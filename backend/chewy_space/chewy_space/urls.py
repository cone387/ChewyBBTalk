"""
URL configuration for chewy_space project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework import permissions
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from user_auth import views as user_views


schema_url_patterns = [
    path('api/v1/bbtalk/', include('bbtalk.urls')),
    path('api/v1/media/', include('media.urls')),
    path('api/v1/user/me/', user_views.get_current_user, name='user_me'),
]
schema_view = SpectacularAPIView(
    urlconf=schema_url_patterns,
    public=True,
    permission_classes=(permissions.AllowAny,),
)
schema_swagger_view = SpectacularSwaggerView(
    urlconf=schema_url_patterns,
    public=True,
    permission_classes=(permissions.AllowAny,),
)
schema_redoc_view = SpectacularRedocView(
    urlconf=schema_url_patterns,
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/schema/', schema_view.as_view(), name='schema'),
    path('api/schema/redoc/', schema_redoc_view.as_view(url_name='schema'), name='redoc-ui'),
    path('api/schema/swagger-ui/', schema_swagger_view.as_view(url_name='schema'), name='swagger-ui'),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/', include('user_auth.urls')),
] + schema_url_patterns
