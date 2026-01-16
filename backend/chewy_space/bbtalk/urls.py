from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    BBTalkViewSet, TagViewSet, PublicBBTalkViewSet,
    get_current_user, login_view, logout_view, register_view
)

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'public', PublicBBTalkViewSet, basename='bbtalk-public')
router.register(r'', BBTalkViewSet)

urlpatterns = [
    # 认证接口
    path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/register/', register_view, name='register'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),  # JWT Token 刷新
    # 用户接口
    path('user/me/', get_current_user, name='user_me'),
    # BBTalk 和 Tag 路由
    path('', include(router.urls)),
]