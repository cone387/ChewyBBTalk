import shutil
import tempfile

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from chewy_api.api.dependencies import DB, CurrentUser
from chewy_api.backups.service import list_backups
from chewy_api.db.models import now
from chewy_api.storage.service import upload_store

router = APIRouter(tags=['System'])


@router.get('/api/v1/bbtalk/settings/status/')
def runtime_status(request: Request, response: Response, db: DB, user: CurrentUser):
    config = request.app.state.settings
    storage = {'mode': 'unknown'}
    try:
        store, config_id = upload_store(db, config, user)
        storage['mode'] = 's3' if config_id else 'server_s3' if store.cloud else 'server'
        if store.cloud:
            with store.client() as client:
                client.list_objects_v2(Bucket=store.config['bucket_name'], MaxKeys=1)
        else:
            config.storage_root.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryFile(dir=config.storage_root) as probe:
                probe.write(b'bbtalk-status')
                probe.seek(0)
                if probe.read() != b'bbtalk-status':
                    raise OSError
        storage.update(
            status='ok',
            message='S3 连接及列表权限检查通过；未验证上传与历史附件'
            if store.cloud
            else '服务器附件目录读写检查通过',
        )
    except Exception:
        storage.update(status='error', message='存储检查失败，请检查配置、连接或目录权限后重试')
    try:
        data = list_backups(user, config)
        latest = data['latest'] or {}
        newest = data['items'][0] if data['items'] else None
        messages = {
            'success': '最近一次备份已完成',
            'failed': '最近一次备份失败，请检查并重新创建',
            'running': '备份正在创建，请稍后刷新',
            'interrupted': '上次备份已中断，可以重新创建',
            'unknown': '无法确认最近备份结果',
        }
        state = latest.get('status', 'none')
        backup = {
            'status': state,
            'message': messages.get(state, '尚无备份执行记录'),
            'count': len(data['items']),
            'latest_completed_at': newest['created_at'] if newest else None,
            'latest_size': newest['size'] if newest else None,
        }
    except Exception:
        backup = {'status': 'error', 'message': '无法读取备份状态，请稍后重试或联系管理员'}
    result = {
        'checked_at': now().isoformat(),
        'service': {'status': 'ok', 'message': '已连接到服务并通过身份验证'},
        'storage': storage,
        'backup': backup,
    }
    if user.is_staff or user.is_superuser:
        diagnostics = {}
        try:
            db.execute(text('SELECT 1'))
            diagnostics['database'] = {'status': 'ok', 'message': '数据库查询检查通过'}
        except Exception:
            diagnostics['database'] = {'status': 'error', 'message': '数据库查询检查失败'}
        try:
            usage = shutil.disk_usage(config.storage_root)
            diagnostics['attachment_disk'] = {
                'status': 'ok',
                'message': '服务器附件目录所在磁盘',
                'total_bytes': usage.total,
                'free_bytes': usage.free,
            }
        except OSError:
            diagnostics['attachment_disk'] = {
                'status': 'error',
                'message': '无法读取附件目录所在磁盘信息',
            }
        result['diagnostics'] = diagnostics
    response.headers['Cache-Control'] = 'no-store'
    return result
