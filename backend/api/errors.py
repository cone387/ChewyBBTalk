from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError

from core.errors import APIError


def error_response(request, error):
    return JSONResponse(
        jsonable_encoder(error.data), status_code=error.status, headers=error.headers
    )


def install_exception_handlers(app):
    app.add_exception_handler(APIError, error_response)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        fields = {}
        for item in error.errors():
            name = str(item['loc'][-1]) if item['loc'] else 'detail'
            fields.setdefault(name, []).append(item['msg'])
        return JSONResponse(fields, status_code=400)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request, error):
        return JSONResponse({'error': '数据已存在或关联无效，请刷新后重试'}, status_code=400)

    @app.exception_handler(OperationalError)
    async def operational_error(request, error):
        return JSONResponse(
            {'error': '数据库暂时不可用，请稍后重试', 'code': 'submission_retry'},
            status_code=503,
            headers={'Retry-After': '1'},
        )
