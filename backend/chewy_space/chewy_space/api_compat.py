"""Compatibility boundary for existing Django/DRF business handlers.

FastAPI selects the endpoint; this module preserves Django's middleware,
transactions, serializers and authentication while handlers are migrated.
All synchronous work (including streaming and cleanup) stays on one worker
thread per request. Uploads spill to disk instead of buffering in memory.
"""
from tempfile import SpooledTemporaryFile

import anyio
from asgiref.sync import ThreadSensitiveContext, sync_to_async
from django.conf import settings
from django.core import signals
from django.core.handlers.asgi import ASGIRequest
from django.core.handlers.base import BaseHandler
from django.urls import ResolverMatch
from fastapi import Request
from starlette.responses import Response


class SelectedHandler(BaseHandler):
    def resolve_request(self, request):
        # The route was already selected by FastAPI, not Django's URL resolver.
        return request.resolver_match


class HandlerResponse(Response):
    """Run the entire legacy request lifecycle off the ASGI event loop."""

    def __init__(self, request, callback, name, kwargs):
        super().__init__()
        self.request = request
        self.callback = callback
        self.name = name
        self.kwargs = kwargs

    async def __call__(self, scope, receive, send):
        async with ThreadSensitiveContext():
            with SpooledTemporaryFile(max_size=settings.FILE_UPLOAD_MAX_MEMORY_SIZE) as body:
                async for chunk in self.request.stream():
                    await sync_to_async(body.write)(chunk)
                await sync_to_async(body.seek)(0)
                response = None
                django_request = None
                try:
                    def handle():
                        nonlocal django_request
                        signals.request_started.send(sender=SelectedHandler, scope=scope)
                        django_request = ASGIRequest(scope, body)
                        django_request.resolver_match = ResolverMatch(
                            self.callback, (), self.kwargs, url_name=self.name,
                        )
                        handler = SelectedHandler()
                        handler.load_middleware()
                        return handler.get_response(django_request)

                    response = await sync_to_async(handle)()
                    headers = [(key.lower().encode('ascii'), value.encode('latin1'))
                               for key, value in response.items()]
                    headers.extend((b'set-cookie', cookie.output(header='').strip().encode('latin1'))
                                   for cookie in response.cookies.values())
                    await send({'type': 'http.response.start', 'status': response.status_code,
                                'headers': headers})
                    if scope['method'] != 'HEAD':
                        if response.streaming:
                            if response.is_async:
                                async for chunk in response.streaming_content:
                                    await send({'type': 'http.response.body', 'body': chunk, 'more_body': True})
                            else:
                                iterator = iter(response.streaming_content)
                                sentinel = object()
                                while True:
                                    chunk = await sync_to_async(next)(iterator, sentinel)
                                    if chunk is sentinel:
                                        break
                                    await send({'type': 'http.response.body', 'body': chunk, 'more_body': True})
                        else:
                            await send({'type': 'http.response.body', 'body': response.content, 'more_body': True})
                    await send({'type': 'http.response.body', 'body': b''})
                finally:
                    # Disconnects and failed sends must also release files and DB connections.
                    with anyio.CancelScope(shield=True):
                        if response is not None:
                            await sync_to_async(response.close)()
                        else:
                            if django_request is not None:
                                await sync_to_async(django_request.close)()
                            await sync_to_async(signals.request_finished.send)(sender=SelectedHandler)


def endpoint_for(callback, name, converters=None):
    async def endpoint(request: Request):
        kwargs = dict(request.path_params)
        for key, converter in (converters or {}).items():
            if key in kwargs:
                kwargs[key] = converter.to_python(str(kwargs[key]))
        return HandlerResponse(request, callback, name, kwargs)

    endpoint.__name__ = name.replace('-', '_') if name else callback.__name__
    return endpoint
