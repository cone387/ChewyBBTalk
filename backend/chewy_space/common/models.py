from django.db import models
from django.utils import timezone
from django.conf import settings
import base64
from uuid import uuid4


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        return super().update(is_deleted=True, deleted_time=timezone.now())

    def restore(self):
        return super().update(is_deleted=False, deleted_time=None)


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(is_deleted=False)

    def deleted(self):
        """仅返回已删除的记录"""
        return super().get_queryset().filter(is_deleted=True)

    def with_deleted(self):
        """返回包括已删除记录的完整查询集"""
        return super().get_queryset()


class BaseModel(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, verbose_name="用户",
                             db_constraint=False, db_index=True)
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间", db_index=True)
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间", db_index=True)

    class Meta:
        abstract = True


class SoftDeleteModel(BaseModel):
    is_deleted = models.BooleanField(default=False, verbose_name="是否删除", db_index=True)
    deleted_time = models.DateTimeField(null=True, blank=True, verbose_name="删除时间")
    
    objects = SoftDeleteManager()

    def delete(self, using = None, keep_parents = False):
        if not self.is_deleted:
            self.is_deleted = True
            self.deleted_time = timezone.now()
            self.save(update_fields=["is_deleted", "deleted_time"], using=using)

    def restore(self):
        """恢复被软删除的记录"""
        if self.is_deleted:
            self.is_deleted = False
            self.deleted_time = None
            self.save(update_fields=["is_deleted", "deleted_time"])

    class Meta:
        abstract = True