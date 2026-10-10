class APIError(Exception):
    def __init__(self, status, data, headers=None):
        self.status, self.data, self.headers = status, data, headers


def fail(status, message, **extra):
    raise APIError(status, {'error': message, **extra})
