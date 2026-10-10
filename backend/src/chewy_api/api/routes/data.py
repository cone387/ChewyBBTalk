"""Portable v1 backups and account-scoped imports with attachment integrity."""

import json
import zipfile

from fastapi import APIRouter, File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse

from chewy_api.api.dependencies import DB, CurrentUser
from chewy_api.backups.transfer import FIELDS, DataExporter, import_data, read_import
from chewy_api.core.errors import APIError, fail
from chewy_api.db.models import now

router = APIRouter(prefix='/api/v1/bbtalk/data', tags=['Data'])


def upload_content(file, settings):
    content = file.file.read(settings.max_import_size + 1)
    if len(content) > settings.max_import_size:
        fail(413, '导入文件超过大小限制')
    return content


@router.get('/export/')
def export(request: Request, db: DB, user: CurrentUser):
    exporter = DataExporter(user, db, request.app.state.settings)
    mode = request.query_params.get('export_format', request.query_params.get('format', 'json'))
    if mode == 'zip':
        payload = exporter.export_to_zip(
            request.query_params.get('include_attachments', '').lower() == 'true'
        ).getvalue()
        media = 'application/zip'
    else:
        mode = 'json'
        payload = json.dumps(exporter.export_all(), ensure_ascii=False, indent=2).encode()
        media = 'application/json'
    return Response(
        payload,
        media_type=media,
        headers={
            'Content-Disposition': f'attachment; filename="chewybbtalk_export_{user.id}_{now():%Y%m%d_%H%M%S}.{mode}"'
        },
    )


@router.post('/validate/')
def validate(request: Request, user: CurrentUser, file: UploadFile = File(...)):
    result = {
        'valid': False,
        'file_type': None,
        'version': None,
        'export_time': None,
        'preview': {},
        'error': None,
        'complete_backup': False,
    }
    try:
        data, archive, complete = read_import(
            upload_content(file, request.app.state.settings),
            request.app.state.settings.max_import_size,
        )
        result.update(
            valid=True,
            file_type='zip' if archive else 'json',
            version=data['version'],
            export_time=data.get('export_time'),
            preview={name + '_count': len(data.get(name, [])) for name in FIELDS},
            complete_backup=complete,
        )
        if archive:
            archive.close()
    except (ValueError, KeyError, UnicodeError, zipfile.BadZipFile) as error:
        result['error'] = str(error)
    return result


@router.post('/import/')
def import_file(
    request: Request,
    db: DB,
    user: CurrentUser,
    file: UploadFile = File(...),
    overwrite_tags: bool = Form(False),
    skip_duplicates: bool = Form(True),
    import_storage_settings: bool = Form(False),
):
    archive = None
    try:
        data, archive, complete = read_import(
            upload_content(file, request.app.state.settings),
            request.app.state.settings.max_import_size,
        )
        stats = import_data(
            db,
            request.app.state.settings,
            user,
            data,
            archive,
            complete,
            overwrite_tags=overwrite_tags,
            skip_duplicates=skip_duplicates,
            import_storage_settings=import_storage_settings,
        )
        partial = bool(stats['errors'] or stats['attachments_skipped'] or stats['comments_skipped'])
        return {
            'success': True,
            'partial': partial,
            'message': '导入部分完成，请核对跳过项与错误' if partial else '数据导入成功',
            'stats': stats,
        }
    except (ValueError, KeyError, UnicodeError, zipfile.BadZipFile) as error:
        raise APIError(400, {'success': False, 'error': str(error)})
    finally:
        if archive:
            archive.close()


@router.get('/backups/')
def backups_list(request: Request, user: CurrentUser):
    from chewy_api.backups.service import list_backups

    return list_backups(user, request.app.state.settings)


@router.post('/backups/', status_code=201)
def backup_create(request: Request, response: Response, db: DB, user: CurrentUser):
    from chewy_api.backups.service import BackupBusy, create_backup, list_backups

    try:
        create_backup(user, db, request.app.state.settings)
        response.headers['Cache-Control'] = 'no-store'
        return list_backups(user, request.app.state.settings)
    except BackupBusy:
        fail(409, '当前账号已有备份正在创建，请刷新状态')
    except Exception:
        fail(500, '备份操作失败，请检查附件可用性和服务器磁盘')


@router.get('/backups/{filename}/')
def backup_download(filename: str, request: Request, user: CurrentUser):
    from chewy_api.backups.service import backup_path

    try:
        path = backup_path(user, filename, request.app.state.settings)
        return FileResponse(
            path,
            media_type='application/zip',
            filename=path.name,
            headers={'Cache-Control': 'no-store'},
        )
    except (FileNotFoundError, ValueError):
        fail(404, '备份不存在或不可访问')
