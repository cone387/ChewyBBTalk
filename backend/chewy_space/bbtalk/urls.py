from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BBTalkViewSet, TagViewSet, PublicBBTalkViewSet, get_current_user

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'public', PublicBBTalkViewSet, basename='bbtalk-public')
router.register(r'', BBTalkViewSet)

urlpatterns = [
    path('user/me/', get_current_user, name='user_me'),
    path('', include(router.urls)),
]