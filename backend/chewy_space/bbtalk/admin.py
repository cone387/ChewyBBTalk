from django.contrib import admin
from .models import BBTalk, Tag, User, Identity


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('id', 'username', 'email', 'display_name', 'is_active', 'is_staff', 'is_superuser', 'last_login')
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'create_time')
    search_fields = ('username', 'email', 'display_name')
    readonly_fields = ('create_time', 'update_time', 'last_login')
    fieldsets = (
        ('基本信息', {
            'fields': ('username', 'email', 'display_name', 'avatar', 'bio')
        }),
        ('权限', {
            'fields': ('is_active', 'is_staff', 'is_superuser')
        }),
        ('时间信息', {
            'fields': ('create_time', 'update_time', 'last_login')
        }),
    )


@admin.register(Identity)
class IdentityAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'identity_type', 'identifier', 'provider', 'is_verified', 'is_primary', 'last_used')
    list_filter = ('identity_type', 'is_verified', 'is_primary', 'provider')
    search_fields = ('identifier', 'provider_user_id')
    readonly_fields = ('create_time', 'update_time', 'last_used')
    fieldsets = (
        ('基本信息', {
            'fields': ('user', 'identity_type', 'identifier')
        }),
        ('OAuth 信息', {
            'fields': ('provider', 'provider_user_id'),
            'classes': ('collapse',)
        }),
        ('状态', {
            'fields': ('is_verified', 'is_primary')
        }),
        ('时间信息', {
            'fields': ('create_time', 'update_time', 'last_used')
        }),
    )


class BaseAdmin(admin.ModelAdmin):
    exclude = ('user',)
    
    def save_model(self, request, obj, form, change):
        if not change:
            # 新建时自动设置 user
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
