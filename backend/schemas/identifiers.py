"""Business identifiers shared by HTTP payloads, paths and backup imports."""

from typing import Annotated

from pydantic import Field, TypeAdapter, ValidationError

BusinessUID = Annotated[str, Field(strict=True, min_length=1, max_length=64)]
uid_adapter = TypeAdapter(BusinessUID)


def imported_uid(row, factory):
    # Missing identifiers are generated for old exports; explicitly invalid ones
    # must not silently change identity or leave unreachable resources behind.
    if 'uid' not in row:
        return factory()
    try:
        return uid_adapter.validate_python(row['uid'])
    except ValidationError:
        raise ValueError('UID 必须是长度 1–64 的字符串') from None
