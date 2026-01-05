from django.contrib import admin
from common.admin import SoftDeleteModelAdmin
from .models import Tag


@admin.register(Tag)
class TagAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'uid', 'name', 'color', 'create_time')
    list_filter = ('create_time', )
    search_fields = ('name', )
    readonly_fields = ('create_time', 'update_time', 'is_deleted', 'deleted_time')
    fieldsets = (
        ('基本信息', {
            'fields': ('name', 'color')
        }),
        ('状态信息', {
            'fields': ('is_deleted', 'deleted_time', 'create_time', 'update_time')
        }),
    )

