"""Hidden aliases for deployed clients; business handlers only declare canonical paths."""

from copy import copy

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.routing import compile_path


def reject_legacy_query_conflicts(request: Request):
    # Query models receive populated defaults; inspect presence before those defaults
    # can make an explicit `format=json` indistinguishable from an omitted format.
    aliases = {
        'tags__name': 'tags',
        'create_time__gte': 'created_from',
        'create_time__lte': 'created_to',
        'create_date__gte': 'created_date_from',
        'create_date__lte': 'created_date_to',
        'create_time__date': 'created_on',
        'export_format': 'format',
    }
    errors = [
        {'type': 'value_error', 'loc': ('query', new), 'msg': f'不能同时提供 {old} 和 {new}'}
        for old, new in aliases.items()
        if old in request.query_params and new in request.query_params
    ]
    if errors:
        raise RequestValidationError(errors)


def alias(route: APIRoute, path: str, methods=None) -> APIRoute:
    result = copy(route)
    result.path = path
    result.path_regex, result.path_format, result.param_convertors = compile_path(path)
    result.methods = methods or route.methods.copy()
    result.include_in_schema = False
    return result


def compatible_routes(router):
    patches = {
        route.path: route
        for route in router.routes
        if isinstance(route, APIRoute) and 'PATCH' in route.methods
    }
    for route in router.routes:
        yield route
        if not isinstance(route, APIRoute):
            continue
        paths = [route.path]
        if route.path.startswith('/api/v1/'):
            paths.append(route.path + '/')
            if route.path.endswith('/settings/storage') and 'POST' in route.methods:
                paths.append(route.path + '/create/')
            if route.path.endswith('/settings/storage/{pk}') and 'DELETE' in route.methods:
                paths.append(route.path + '/delete/')
            for path in paths[1:]:
                # Historical tag PUT accepted omitted names just like PATCH.
                source = (
                    patches[route.path]
                    if 'PUT' in route.methods and route.path.endswith('/tags/{uid}')
                    else route
                )
                yield alias(source, path, route.methods.copy())
        if 'GET' in route.methods:
            for path in paths:
                yield alias(route, path, {'HEAD'})
