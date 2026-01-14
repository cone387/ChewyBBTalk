from django.contrib import admin
from .models import BBTalk, Tag, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('id', 'username', 'email', 'display_name', 'authelia_user_id', 'is_active', 'is_staff', 'last_login')
    list_filter = ('is_active', 'create_time')
    search_fields = ('username', 'email', 'authelia_user_id')
    readonly_fields = ('authelia_user_id', 'create_time', 'update_time', 'last_login')


class BaseAdmin(admin.ModelAdmin):
    exclude = ('user',)
    
    def save_model(self, request, obj, form, change):
        if not change and hasattr(obj, 'user'):
            # 新建时自动设置 user，request.user 已经是我们自定义的 User 模型
            obj.user = request.user
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
