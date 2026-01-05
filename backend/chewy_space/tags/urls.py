from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TagViewSet, SyncViewSet

router = DefaultRouter()
router.register(r'', TagViewSet, basename='tag')
router.register(r'sync', SyncViewSet, basename='tag-sync')

urlpatterns = [
    path('', include(router.urls)),
]