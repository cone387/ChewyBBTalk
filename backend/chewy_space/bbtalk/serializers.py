from rest_framework import serializers
from rest_framework.request import Request
from .models import BBTalk, Tag, generate_tag_color, User


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

