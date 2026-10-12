"""Shared documentation for business errors; validation retains FastAPI's 422."""

from pydantic import BaseModel, ConfigDict, JsonValue


class BusinessError(BaseModel):
    model_config = ConfigDict(extra='allow')
    detail: JsonValue = None
    error: str | None = None
    message: str | None = None
    code: str | None = None


COMMON_RESPONSES = {
    status: {'model': BusinessError, 'description': description}
    for status, description in {
        400: '业务输入无效或数据库唯一性/关联冲突',
        401: '缺少有效凭据或令牌已失效',
        403: '权限不足、功能关闭或 Cookie 写请求 CSRF 校验失败',
        404: '资源不存在、不可访问或页码超出范围',
        409: '资源版本、提交标识或并发状态冲突',
        410: '幂等提交对应的记录已删除',
        429: '请求频率超限，请按 Retry-After 重试',
        503: '服务暂不可用；数据库故障返回 database_unavailable，提交不确定返回 submission_retry',
    }.items()
}
for status in (429, 503):
    COMMON_RESPONSES[status]['headers'] = {
        'Retry-After': {'description': '建议等待秒数（适用时返回）', 'schema': {'type': 'integer'}}
    }
