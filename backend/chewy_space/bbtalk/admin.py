from django.contrib import admin
from .models import BBTalk, Tag


class BaseAdmin(admin.ModelAdmin):
    exclude = ('user_id', )

    def save_model(self, request, obj, form, change):
        if not change:
            # Admin 不支持 Keycloak 用户，需要手动设置 user_id
            obj.user_id = str(request.user.id) if request.user.is_authenticated else ''
        super().save_model(request, obj, form, change)


@admin.register(Tag)
class TagAdmin(BaseAdmin):
    list_display = ('id', 'uid', 'name', 'color', 'sort_order', 'update_time')
    list_filter = ('create_time', 'update_time')
    search_fields = ('name',)
    readonly_fields = ('uid', 'create_time', 'update_time')


@admin.register(BBTalk)
class BBTalkAdmin(BaseAdmin):
    list_display = ('id', 'uid', 'content', 'visibility', 'formated_tags', 'update_time',)
    list_filter = ('create_time', 'update_time')
    search_fields = ('content', )
    date_hierarchy = 'create_time'
    filter_horizontal = ('tags',)
    readonly_fields = ('context', 'attachments', 'create_time', 'update_time')
    fields = (
        'content',
        'tags',
        'attachments',
        'context',
        'create_time', 'update_time'
    )
    
    def formated_tags(self, obj: BBTalk):
        """在列表视图中显示标签"""
        return ', '.join([tag.name for tag in obj.tags.all()])
    formated_tags.short_description = '标签'
