import typing

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from .crypto import KeyGenerator, concatenate
from common.models import BaseModel


class APIKeyManager(models.Manager):
    key_generator = KeyGenerator()

    def assign_key(self, obj: "APIKey") -> str:
        key, prefix, hashed_key = self.key_generator.generate()
        obj.key = concatenate(prefix, hashed_key)
        obj.prefix = prefix
        obj.hashed_key = hashed_key

        return key

    def create_key(self, **kwargs: typing.Any) -> typing.Tuple["APIKey", str]:
        # Prevent from manually setting the primary key.
        kwargs.pop("id", None)
        obj = self.model(**kwargs)
        key = self.assign_key(obj)
        obj.save()
        return obj, key

    def get_usable_keys(self) -> models.QuerySet:
        return self.filter(revoked=False)

    def get_from_key(self, key: str) -> "APIKey":
        prefix, _, _ = key.partition(".")
        queryset = self.get_usable_keys()

        try:
            api_key = queryset.get(prefix=prefix)
        except self.model.DoesNotExist:
            raise  # For the sake of being explicit.

        if not api_key.is_valid(key):
            raise self.model.DoesNotExist("Key is not valid.")
        else:
            return api_key

    def is_valid(self, key: str) -> bool:
        try:
            api_key = self.get_from_key(key)
        except self.model.DoesNotExist:
            return False

        if api_key.expired:
            return False

        return True


class APIKey(BaseModel):
    objects = APIKeyManager()
    name = models.CharField(max_length=50, verbose_name="名称", help_text="名称")
    prefix = models.CharField(max_length=8, unique=True, editable=False, verbose_name="前缀")
    hashed_key = models.CharField(max_length=150, editable=False, verbose_name="哈希")
    key = models.CharField(max_length=150, unique=True, editable=False, verbose_name="密钥")
    latest_used_date = models.DateTimeField(null=True, blank=True, verbose_name="最新使用日期")
    usage_count = models.PositiveIntegerField(default=0, verbose_name="使用次数")
    revoked = models.BooleanField(default=False, verbose_name="吊销", help_text="吊销的 API 密钥将无法再被客户端使用。")
    expiry_time = models.DateTimeField(blank=True, null=True, verbose_name="过期时间")

    class Meta:
        ordering = ("-create_time",)
        verbose_name = verbose_name_plural = "密钥"
        db_table = "user_api_keys"

    def __init__(self, *args: typing.Any, **kwargs: typing.Any):
        super().__init__(*args, **kwargs)
        # Store the initial value of `revoked` to detect changes.
        self._initial_revoked = self.revoked

    @property
    def expired(self) -> bool:
        if self.expiry_time is None:
            return False
        return self.expiry_time < timezone.now()

    def is_valid(self, key: str) -> bool:
        key_generator = type(self).objects.key_generator
        valid = key_generator.verify(key, self.hashed_key)

        # Transparently update the key to use the preferred hasher
        # if it is using an outdated hasher.
        if valid and not key_generator.using_preferred_hasher(self.hashed_key):
            # Note that since the PK includes the hashed key,
            # they will be internally inconsistent following this upgrade.
            # See: https://github.com/florimondmanca/djangorestframework-api-key/issues/128
            self.hashed_key = key_generator.hash(key)
            self.save()

        return valid

    def clean(self) -> None:
        self._validate_revoked()

    def save(self, *args: typing.Any, **kwargs: typing.Any) -> None:
        self._validate_revoked()
        super().save(*args, **kwargs)

    def _validate_revoked(self) -> None:
        if self._initial_revoked and not self.revoked:
            raise ValidationError(
                _("The API key has been revoked, which cannot be undone.")
            )

    def __str__(self) -> str:
        return str(self.name)
