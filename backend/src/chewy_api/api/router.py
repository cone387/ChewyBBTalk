from fastapi import APIRouter
from fastapi.routing import APIRoute

from chewy_api.api.routes import auth, data, pages, records, status, storage


def install_routes(app):
    for router in (
        pages.router,
        auth.router,
        storage.router,
        data.router,
        status.router,
        records.router,
    ):
        # Copy before adding HEAD so repeated app factories never mutate shared routers.
        native = APIRouter()
        native.include_router(router)
        for route in list(router.routes):
            if isinstance(route, APIRoute) and 'GET' in route.methods:
                native.add_api_route(
                    route.path, route.endpoint, methods=['HEAD'], include_in_schema=False
                )
        app.include_router(native)
