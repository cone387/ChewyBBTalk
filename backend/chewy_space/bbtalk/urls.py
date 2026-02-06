from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    BBTalkViewSet, TagViewSet, PublicBBTalkViewSet,
    get_current_user, login_view, logout_view, register_view, 
    token_obtain_view, token_blacklist_view,
    get_storage_settings, update_storage_settings, test_storage_connection
)

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'public', PublicBBTalkViewSet, basename='bbtalk-public')
router.register(r'', BBTalkViewSet)

urlpatterns = [
    # JWT Token 认证
    path('auth/token/', token_obtain_view, name='token_obtain'),  # 获取 Token
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),  # 刷新 Token
    path('auth/token/blacklist/', token_blacklist_view, name='token_blacklist'),  # Token 登出（黑名单）
    # Session 认证（传统方式）
    path('auth/login/', login_view, name='login'),  # Session 登录
    path('auth/logout/', logout_view, name='logout'),  # Session 登出
    path('auth/register/', register_view, name='register'),  # 注册（返回 JWT Token）
    # 用户接口
    path('user/me/', get_current_user, name='user_me'),
    # 存储设置接口
    path('settings/storage/', get_storage_settings, name='storage_settings_get'),
    path('settings/storage/update/', update_storage_settings, name='storage_settings_update'),
    path('settings/storage/test/', test_storage_connection, name='storage_settings_test'),
    # BBTalk 和 Tag 路由
    path('', include(router.urls)),
]