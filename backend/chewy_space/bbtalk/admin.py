from django.contrib import admin
from .models import BBTalk, Tag


class BaseAdmin(admin.ModelAdmin):
    exclude = ('user',)
    
    def save_model(self, request, obj, form, change):
        if not change and hasattr(obj, 'user'):
            # 新建时自动设置user
            from .models import User
            if request.user.is_authenticated:
                # 尝试获取对应的 User 记录
                try:
                    user = User.objects.get(username=request.user.username)
                    obj.user = user
                except User.DoesNotExist:
                    # 如果用户不存在，创建一个
                    user = User.objects.create(
                        authelia_user_id=request.user.username,
                        username=request.user.username,
                        email=getattr(request.user, 'email', ''),
                    )
                    obj.user = user
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
