from django.db import models
from django.utils import timezone
from media.models import Media
import random
import colorsys
import base64
from uuid import uuid4


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


class BaseModel(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.CharField(max_length=36, verbose_name="用户ID", db_index=True)
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间", db_index=True)
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间", db_index=True)

    class Meta:
        abstract = True


def generate_tag_color():
    """生成视觉友好的随机标签颜色"""
    h = random.random()
    s = random.uniform(0.6, 0.9)
    l = random.uniform(0.45, 0.7)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#{:02x}{:02x}{:02x}".format(int(r*255), int(g*255), int(b*255))


class Tag(BaseModel):
    uid = models.CharField(max_length=22, unique=True, verbose_name="uid", default=generate_uid, editable=False)
    name = models.CharField(max_length=50, help_text="标签名称", verbose_name="名称")
    color = models.CharField(max_length=7, default=generate_tag_color, help_text="十六进制，如#ff0000", verbose_name="颜色")
    sort_order = models.FloatField(default=0, verbose_name="排序")

    class Meta:
        unique_together = ["name", "user_id"]
        verbose_name = verbose_name_plural = "标签"
        ordering = ["-update_time"]
        db_table = "user_tags"
        indexes = [
            models.Index(fields=['user_id', '-update_time'], name='tag_user_time_idx'),
            models.Index(fields=['user_id', 'name'], name='tag_user_name_idx'),
        ]

    def __str__(self):
        return self.name


class BBTalk(BaseModel):
    uid = models.CharField(max_length=22, unique=True, verbose_name="uid", default=generate_uid, editable=False)
    content = models.TextField(help_text="支持 Markdown", verbose_name="内容")
    visibility = models.CharField(
        max_length=16,
        choices=(
            ("public", "公开"),
            ("private", "仅自己可见"),
        ),
        default="private",
        verbose_name="可见性"
    )
    tags = models.ManyToManyField(
        'Tag',
        related_name="bbtalks",
        verbose_name="标签",
        db_table="bbtalk_tags_relations"
    )
    media = models.ManyToManyField(
        Media,
        related_name="bbtalks",
        verbose_name="媒体附件",
        db_table="bbtalk_media_relations"
    )
    context = models.JSONField(
        default=dict,
        blank=True,
        help_text="存储 GPS/天气/设备等上下文信息",
        verbose_name="上下文信息"
    )

    def __str__(self):
        return self.content[:20]

    class Meta:
        ordering = ["-update_time"]
        verbose_name = verbose_name_plural = "碎碎念"
        db_table = "user_bbtalks"
        indexes = [
            models.Index(fields=['user_id', '-update_time'], name='bbtalk_user_time_idx'),
            models.Index(fields=['user_id', '-create_time'], name='bbtalk_user_create_idx'),
        ]