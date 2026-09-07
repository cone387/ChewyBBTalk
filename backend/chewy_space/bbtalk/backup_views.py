import logging

from django.http import FileResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .backups import BackupBusy, backup_path, create_backup, list_backups

logger = logging.getLogger(__name__)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def backups(request):
    try:
        if request.method == 'POST':
            create_backup(request.user)
        response = Response(list_backups(request.user), status=201 if request.method == 'POST' else 200)
        response['Cache-Control'] = 'no-store'
        return response
    except BackupBusy:
        return Response({'error': '当前账号已有备份正在创建，请刷新状态'}, status=409)
    except Exception:
        logger.exception('用户 %s 备份操作失败', request.user.pk)
        return Response({'error': '备份操作失败，请刷新状态并检查附件可用性和服务器磁盘'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_backup(request, filename):
    try:
        path = backup_path(request.user, filename)
        response = FileResponse(path.open('rb'), as_attachment=True, filename=path.name, content_type='application/zip')
        response['Cache-Control'] = 'no-store'
        return response
    except (FileNotFoundError, ValueError):
        return Response({'error': '备份不存在或不可访问'}, status=404)
    except OSError:
        return Response({'error': '备份暂时无法下载，请稍后重试'}, status=503)
