from django.contrib import admin
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.utils.html import format_html


class BaseAdmin(admin.ModelAdmin):
    exclude = ('user', )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.user = request.user
        super().save_model(request, obj, form, change)


class SoftDeleteModelAdmin(BaseAdmin):
    """
    软删除Admin混入类，提供软删除功能和已删除记录管理
    
    使用方法：
    1. 确保模型有is_deleted(boolean)和deleted_time(datetime)字段
    2. 在Admin类中继承此类
    3. 可选：重写get_queryset方法自定义查询逻辑
    """
    
    # 默认不显示删除标记列，超级用户可以查看
    list_display = []
    actions = ['restore_selected']
    readonly_fields = ['is_deleted', 'deleted_time']

    def get_queryset(self, request):
        """控制显示的记录，默认情况下不显示已删除的记录"""
        qs = super().get_queryset(request)
        # 超级用户可以查看所有记录，包括已删除的
        if request.user.is_superuser:
            return qs
        # 普通用户只能查看未删除的记录
        return qs.filter(is_deleted=False)
    
    def get_list_display(self, request):
        """控制列表显示字段，超级用户可以查看is_deleted和deleted_time字段"""
        list_display = list(super().get_list_display(request))
        if request.user.is_superuser:
            # 如果is_deleted不在列表中，则添加
            if 'is_deleted' not in list_display:
                list_display.append('is_deleted')
            # 如果deleted_time不在列表中，则添加
            if 'deleted_time' not in list_display:
                list_display.append('deleted_time')
        return list_display
    
    def restore_selected(self, request, queryset):
        """恢复已删除的记录"""
        # 批量恢复已删除的记录
        restored_count = queryset.filter(is_deleted=True).update(
            is_deleted=False,
            deleted_time=None
        )
        self.message_user(request, f"已成功恢复 {restored_count} 条记录。")
        # 重定向到当前页面
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return HttpResponseRedirect(request.get_full_path())
    
    restore_selected.short_description = "恢复选中的记录"
    
    def get_actions(self, request):
        """控制可用操作，只有超级用户可以看到恢复操作"""
        actions = super().get_actions(request)
        # 只有超级用户可以看到恢复操作
        if not request.user.is_superuser:
            actions.pop('restore_selected', None)
        return actions
    
    def get_readonly_fields(self, request, obj=None):
        """控制只读字段，普通用户不能修改is_deleted字段"""
        readonly_fields = list(super().get_readonly_fields(request, obj))
        # 普通用户不能修改is_deleted字段
        if not request.user.is_superuser:
            if 'is_deleted' not in readonly_fields:
                readonly_fields.append('is_deleted')
        return readonly_fields
    
    def is_deleted_column(self, obj):
        """自定义is_deleted字段的显示样式"""
        if obj.is_deleted:
            return format_html('<span style="color: red;">是</span>')
        return format_html('<span style="color: green;">否</span>')
    
    is_deleted_column.short_description = '是否已删除'
    is_deleted_column.boolean = True
