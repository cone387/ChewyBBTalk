from django.contrib import admin
from common.admin import SoftDeleteModelAdmin
from .models import Media


@admin.register(Media)
class MediaAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'uid', 'file', 'media_type', 'create_time')
    list_filter = ('media_type', 'engine', 'create_time')
    date_hierarchy = 'create_time'
    readonly_fields = ('create_time', 'update_time', 'is_deleted', 'deleted_time')
    fieldsets = (
        ('文件信息', {
            'fields': ('file', 'engine', 'media_type', 'description')
        }),
        ('状态信息', {
            'fields': ('is_deleted', 'deleted_time', 'create_time', 'update_time')
        }),
    )
