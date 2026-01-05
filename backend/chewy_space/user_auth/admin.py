import typing

from django.contrib import admin, messages
from django.db import models
from django.http.request import HttpRequest
from .models import APIKey
from common.admin import BaseAdmin


@admin.register(APIKey)
class APIKeyAdmin(BaseAdmin):
    model: typing.Type[APIKey]

    list_display = (
        "id",
        "name",
        "prefix",
        "expiry_time",
        "active",
        "latest_used_date",
        "usage_count",
        "create_time",
    )
    fields = (
        ("name", "revoked"),
        "prefix",
        "expiry_time",
        "create_time"
    )
    list_filter = ("create_time",)
    search_fields = ("name", "prefix")

    def active(self, obj: APIKey) -> bool:
        return not obj.revoked and not obj.expired
    active.boolean = True
    active.short_description = "有效"

    def get_readonly_fields(
        self, request: HttpRequest, obj: models.Model = None
    ) -> typing.Tuple[str, ...]:
        obj = typing.cast(APIKey, obj)
        fields: typing.Tuple[str, ...]

        fields = ("prefix",)
        if obj is not None and obj.revoked:
            fields = fields + ("name", "revoked", "expiry_time")

        return fields

    def save_model(
        self,
        request: HttpRequest,
        obj: APIKey,
        form: typing.Any = None,
        change: bool = False,
    ) -> None:
        created = not obj.pk

        if created:
            obj.user = request.user
            key = self.model.objects.assign_key(obj)
            obj.save()
            message = "API Key已经创建. 请复制并保存这个密钥, 因为之后将无法再次查看: {}".format(key)
            messages.add_message(request, messages.WARNING, message)
        else:
            obj.save()
