from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
import os
import uuid
from .models import Media
from .choices import MediaEngine, MediaType

User = get_user_model()


class BaseMediaTest(APITestCase):
    """媒体测试基础类，提供通用的测试设置和清理功能"""
    
    def setUp(self):
        """测试前的设置"""
        # 清空数据库中所有媒体相关数据，确保测试隔离
        Media.objects.all().delete()
        
    def tearDown(self):
        """测试后的清理"""
        # 清理测试中创建的临时文件
        try:
            for media in Media.objects.all():  # 使用deleted()获取所有记录（包括已删除的）
                if media.file and hasattr(media.file, 'path') and os.path.exists(media.file.path):
                    try:
                        os.remove(media.file.path)
                    except:
                        pass
        except:
            pass  # 忽略清理阶段的错误
        
    def _generate_unique_id(self):
        """生成全局唯一标识符"""
        return str(uuid.uuid4())[:12]
    
    def _create_test_file(self, name_suffix=""):
        """创建测试文件"""
        return SimpleUploadedFile(
            name=f'test_{self.unique_id}{name_suffix}.txt',
            content=b'test file content',
            content_type='text/plain'
        )


class MediaModelTest(BaseMediaTest):
    """测试Media模型功能"""
    
    def setUp(self):
        super().setUp()
        
        # 创建测试用户
        self.unique_id = self._generate_unique_id()
        self.user = User.objects.create_user(
            username=f'mm_user_{self.unique_id}',
            password='testpass123'
        )
        
        # 创建测试媒体文件
        self.test_file = self._create_test_file()
    
    def test_create_media(self):
        """测试创建媒体文件"""
        try:
            # 创建媒体对象
            media = Media.objects.create(
                user=self.user,
                file=self.test_file,
                engine=MediaEngine.LOCAL,
                media_type=MediaType.OTHER,
                description=f'Test description {self.unique_id}'
            )
            
            # 验证创建成功
            self.assertIsNotNone(media.uid)
            self.assertEqual(media.user, self.user)
            self.assertEqual(media.engine, MediaEngine.LOCAL)
            self.assertEqual(media.media_type, MediaType.OTHER)
        except Exception as e:
            self.fail(f"创建媒体时出错: {str(e)}")
    
    def test_soft_delete_media(self):
        """测试媒体文件软删除"""
        try:
            # 创建媒体对象
            media = Media.objects.create(
                user=self.user,
                file=self.test_file,
                engine=MediaEngine.LOCAL,
                media_type=MediaType.OTHER,
                description=f'Test description {self.unique_id}'
            )
            
            # 保存ID用于后续查询
            media_id = media.id
            
            # 软删除
            media.delete()
            
            # 验证媒体已被标记为删除
            self.assertTrue(media.is_deleted)
            
            # 验证正常查询不返回已删除的媒体
            self.assertFalse(Media.objects.filter(id=media_id).exists())
            
            # 验证使用deleted()方法可以查询到已删除的媒体
            deleted_media = Media.objects.deleted().filter(id=media_id).first()
            self.assertIsNotNone(deleted_media)
        except Exception as e:
            self.fail(f"软删除测试失败: {str(e)}")


class MediaSerializerTest(BaseMediaTest):
    """测试MediaSerializer"""
    
    def setUp(self):
        super().setUp()
        
        # 创建测试用户
        self.unique_id = self._generate_unique_id()
        self.user = User.objects.create_user(
            username=f'ms_user_{self.unique_id}',
            password='testpass123'
        )
    
    def test_serialize_media(self):
        """测试序列化媒体对象"""
        try:
            from .serializers import MediaSerializer
            
            # 创建媒体对象
            test_file = self._create_test_file()
            media = Media.objects.create(
                user=self.user,
                file=test_file,
                engine=MediaEngine.LOCAL,
                media_type=MediaType.OTHER,
                description=f'Test description {self.unique_id}'
            )
            
            # 序列化
            serializer = MediaSerializer(media)
            data = serializer.data
            
            # 验证序列化数据
            self.assertEqual(data['uid'], media.uid)
            # 注意：user字段是HiddenField，不会在序列化响应中包含
            self.assertEqual(data['engine'], media.engine)
            self.assertEqual(data['media_type'], MediaType.OTHER)
        except Exception as e:
            self.fail(f"序列化测试失败: {str(e)}")


class MediaViewSetTest(BaseMediaTest):
    """测试MediaViewSet"""
    
    def setUp(self):
        super().setUp()
        
        # 创建测试用户
        self.unique_id = self._generate_unique_id()
        self.user1 = User.objects.create_user(
            username=f'mv_user1_{self.unique_id}',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username=f'mv_user2_{self.unique_id}',
            password='testpass123'
        )
        
        # 创建用户1的媒体
        test_file1 = self._create_test_file("_1")
        self.media1 = Media.objects.create(
            user=self.user1,
            file=test_file1,
            engine=MediaEngine.LOCAL,
            media_type=MediaType.OTHER,
            description=f'User1 test {self.unique_id}'
        )
        
        # 创建用户2的媒体
        test_file2 = self._create_test_file("_2")
        self.media2 = Media.objects.create(
            user=self.user2,
            file=test_file2,
            engine=MediaEngine.LOCAL,
            media_type=MediaType.OTHER,
            description=f'User2 test {self.unique_id}'
        )
        
        # 设置API URL
        self.url = reverse('media-list')
    
    def test_list_media(self):
        """测试获取媒体列表"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 获取媒体列表
            response = self.client.get(self.url)
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # 验证响应数据结构
            self.assertIsInstance(response.data, dict)
            self.assertIn('results', response.data)
        except Exception as e:
            self.fail(f"列表测试失败: {str(e)}")
    
    def test_retrieve_media(self):
        """测试获取单个媒体详情"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 获取自己的媒体详情
            detail_url = reverse('media-detail', args=[self.media1.uid])
            response = self.client.get(detail_url)
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # 验证返回正确的媒体
            self.assertEqual(response.data['uid'], self.media1.uid)
        except Exception as e:
            self.fail(f"详情测试失败: {str(e)}")
    
    def test_create_media(self):
        """测试创建媒体"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 准备新的测试文件
            new_test_file = self._create_test_file("_new")
            
            # 创建媒体数据
            data = {
                'file': new_test_file,
                'engine': MediaEngine.LOCAL,
                'media_type': MediaType.OTHER,
                'description': f'New test {self.unique_id}'
            }
            
            # 发送创建请求
            response = self.client.post(self.url, data, format='multipart')
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        except Exception as e:
            self.fail(f"创建测试失败: {str(e)}")
    
    def test_update_media(self):
        """测试更新媒体"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 准备更新数据
            update_data = {
                'description': f'Updated description {self.unique_id}'
            }
            
            # 更新自己的媒体
            update_url = reverse('media-detail', args=[self.media1.uid])
            response = self.client.patch(update_url, update_data)
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        except Exception as e:
            self.fail(f"更新测试失败: {str(e)}")
    
    def test_delete_media(self):
        """测试删除媒体"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 删除自己的媒体
            delete_url = reverse('media-detail', args=[self.media1.uid])
            response = self.client.delete(delete_url)
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        except Exception as e:
            self.fail(f"删除测试失败: {str(e)}")
    
    def test_search_media(self):
        """测试搜索媒体"""
        try:
            # 认证用户1
            self.client.force_authenticate(user=self.user1)
            
            # 使用搜索参数
            search_url = f'{self.url}?search=User1 test'
            response = self.client.get(search_url)
            
            # 验证响应状态
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        except Exception as e:
            self.fail(f"搜索测试失败: {str(e)}")
