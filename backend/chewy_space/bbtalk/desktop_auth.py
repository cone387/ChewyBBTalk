"""First-party native app authorization: browser consent + S256 PKCE."""
import base64
import hashlib
import re
import secrets
from datetime import timedelta
from urllib.parse import urlsplit

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, authentication_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .auth_policy import LoginThrottle
from .models import DesktopAuthorization


def valid_redirect(value):
    try:
        url = urlsplit(value)
        return (url.scheme == 'http' and url.hostname == '127.0.0.1'
                and url.port is not None and 1024 <= url.port <= 65535
                and url.path == '/callback' and not url.query and not url.fragment
                and not url.username and not url.password)
    except (ValueError, TypeError):
        return False


def reply(data, status=200):
    response = Response(data, status=status)
    response['Cache-Control'] = 'no-store'
    response['Pragma'] = 'no-cache'
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([LoginThrottle])
def authorize(request):
    challenge = request.data.get('code_challenge', '')
    redirect = request.data.get('redirect_uri', '')
    if (not isinstance(challenge, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', challenge)
            or request.data.get('code_challenge_method') != 'S256' or not valid_redirect(redirect)):
        return reply({'detail': '授权请求无效，请从桌面端重新发起'}, 400)
    now = timezone.now()
    DesktopAuthorization.objects.filter(expires_at__lt=now).delete()
    code = secrets.token_urlsafe(32)
    DesktopAuthorization.objects.create(
        code_hash=hashlib.sha256(code.encode()).hexdigest(), user=request.user,
        challenge=challenge, redirect_uri=redirect, expires_at=now + timedelta(minutes=2))
    return reply({'code': code})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def exchange(request):
    verifier = request.data.get('code_verifier', '')
    code = request.data.get('code', '')
    redirect = request.data.get('redirect_uri', '')
    if (not isinstance(verifier, str) or not re.fullmatch(r'[A-Za-z0-9._~-]{43,128}', verifier)
            or not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', code)
            or not valid_redirect(redirect)):
        return reply({'detail': '授权码无效或已过期'}, 400)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    with transaction.atomic():
        grants = DesktopAuthorization.objects.filter(
            code_hash=hashlib.sha256(code.encode()).hexdigest(), challenge=challenge,
            redirect_uri=redirect, expires_at__gt=timezone.now(), consumed=False, user__is_active=True)
        # Conditional UPDATE serializes concurrent exchanges on SQLite and PostgreSQL.
        if grants.update(consumed=True) != 1:
            return reply({'detail': '授权码无效或已过期'}, 400)
        grant = DesktopAuthorization.objects.select_related('user').get(code_hash=hashlib.sha256(code.encode()).hexdigest())
        refresh = RefreshToken.for_user(grant.user)
        return reply({'access': str(refresh.access_token), 'refresh': str(refresh), 'username': grant.user.username})
