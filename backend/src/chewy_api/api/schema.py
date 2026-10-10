def install_openapi(app):
    original_openapi = app.openapi

    def openapi():
        schema = original_openapi()
        schema.setdefault('components', {}).setdefault('securitySchemes', {})['jwtAuth'] = {
            'type': 'http',
            'scheme': 'bearer',
            'bearerFormat': 'JWT',
        }
        public = (
            '/auth/token/',
            '/auth/login/',
            '/auth/register/',
            '/auth/policy/',
            '/auth/password/',
            '/auth/desktop/exchange/',
            '/public/',
        )
        for path, methods in schema['paths'].items():
            for method, operation in methods.items():
                if (
                    method in {'get', 'post', 'put', 'patch', 'delete'}
                    and path.startswith('/api/v1/')
                    and not any(value in path for value in public)
                ):
                    operation['security'] = [{'jwtAuth': []}]
        return schema

    app.openapi = openapi
