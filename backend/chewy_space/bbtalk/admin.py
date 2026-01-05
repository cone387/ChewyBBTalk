from django.contrib import admin
from .models import BBTalk
from common.admin import SoftDeleteModelAdmin


@admin.register(BBTalk)
class BBTalkAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'uid', 'content', 'visibility', 'formated_tags', 'update_time',)
    list_filter = ('create_time', 'update_time')
    search_fields = ('content', )
    date_hierarchy = 'create_time'
    filter_horizontal = ('tags', 'media')
    readonly_fields = ('context', 'create_time', 'update_time', 'is_deleted', 'deleted_time')
    fields = (
        'content',
        ('tags', 'media'),
        'context',
        'is_deleted', 'deleted_time', 'create_time', 'update_time'
    )
    
    def formated_tags(self, obj: BBTalk):
        """在列表视图中显示标签"""
        return ', '.join([tag.name for tag in obj.tags.all()])
    formated_tags.short_description = '标签'
