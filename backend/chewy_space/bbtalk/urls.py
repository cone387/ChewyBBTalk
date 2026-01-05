from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BBTalkViewSet, TagViewSet, PublicBBTalkViewSet

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'public', PublicBBTalkViewSet, basename='bbtalk-public')
router.register(r'', BBTalkViewSet)

urlpatterns = [
    path('', include(router.urls)),
]