from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.exc import IntegrityError, OperationalError

from .config import Settings
from .db import database
from .errors import APIError, error_response
from .security import Limiter


def create_app(settings=None):
    settings = settings or Settings()
    engine, sessions = database(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title='ChewyBBTalk API', version='2.0.0', lifespan=lifespan,
                  docs_url='/api/schema/swagger-ui/', redoc_url='/api/schema/redoc/', openapi_url='/api/schema/')
    app.state.settings, app.state.engine, app.state.sessions = settings, engine, sessions
    app.state.limiter = Limiter()
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
        return JSONResponse({'error': '数据库暂时不可用，请稍后重试', 'code': 'submission_retry'}, status_code=503, headers={'Retry-After': '1'})

    @app.middleware('http')
    async def request_policy(request: Request, call_next):
        # Preserve the deployed HTTPS proxy convention without rewriting peer IP
        # (the latter is used for authentication rate limits).
        if request.headers.get('x-forwarded-proto', '').split(',')[0].strip() == 'https':
            request.scope['scheme'] = 'https'
        # Old DRF JSON suffixes remain valid without a legacy router.
        path = request.scope['path']
        if path.startswith('/api/v1/') and path.rstrip('/').endswith('.json'):
            request.scope['path'] = path.rstrip('/')[:-5] + '/'
            request.scope['raw_path'] = request.scope['path'].encode()
        if path.startswith('/admin') and request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            source = request.headers.get('origin') or request.headers.get('referer', '')
            origin = urlsplit(source)
            if not source or origin.netloc != request.url.netloc or origin.scheme not in {'http', 'https'}:
                return JSONResponse({'detail': 'CSRF 验证失败'}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        return response

    hosts = [value for host in settings.allowed_hosts for value in ([host.strip()[1:], '*' + host.strip()] if host.strip().startswith('.') else [host.strip()])]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts, www_redirect=False)
    app.add_middleware(CORSMiddleware, allow_origins=['*'] if settings.cors_all else settings.cors_origins, allow_credentials=settings.cors_credentials, allow_methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['accept', 'authorization', 'content-type', 'x-csrftoken', 'x-requested-with', 'idempotency-key', 'if-match'], expose_headers=['Idempotency-Replayed', 'Retry-After'])

    @app.get('/healthz', tags=['System'])
    def health():
        return {'status': 'ok'}

    @app.get('/privacy-policy/', response_class=HTMLResponse, include_in_schema=False)
    def privacy():
        return (Path(__file__).parent / 'templates/privacy_policy_view.html').read_text(encoding='utf8')

    @app.get('/support/', response_class=HTMLResponse, include_in_schema=False)
    def support():
        return (Path(__file__).parent / 'templates/support_view.html').read_text(encoding='utf8')

    from . import auth, records, storage, data, status
    from fastapi.routing import APIRoute
    app.state.send_recovery_email = auth.send_recovery_email
    for router in (auth.router, storage.router, data.router, status.router, records.router):
        # Copy before adding HEAD so repeated app factories never mutate shared routers.
        from fastapi import APIRouter
        native = APIRouter()
        native.include_router(router)
        for route in list(router.routes):
            if isinstance(route, APIRoute) and 'GET' in route.methods:
                native.add_api_route(route.path, route.endpoint, methods=['HEAD'], include_in_schema=False)
        app.include_router(native)
    # Preserve HEAD without publishing duplicate OpenAPI operations.
    for route in list(app.routes):
        if isinstance(route, APIRoute) and 'GET' in route.methods and 'HEAD' not in route.methods:
            app.add_api_route(route.path, route.endpoint, methods=['HEAD'], include_in_schema=False)
    original_openapi = app.openapi

    def openapi():
        schema = original_openapi()
        schema.setdefault('components', {}).setdefault('securitySchemes', {})['jwtAuth'] = {'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT'}
        public = ('/auth/token/', '/auth/login/', '/auth/register/', '/auth/policy/', '/auth/password/', '/auth/desktop/exchange/', '/public/')
        for path, methods in schema['paths'].items():
            for method, operation in methods.items():
                if method in {'get', 'post', 'put', 'patch', 'delete'} and path.startswith('/api/v1/') and not any(value in path for value in public):
                    operation['security'] = [{'jwtAuth': []}]
        return schema

    app.openapi = openapi
    from .admin import install_admin
    install_admin(app)
    return app


app = create_app()
