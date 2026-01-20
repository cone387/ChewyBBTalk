from django.db import models
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
import random
import colorsys
import base64
from uuid import uuid4
from chewy_attachment.django_app.models import AttachmentBase


def generate_uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


class User(models.Model):
    """
    用户模型：代表系统中的一个用户实体
    
    一个用户可以有多个身份（Identity）认证方式
    """
    id = models.BigAutoField(primary_key=True, verbose_name="用户ID")
    username = models.CharField(max_length=150, unique=True, db_index=True, verbose_name="用户名")
    email = models.EmailField(blank=True, verbose_name="邮箱")
    display_name = models.CharField(max_length=150, blank=True, verbose_name="显示名称")
    avatar = models.URLField(blank=True, verbose_name="头像")
    bio = models.TextField(blank=True, verbose_name="个人简介")
    
    # 账户状态
    is_active = models.BooleanField(default=True, verbose_name="激活状态")
    is_staff = models.BooleanField(default=False, verbose_name="管理员")
    is_superuser = models.BooleanField(default=False, verbose_name="超级管理员")
    
    # 时间字段
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
            models.Index(fields=['username'], name='user_username_idx'),
            models.Index(fields=['email'], name='user_email_idx'),
            models.Index(fields=['is_active', '-create_time'], name='user_active_time_idx'),
        ]

    def __str__(self):
        return self.username

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def has_perm(self, perm, obj=None):
        """检查用户是否有指定权限"""
        return self.is_superuser or self.is_staff

    def has_module_perms(self, app_label):
        """检查用户是否有指定应用的权限"""
        return self.is_superuser or self.is_staff


class Identity(models.Model):
    """
    身份模型：代表一种登录认证方式
    
    一个用户可以绑定多个身份（多种登录方式）
    支持：密码登录、OAuth、微信、邮箱验证码等
    """
    IDENTITY_TYPE_CHOICES = [
        ('password', '密码登录'),
        ('oauth', 'OAuth登录'),
        ('wechat', '微信登录'),
        ('email_code', '邮箱验证码'),
    ]
    
    id = models.BigAutoField(primary_key=True, verbose_name="身份ID")
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='identities',
        db_constraint=False,
        verbose_name="用户"
    )
    identity_type = models.CharField(
        max_length=32, 
        choices=IDENTITY_TYPE_CHOICES,
        verbose_name="身份类型"
    )
    
    # 通用认证字段
    identifier = models.CharField(
        max_length=255,
        verbose_name="标识符",
        help_text="密码登录存username，OAuth存provider+openid，邮箱登录存email"
    )
    credential = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="凭证",
        help_text="密码登录存密码哈希，OAuth存access_token，验证码登录不存"
    )
    
    # OAuth 专用字段
    provider = models.CharField(
        max_length=32, 
        blank=True,
        verbose_name="OAuth提供商",
        help_text="如: github, google, wechat"
    )
    provider_user_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="第三方用户ID"
    )
    
    # 状态字段
    is_verified = models.BooleanField(default=False, verbose_name="是否已验证")
    is_primary = models.BooleanField(default=False, verbose_name="是否为主身份")
    
    # 时间字段
    create_time = models.DateTimeField(default=timezone.now, verbose_name="创建时间")
    update_time = models.DateTimeField(auto_now=True, verbose_name="更新时间")
    last_used = models.DateTimeField(null=True, blank=True, verbose_name="最后使用时间")

    class Meta:
        db_table = "cb_identities"
        verbose_name = verbose_name_plural = "身份"
        ordering = ["-create_time"]
        unique_together = [
            ('identity_type', 'identifier'),  # 同一类型的标识符唯一
        ]
        indexes = [
            models.Index(fields=['user', 'identity_type'], name='identity_user_type_idx'),
            models.Index(fields=['identity_type', 'identifier'], name='identity_type_id_idx'),
            models.Index(fields=['provider', 'provider_user_id'], name='identity_provider_idx'),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.get_identity_type_display()}"
    
    def set_password(self, raw_password):
        """设置密码（仅用于 password 类型）"""
        if self.identity_type == 'password':
            self.credential = make_password(raw_password)
    
    def check_password(self, raw_password):
        """验证密码（仅用于 password 类型）"""
        if self.identity_type == 'password':
            return check_password(raw_password, self.credential)
        return False


class BaseModel(models.Model):
    """业务模型基类"""
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_constraint=False, 
        verbose_name="用户", 
        db_index=True
    )
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
        db_table = "cb_tags"
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
        db_table="cb_bbtalk_tag_relations"
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
        db_table = "cb_bbtalks"
        indexes = [
            models.Index(fields=['user', '-update_time'], name='bbtalk_user_time_idx'),
            models.Index(fields=['user', '-create_time'], name='bbtalk_user_create_idx'),
        ]


class Attachment(AttachmentBase):
    """
    自定义附件模型
    
    使用 ChewyAttachment 的模型交换机制，类似 Django 的 AUTH_USER_MODEL
    这样可以自定义表名并避免多项目冲突
    """
    
    class Meta(AttachmentBase.Meta):
        db_table = "cb_attachments"  # 自定义表名，与项目其他表保持一致的 cb_ 前缀
        abstract = False
        app_label = 'bbtalk'
        verbose_name = "附件"
        verbose_name_plural = "附件"
