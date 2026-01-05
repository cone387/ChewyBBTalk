from django.db import models
from django.db.models.fields.files import FieldFile
from django.utils import timezone
from .storage import QiniuPrivateStorage, LocalStorage
from .choices import MediaEngine, MediaType
import base64
from uuid import uuid4


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


def get_file_storage(engine=None):
    if engine == MediaEngine.LOCAL:
        return LocalStorage()
    else:
        return QiniuPrivateStorage()


class MediaFileFiledFile(FieldFile):
    def __init__(self, instance: 'Media', field, name):
        super(MediaFileFiledFile, self).__init__(instance, field, name)
        self.storage = get_file_storage(instance.engine)


class MediaFileFiled(models.FileField):
    attr_class = MediaFileFiledFile


def media_upload_to(instance: 'Media', filename: str):
    return f'chewy-space/%s/%s' % (instance.user_id,
        (timezone.now().strftime('%Y%m%d%H%M%S%f') + "." + filename.rsplit('.', 1)[1]) if '.' in filename else ''
    )


class Media(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.CharField(max_length=36, verbose_name="用户ID", db_index=True)
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间", db_index=True)
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间", db_index=True)
    uid = models.CharField(max_length=22, unique=True, verbose_name="uid", default=generate_uid, editable=False)
    """媒体文件模型（专注于文件存储）"""
    file = MediaFileFiled(
        upload_to=media_upload_to,
        verbose_name="文件"
    )
    engine = models.IntegerField(verbose_name='存储引擎', choices=MediaEngine.choices, default=MediaEngine.QINIU)
    media_type = models.CharField(
        max_length=20,
        choices=MediaType.choices,
        default=MediaType.AUTO,
        verbose_name="媒体类型"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="文件描述"
    )

    def __str__(self):
        return f"{self.file.name} - {self.media_type}"
    
    def save(self, *args, **kwargs):
        # 如果 media_type 为 auto，自动检测文件类型
        if self.media_type == MediaType.AUTO and self.file:
            self.media_type = MediaType.detect(self.file.name)
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-create_time"]
        verbose_name = "媒体文件"
        verbose_name_plural = "媒体文件"
        db_table = "user_media"

