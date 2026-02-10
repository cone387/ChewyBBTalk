from rest_framework import serializers
from rest_framework.request import Request
from .models import BBTalk, Tag, generate_tag_color, User, UserStorageSettings


class UserSerializer(serializers.ModelSerializer):
    """用户序列化器"""
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'display_name', 'avatar', 'bio', 'is_staff', 'create_time', 'last_login')
        read_only_fields = ('id', 'username', 'is_staff', 'create_time', 'last_login')


class TagSerializer(serializers.ModelSerializer):
    bbtalk_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Tag
        fields = ('uid', 'name', 'color', 'sort_order', 'bbtalk_count', 'create_time', 'update_time')
        read_only_fields = ('uid', 'bbtalk_count', 'create_time', 'update_time')


class BBTalkSerializer(serializers.ModelSerializer):
    # 嵌套显示标签
    tags = TagSerializer(many=True, read_only=True)
    # attachments 字段用于存储附件元信息列表
    attachments = serializers.JSONField(required=False, default=list)

    post_tags = serializers.CharField(write_only=True, allow_null=True, allow_blank=True,
                                      help_text='标签, 按逗号分隔, 例如: 标签1,标签2,标签3',
                                      required=False, label='标签')

    def save(self, **kwargs):
        request: Request = self.context['request']
        ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        context = self.validated_data.pop('context', None) or kwargs.pop('context', None) or {}
        context['device'] = {
            'ip': ip,
            'ua': user_agent
        }
        return super().save(context=context, **kwargs)

    def save_tags(self, instance, tag_names):
        tags = []
        user = instance.user
        for tag in tag_names.split(','):
            tag = tag.strip()
            if tag:  # 确保标签不为空
                tag, created = Tag.objects.get_or_create(name=tag, user=user)
                tags.append(tag)
        instance.tags.set(tags)

    def create(self, validated_data):
        # 确保user字段被设置为当前用户
        if 'user' not in validated_data and 'request' in self.context:
            validated_data['user'] = self.context['request'].user
        tag_names: str = validated_data.pop('post_tags', '').strip()
        instance: BBTalk = super().create(validated_data)
        self.save_tags(instance, tag_names)
        return instance

    def update(self, instance: BBTalk, validated_data):
        tag_names: str = validated_data.pop('post_tags', '').strip()
        self.save_tags(instance, tag_names)
        return super().update(instance, validated_data)

    class Meta:
        model = BBTalk
        fields = ('uid', 'user', 'post_tags', 'content', 'visibility', 'context', 'tags', 'attachments', 'create_time', 'update_time')
        read_only_fields = ('uid', 'user', 'create_time', 'update_time')


class UserStorageSettingsSerializer(serializers.ModelSerializer):
    """用户存储设置序列化器"""
    
    # 写入时接收密钥，但读取时不返回完整密钥
    s3_secret_access_key = serializers.CharField(
        write_only=True, 
        required=False, 
        allow_blank=True,
        help_text="S3 密钥（仅写入）"
    )
    
    # 用于显示密钥是否已配置
    has_secret_key = serializers.SerializerMethodField()
    
    # S3 配置是否完整
    is_s3_configured = serializers.SerializerMethodField()
    
    class Meta:
        model = UserStorageSettings
        fields = (
            'id',
            'name',
            'storage_type',
            's3_access_key_id',
            's3_secret_access_key',
            's3_bucket_name',
            's3_region_name',
            's3_endpoint_url',
            's3_custom_domain',
            'is_active',
            'has_secret_key',
            'is_s3_configured',
            'create_time',
            'update_time',
        )
        read_only_fields = ('id', 'has_secret_key', 'is_s3_configured', 'create_time', 'update_time')
    
    def get_has_secret_key(self, obj) -> bool:
        """检查是否已配置密钥"""
        return bool(obj.s3_secret_access_key)
    
    def get_is_s3_configured(self, obj) -> bool:
        """检查 S3 配置是否完整"""
        return obj.is_s3_configured()
    
    def update(self, instance, validated_data):
        # 如果没有提供新的密钥，保留原有密钥
        if 's3_secret_access_key' not in validated_data or not validated_data.get('s3_secret_access_key'):
            validated_data.pop('s3_secret_access_key', None)
        return super().update(instance, validated_data)

