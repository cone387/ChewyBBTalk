from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import api_view, permission_classes as permission_classes_decorator
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from django.http import HttpResponse
from .models import BBTalk, Tag, generate_tag_color, User, UserStorageSettings
from .serializers import BBTalkSerializer, TagSerializer, UserSerializer, UserStorageSettingsSerializer
from .authentication import authenticate_with_password, create_user_with_password
from .data_export import DataExporter
from .data_import import DataImporter, validate_import_file, ImportError
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
            'description': '获取 Token 成功',
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
        400: {'description': '认证失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.AllowAny])
def token_obtain_view(request):
    """获取 JWT Token（用用户名密码换取 Token）"""
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
        200: UserSerializer,
        400: {'description': '登录失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.AllowAny])
def login_view(request):
    """用户登录（Session 认证，传统方式）"""
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({'error': '用户名和密码不能为空'}, status=status.HTTP_400_BAD_REQUEST)
    
    user = authenticate_with_password(username, password)
    
    if user:
        # 使用 Django Session 登录
        django_login(request, user, backend='bbtalk.authentication.UserBackend')
        serializer = UserSerializer(user)
        return Response(serializer.data)
    else:
        return Response({'error': '用户名或密码错误'}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Auth'],
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'refresh': {'type': 'string', 'description': 'Refresh Token'},
            },
            'required': ['refresh']
        }
    },
    responses={
        200: {'description': 'Token 已加入黑名单'},
        400: {'description': '请求失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def token_blacklist_view(request):
    """将 Refresh Token 加入黑名单（JWT Token 登出）"""
    refresh_token = request.data.get('refresh')
    
    if not refresh_token:
        return Response({'error': 'Refresh Token 不能为空'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response({'message': 'Token 已加入黑名单，登出成功'})
    except Exception as e:
        return Response({'error': f'Token 无效: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Auth'],
    responses={200: {'description': '登出成功'}}
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def logout_view(request):
    """用户登出（Session 认证）"""
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


@extend_schema(
    tags=['Settings'],
    responses={200: UserStorageSettingsSerializer(many=True)}
)
@api_view(['GET'])
@permission_classes_decorator([permissions.IsAuthenticated])
def list_storage_settings(request):
    """获取当前用户的所有存储配置"""
    settings = UserStorageSettings.objects.filter(user=request.user).order_by('-is_active', '-update_time')
    serializer = UserStorageSettingsSerializer(settings, many=True)
    return Response(serializer.data)


@extend_schema(
    tags=['Settings'],
    responses={200: UserStorageSettingsSerializer}
)
@api_view(['GET'])
@permission_classes_decorator([permissions.IsAuthenticated])
def get_storage_settings(request):
    """获取当前用户的激活存储配置"""
    settings = UserStorageSettings.objects.filter(user=request.user, is_active=True).first()
    if not settings:
        # 如果没有激活的配置，返回第一个配置
        settings = UserStorageSettings.objects.filter(user=request.user).first()
    
    if not settings:
        return Response({
            'storage_type': 'local',
            'is_active': False,
        })
    
    serializer = UserStorageSettingsSerializer(settings)
    return Response(serializer.data)


@extend_schema(
    tags=['Settings'],
    request=UserStorageSettingsSerializer,
    responses={201: UserStorageSettingsSerializer}
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def create_storage_settings(request):
    """创建新的存储配置"""
    serializer = UserStorageSettingsSerializer(data=request.data)
    
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Settings'],
    request=UserStorageSettingsSerializer,
    responses={200: UserStorageSettingsSerializer}
)
@api_view(['PUT', 'PATCH'])
@permission_classes_decorator([permissions.IsAuthenticated])
def update_storage_settings(request, pk=None):
    """更新指定的存储配置"""
    try:
        settings = UserStorageSettings.objects.get(pk=pk, user=request.user)
    except UserStorageSettings.DoesNotExist:
        return Response({'error': '配置不存在'}, status=status.HTTP_404_NOT_FOUND)
    
    partial = request.method == 'PATCH'
    serializer = UserStorageSettingsSerializer(settings, data=request.data, partial=partial)
    
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Settings'],
    responses={204: None}
)
@api_view(['DELETE'])
@permission_classes_decorator([permissions.IsAuthenticated])
def delete_storage_settings(request, pk):
    """删除指定的存储配置"""
    try:
        settings = UserStorageSettings.objects.get(pk=pk, user=request.user)
        settings.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except UserStorageSettings.DoesNotExist:
        return Response({'error': '配置不存在'}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(
    tags=['Settings'],
    responses={200: UserStorageSettingsSerializer}
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def activate_storage_settings(request, pk):
    """激活指定的存储配置（将其他配置设为未激活）"""
    try:
        # 先将所有配置设为未激活
        UserStorageSettings.objects.filter(user=request.user).update(is_active=False)
        
        # 激活指定配置
        settings = UserStorageSettings.objects.get(pk=pk, user=request.user)
        settings.is_active = True
        settings.save()
        
        serializer = UserStorageSettingsSerializer(settings)
        return Response(serializer.data)
    except UserStorageSettings.DoesNotExist:
        return Response({'error': '配置不存在'}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(
    tags=['Settings'],
    responses={200: {'description': '已切换为服务器存储'}}
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def deactivate_all_storage(request):
    """取消所有 S3 配置的激活状态，切换为服务器存储"""
    UserStorageSettings.objects.filter(user=request.user).update(is_active=False)
    return Response({'message': '已切换为服务器存储'})


def _test_s3_config(storage_settings):
    """内部工具函数：测试指定 S3 配置的连接"""
    if not storage_settings.is_s3_configured():
        return Response({
            'success': False,
            'message': 'S3 配置不完整，请先完成配置'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        import boto3
        from botocore.exceptions import ClientError, NoCredentialsError
        
        config = storage_settings.get_s3_config()
        
        session_kwargs = {
            'aws_access_key_id': config['access_key_id'],
            'aws_secret_access_key': config['secret_access_key'],
            'region_name': config['region_name'],
        }
        
        client_kwargs = {}
        if config.get('endpoint_url'):
            client_kwargs['endpoint_url'] = config['endpoint_url']
        
        session = boto3.Session(**session_kwargs)
        s3_client = session.client('s3', **client_kwargs)
        
        # 尝试列出存储桶内容（只获取1个对象来测试连接）
        s3_client.list_objects_v2(Bucket=config['bucket_name'], MaxKeys=1)
        
        return Response({
            'success': True,
            'message': f"连接成功！存储桶 '{config['bucket_name']}' 可访问"
        })
        
    except NoCredentialsError:
        return Response({
            'success': False,
            'message': '凭证无效或未配置'
        }, status=status.HTTP_400_BAD_REQUEST)
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        return Response({
            'success': False,
            'message': f'S3 错误 ({error_code}): {error_message}'
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'连接失败: {str(e)}'
        }, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    tags=['Settings'],
    responses={
        200: {
            'description': '连接测试结果',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'success': {'type': 'boolean'},
                            'message': {'type': 'string'},
                        }
                    }
                }
            }
        }
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def test_storage_connection(request):
    """测试当前激活的 S3 存储连接"""
    settings = UserStorageSettings.objects.filter(user=request.user, is_active=True).first()
    if not settings:
        return Response({
            'success': False,
            'message': '没有激活的 S3 配置'
        }, status=status.HTTP_400_BAD_REQUEST)
    return _test_s3_config(settings)


@extend_schema(
    tags=['Settings'],
    responses={
        200: {
            'description': '连接测试结果',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'success': {'type': 'boolean'},
                            'message': {'type': 'string'},
                        }
                    }
                }
            }
        }
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def test_storage_connection_by_id(request, pk):
    """测试指定 S3 配置的连接"""
    try:
        settings = UserStorageSettings.objects.get(pk=pk, user=request.user)
    except UserStorageSettings.DoesNotExist:
        return Response({
            'success': False,
            'message': '配置不存在'
        }, status=status.HTTP_404_NOT_FOUND)
    return _test_s3_config(settings)


@extend_schema(
    tags=['Data'],
    responses={
        200: {
            'description': '导出成功',
            'content': {
                'application/json': {
                    'type': 'object'
                },
                'application/zip': {
                    'schema': {
                        'type': 'string',
                        'format': 'binary'
                    }
                }
            }
        }
    }
)
@api_view(['GET'])
@permission_classes_decorator([permissions.IsAuthenticated])
def export_data(request):
    """导出用户数据"""
    export_format = request.query_params.get('export_format', request.query_params.get('format', 'json'))  # json 或 zip
    include_attachments = request.query_params.get('include_attachments', 'false').lower() == 'true'
    
    exporter = DataExporter(request.user)
    
    try:
        if export_format == 'zip':
            # 导出为 ZIP
            zip_buffer = exporter.export_to_zip(include_attachments=include_attachments)
            response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
            filename = f'chewybbtalk_export_{request.user.username}_{exporter.export_time.strftime("%Y%m%d_%H%M%S")}.zip'
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        else:
            # 导出为 JSON
            json_buffer = exporter.export_to_file()
            response = HttpResponse(json_buffer.getvalue(), content_type='application/json')
            filename = f'chewybbtalk_export_{request.user.username}_{exporter.export_time.strftime("%Y%m%d_%H%M%S")}.json'
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
    
    except Exception as e:
        return Response({
            'error': f'导出失败: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=['Data'],
    request={
        'multipart/form-data': {
            'type': 'object',
            'properties': {
                'file': {
                    'type': 'string',
                    'format': 'binary',
                    'description': '导入文件（JSON 或 ZIP 格式）'
                },
                'overwrite_tags': {
                    'type': 'boolean',
                    'description': '是否覆盖同名标签',
                    'default': False
                },
                'skip_duplicates': {
                    'type': 'boolean',
                    'description': '是否跳过重复内容',
                    'default': True
                },
                'import_storage_settings': {
                    'type': 'boolean',
                    'description': '是否导入存储配置',
                    'default': False
                }
            },
            'required': ['file']
        }
    },
    responses={
        200: {
            'description': '导入成功',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'success': {'type': 'boolean'},
                            'message': {'type': 'string'},
                            'stats': {
                                'type': 'object',
                                'properties': {
                                    'tags_created': {'type': 'integer'},
                                    'tags_skipped': {'type': 'integer'},
                                    'bbtalks_created': {'type': 'integer'},
                                    'bbtalks_skipped': {'type': 'integer'},
                                    'storage_settings_created': {'type': 'integer'},
                                    'errors': {'type': 'array', 'items': {'type': 'string'}}
                                }
                            }
                        }
                    }
                }
            }
        },
        400: {'description': '导入失败'}
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def import_data(request):
    """导入用户数据"""
    if 'file' not in request.FILES:
        return Response({
            'error': '请上传文件'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    file_obj = request.FILES['file']
    
    # 解析导入选项
    options = {
        'overwrite_tags': request.POST.get('overwrite_tags', 'false').lower() == 'true',
        'skip_duplicates': request.POST.get('skip_duplicates', 'true').lower() == 'true',
        'import_storage_settings': request.POST.get('import_storage_settings', 'false').lower() == 'true',
    }
    
    try:
        importer = DataImporter(request.user, options)
        stats = importer.import_from_file(file_obj)
        
        return Response({
            'success': True,
            'message': '数据导入成功',
            'stats': stats
        })
    
    except ImportError as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
    
    except Exception as e:
        return Response({
            'success': False,
            'error': f'导入失败: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=['Data'],
    request={
        'multipart/form-data': {
            'type': 'object',
            'properties': {
                'file': {
                    'type': 'string',
                    'format': 'binary',
                    'description': '待验证的导入文件'
                }
            },
            'required': ['file']
        }
    },
    responses={
        200: {
            'description': '文件验证结果',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'valid': {'type': 'boolean'},
                            'file_type': {'type': 'string'},
                            'version': {'type': 'string'},
                            'export_time': {'type': 'string'},
                            'preview': {
                                'type': 'object',
                                'properties': {
                                    'tags_count': {'type': 'integer'},
                                    'bbtalks_count': {'type': 'integer'},
                                    'storage_settings_count': {'type': 'integer'}
                                }
                            },
                            'error': {'type': 'string'}
                        }
                    }
                }
            }
        }
    }
)
@api_view(['POST'])
@permission_classes_decorator([permissions.IsAuthenticated])
def validate_import(request):
    """验证导入文件格式"""
    if 'file' not in request.FILES:
        return Response({
            'error': '请上传文件'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    file_obj = request.FILES['file']
    
    try:
        result = validate_import_file(file_obj)
        return Response(result)
    
    except Exception as e:
        return Response({
            'valid': False,
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
