"""Application factory. Importing this module never creates runtime files."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from chewy_api.admin.views import install_admin
from chewy_api.api.errors import install_exception_handlers
from chewy_api.api.middleware import install_middleware
from chewy_api.api.router import install_routes
from chewy_api.api.schema import install_openapi
from chewy_api.core.config import Settings
from chewy_api.db.session import database
from chewy_api.services.accounts import send_recovery_email
from chewy_api.services.security import Limiter


def create_app(settings=None):
    settings = settings or Settings()
    engine, sessions = database(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title='ChewyBBTalk API',
        version='2.0.0',
        lifespan=lifespan,
        docs_url='/api/schema/swagger-ui/',
        redoc_url='/api/schema/redoc/',
        openapi_url='/api/schema/',
    )
    app.state.settings, app.state.engine, app.state.sessions = settings, engine, sessions
    app.state.limiter = Limiter()
    app.state.send_recovery_email = send_recovery_email
    install_exception_handlers(app)
    install_middleware(app, settings)
    install_routes(app)
    install_openapi(app)
    install_admin(app)
    return app
