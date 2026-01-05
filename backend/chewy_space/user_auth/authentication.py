from rest_framework.authentication import BaseAuthentication, get_authorization_header, exceptions
from django.utils.translation import gettext_lazy as _
from django.db.utils import Error
from django.utils import timezone
from . models import APIKey


class APIKeyAuthentication(BaseAuthentication):
    """
    Simple token based authentication.

    Clients should authenticate by passing the token key in the "Authorization"
    HTTP header, prepended with the string "Token ".  For example:

        Authorization: Bearer 401f7ac837da42b97f613d789819ff93537bee6a
    """

    keyword = 'Token'
    model = APIKey

    """
    A custom API key model may be used, but must have the following properties.

    * key -- The string identifying the API key
    * user -- The user to which the API key belongs
    """

    def authenticate(self, request):
        auth = get_authorization_header(request).split()

        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth) == 1:
            msg = _('Invalid token header. No credentials provided.')
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = _('Invalid token header. Token string should not contain spaces.')
            raise exceptions.AuthenticationFailed(msg)

        try:
            key = auth[1].decode()
        except UnicodeError:
            msg = _('Invalid token header. Token string should not contain invalid characters.')
            raise exceptions.AuthenticationFailed(msg)

        return self.authenticate_credentials(key)

    def authenticate_credentials(self, key):
        try:
            api_key = APIKey.objects.get_from_key(key)
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed(_('Invalid key.'))

        if api_key.revoked or api_key.expired:
            raise exceptions.AuthenticationFailed(_('Invalid key or Expired key.'))

        if not api_key.user.is_active:
            raise exceptions.AuthenticationFailed(_('User inactive or deleted.'))

        try:
            api_key.latest_used_date = timezone.now()
            api_key.usage_count += 1
            api_key.save(update_fields=["latest_used_date", "usage_count"])
        except Error:
            pass

        return api_key.user, api_key

    def authenticate_header(self, request):
        return self.keyword