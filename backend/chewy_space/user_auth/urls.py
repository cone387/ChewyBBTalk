from django.urls import path
from rest_framework_simplejwt import views as jwt_views
from . import views


urlpatterns = [
    # JWT Token 认证
    path('token/', jwt_views.TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', jwt_views.TokenRefreshView.as_view(), name='token_refresh'),
    
    # 用户相关接口
    path('user/', views.get_current_user, name='get_current_user'),
    path('register/', views.register, name='register'),
]