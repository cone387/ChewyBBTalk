from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from .models import Media
from .serializers import MediaSerializer


class MediaViewSet(viewsets.ModelViewSet):
    """提供Media的CRUD操作的视图集"""
    serializer_class = MediaSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['media_type', 'engine']
    search_fields = ['description']
    lookup_field = 'uid'
    
    def get_queryset(self):
        # 只返回当前用户的媒体文件，管理员可以查看所有文件
        user = self.request.user
        return Media.objects.filter(user=user).order_by('-create_time')
    
    def perform_create(self, serializer):
        # 自动设置当前用户为创建者
        serializer.save(user=self.request.user)
