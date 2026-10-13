from copy import copy

from fastapi import APIRouter
from fastapi.routing import APIRoute
from api.openapi import COMMON_RESPONSES
from api.routes import auth, data, pages, records, status, storage


def install_routes(app):
    for router in (
        pages.router,
        auth.router,
        storage.router,
        data.router,
        status.router,
        records.router,
    ):
        native = APIRouter()
        for route in router.routes:
            native.routes.append(route)
            if isinstance(route, APIRoute) and 'GET' in route.methods:
                head = copy(route)
                head.methods = {'HEAD'}
                head.include_in_schema = False
                native.routes.append(head)
        app.include_router(native, responses=COMMON_RESPONSES)
