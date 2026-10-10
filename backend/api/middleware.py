from urllib.parse import urlsplit

from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware


def install_middleware(app, settings):
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
            if (
                not source
                or origin.netloc != request.url.netloc
                or origin.scheme not in {'http', 'https'}
            ):
                return JSONResponse({'detail': 'CSRF 验证失败'}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        return response

    hosts = [
        value
        for host in settings.allowed_hosts
        for value in (
            [host.strip()[1:], '*' + host.strip()]
            if host.strip().startswith('.')
            else [host.strip()]
        )
    ]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts, www_redirect=False)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'] if settings.cors_all else settings.cors_origins,
        allow_credentials=settings.cors_credentials,
        allow_methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allow_headers=[
            'accept',
            'authorization',
            'content-type',
            'x-csrftoken',
            'x-requested-with',
            'idempotency-key',
            'if-match',
        ],
        expose_headers=['Idempotency-Replayed', 'Retry-After'],
    )
