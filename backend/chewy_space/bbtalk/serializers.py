from rest_framework import serializers
from rest_framework.request import Request
from .models import BBTalk
from tags.models import Tag
from tags.serializers import TagSerializer
from media.serializers import MediaSerializer
from media.models import Media


class BBTalkSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True, default=serializers.CurrentUserDefault())
    # 嵌套显示标签
    tags = TagSerializer(many=True, read_only=True)
    # 嵌套显示媒体文件
    media = MediaSerializer(many=True, read_only=True)

    post_tags = serializers.CharField(write_only=True, allow_null=True, allow_blank=True,
                                      help_text='标签, 按逗号分隔, 例如: 标签1,标签2,标签3',
                                      required=False, label='标签')
    post_media = serializers.ListField(
        child=serializers.CharField(allow_null=True),
        write_only=True,
        required=False,
        allow_null=True,
        help_text='媒体文件 UID 列表',
        label='媒体文件'
    )

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
        for tag in tag_names.split(','):
            tag = tag.strip()
            if tag:  # 确保标签不为空
                tag, created = Tag.objects.get_or_create(name=tag, user=self.context['request'].user)
                tags.append(tag)
        instance.tags.set(tags)

    def save_media_files(self, instance, media_uids):
        # 过滤掉 None/null 值，只保留有效的 UID
        valid_uids = [uid for uid in media_uids if uid is not None]
        # 根据UID列表查询媒体文件
        media_files = Media.objects.filter(user=self.context['request'].user, uid__in=valid_uids, is_deleted=False)
        instance.media.set(media_files)

    def create(self, validated_data):
        # 确保user字段被设置为当前用户
        if 'user' not in validated_data and 'request' in self.context:
            validated_data['user'] = self.context['request'].user
        tag_names: str = validated_data.pop('post_tags', '').strip()
        media_uids = validated_data.pop('post_media', None) or []
        instance: BBTalk = super().create(validated_data)
        self.save_tags(instance, tag_names)
        self.save_media_files(instance, media_uids)
        return instance

    def update(self, instance: BBTalk, validated_data):
        tag_names: str = validated_data.pop('post_tags', '').strip()
        # 获取post_media字段并移除
        media_uids = validated_data.pop('post_media', None)
        self.save_tags(instance, tag_names)
        # 只有当 media_uids 不为 None 时才更新媒体文件
        # 如果为 None 表示不修改媒体，如果为 [] 表示清空所有媒体
        if media_uids is not None:
            self.save_media_files(instance, media_uids)
        return super().update(instance, validated_data)

    class Meta:
        model = BBTalk
        fields = ('uid', 'user', 'post_tags', 'post_media', 'content', 'visibility', 'context', 'tags', 'media', 'create_time', 'update_time')
        read_only_fields = ('uid', 'create_time', 'update_time')


# ========== 同步专用序列化器 ==========

class SyncBBTalkSerializer(serializers.ModelSerializer):
    """同步专用的BBTalk序列化器，包含软删除信息"""
    tags = TagSerializer(many=True, read_only=True)
    media = MediaSerializer(many=True, read_only=True)

    class Meta:
        model = BBTalk
        fields = ['uid', 'content', 'visibility', 'tags', 'media', 'context', 'create_time', 'update_time', 'is_deleted', 'deleted_time']


class SyncRequestSerializer(serializers.Serializer):
    """同步请求参数序列化器"""
    sync_mode = serializers.ChoiceField(
        choices=['full', 'incremental'],
        required=True,
        help_text="同步模式: full(全量) 或 incremental(增量)"
    )
    last_sync_time = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="最后同步时间，ISO 8601格式，增量同步时必填"
    )

    def validate(self, data):
        """验证请求参数"""
        if data['sync_mode'] == 'incremental' and not data.get('last_sync_time'):
            raise serializers.ValidationError({
                'last_sync_time': '增量同步时必须提供last_sync_time参数'
            })
        return data


class SyncResponseSerializer(serializers.Serializer):
    """同步响应数据序列化器"""
    sync_time = serializers.DateTimeField(help_text="本次同步时间戳")
    data = serializers.DictField(help_text="同步数据对象")
    metadata = serializers.DictField(help_text="元数据信息")
