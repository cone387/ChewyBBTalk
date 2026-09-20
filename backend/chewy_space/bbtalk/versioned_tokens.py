from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User


class VersionedRefreshToken(RefreshToken):
    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        token['credential_version'] = user.credential_version
        return token


def check_version(token, user):
    # Tokens issued before this migration are only valid until the first reset.
    if not user or not user.is_active or token.get('credential_version', 0) != user.credential_version:
        raise AuthenticationFailed('密码已变更，请重新登录', code='credentials_changed')


class VersionedJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        check_version(validated_token, user)
        return user


class VersionedTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = self.token_class(attrs['refresh'])
        user = User.objects.filter(pk=token.get('user_id')).first()
        check_version(token, user)
        return super().validate(attrs)
