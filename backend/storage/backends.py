import mimetypes
import os
from pathlib import Path, PurePosixPath
from uuid import uuid4

import boto3
from botocore.config import Config

from models import now

mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/aac', '.aac')


def safe_key(value):
    value = str(value).replace('\\', '/')
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or ':' in value or '\x00' in value:
        raise ValueError('附件路径不安全')
    return '/'.join(path.parts)


class Store:
    def __init__(self, settings, config=None):
        self.root = settings.storage_root.resolve()
        self.settings = settings
        self.config = config

    @property
    def cloud(self):
        return self.config is not None

    def local_path(self, key):
        path = self.root / safe_key(key)
        if not path.resolve().is_relative_to(self.root):
            raise ValueError('附件路径不安全')
        return path

    def client(self):
        config = self.config
        return boto3.client(
            's3',
            aws_access_key_id=config['access_key_id'],
            aws_secret_access_key=config['secret_access_key'],
            region_name=config.get('region_name') or 'us-east-1',
            endpoint_url=config.get('endpoint_url') or None,
            config=Config(connect_timeout=3, read_timeout=30, retries={'total_max_attempts': 2}),
        )

    def read(self, key):
        key = safe_key(key)
        if not self.cloud:
            return self.local_path(key).read_bytes()
        with self.client() as client:
            response = client.get_object(Bucket=self.config['bucket_name'], Key=key)
            try:
                return response['Body'].read()
            finally:
                response['Body'].close()

    def save(self, content, filename, key=None):
        key = safe_key(key or f'{now():%Y/%m/%d}/{uuid4().hex}{Path(filename).suffix.lower()}')
        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        if self.cloud:
            with self.client() as client:
                client.put_object(
                    Bucket=self.config['bucket_name'], Key=key, Body=content, ContentType=mime
                )
        else:
            path = self.local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as output:
                output.write(content)
        return key, mime

    def delete(self, key):
        key = safe_key(key)
        if self.cloud:
            with self.client() as client:
                client.delete_object(Bucket=self.config['bucket_name'], Key=key)
        else:
            self.local_path(key).unlink(missing_ok=True)

    def url(self, key):
        with self.client() as client:
            return client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.config['bucket_name'], 'Key': safe_key(key)},
                ExpiresIn=int(os.getenv('AWS_QUERYSTRING_EXPIRE', '3600')),
            )
