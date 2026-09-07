import math
from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.exceptions import Throttled
from rest_framework.views import APIView, exception_handler
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView

class AuthThrottle(SimpleRateThrottle):
    def get_rate(self):
        return getattr(settings, self.setting) or None

    def get_cache_key(self, request, view):
        # Trust only the direct peer. Forwarded headers from clients cannot bypass limits.
        return self.cache_format % {'scope': self.scope, 'ident': request.META.get('REMOTE_ADDR', 'unknown')}

class LoginThrottle(AuthThrottle):
    scope = 'auth_login'
    setting = 'AUTH_LOGIN_RATE'

class RegistrationThrottle(AuthThrottle):
    scope = 'auth_registration'
    setting = 'AUTH_REGISTRATION_RATE'

class RefreshThrottle(AuthThrottle):
    scope = 'auth_refresh'
    setting = 'AUTH_REFRESH_RATE'

class LimitedTokenRefreshView(TokenRefreshView):
    throttle_classes = [RefreshThrottle]

class AuthPolicyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    def get(self, request):
        response = Response({'registration_enabled': settings.REGISTRATION_ENABLED})
        response['Cache-Control'] = 'no-store'
        return response

def auth_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, Throttled):
        wait = math.ceil(exc.wait or 1)
        response.data = {'error': f'请求过于频繁，请 {wait} 秒后重试', 'code': 'rate_limited', 'retry_after': wait}
    return response
