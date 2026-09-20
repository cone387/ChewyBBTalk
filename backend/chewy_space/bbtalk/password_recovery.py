"""Password changes and single-use, hashed email recovery codes."""
import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_policy import AuthThrottle
from .models import DesktopAuthorization, Identity, PasswordRecovery, User


class RecoveryThrottle(AuthThrottle):
    scope = 'password_recovery'
    setting = 'PASSWORD_RECOVERY_RATE'


class RecoveryAccountThrottle(RecoveryThrottle):
    scope = 'password_recovery_account'

    def get_cache_key(self, request, view):
        username = str(request.data.get('username', '')).strip().casefold()
        return self.cache_format % {'scope': self.scope, 'ident': hashlib.sha256(username.encode()).hexdigest()}


class PasswordInput(serializers.Serializer):
    new_password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False)


def set_password(user, password):
    validate_password(password, user=user)
    identity = Identity.objects.select_for_update().get(user=user, identity_type='password')
    identity.set_password(password)
    identity.save(update_fields=['credential', 'update_time'])
    user.credential_version += 1
    user.save(update_fields=['credential_version', 'update_time'])
    PasswordRecovery.objects.filter(user=user).delete()
    DesktopAuthorization.objects.filter(user=user).delete()


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [RecoveryThrottle]

    def post(self, request):
        data = PasswordInput(data=request.data)
        data.is_valid(raise_exception=True)
        old_password = request.data.get('old_password')
        if not isinstance(old_password, str):
            return Response({'error': '请输入当前密码'}, status=400)
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=request.user.pk)
                identity = Identity.objects.filter(user=user, identity_type='password').first()
                if not identity or not identity.check_password(old_password):
                    return Response({'error': '当前密码不正确'}, status=400)
                set_password(user, data.validated_data['new_password'])
        except ValidationError as error:
            return Response({'error': '；'.join(error.messages)}, status=400)
        return Response({'message': '密码已更新，请重新登录'})


class RecoveryRequestInput(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)


class RecoveryRequestView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RecoveryThrottle, RecoveryAccountThrottle]

    def post(self, request):
        if not settings.PASSWORD_RECOVERY_ENABLED:
            return Response({'error': '当前服务暂未启用邮件找回，请联系服务提供方', 'code': 'recovery_disabled'}, status=503)
        data = RecoveryRequestInput(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.filter(username=data.validated_data['username'], email__iexact=data.validated_data['email'], is_active=True).first()
        if user and Identity.objects.filter(user=user, identity_type='password').exists():
            code = secrets.token_urlsafe(24)
            digest = hashlib.sha256(code.encode()).hexdigest()
            PasswordRecovery.objects.update_or_create(user=user, defaults={
                'code_hash': digest, 'email': user.email, 'credential_version': user.credential_version,
                'expires_at': timezone.now() + timedelta(minutes=15),
            })
            try:
                sent = send_mail('ChewyBBTalk 密码找回', f'请在 App 的“找回密码”中粘贴以下恢复码：\n\n{code}\n\n恢复码 15 分钟内有效，仅可使用一次。请勿转发。如非本人操作，可忽略本邮件。', settings.DEFAULT_FROM_EMAIL, [user.email])
                if not sent:
                    raise RuntimeError('mail_not_sent')
            except Exception:
                # Do not log codes, credentials or mail provider response bodies.
                logging.getLogger(__name__).warning('Password recovery mail delivery failed')
                PasswordRecovery.objects.filter(user=user, code_hash=digest).delete()
        response = Response({'message': '如果用户名和邮箱匹配，你将收到恢复邮件。请检查收件箱及垃圾邮件；未收到时可稍后重试或联系服务提供方。'})
        response['Cache-Control'] = 'no-store'
        return response


class RecoveryConfirmInput(PasswordInput):
    username = serializers.CharField(max_length=150)
    code = serializers.CharField(min_length=32, max_length=32)


class RecoveryConfirmView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RecoveryThrottle, RecoveryAccountThrottle]

    def post(self, request):
        if not settings.PASSWORD_RECOVERY_ENABLED:
            return Response({'error': '当前服务暂未启用邮件找回'}, status=503)
        data = RecoveryConfirmInput(data=request.data)
        data.is_valid(raise_exception=True)
        digest = hashlib.sha256(data.validated_data['code'].encode()).hexdigest()
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(username=data.validated_data['username'], is_active=True).first()
                grant = PasswordRecovery.objects.filter(user=user, code_hash=digest, expires_at__gt=timezone.now()).first() if user else None
                if not grant or grant.email != user.email or grant.credential_version != user.credential_version:
                    return Response({'error': '恢复码无效或已过期，请重新申请'}, status=400)
                # Conditional delete is the single-use claim even on SQLite.
                if not PasswordRecovery.objects.filter(pk=grant.pk, code_hash=digest).delete()[0]:
                    return Response({'error': '恢复码已使用，请重新申请'}, status=400)
                set_password(user, data.validated_data['new_password'])
        except ValidationError as error:
            return Response({'error': '；'.join(error.messages)}, status=400)
        return Response({'message': '密码已重置，请使用新密码登录'})
