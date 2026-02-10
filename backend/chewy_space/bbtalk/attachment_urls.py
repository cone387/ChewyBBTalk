"""
附件 URL 配置，使用自定义的 ViewSet
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .attachment_views import AttachmentViewSet

router = DefaultRouter()
router.register(r'files', AttachmentViewSet, basename='attachment')

urlpatterns = [
    path('', include(router.urls)),
]
