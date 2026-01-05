from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import BBTalk
from .serializers import BBTalkSerializer, SyncBBTalkSerializer, SyncRequestSerializer, SyncResponseSerializer
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404


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


class SyncViewSet(viewsets.ViewSet):
    """
    BBTalk数据同步视图集
    提供全量和增量数据同步功能
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary='BBTalk数据同步接口',
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

        # 同步BBTalk数据
        bbtalks_queryset = BBTalk.objects.with_deleted().filter(user=user)
        
        if sync_mode == 'incremental' and last_sync_time:
            bbtalks_queryset = bbtalks_queryset.filter(update_time__gt=last_sync_time)
        
        bbtalks_queryset = bbtalks_queryset.prefetch_related('tags', 'media').order_by('create_time')
        bbtalks = bbtalks_queryset[:max_records]
        
        response_data['data']['bbtalks'] = SyncBBTalkSerializer(bbtalks, many=True).data
        total_count = len(bbtalks)

        # 更新元数据
        response_data['metadata']['total_count'] = total_count
        response_data['metadata']['has_more'] = total_count >= max_records

        return Response(response_data, status=status.HTTP_200_OK)


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
