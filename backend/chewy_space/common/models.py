from django.db import models
from django.utils import timezone
from django.conf import settings
import base64
from uuid import uuid4


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


class BaseModel(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, verbose_name="用户",
                             db_constraint=False, db_index=True)
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间", db_index=True)
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间", db_index=True)

    class Meta:
        abstract = True