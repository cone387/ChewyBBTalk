from rest_framework import serializers
from .models import Tag


class TagSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    bbtalk_count = serializers.IntegerField(read_only=True)
    task_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Tag
        fields = ('uid', 'user', 'name', 'color', 'sort_order', 'bbtalk_count', 'task_count', 'create_time', 'update_time')
        read_only_fields = ('uid', 'user', 'bbtalk_count', 'task_count', 'create_time', 'update_time')


# ========== 同步专用序列化器 ==========

class SyncTagSerializer(serializers.ModelSerializer):
    """同步专用的Tag序列化器，包含软删除信息"""
    class Meta:
        model = Tag
        fields = ['uid', 'name', 'color', 'sort_order', 'create_time', 'update_time', 'is_deleted', 'deleted_time']


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

    def validate(self, attrs):
        """验证请求参数"""
        if attrs['sync_mode'] == 'incremental' and not attrs.get('last_sync_time'):
            raise serializers.ValidationError({
                'last_sync_time': '增量同步时必须提供last_sync_time参数'
            })
        return attrs


class SyncResponseSerializer(serializers.Serializer):
    """同步响应数据序列化器"""
    sync_time = serializers.DateTimeField(help_text="本次同步时间戳")
    data = serializers.DictField(help_text="同步数据对象")
    metadata = serializers.DictField(help_text="元数据信息")
