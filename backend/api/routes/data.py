"""Portable v1 backups and account-scoped imports with attachment integrity."""

import json
import zipfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse

from api.compat import reject_legacy_query_conflicts
from api.dependencies import DB, CurrentUser
from backups.transfer import FIELDS, DataExporter, import_data, read_import
from core.errors import APIError, fail
from models import now
from schemas.query import ExportQuery
from schemas.responses import BackupListOutput, ImportOutput, ImportValidationOutput

router = APIRouter(prefix='/api/v1/bbtalk/data', tags=['Data'])


def upload_content(file, settings):
    content = file.file.read(settings.max_import_size + 1)
    if len(content) > settings.max_import_size:
        fail(413, '导入文件超过大小限制')
    return content


@router.get(
    '/export',
    dependencies=[Depends(reject_legacy_query_conflicts)],
    response_class=Response,
    responses={
        200: {
            'content': {
                'application/json': {},
                'application/zip': {'schema': {'type': 'string', 'format': 'binary'}},
            }
        }
    },
)
def export(request: Request, db: DB, user: CurrentUser, params: Annotated[ExportQuery, Query()]):
    exporter = DataExporter(user, db, request.app.state.settings)
    mode = params.format
    if mode == 'zip':
        payload = exporter.export_to_zip(params.include_attachments).getvalue()
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


@router.post('/validate', response_model=ImportValidationOutput)
def validate(request: Request, user: CurrentUser, file: Annotated[UploadFile, File()]):
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
    except json.JSONDecodeError as error:
        result['error'] = (
            f'JSON 格式不正确（第 {error.lineno} 行，第 {error.colno} 列），请检查文件或重新导出后再试'
        )
    except (UnicodeError, zipfile.BadZipFile):
        result['error'] = '文件编码或压缩格式不正确，请选择系统导出的 JSON 或 ZIP 文件'
    except (ValueError, KeyError) as error:
        result['error'] = str(error)
    return result


@router.post('/import', response_model=ImportOutput)
def import_file(
    request: Request,
    db: DB,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    overwrite_tags: Annotated[bool, Form()] = False,
    skip_duplicates: Annotated[bool, Form()] = True,
    import_storage_settings: Annotated[bool, Form()] = False,
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
    except json.JSONDecodeError as error:
        raise APIError(
            400,
            {
                'success': False,
                'error': f'JSON 格式不正确（第 {error.lineno} 行，第 {error.colno} 列），请检查文件后重试',
            },
        )
    except (UnicodeError, zipfile.BadZipFile):
        raise APIError(
            400, {'success': False, 'error': '文件编码或压缩格式不正确，请重新导出后再试'}
        )
    except (ValueError, KeyError) as error:
        raise APIError(400, {'success': False, 'error': str(error)})
    finally:
        if archive:
            archive.close()


@router.get('/backups', response_model=BackupListOutput, response_model_exclude_unset=True)
def backups_list(request: Request, user: CurrentUser):
    from backups.service import list_backups

    return list_backups(user, request.app.state.settings)


@router.post(
    '/backups', status_code=201, response_model=BackupListOutput, response_model_exclude_unset=True
)
def backup_create(request: Request, response: Response, db: DB, user: CurrentUser):
    from backups.service import BackupBusy, create_backup, list_backups

    try:
        create_backup(user, db, request.app.state.settings)
        response.headers['Cache-Control'] = 'no-store'
        return list_backups(user, request.app.state.settings)
    except BackupBusy:
        fail(409, '当前账号已有备份正在创建，请刷新状态')
    except Exception:
        fail(500, '备份操作失败，请检查附件可用性和服务器磁盘')


@router.get(
    '/backups/{filename}',
    response_class=FileResponse,
    responses={
        200: {'content': {'application/zip': {'schema': {'type': 'string', 'format': 'binary'}}}}
    },
)
def backup_download(filename: str, request: Request, user: CurrentUser):
    from backups.service import backup_path

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
