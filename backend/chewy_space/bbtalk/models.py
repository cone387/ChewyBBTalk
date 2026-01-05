from django.db import models
from tags.models import Tag
from media.models import Media
from common.models import SoftDeleteModel, generate_uid


class BBTalk(SoftDeleteModel):
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
        Tag,
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
            # 复合索引：优化常见查询模式 (user + is_deleted + update_time)
            models.Index(fields=['user', 'is_deleted', '-update_time'], name='bbtalk_user_deleted_time_idx'),
            # 优化按创建时间查询
            models.Index(fields=['user', 'is_deleted', '-create_time'], name='bbtalk_user_deleted_create_idx'),
        ]