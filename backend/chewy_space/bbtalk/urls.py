from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BBTalkViewSet, SyncViewSet, PublicBBTalkViewSet

router = DefaultRouter()
router.register(r'', BBTalkViewSet)
router.register(r'sync', SyncViewSet, basename='bbtalk-sync')
router.register(r'public', PublicBBTalkViewSet, basename='bbtalk-public')

urlpatterns = [
    path('', include(router.urls)),
]