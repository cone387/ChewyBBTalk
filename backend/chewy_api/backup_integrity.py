"""Integrity metadata for complete ZIP backups; legacy archives remain readable."""
import hashlib
import json
from pathlib import PurePosixPath


def attachment_member(storage_path):
    value = str(storage_path or '').replace('\\', '/')
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or ':' in value:
        raise ValueError('附件路径不安全')
    return 'attachments/' + '/'.join(path.parts)


def fingerprint(content):
    return {'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()}


def verify_attachment_references(data):
    known = {str(item['id']) for item in data.get('attachments', [])}
    for record in data.get('bbtalks', []):
        for reference in record.get('attachments') or []:
            uid = str(reference.get('uid') or reference.get('id') or '') if isinstance(reference, dict) else str(reference)
            if not uid or uid not in known:
                raise ValueError('记录引用的附件元信息缺失，无法生成或恢复完整备份')


def verify_archive(archive):
    """Validate before any database/storage mutation. Return completeness flag."""
    if 'manifest.json' not in archive.namelist():
        return False
    try:
        manifest = json.loads(archive.read('manifest.json'))
        if not isinstance(manifest, dict) or manifest.get('version') != 1 or manifest.get('complete') is not True:
            raise ValueError('不支持的备份完整性清单')
        members = manifest['members']
        if not isinstance(members, dict) or 'data.json' not in members:
            raise ValueError('备份完整性清单缺少数据文件')
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise ValueError('备份含有重复文件名')
        for name, expected in members.items():
            if name != 'data.json' and (not name.startswith('attachments/') or attachment_member(name[12:]) != name):
                raise ValueError('备份完整性清单含不安全路径')
            if fingerprint(archive.read(name)) != expected:
                raise ValueError(f'备份文件校验失败：{name}')
        data = json.loads(archive.read('data.json'))
        if not isinstance(data, dict) or not isinstance(data.get('attachments', []), list):
            raise ValueError('备份附件元信息无效')
        required = {attachment_member(item['storage_path']) for item in data.get('attachments', [])}
        if set(members) != required | {'data.json'}:
            raise ValueError('备份完整性清单与附件元信息不一致')
        verify_attachment_references(data)
        return True
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError('备份完整性清单损坏或文件缺失') from exc
