from django.test import TestCase, override_settings, TransactionTestCase
from django.db import transaction, IntegrityError
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from .models import User, Tag, BBTalk
import json


class UserModelTest(TransactionTestCase):
    """User 模型测试"""
    
    def test_create_user(self):
        """测试创建用户"""
        user = User.objects.create(
            username='testuser',
            email='test@example.com',
            display_name='测试用户'
        )
        self.assertEqual(user.username, 'testuser')
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
    
    def test_user_str(self):
        """测试用户字符串表示"""
        user = User.objects.create(
            username='testuser'
        )
        self.assertEqual(str(user), 'testuser')
    
    def test_user_is_staff_property(self):
        """测试管理员属性"""
        user = User.objects.create(
            username='testuser'
        )
        self.assertFalse(user.is_staff)
        
        user.is_staff = True
        user.save()
        self.assertTrue(user.is_staff)
    
    def test_user_unique_constraints(self):
        """测试用户唯一性约束"""
        User.objects.create(
            username='testuser'
        )
        
        # username 必须唯一
        with self.assertRaises(IntegrityError):
            User.objects.create(
                username='testuser'
            )


class TagModelTest(TransactionTestCase):
    """Tag 模型测试"""
    
    def test_create_tag(self):
        """测试创建标签"""
        user = User.objects.create(
            username='testuser'
        )
        tag = Tag.objects.create(
            name='测试',
            user=user,
            color='#ff0000'
        )
        self.assertEqual(tag.name, '测试')
        self.assertEqual(tag.color, '#ff0000')
        self.assertIsNotNone(tag.uid)
    
    def test_tag_auto_color(self):
        """测试标签自动生成颜色"""
        user = User.objects.create(
            username='testuser'
        )
        tag = Tag.objects.create(
            name='测试',
            user=user
        )
        self.assertIsNotNone(tag.color)
        self.assertTrue(tag.color.startswith('#'))
        self.assertEqual(len(tag.color), 7)
    
    def test_tag_unique_per_user(self):
        """测试标签在用户内唯一"""
        user = User.objects.create(
            username='testuser'
        )
        Tag.objects.create(name='测试', user=user)
        
        # 同一用户不能创建同名标签
        with self.assertRaises(IntegrityError):
            Tag.objects.create(name='测试', user=user)
    
    def test_different_users_same_tag_name(self):
        """测试不同用户可以创建同名标签"""
        user1 = User.objects.create(
            username='testuser1'
        )
        user2 = User.objects.create(
            username='testuser2'
        )
        Tag.objects.create(name='测试', user=user1)
        tag2 = Tag.objects.create(name='测试', user=user2)
        self.assertEqual(tag2.name, '测试')


class BBTalkModelTest(TestCase):
    """BBTalk 模型测试"""
    
    def setUp(self):
        self.user = User.objects.create(
            username='testuser'
        )
        self.tag1 = Tag.objects.create(name='生活', user=self.user)
        self.tag2 = Tag.objects.create(name='工作', user=self.user)
    
    def test_create_bbtalk_basic(self):
        """测试创建基本 BBTalk"""
        bbtalk = BBTalk.objects.create(
            user=self.user,
            content='测试内容',
            visibility='public'
        )
        self.assertEqual(bbtalk.content, '测试内容')
        self.assertEqual(bbtalk.visibility, 'public')
        self.assertIsNotNone(bbtalk.uid)
        self.assertEqual(bbtalk.attachments, [])
        self.assertEqual(bbtalk.context, {})
    
    def test_create_bbtalk_with_attachments(self):
        """测试创建带附件的 BBTalk"""
        attachments = [
            {'url': 'https://example.com/image1.jpg', 'type': 'image'},
            {'url': 'https://example.com/video1.mp4', 'type': 'video'},
            {'url': 'https://example.com/audio1.mp3', 'type': 'audio'}
        ]
        bbtalk = BBTalk.objects.create(
            user=self.user,
            content='带附件的内容',
            visibility='public',
            attachments=attachments
        )
        self.assertEqual(len(bbtalk.attachments), 3)
        self.assertEqual(bbtalk.attachments[0]['type'], 'image')
        self.assertEqual(bbtalk.attachments[1]['type'], 'video')
        self.assertEqual(bbtalk.attachments[2]['type'], 'audio')
    
    def test_create_bbtalk_with_context(self):
        """测试创建带上下文的 BBTalk"""
        context = {
            'device': 'iPhone',
            'location': 'Beijing',
            'weather': 'sunny'
        }
        bbtalk = BBTalk.objects.create(
            user=self.user,
            content='带上下文的内容',
            visibility='private',
            context=context
        )
        self.assertEqual(bbtalk.context['device'], 'iPhone')
        self.assertEqual(bbtalk.context['location'], 'Beijing')
    
    def test_bbtalk_with_tags(self):
        """测试 BBTalk 关联标签"""
        bbtalk = BBTalk.objects.create(
            user=self.user,
            content='测试内容',
            visibility='public'
        )
        bbtalk.tags.add(self.tag1, self.tag2)
        
        self.assertEqual(bbtalk.tags.count(), 2)
        self.assertIn(self.tag1, bbtalk.tags.all())
        self.assertIn(self.tag2, bbtalk.tags.all())
    
    def test_bbtalk_visibility_choices(self):
        """测试 BBTalk 可见性选项"""
        # 测试 public
        bbtalk_public = BBTalk.objects.create(
            user=self.user,
            content='公开内容',
            visibility='public'
        )
        self.assertEqual(bbtalk_public.visibility, 'public')
        
        # 测试 private
        bbtalk_private = BBTalk.objects.create(
            user=self.user,
            content='私密内容',
            visibility='private'
        )
        self.assertEqual(bbtalk_private.visibility, 'private')


from rest_framework_simplejwt.tokens import RefreshToken

@override_settings(DEBUG=True)
class BBTalkAPITest(APITestCase):
    """BBTalk API 测试"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create(
            username='testuser',
            email='test@example.com'
        )
        self.user2 = User.objects.create(
            username='testuser2',
            email='test2@example.com'
        )
        
        # 使用 JWT Token 认证
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        refresh2 = RefreshToken.for_user(self.user2)
        self.token2 = f'Bearer {refresh2.access_token}'
        
        # 创建测试标签
        self.tag1 = Tag.objects.create(name='生活', user=self.user)
        self.tag2 = Tag.objects.create(name='工作', user=self.user)
        
        # 创建测试 BBTalk
        self.bbtalk_public = BBTalk.objects.create(
            user=self.user,
            content='公开内容',
            visibility='public'
        )
        self.bbtalk_private = BBTalk.objects.create(
            user=self.user,
            content='私密内容',
            visibility='private'
        )
    
    def test_list_bbtalks(self):
        """测试获取 BBTalk 列表"""
        url = '/api/v1/bbtalk/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertEqual(len(response.data['results']), 2)
    
    def test_list_bbtalks_filter_visibility(self):
        """测试按可见性过滤 BBTalk"""
        url = '/api/v1/bbtalk/'
        response = self.client.get(url, {'visibility': 'public'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertTrue(all(item['visibility'] == 'public' for item in results))
    
    def test_create_bbtalk_basic(self):
        """测试创建基本 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '新的碎碎念',
            'visibility': 'public'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['content'], '新的碎碎念')
        self.assertEqual(response.data['visibility'], 'public')
        self.assertIsNotNone(response.data['uid'])
    
    def test_create_bbtalk_with_attachments(self):
        """测试创建带附件的 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '带附件的碎碎念',
            'visibility': 'public',
            'attachments': [
                {'url': 'https://example.com/photo.jpg', 'type': 'image'},
                {'url': 'https://example.com/video.mp4', 'type': 'video'},
                {'url': 'https://example.com/audio.mp3', 'type': 'audio'}
            ]
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['attachments']), 3)
        self.assertEqual(response.data['attachments'][0]['type'], 'image')
        self.assertEqual(response.data['attachments'][1]['type'], 'video')
        self.assertEqual(response.data['attachments'][2]['type'], 'audio')
    
    def test_create_bbtalk_with_multiple_image_attachments(self):
        """测试创建带多个图片附件的 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '带多个图片的碎碎念',
            'visibility': 'public',
            'attachments': [
                {'url': 'https://example.com/photo1.jpg', 'type': 'image'},
                {'url': 'https://example.com/photo2.png', 'type': 'image'},
                {'url': 'https://example.com/photo3.gif', 'type': 'image'}
            ]
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['attachments']), 3)
        self.assertTrue(all(att['type'] == 'image' for att in response.data['attachments']))
    
    def test_create_bbtalk_with_tags(self):
        """测试创建带标签的 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '带标签的碎碎念',
            'visibility': 'public',
            'post_tags': '生活,工作'  # 使用 post_tags 字段传递标签名称
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['tags']), 2)
    
    def test_create_bbtalk_with_context(self):
        """测试创建带上下文的 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '带上下文的碎碎念',
            'visibility': 'public',
            'context': {
                'location': 'Beijing',
                'weather': {'temp': 20, 'condition': 'sunny'}
            }
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # context.device 会被 serializer 自动设置为 IP 和 UA 信息
        self.assertIn('device', response.data['context'])
        # 用户传入的其他字段应该保留
        self.assertEqual(response.data['context']['location'], 'Beijing')
    
    def test_create_bbtalk_with_empty_attachments(self):
        """测试创建空附件列表的 BBTalk"""
        url = '/api/v1/bbtalk/'
        data = {
            'content': '无附件的碎碎念',
            'visibility': 'public',
            'attachments': []
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['attachments'], [])
    
    def test_update_bbtalk(self):
        """测试更新 BBTalk"""
        url = f'/api/v1/bbtalk/{self.bbtalk_public.uid}/'
        data = {
            'content': '更新后的内容',
            'visibility': 'private'
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content'], '更新后的内容')
        self.assertEqual(response.data['visibility'], 'private')
    
    def test_update_bbtalk_attachments(self):
        """测试更新 BBTalk 附件"""
        url = f'/api/v1/bbtalk/{self.bbtalk_public.uid}/'
        data = {
            'attachments': [
                {'url': 'https://example.com/new_photo.jpg', 'type': 'image'},
                {'url': 'https://example.com/new_video.mp4', 'type': 'video'}
            ]
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['attachments']), 2)
        self.assertEqual(response.data['attachments'][0]['type'], 'image')
        self.assertEqual(response.data['attachments'][1]['type'], 'video')
    
    def test_update_bbtalk_clear_attachments(self):
        """测试清空 BBTalk 附件"""
        # 先创建带附件的 BBTalk
        bbtalk_with_att = BBTalk.objects.create(
            user=self.user,
            content='有附件',
            visibility='public',
            attachments=[{'url': 'https://example.com/test.jpg', 'type': 'image'}]
        )
        
        url = f'/api/v1/bbtalk/{bbtalk_with_att.uid}/'
        data = {'attachments': []}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['attachments'], [])
    
    def test_delete_bbtalk(self):
        """测试删除 BBTalk"""
        url = f'/api/v1/bbtalk/{self.bbtalk_public.uid}/'
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BBTalk.objects.filter(id=self.bbtalk_public.id).exists())
    
    def test_cannot_update_others_bbtalk(self):
        """测试不能更新他人的 BBTalk"""
        url = f'/api/v1/bbtalk/{self.bbtalk_public.uid}/'
        data = {'content': '尝试更新'}
        # 使用 user2 的 token
        self.client.credentials(HTTP_AUTHORIZATION=self.token2)
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_cannot_delete_others_bbtalk(self):
        """测试不能删除他人的 BBTalk"""
        url = f'/api/v1/bbtalk/{self.bbtalk_public.uid}/'
        # 使用 user2 的 token
        self.client.credentials(HTTP_AUTHORIZATION=self.token2)
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(DEBUG=True)
class TagAPITest(APITestCase):
    """Tag API 测试"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create(
            username='testuser'
        )
        
        # 使用 JWT Token 认证
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        # 创建标签
        self.tag = Tag.objects.create(
            name='测试标签',
            user=self.user,
            color='#ff0000'
        )
        
        # 创建关联的 BBTalk（因为 TagViewSet 只返回有 BBTalk 关联的标签）
        self.bbtalk = BBTalk.objects.create(
            user=self.user,
            content='测试内容',
            visibility='public'
        )
        self.bbtalk.tags.add(self.tag)
    
    def test_list_tags(self):
        """测试获取标签列表"""
        url = '/api/v1/bbtalk/tags/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data), 0)
    
    def test_create_tag(self):
        """测试创建标签"""
        url = '/api/v1/bbtalk/tags/'
        data = {
            'name': '新标签',
            'color': '#00ff00'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], '新标签')
        self.assertEqual(response.data['color'], '#00ff00')
    
    def test_create_tag_auto_color(self):
        """测试创建标签自动生成颜色"""
        url = '/api/v1/bbtalk/tags/'
        data = {'name': '自动颜色标签'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data['color'])
        self.assertTrue(response.data['color'].startswith('#'))
    
    def test_update_tag(self):
        """测试更新标签"""
        url = f'/api/v1/bbtalk/tags/{self.tag.uid}/'
        data = {
            'name': '更新后的标签',
            'color': '#0000ff'
        }
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], '更新后的标签')
        self.assertEqual(response.data['color'], '#0000ff')
    
    def test_delete_tag(self):
        """测试删除标签"""
        url = f'/api/v1/bbtalk/tags/{self.tag.uid}/'
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Tag.objects.filter(id=self.tag.id).exists())


@override_settings(DEBUG=True)
class UserAPITest(APITestCase):
    """User API 测试"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create(
            username='testuser',
            email='test@example.com'
        )
        
        # 使用 JWT Token 认证
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    
    def test_get_current_user(self):
        """测试获取当前用户信息"""
        url = '/api/v1/bbtalk/user/me/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'testuser')
        self.assertEqual(response.data['email'], 'test@example.com')
    
    # 移除首次请求自动创建用户的测试，因为现在不再支持该逻辑

