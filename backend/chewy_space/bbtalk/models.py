from django.db import models
from django.utils import timezone
import random
import colorsys
import base64
from uuid import uuid4


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


class User(models.Model):
    """
    本应用的基础用户模型，通过 authelia_user_id 等字段关联到外部认证服务
    支持多种认证源：Authelia、Keycloak 等（通过不同的字段）
    """
    id = models.BigAutoField(primary_key=True, verbose_name="用户ID")
    username = models.CharField(max_length=150, unique=True, verbose_name="用户名")
    email = models.EmailField(blank=True, verbose_name="邮箱")
    display_name = models.CharField(max_length=150, blank=True, verbose_name="显示名称")
    avatar = models.URLField(blank=True, verbose_name="头像")
    
    # 认证服务字段（可扩展）
    authelia_user_id = models.CharField(
        max_length=255, 
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Authelia用户ID",
        help_text="来自 Authelia 认证服务的用户唯一标识"
    )
    # 将来如果需要支持 Keycloak，可以添加：
    # keycloak_user_id = models.CharField(max_length=255, unique=True, null=True, blank=True, ...)
    
    groups = models.JSONField(default=list, blank=True, verbose_name="用户组")
    is_active = models.BooleanField(default=True, verbose_name="激活状态")
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间")
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间")
    last_login = models.DateTimeField(null=True, blank=True, verbose_name="最后登录")

    # Django 认证系统要求的属性
    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = "cb_users"
        verbose_name = verbose_name_plural = "用户"
        ordering = ["-create_time"]
        indexes = [
            models.Index(fields=['authelia_user_id'], name='user_authelia_idx'),
            models.Index(fields=['username'], name='user_username_idx'),
        ]

    def __str__(self):
        return self.username

    @property
    def is_staff(self):
        """是否为管理员"""
        return 'admin' in self.groups or 'admins' in self.groups

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def has_perm(self, perm, obj=None):
        """检查用户是否有指定权限"""
        # 管理员拥有所有权限
        return self.is_staff

    def has_module_perms(self, app_label):
        """检查用户是否有指定应用的权限"""
        return self.is_staff


class BaseModel(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_constraint=False, verbose_name="用户", db_index=True)
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
        unique_together = [["name", "user"]]
        verbose_name = verbose_name_plural = "标签"
        ordering = ["-update_time"]
        db_table = "cb_user_tags"
        indexes = [
            models.Index(fields=['user', '-update_time'], name='tag_user_time_idx'),
            models.Index(fields=['user', 'name'], name='tag_user_name_idx'),
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
        blank=True,
        db_constraint=False,
        db_table="cb_bbtalk_tags_relations"
    )
    attachments = models.JSONField(
        default=list,
        blank=True,
        help_text="附件列表，存储附件元信息的字典列表",
        verbose_name="附件"
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
        db_table = "cb_user_bbtalks"
        indexes = [
            models.Index(fields=['user', '-update_time'], name='bbtalk_user_time_idx'),
            models.Index(fields=['user', '-create_time'], name='bbtalk_user_create_idx'),
        ]