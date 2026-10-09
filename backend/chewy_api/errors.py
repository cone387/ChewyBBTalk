from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder


class APIError(Exception):
    def __init__(self, status, data, headers=None):
        self.status, self.data, self.headers = status, data, headers


def fail(status, message, **extra):
    raise APIError(status, {'error': message, **extra})


def error_response(request, error):
    return JSONResponse(jsonable_encoder(error.data), status_code=error.status, headers=error.headers)
