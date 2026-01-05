from django.db import models
from common.models import SoftDeleteModel, generate_uid
import random
import colorsys


def generate_tag_color():
    """生成视觉友好的随机标签颜色"""
    h = random.random()  # 0~1 随机色相
    s = random.uniform(0.6, 0.9)  # 饱和度 60%-90%
    l = random.uniform(0.45, 0.7)  # 亮度 45%-70%
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#{:02x}{:02x}{:02x}".format(int(r*255), int(g*255), int(b*255))


class Tag(SoftDeleteModel):
    uid = models.CharField(max_length=22, unique=True, verbose_name="uid", default=generate_uid, editable=False)
    name = models.CharField(max_length=50, help_text="标签名称，如'生活''工作'", verbose_name="名称")
    color = models.CharField(max_length=7, default=generate_tag_color, help_text="十六进制，如#ff0000", verbose_name="颜色")
    sort_order = models.FloatField(default=0, verbose_name="排序")

    class Meta:
        unique_together = ["name", "user", "is_deleted"]
        verbose_name = verbose_name_plural = "标签"
        ordering = ["-update_time"]
        db_table = "user_tags"
        indexes = [
            # 复合索引：优化常见查询模式
            models.Index(fields=['user', 'is_deleted', '-update_time'], name='tag_user_deleted_time_idx'),
            models.Index(fields=['user', 'is_deleted', 'name'], name='tag_user_deleted_name_idx'),
        ]

    def __str__(self):
        return self.name
