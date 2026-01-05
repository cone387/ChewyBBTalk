from rest_framework import serializers
from rest_framework.request import Request
from .models import BBTalk, Tag, generate_tag_color
from media.serializers import MediaSerializer
from media.models import Media


class TagSerializer(serializers.ModelSerializer):
    bbtalk_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Tag
        fields = ('uid', 'name', 'color', 'sort_order', 'bbtalk_count', 'create_time', 'update_time')
        read_only_fields = ('uid', 'bbtalk_count', 'create_time', 'update_time')


class BBTalkSerializer(serializers.ModelSerializer):
    user_id = serializers.CharField(read_only=True)
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
        user_id = self.context['request'].user.id
        for tag in tag_names.split(','):
            tag = tag.strip()
            if tag:  # 确保标签不为空
                tag, created = Tag.objects.get_or_create(name=tag, user_id=user_id)
                tags.append(tag)
        instance.tags.set(tags)

    def save_media_files(self, instance, media_uids):
        # 过滤掉 None/null 值，只保留有效的 UID
        valid_uids = [uid for uid in media_uids if uid is not None]
        # 根据UID列表查询媒体文件
        user_id = self.context['request'].user.id
        media_files = Media.objects.filter(user_id=user_id, uid__in=valid_uids)
        instance.media.set(media_files)

    def create(self, validated_data):
        # 确保user_id字段被设置为当前用户
        if 'user_id' not in validated_data and 'request' in self.context:
            validated_data['user_id'] = self.context['request'].user.id
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
        fields = ('uid', 'user_id', 'post_tags', 'post_media', 'content', 'visibility', 'context', 'tags', 'media', 'create_time', 'update_time')
        read_only_fields = ('uid', 'user_id', 'create_time', 'update_time')

