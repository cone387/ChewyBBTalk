from typing import Literal

from pydantic import Field

from schemas.base import Input


class StorageInput(Input):
    name: str = Field(default='默认配置', min_length=1, max_length=100)
    storage_type: Literal['local', 's3'] = 's3'
    s3_access_key_id: str = Field(default='', max_length=255)
    s3_secret_access_key: str = Field(default='', max_length=255)
    s3_bucket_name: str = Field(default='', max_length=255)
    s3_region_name: str = Field(default='us-east-1', max_length=64)
    s3_endpoint_url: str = Field(default='', max_length=500)
    s3_custom_domain: str = Field(default='', max_length=255)
    is_active: bool = False
