"""Authenticated, account-scoped checks with a deliberately small response schema."""
import tempfile
import shutil
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .backups import list_backups
from .models import UserStorageSettings


def local_storage_check():
    root = Path(settings.CHEWY_ATTACHMENT['STORAGE_ROOT'])
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile(dir=root) as probe:
        probe.write(b'bbtalk-status')
        probe.flush()
        probe.seek(0)
        if probe.read() != b'bbtalk-status':
            raise OSError('Storage read check failed')
    return {'status': 'ok', 'message': '服务器附件目录读写检查通过'}


def s3_check(config):
    import boto3
    from botocore.config import Config
    client = boto3.client('s3', aws_access_key_id=config['access_key_id'],
                          aws_secret_access_key=config['secret_access_key'],
                          region_name=config.get('region_name'), endpoint_url=config.get('endpoint_url'),
                          config=Config(connect_timeout=3, read_timeout=3, retries={'total_max_attempts': 1}))
    try:
        client.list_objects_v2(Bucket=config['bucket_name'], MaxKeys=1)
    finally:
        client.close()
    return {'status': 'ok', 'message': 'S3 连接及列表权限检查通过；未验证上传与历史附件'}


def storage_check(user):
    mode = 'unknown'
    try:
        active = UserStorageSettings.objects.filter(user=user, is_active=True, storage_type='s3').first()
        if active:
            mode = 's3'
            config = active.get_s3_config()
            if not config:
                return {'mode': mode, 'status': 'error', 'message': '当前 S3 配置不完整，请检查存储设置'}
            result = s3_check(config)
        elif settings.CHEWY_ATTACHMENT.get('STORAGE_ENGINE') == 'file':
            mode = 'server'
            result = local_storage_check()
        elif getattr(settings, 'USE_S3_STORAGE', False):
            mode = 'server_s3'
            result = s3_check({'access_key_id': settings.AWS_ACCESS_KEY_ID,
                               'secret_access_key': settings.AWS_SECRET_ACCESS_KEY,
                               'bucket_name': settings.AWS_STORAGE_BUCKET_NAME,
                               'region_name': settings.AWS_S3_REGION_NAME,
                               'endpoint_url': settings.AWS_S3_ENDPOINT_URL})
        else:
            return {'mode': 'server', 'status': 'unknown', 'message': '当前服务器存储引擎不支持此检查，请联系管理员'}
        return {'mode': mode, **result}
    except Exception:
        return {'mode': mode, 'status': 'error', 'message': '存储检查失败，请检查配置、连接或目录权限后重试'}


def backup_check(user):
    try:
        data = list_backups(user)
        latest = data['latest'] or {}
        state = latest.get('status')
        messages = {'success': '最近一次备份已完成', 'failed': '最近一次备份失败，请在数据管理中检查并重新创建',
                    'running': '备份正在创建，请稍后刷新', 'interrupted': '上次备份已中断，可以重新创建',
                    'unknown': '无法确认最近备份结果，请在数据管理中核对'}
        if state not in messages:
            state = 'none' if not latest else 'unknown'
        newest = data['items'][0] if data['items'] else None
        return {'status': state, 'message': messages.get(state, '尚无备份执行记录'),
                'count': len(data['items']),
                'latest_completed_at': newest['created_at'] if newest else None,
                'latest_size': newest['size'] if newest else None}
    except Exception:
        return {'status': 'error', 'message': '无法读取备份状态，请稍后重试或联系管理员'}


def database_check():
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            if cursor.fetchone()[0] != 1:
                raise ValueError('Unexpected database result')
        return {'status': 'ok', 'message': '数据库查询检查通过'}
    except Exception:
        return {'status': 'error', 'message': '数据库查询检查失败，请检查服务配置'}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def runtime_status(request):
    data = {'checked_at': timezone.now().isoformat(),
            'service': {'status': 'ok', 'message': '已连接到服务并通过身份验证'},
            'storage': storage_check(request.user), 'backup': backup_check(request.user)}
    if request.user.is_staff or request.user.is_superuser:
        diagnostics = {'database': database_check()}
        try:
            usage = shutil.disk_usage(settings.CHEWY_ATTACHMENT['STORAGE_ROOT'])
            diagnostics['attachment_disk'] = {'status': 'ok', 'message': '服务器附件目录所在磁盘',
                                               'total_bytes': usage.total, 'free_bytes': usage.free}
        except Exception:
            diagnostics['attachment_disk'] = {'status': 'error', 'message': '无法读取附件目录所在磁盘信息'}
        data['diagnostics'] = diagnostics
    response = Response(data)
    response['Cache-Control'] = 'no-store'
    return response
