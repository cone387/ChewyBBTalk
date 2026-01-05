from django.db.models import IntegerChoices, TextChoices
from urllib.parse import urlparse


class MediaType(TextChoices):
    AUTO = 'auto', '自动检测'
    IMAGE = 'image', '图片'
    VIDEO = 'video', '视频'
    AUDIO = 'audio', '音频'
    OTHER = 'attachment', '附件'

    @classmethod
    def detect(cls, value: str):
        path = urlparse(value).path.lower()  # 只取路径部分，不包含查询参数
        
        # 图片格式
        image_exts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
        for ext in image_exts:
            if path.endswith(ext):
                return cls.IMAGE
        
        # 视频格式
        video_exts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v']
        for ext in video_exts:
            if path.endswith(ext):
                return cls.VIDEO
        
        # 音频格式
        audio_exts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma']
        for ext in audio_exts:
            if path.endswith(ext):
                return cls.AUDIO
        
        return cls.OTHER


class MediaEngine(IntegerChoices):
    QINIU = 1, '七牛云'
    LOCAL = 2, '本地'
