from django.contrib import admin
from bbtalk.admin import BaseAdmin
from .models import Media


@admin.register(Media)
class MediaAdmin(BaseAdmin):
    list_display = ('id', 'uid', 'file', 'media_type', 'create_time')
    list_filter = ('media_type', 'engine', 'create_time')
    date_hierarchy = 'create_time'
    readonly_fields = ('create_time', 'update_time')
    fieldsets = (
        ('文件信息', {
            'fields': ('file', 'engine', 'media_type', 'description')
        }),
        ('时间信息', {
            'fields': ('create_time', 'update_time')
        }),
    )
