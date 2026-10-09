"""FastAPI application factory. Django remains the persistence/business layer."""
import os
import re

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')

import django

django.setup()

from django.conf import settings
from django.core.asgi import get_asgi_application
from django.urls import URLResolver
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.convertors import StringConvertor, register_url_convertor
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles

from .api_compat import endpoint_for


class LookupConvertor(StringConvertor):
    regex = '[^/.]+'


class FormatConvertor(StringConvertor):
    regex = '[a-z0-9]+'


register_url_convertor('drf_lookup', LookupConvertor())
register_url_convertor('drf_format', FormatConvertor())


def compatibility_routes(patterns, prefix=''):
    """Import the complete existing route inventory, including DRF actions.

    Keep ordering and format suffixes intact. Fail on unsupported patterns so a
    future route cannot silently disappear from the FastAPI surface.
    """
    for entry in patterns:
        route = str(entry.pattern)
        if isinstance(entry, URLResolver):
            yield from compatibility_routes(entry.url_patterns, prefix + route)
            continue
        route = prefix + route
        # DRF's optional slash on .json routes needs two explicit ASGI paths.
        optional_slash = route.endswith('/?$')
        route = route.removesuffix('/?$') if optional_slash else route

        def regex_parameter(match):
            name, expression = match.groups()
            converters = {'[^/.]+': 'drf_lookup', '[a-z0-9]+': 'drf_format'}
            if expression not in converters:
                raise ValueError(f'Unsupported route parameter: {expression}')
            return '{' + name + ':' + converters[expression] + '}'

        route = re.sub(r'\(\?P<(\w+)>([^)]+)\)', regex_parameter, route)
        route = route.replace('^', '').removesuffix('\\Z').removesuffix('$')
        route = re.sub(r'<int:(\w+)>', r'{\1:int}', route)
        route = re.sub(r'<(?:str:)?(\w+)>', r'{\1}', route)
        route = route.replace('\\.', '.')
        if any(char in route for char in ('(', ')', '?', '[', ']')):
            raise ValueError(f'Unsupported compatibility route: {route}')
        callback = entry.callback
        view_class = getattr(callback, 'cls', None)
        actions = getattr(callback, 'actions', None)
        if actions is not None:
            methods = set(actions) | {'options'}
        elif view_class is not None:
            methods = {method for method in view_class.http_method_names if hasattr(view_class, method)}
        else:
            methods = {'get', 'head'}
        if 'get' in methods:
            methods.add('head')
        paths = [route, route + '/'] if optional_slash else [route]
        for path in paths:
            yield '/' + path, callback, entry.name, sorted(method.upper() for method in methods), getattr(entry.pattern, 'converters', {})


class AuthPolicy(BaseModel):
    registration_enabled: bool
    password_recovery_enabled: bool


def create_app():
    app = FastAPI(
        title='ChewyBBTalk API', version='1.0.0',
        description='FastAPI 服务入口；兼容现有客户端及 Django 数据模型。',
        docs_url='/api/schema/swagger-ui/', redoc_url='/api/schema/redoc/',
        openapi_url='/api/schema/',
    )
    hosts = [host.strip() for host in settings.ALLOWED_HOSTS]
    # Django's .example.com also includes the apex domain.
    hosts = [value for host in hosts for value in ([host[1:], '*' + host] if host.startswith('.') else [host])]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts, www_redirect=False)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'] if settings.CORS_ORIGIN_ALLOW_ALL else settings.CORS_ALLOWED_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
        allow_headers=settings.CORS_ALLOW_HEADERS, expose_headers=settings.CORS_EXPOSE_HEADERS,
    )

    @app.get('/healthz', tags=['System'])
    def health():
        return {'status': 'ok'}

    @app.get('/api/v1/bbtalk/auth/policy/', response_model=AuthPolicy, tags=['Auth'])
    def auth_policy():
        return JSONResponse(AuthPolicy(
            registration_enabled=settings.REGISTRATION_ENABLED,
            password_recovery_enabled=settings.PASSWORD_RECOVERY_ENABLED,
        ).model_dump(), headers={'Cache-Control': 'no-store'})

    from .urls import schema_url_patterns
    for path, callback, name, methods, converters in compatibility_routes(schema_url_patterns):
        if path == '/api/v1/bbtalk/auth/policy/':
            methods = [method for method in methods if method != 'GET']
        app.add_api_route(path, endpoint_for(callback, name, converters), methods=methods,
                          name=name, include_in_schema=False)

    from bbtalk.privacy_views import privacy_policy_view, support_view
    for path, callback in [('/privacy-policy/', privacy_policy_view), ('/support/', support_view)]:
        app.add_api_route(path, endpoint_for(callback, callback.__name__), methods=['GET', 'HEAD'],
                          include_in_schema=False)

    # Mount only the retained admin. API traffic never falls through to Django.
    # Mount at /admin with a small wrapper to preserve Django reverse() paths.
    django_app = get_asgi_application()

    async def admin(scope, receive, send):
        scope = dict(scope, root_path=scope.get('root_path', '').removesuffix('/admin'))
        await django_app(scope, receive, send)

    app.mount('/admin', admin)
    app.mount('/static', StaticFiles(directory=settings.STATIC_ROOT, check_dir=False), name='static')
    # Attachments are served exclusively by their permission-checked endpoints.
    # Never mount MEDIA_ROOT: it contains private user files.

    native_openapi = app.openapi

    def openapi():
        if app.openapi_schema is None:
            from . import openapi_auth  # noqa: F401 - register project authentication schemes
            from drf_spectacular.generators import SchemaGenerator
            legacy = SchemaGenerator(patterns=schema_url_patterns).get_schema(request=None, public=True)
            schema = native_openapi()
            schema['paths'] = {**legacy['paths'], **schema['paths']}
            for key, values in legacy.get('components', {}).items():
                schema.setdefault('components', {}).setdefault(key, {}).update(values)
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
    return app


app = create_app()
