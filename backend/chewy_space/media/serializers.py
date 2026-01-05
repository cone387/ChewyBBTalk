from rest_framework import serializers
from .models import Media
from .choices import MediaType
import os


class MediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    filename = serializers.SerializerMethodField()
    original_filename = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    media_type = serializers.SerializerMethodField()  # 改为 SerializerMethodField 以支持自动检测

    class Meta:
        model = Media
        fields = ('uid', 'file', 'url', 'filename', 'original_filename', 'file_size', 'engine', 'media_type', 'description', 'create_time', 'update_time')
        read_only_fields = ('uid', 'url', 'filename', 'original_filename', 'file_size', 'create_time', 'update_time')
    
    def get_url(self, obj):
        """获取文件访问 URL"""
        if obj.file:
            return obj.file.url
        return None
    
    def get_filename(self, obj):
        """获取存储的文件名"""
        if obj.file and obj.file.name:
            return os.path.basename(obj.file.name)
        return None
    
    def get_original_filename(self, obj):
        """获取原始文件名（从 description 或 file.name 中提取）"""
        if obj.description:
            return obj.description
        if obj.file and obj.file.name:
            return os.path.basename(obj.file.name)
        return '未命名文件'
    
    def get_file_size(self, obj):
        """获取文件大小（字节）"""
        try:
            if obj.file:
                return obj.file.size
        except:
            pass
        return None
    
    def get_media_type(self, obj):
        """获取媒体类型，如果是 auto 则自动检测"""
        if obj.media_type == MediaType.AUTO:
            # 如果是 auto，优先从 URL 检测，其次从文件名检测
            if obj.file:
                url = obj.file.url if hasattr(obj.file, 'url') else None
                if url:
                    detected = MediaType.detect(url)
                    if detected != MediaType.OTHER:
                        return detected
                # 如果 URL 检测失败，尝试从文件名检测
                if obj.file.name:
                    return MediaType.detect(obj.file.name)
        return obj.media_type
