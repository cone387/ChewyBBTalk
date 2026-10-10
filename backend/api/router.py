from fastapi import APIRouter

from api.compat import compatible_routes
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
        native.routes.extend(compatible_routes(router))
        app.include_router(native)
