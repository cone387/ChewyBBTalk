"""Describe the existing authentication policies in the combined OpenAPI schema."""
from drf_spectacular.authentication import SessionScheme
from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class VersionedJWTScheme(SimpleJWTScheme):
    target_class = 'bbtalk.versioned_tokens.VersionedJWTAuthentication'


class BBTalkSessionScheme(SessionScheme):
    target_class = 'bbtalk.authentication.SessionAuthentication'
