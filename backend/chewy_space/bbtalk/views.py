from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import api_view, permission_classes as permission_classes_decorator
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import BBTalk, Tag, generate_tag_color
from .serializers import BBTalkSerializer, TagSerializer
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404
from django.db.models import Count


@extend_schema(
    tags=['User'],
    responses={
        200: {
            'description': '获取当前用户成功',
            'content': {
                'application/json': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'integer'},
                        'username': {'type': 'string'},
                        'email': {'type': 'string'},
                    }
                }
            }
        }
    }
)
@api_view(['GET'])
@permission_classes_decorator([permissions.IsAuthenticated])
def get_current_user(request):
    """获取当前登录用户信息"""
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'display_name': user.display_name,
        'avatar': user.avatar,
    })


class BBTalkViewSet(viewsets.ModelViewSet):
    """提供BBTalk的CRUD操作的视图集"""
    queryset = BBTalk.objects.all()  # 用于路由自动识别，实际查询使用 get_queryset()
    serializer_class = BBTalkSerializer
    permission_classes = [permissions.IsAuthenticated,]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['tags__name', 'visibility']
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
        ).prefetch_related(
            'tags'  # 预加载标签
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
            bbtalk_count=Count('bbtalks', distinct=True)
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
            defaults={
                'color': request.data.get('color', generate_tag_color()),
                'sort_order': request.data.get('sort_order', 0)
            }
        )
        
        serializer = self.get_serializer(tag)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PublicBBTalkViewSet(viewsets.ReadOnlyModelViewSet):
    """
    公开访问的 BBTalk 视图集
    只允许访问公开的 BBTalk，无需登录
    """
    serializer_class = BBTalkSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'uid'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['tags__name']
    search_fields = ['content', 'tags__name']
    
    def get_queryset(self):
        return BBTalk.objects.filter(
            visibility='public'
        ).prefetch_related('tags').order_by('-update_time')
