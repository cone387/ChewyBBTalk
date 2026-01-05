from django.contrib.auth.models import User
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes


class UserSerializer:
    """用户序列化器（简化版）"""
    @staticmethod
    def serialize(user):
        return {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'create_time': user.date_joined.isoformat(),
            'update_time': user.date_joined.isoformat(),
        }


@extend_schema(
    tags=['用户认证'],
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'email': {'type': 'string', 'format': 'email'},
                'password': {'type': 'string'},
            },
            'required': ['username', 'email', 'password'],
        }
    },
    responses={
        201: {
            'description': '注册成功',
            'content': {
                'application/json': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'integer'},
                        'username': {'type': 'string'},
                        'email': {'type': 'string'},
                        'create_time': {'type': 'string', 'format': 'date-time'},
                        'update_time': {'type': 'string', 'format': 'date-time'},
                    }
                }
            }
        }
    }
)
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    用户注册接口
    """
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')

    # 验证必填字段
    if not all([username, email, password]):
        return Response(
            {'error': '用户名、邮箱和密码都是必填项'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 检查用户名是否已存在
    if User.objects.filter(username=username).exists():
        return Response(
            {'error': '用户名已存在'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 检查邮箱是否已存在
    if User.objects.filter(email=email).exists():
        return Response(
            {'error': '邮箱已被注册'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 创建用户
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )

    return Response(
        UserSerializer.serialize(user),
        status=status.HTTP_201_CREATED
    )


@extend_schema(
    tags=['用户认证'],
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
                        'create_time': {'type': 'string', 'format': 'date-time'},
                        'update_time': {'type': 'string', 'format': 'date-time'},
                    }
                }
            }
        }
    }
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """
    获取当前登录用户信息
    """
    return Response(UserSerializer.serialize(request.user))
