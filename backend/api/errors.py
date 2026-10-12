import logging

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pymysql.err import OperationalError as MySQLOperationalError
from sqlalchemy.exc import IntegrityError, OperationalError

from core.errors import APIError


def database_conflict(error):
    # PyMySQL reports MySQL 8 CHECK violations as OperationalError (3819),
    # although they are invalid data and retrying the same write cannot help.
    return isinstance(error, IntegrityError) or (
        isinstance(error, OperationalError)
        and isinstance(error.orig, MySQLOperationalError)
        and error.orig.args[:1] == (3819,)
    )


def conflict_response():
    return JSONResponse(
        {'error': '数据已存在或关联无效，请刷新后重试', 'code': 'database_conflict'},
        status_code=400,
    )


def log_database_error(request, error):
    # SQLAlchemy exception text/tracebacks include SQL parameters and driver
    # details. Record only fixed metadata, never SQL, request values or secrets.
    logging.getLogger(__name__).warning(
        'Database operation failed (%s, %s, method=%s)',
        type(error).__name__,
        type(error.orig).__name__,
        request.method,
    )


def error_response(request, error):
    return JSONResponse(
        jsonable_encoder(error.data), status_code=error.status, headers=error.headers
    )


def install_exception_handlers(app):
    app.add_exception_handler(APIError, error_response)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request, error):
        log_database_error(request, error)
        return conflict_response()

    @app.exception_handler(OperationalError)
    async def operational_error(request, error):
        log_database_error(request, error)
        if database_conflict(error):
            return conflict_response()
        return JSONResponse(
            {'error': '数据库暂时不可用，请稍后重试', 'code': 'database_unavailable'},
            status_code=503,
            headers={'Retry-After': '1'},
        )
