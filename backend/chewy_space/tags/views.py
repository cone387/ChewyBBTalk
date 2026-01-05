from rest_framework import viewsets, permissions, filters, status
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Tag, generate_tag_color
from .serializers import TagSerializer, SyncTagSerializer, SyncRequestSerializer, SyncResponseSerializer
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from django.db.models import Count, Q


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
    ordering = ['sort_order', '-update_time']  # 默认按排序字段排序，然后按更新时间倒序
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
        
        # BBTalk 子应用只计算 bbtalk_count
        queryset = queryset.annotate(
            bbtalk_count=Count('bbtalks', filter=Q(bbtalks__is_deleted=False), distinct=True)
        )
        
        # 只返回有 bbtalk 关联的标签（bbtalk_count > 0）
        queryset = queryset.filter(bbtalk_count__gt=0)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """
        创建标签，如果标签已存在则返回现有标签
        使用 update_or_create 逻辑避免重复创建失败
        """
        user = request.user
        name = request.data.get('name', '').strip()
        
        if not name:
            return Response(
                {'error': '标签名称不能为空'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 使用 update_or_create 逻辑
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
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
    
    def perform_create(self, serializer):
        # 自动设置当前用户为创建者
        serializer.save(user=self.request.user)


class SyncViewSet(viewsets.ViewSet):
    """
    Tag数据同步视图集
    提供全量和增量数据同步功能
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary='Tag数据同步接口',
        description='支持全量和增量数据同步，用于客户端与服务端数据一致性',
        request=SyncRequestSerializer,
        responses={
            200: SyncResponseSerializer,
            400: {'description': '请求参数错误'}
        }
    )
    @action(detail=False, methods=['post'])
    def sync(self, request):
        """
        统一同步接口
        支持全量同步和增量同步
        """
        # 验证请求参数
        request_serializer = SyncRequestSerializer(data=request.data)
        if not request_serializer.is_valid():
            return Response(
                request_serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        validated_data = request_serializer.validated_data
        sync_mode = validated_data['sync_mode']
        last_sync_time = validated_data.get('last_sync_time')

        # 记录当前同步时间
        sync_time = timezone.now()

        # 准备响应数据
        response_data = {
            'sync_time': sync_time,
            'data': {},
            'metadata': {
                'total_count': 0,
                'has_more': False
            }
        }

        user = request.user
        max_records = 10000  # 单次最大记录数

        # 同步Tag数据
        tags_queryset = Tag.objects.with_deleted().filter(user=user)
        
        if sync_mode == 'incremental' and last_sync_time:
            tags_queryset = tags_queryset.filter(update_time__gt=last_sync_time)
        
        tags_queryset = tags_queryset.order_by('create_time')
        tags = tags_queryset[:max_records]
        
        response_data['data']['tags'] = SyncTagSerializer(tags, many=True).data
        total_count = len(tags)

        # 更新元数据
        response_data['metadata']['total_count'] = total_count
        response_data['metadata']['has_more'] = total_count >= max_records

        return Response(response_data, status=status.HTTP_200_OK)
