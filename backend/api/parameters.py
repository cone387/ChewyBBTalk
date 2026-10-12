from typing import Annotated

from fastapi import Header, Path
from pydantic import AwareDatetime, BeforeValidator

from schemas.identifiers import BusinessUID


def unquote_timestamp(value):
    return value.strip('"') if isinstance(value, str) else value


RecordUID = Annotated[BusinessUID, Path(description='记录、标签或评论的业务 UID')]
Revision = Annotated[
    AwareDatetime | None,
    BeforeValidator(unquote_timestamp),
    Header(alias='If-Match', description='记录完整 update_time，可带双引号；必须包含时区'),
]
