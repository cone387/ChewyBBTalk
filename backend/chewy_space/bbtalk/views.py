from rest_framework import viewsets, filters, permissions, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import BBTalk, Tag, generate_tag_color
from .serializers import BBTalkSerializer, TagSerializer
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q


class BBTalkViewSet(viewsets.ModelViewSet):
    """提供BBTalk的CRUD操作的视图集"""
    queryset = BBTalk.objects.all()  # 用于路由自动识别，实际查询使用 get_queryset()
    serializer_class = BBTalkSerializer
    permission_classes = [permissions.IsAuthenticated,]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['tags__name']
    search_fields = ['content', "tags__name"]
    lookup_field = 'uid'
    
    def perform_create(self, serializer):
        # 自动设置当前用户为创建者
        serializer.save(user=self.request.user)
    
    def get_queryset(self):
        # 只返回当前用户的记录，并优化关联查询
        user = self.request.user
        return BBTalk.objects.filter(
            user=user
        ).select_related(
            'user'  # 如果需要用户信息，一次性加载
        ).prefetch_related(
            'tags',  # 预加载标签
            'media'  # 预加载媒体文件
        ).order_by('-update_time')


class TagViewSet(viewsets.ModelViewSet):
    """提供Tag的CRUD操作的视图集"""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    lookup_field = 'uid'
    filterset_fields = ['name']
    search_fields = ['name']
    ordering_fields = ['sort_order', 'create_time', 'update_time']
    ordering = ['sort_order', '-update_time']
    max_tags_count = 2000
    pagination_class = None

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset[:self.max_tags_count]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    def get_queryset(self):
        user = self.request.user
        queryset = Tag.objects.filter(user=user)
        queryset = queryset.annotate(
            bbtalk_count=Count('bbtalks', filter=Q(bbtalks__is_deleted=False), distinct=True)
        )
        # 只返回有 bbtalk 关联的标签
        queryset = queryset.filter(bbtalk_count__gt=0)
        return queryset
    
    def create(self, request, *args, **kwargs):
        """创建标签，如果标签已存在则返回现有标签"""
        user = request.user
        name = request.data.get('name', '').strip()
        
        if not name:
            return Response({'error': '标签名称不能为空'}, status=status.HTTP_400_BAD_REQUEST)
        
        tag, created = Tag.objects.update_or_create(
            user=user,
            name=name,
            is_deleted=False,
            defaults={
                'color': request.data.get('color', generate_tag_color()),
                'sort_order': request.data.get('sort_order', 0)
            }
        )
        
        serializer = self.get_serializer(tag)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PublicBBTalkViewSet(viewsets.ViewSet):
    """
    公开访问的 BBTalk 视图集
    只允许访问公开的 BBTalk，无需登录
    """
    permission_classes = [permissions.AllowAny]  # 允许未登录访问
    
    @extend_schema(
        summary='获取公开的 BBTalk 详情',
        description='无需登录即可访问公开的 BBTalk',
        responses={
            200: BBTalkSerializer,
            404: {'description': 'BBTalk 不存在或不是公开的'}
        }
    )
    def retrieve(self, request, pk=None):
        """
        获取单个公开的 BBTalk
        """
        # 只查询公开且未删除的 BBTalk
        bbtalk = get_object_or_404(
            BBTalk.objects.prefetch_related('tags', 'media'),
            uid=pk,
            visibility='public',
            is_deleted=False
        )
        
        serializer = BBTalkSerializer(bbtalk, context={'request': request})
        return Response(serializer.data)
