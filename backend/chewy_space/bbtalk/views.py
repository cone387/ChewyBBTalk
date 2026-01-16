from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import api_view, permission_classes as permission_classes_decorator
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from .models import BBTalk, Tag, generate_tag_color, User
from .serializers import BBTalkSerializer, TagSerializer, UserSerializer
from .authentication import authenticate_with_password, create_user_with_password
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404
from django.db.models import Count
from django.contrib.auth import login as django_login, logout as django_logout


@extend_schema(
    tags=['Auth'],
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'password': {'type': 'string'},
            },
            'required': ['username', 'password']
        }
    },
    responses={
        200: {
            'description': '登录成功',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'access': {'type': 'string', 'description': 'Access Token'},
                            'refresh': {'type': 'string', 'description': 'Refresh Token'},
                            'user': {'type': 'object', 'description': '用户信息'},
                        }
                    }
                }
            }
        },
        400: {'description': '登录失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.AllowAny])
def login_view(request):
    """用户登录（JWT Token）"""
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({'error': '用户名和密码不能为空'}, status=status.HTTP_400_BAD_REQUEST)
    
    user = authenticate_with_password(username, password)
    
    if user:
        # 生成 JWT Token
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        })
    else:
        return Response({'error': '用户名或密码错误'}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Auth'],
    responses={200: {'description': '登出成功'}}
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def logout_view(request):
    """用户登出（可选：将 Refresh Token 加入黑名单）"""
    try:
        # 尝试从请求中获取 Refresh Token 并加入黑名单
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
    except Exception:
        pass  # 忽略错误，即使 Token 处理失败也返回成功
    
    # Session 登出
    django_logout(request)
    return Response({'message': '登出成功'})


@extend_schema(
    tags=['Auth'],
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'password': {'type': 'string'},
                'email': {'type': 'string'},
                'display_name': {'type': 'string'},
            },
            'required': ['username', 'password']
        }
    },
    responses={
        201: {
            'description': '注册成功',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'access': {'type': 'string', 'description': 'Access Token'},
                            'refresh': {'type': 'string', 'description': 'Refresh Token'},
                            'user': {'type': 'object', 'description': '用户信息'},
                        }
                    }
                }
            }
        },
        400: {'description': '注册失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.AllowAny])
def register_view(request):
    """用户注册"""
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    email = request.data.get('email', '').strip()
    display_name = request.data.get('display_name', '').strip()
    
    if not username or not password:
        return Response({'error': '用户名和密码不能为空'}, status=status.HTTP_400_BAD_REQUEST)
    
    # 检查用户名是否已存在
    if User.objects.filter(username=username).exists():
        return Response({'error': '用户名已存在'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = create_user_with_password(
            username=username,
            password=password,
            email=email,
            display_name=display_name
        )
        
        # 生成 JWT Token
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['User'],
    responses={
        200: UserSerializer
    }
)
@api_view(['GET'])
@permission_classes_decorator([permissions.IsAuthenticated])
def get_current_user(request):
    """获取当前登录用户信息"""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


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
