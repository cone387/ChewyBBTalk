"""Coverage for bbtalk.views: auth endpoints, viewset actions, storage settings, data portability."""
import json
from unittest.mock import Mock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .authentication import create_user_with_password
from .data_export import DataExporter
from .data_import import DataImporter
from .models import BBTalk, Comment, Tag, User, UserStorageSettings
from .views import BBTalkFilter, TagViewSet


def s3_payload(**overrides):
    payload = {
        'name': 'coverage-bucket',
        'storage_type': 's3',
        's3_access_key_id': 'AKIA-coverage',
        's3_secret_access_key': 'coverage-secret',
        's3_bucket_name': 'coverage-bucket',
        's3_region_name': 'us-east-1',
    }
    payload.update(overrides)
    return payload


class AuthViewCoverageTests(TestCase):
    def setUp(self):
        self.user = create_user_with_password('auth-coverage', 'secret-pass')
        self.client = APIClient()

    @override_settings(AUTH_LOGIN_RATE='')
    def test_login_session_flow_valid_and_invalid(self):
        self.assertEqual(
            self.client.post('/api/v1/bbtalk/auth/login/', {'username': 'auth-coverage'}).status_code, 400)
        self.assertEqual(
            self.client.post('/api/v1/bbtalk/auth/login/', {'username': 'x', 'password': ''}).status_code, 400)
        ok = self.client.post('/api/v1/bbtalk/auth/login/', {'username': 'auth-coverage', 'password': 'secret-pass'})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['username'], 'auth-coverage')
        bad = self.client.post('/api/v1/bbtalk/auth/login/', {'username': 'auth-coverage', 'password': 'wrong'})
        self.assertEqual(bad.status_code, 400)
        self.assertIn('错误', bad.data['error'])

    @override_settings(AUTH_LOGIN_RATE='')
    def test_token_obtain_empty_fields_rejected(self):
        response = self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'auth-coverage'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('不能为空', response.data['error'])

    def test_token_blacklist_paths(self):
        self.client.force_authenticate(self.user)
        missing = self.client.post('/api/v1/bbtalk/auth/token/blacklist/', {})
        self.assertEqual(missing.status_code, 400)
        self.assertIn('不能为空', missing.data['error'])
        invalid = self.client.post('/api/v1/bbtalk/auth/token/blacklist/', {'refresh': 'not-a-token'})
        self.assertEqual(invalid.status_code, 400)
        self.assertIn('Token 无效', invalid.data['error'])
        from .views import RefreshToken
        refresh = RefreshToken.for_user(self.user)
        ok = self.client.post('/api/v1/bbtalk/auth/token/blacklist/', {'refresh': str(refresh)})
        self.assertEqual(ok.status_code, 200)
        self.assertIn('登出成功', ok.data['message'])

    def test_logout_requires_authentication_and_clears_session(self):
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/logout/').status_code, 401)
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/v1/bbtalk/auth/logout/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('登出成功', response.data['message'])

    @override_settings(REGISTRATION_ENABLED=True, AUTH_REGISTRATION_RATE='')
    def test_register_validation_duplicate_and_failure(self):
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/register/', {'username': 'newbie'}).status_code, 400)
        self.assertEqual(
            self.client.post('/api/v1/bbtalk/auth/register/', {'username': '', 'password': ''}).status_code, 400)
        created = self.client.post('/api/v1/bbtalk/auth/register/', {
            'username': 'newbie', 'password': 'pass-1234', 'email': 'n@example.com', 'display_name': 'New'})
        self.assertEqual(created.status_code, 201)
        self.assertIn('access', created.data)
        duplicate = self.client.post('/api/v1/bbtalk/auth/register/', {
            'username': 'newbie', 'password': 'pass-1234'})
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('已存在', duplicate.data['error'])
        with patch('bbtalk.views.create_user_with_password', side_effect=RuntimeError('identity conflict')):
            failed = self.client.post('/api/v1/bbtalk/auth/register/', {
                'username': 'another', 'password': 'pass-1234'})
        self.assertEqual(failed.status_code, 400)
        self.assertEqual(failed.data['error'], 'identity conflict')

    @override_settings(REGISTRATION_ENABLED=False)
    def test_register_disabled_returns_forbidden_with_code(self):
        response = self.client.post('/api/v1/bbtalk/auth/register/', {
            'username': 'blocked', 'password': 'pass-1234'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'registration_disabled')


class CurrentUserAndAccountTests(TestCase):
    def setUp(self):
        self.user = create_user_with_password('profile-owner', 'secret-pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_patch_current_user_profile(self):
        response = self.client.patch('/api/v1/bbtalk/user/me/', {
            'display_name': 'Renamed', 'bio': 'hello', 'avatar': 'https://example.com/a.png'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, 'Renamed')
        self.assertEqual(self.user.bio, 'hello')
        invalid = self.client.patch('/api/v1/bbtalk/user/me/', {'email': 'not-an-email'}, format='json')
        self.assertEqual(invalid.status_code, 400)

    def test_delete_account_validation_and_success(self):
        missing = self.client.post('/api/v1/bbtalk/user/delete-account/', {})
        self.assertEqual(missing.status_code, 400)
        self.assertIn('请输入密码', missing.data['error'])
        wrong = self.client.post('/api/v1/bbtalk/user/delete-account/', {'password': 'nope'})
        self.assertEqual(wrong.status_code, 400)
        self.assertIn('密码错误', wrong.data['error'])
        BBTalk.objects.create(user=self.user, content='gone soon')
        ok = self.client.post('/api/v1/bbtalk/user/delete-account/', {'password': 'secret-pass'})
        self.assertEqual(ok.status_code, 200)
        self.assertFalse(User.objects.filter(username='profile-owner').exists())
        self.assertFalse(BBTalk.objects.exists())

    def test_delete_account_server_error_is_reported(self):
        with patch.object(User, 'delete', side_effect=RuntimeError('db offline')):
            response = self.client.post('/api/v1/bbtalk/user/delete-account/', {'password': 'secret-pass'})
        self.assertEqual(response.status_code, 500)
        self.assertIn('删除失败', response.data['error'])


class BBTalkActionCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='action-owner')
        self.other = User.objects.create(username='action-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.record = BBTalk.objects.create(user=self.user, content='action record')
        self.plain = BBTalk.objects.create(user=self.user, content='plain', attachments=[])
        self.with_files = BBTalk.objects.create(user=self.user, content='with files', attachments=[{'uid': 'a'}])

    def test_has_attachments_filter_and_none_value_short_circuit(self):
        true = self.client.get('/api/v1/bbtalk/', {'has_attachments': 'true'})
        self.assertEqual([row['uid'] for row in true.data['results']], [self.with_files.uid])
        false = self.client.get('/api/v1/bbtalk/', {'has_attachments': 'false'})
        self.assertEqual(sorted(row['uid'] for row in false.data['results']),
                         sorted([self.record.uid, self.plain.uid]))
        queryset = BBTalk.objects.filter(user=self.user)
        self.assertIs(BBTalkFilter().filter_has_attachments(queryset, 'has_attachments', None), queryset)

    def test_toggle_pin_flips_state(self):
        response = self.client.post(f'/api/v1/bbtalk/{self.record.uid}/pin/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_pinned'])
        again = self.client.post(f'/api/v1/bbtalk/{self.record.uid}/pin/')
        self.assertFalse(again.data['is_pinned'])

    def test_date_counts_aggregates_with_optional_filters(self):
        BBTalk.objects.filter(pk=self.record.pk).update(create_time='2026-03-05 10:00:00+00:00')
        BBTalk.objects.filter(pk=self.plain.pk).update(create_time='2026-03-05 11:00:00+00:00')
        BBTalk.objects.filter(pk=self.with_files.pk).update(create_time='2026-04-06 09:00:00+00:00')
        all_counts = self.client.get('/api/v1/bbtalk/date-counts/').data
        self.assertEqual(all_counts, [{'date': '2026-03-05', 'count': 2}, {'date': '2026-04-06', 'count': 1}])
        filtered = self.client.get('/api/v1/bbtalk/date-counts/', {'year': '2026', 'month': '4'}).data
        self.assertEqual(filtered, [{'date': '2026-04-06', 'count': 1}])
        empty = self.client.get('/api/v1/bbtalk/date-counts/', {'year': '1999'}).data
        self.assertEqual(empty, [])

    def test_comment_list_create_and_delete(self):
        mine = Comment.objects.create(user=self.user, bbtalk=self.record, content='mine')
        Comment.objects.create(user=self.other, bbtalk=self.record, content='theirs')
        listed = self.client.get(f'/api/v1/bbtalk/{self.record.uid}/comments/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 2)
        created = self.client.post(f'/api/v1/bbtalk/{self.record.uid}/comments/', {'content': 'new'}, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['user_username'], 'action-owner')
        invalid = self.client.post(f'/api/v1/bbtalk/{self.record.uid}/comments/', {}, format='json')
        self.assertEqual(invalid.status_code, 400)
        deleted = self.client.delete(f"/api/v1/bbtalk/{self.record.uid}/comments/{mine.uid}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Comment.objects.filter(pk=mine.pk).exists())
        theirs = Comment.objects.get(content='theirs')
        self.assertEqual(
            self.client.delete(f"/api/v1/bbtalk/{self.record.uid}/comments/{theirs.uid}/").status_code, 404)

    def test_public_viewset_only_exposes_public_records(self):
        BBTalk.objects.create(user=self.other, content='open', visibility='public')
        hidden = BBTalk.objects.create(user=self.other, content='hidden', visibility='private')
        anonymous = APIClient()
        listed = anonymous.get('/api/v1/bbtalk/public/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['count'], 1)
        self.assertEqual(listed.data['results'][0]['content'], 'open')
        self.assertEqual(anonymous.get(f'/api/v1/bbtalk/public/{hidden.uid}/').status_code, 404)


class TagActionCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='tag-owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_tag_requires_name_and_is_idempotent(self):
        empty = self.client.post('/api/v1/bbtalk/tags/', {'name': '   '}, format='json')
        self.assertEqual(empty.status_code, 400)
        self.assertIn('不能为空', empty.data['error'])
        first = self.client.post('/api/v1/bbtalk/tags/', {'name': 'news', 'color': '#112233'}, format='json')
        self.assertEqual(first.status_code, 201)
        again = self.client.post('/api/v1/bbtalk/tags/', {'name': 'news', 'color': '#445566'}, format='json')
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data['uid'], first.data['uid'])
        self.assertEqual(Tag.objects.count(), 1)

    def test_perform_create_assigns_request_user(self):
        from rest_framework.test import APIRequestFactory
        from .serializers import TagSerializer
        request = APIRequestFactory().post('/api/v1/bbtalk/tags/', {'name': 'direct'})
        request.user = self.user
        view = TagViewSet()
        view.request = request
        serializer = TagSerializer(data={'name': 'direct', 'color': '#778899'})
        serializer.is_valid(raise_exception=True)
        TagViewSet.perform_create(view, serializer)
        tag = Tag.objects.get(name='direct')
        self.assertEqual(tag.user, self.user)

    def test_destroy_optionally_removes_associated_bbtalks(self):
        guarded = Tag.objects.create(user=self.user, name='guarded')
        survivor = BBTalk.objects.create(user=self.user, content='survivor')
        survivor.tags.add(guarded)
        plain = self.client.delete(f'/api/v1/bbtalk/tags/{guarded.uid}/')
        self.assertEqual(plain.status_code, 200)
        self.assertEqual(plain.data['deleted_bbtalks'], 0)
        self.assertTrue(BBTalk.objects.filter(pk=survivor.pk).exists())
        self.assertFalse(Tag.objects.filter(pk=guarded.pk).exists())

        solo = Tag.objects.create(user=self.user, name='solo')
        shared = Tag.objects.create(user=self.user, name='shared')
        only_solo = BBTalk.objects.create(user=self.user, content='only solo')
        only_solo.tags.add(solo)
        both = BBTalk.objects.create(user=self.user, content='both tags')
        both.tags.add(solo, shared)
        response = self.client.delete(f'/api/v1/bbtalk/tags/{solo.uid}/?delete_bbtalks=true')
        self.assertEqual(response.status_code, 200)
        # Documented behavior: all BBTalks linked to the tag are removed.
        self.assertEqual(response.data['deleted_bbtalks'], 2)
        self.assertFalse(BBTalk.objects.filter(pk__in=[only_solo.pk, both.pk]).exists())
        self.assertTrue(Tag.objects.filter(pk=shared.pk).exists())

    def test_reorder_validates_and_updates_sort_orders(self):
        missing = self.client.post('/api/v1/bbtalk/tags/reorder/', {'items': []}, format='json')
        self.assertEqual(missing.status_code, 400)
        self.assertIn('缺少排序数据', missing.data['error'])
        first = Tag.objects.create(user=self.user, name='first')
        second = Tag.objects.create(user=self.user, name='second')
        other_tag = Tag.objects.create(user=User.objects.create(username='tag-other'), name='foreign')
        response = self.client.post('/api/v1/bbtalk/tags/reorder/', {
            'items': [{'uid': first.uid, 'sort_order': 2}, {'uid': second.uid, 'sort_order': 1},
                      {'uid': other_tag.uid, 'sort_order': 9}]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(Tag.objects.get(pk=first.pk).sort_order, 2)
        self.assertEqual(Tag.objects.get(pk=second.pk).sort_order, 1)
        self.assertEqual(Tag.objects.get(pk=other_tag.pk).sort_order, 0)


class StorageSettingsCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='settings-owner')
        self.other = User.objects.create(username='settings-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.active = UserStorageSettings.objects.create(
            user=self.user, name='active', storage_type='s3',
            s3_access_key_id='key', s3_secret_access_key='secret', s3_bucket_name='bucket', is_active=True)
        self.inactive = UserStorageSettings.objects.create(
            user=self.user, name='inactive', storage_type='s3',
            s3_access_key_id='key2', s3_secret_access_key='secret2', s3_bucket_name='bucket2')

    def test_list_and_get_settings_fallbacks(self):
        listed = self.client.get('/api/v1/bbtalk/settings/storage/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item['name'] for item in listed.data], ['active', 'inactive'])
        active = self.client.get('/api/v1/bbtalk/settings/storage/active/')
        self.assertEqual(active.data['id'], self.active.id)
        UserStorageSettings.objects.filter(user=self.user).update(is_active=False)
        fallback = self.client.get('/api/v1/bbtalk/settings/storage/active/')
        self.assertEqual(fallback.status_code, 200)
        self.assertIn(fallback.data['id'], [self.active.id, self.inactive.id])
        UserStorageSettings.objects.filter(user=self.user).delete()
        empty = self.client.get('/api/v1/bbtalk/settings/storage/active/')
        self.assertEqual(empty.data, {'storage_type': 'local', 'is_active': False})

    def test_create_settings_valid_and_invalid(self):
        created = self.client.post('/api/v1/bbtalk/settings/storage/create/', s3_payload(name='new-cfg'), format='json')
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data['is_s3_configured'])
        self.assertNotIn('s3_secret_access_key', created.data)
        invalid = self.client.post('/api/v1/bbtalk/settings/storage/create/',
                                   s3_payload(name='bad', storage_type='ftp'), format='json')
        self.assertEqual(invalid.status_code, 400)
        self.assertIn('storage_type', invalid.data)

    def test_update_settings_put_patch_and_not_found(self):
        missing = self.client.put('/api/v1/bbtalk/settings/storage/999/', s3_payload(), format='json')
        self.assertEqual(missing.status_code, 404)
        put = self.client.put(f'/api/v1/bbtalk/settings/storage/{self.inactive.id}/',
                              s3_payload(name='renamed-put'), format='json')
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data['name'], 'renamed-put')
        patched = self.client.patch(f'/api/v1/bbtalk/settings/storage/{self.inactive.id}/',
                                    {'name': 'renamed-patch'}, format='json')
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data['name'], 'renamed-patch')
        invalid = self.client.patch(f'/api/v1/bbtalk/settings/storage/{self.inactive.id}/',
                                    {'storage_type': 'ftp'}, format='json')
        self.assertEqual(invalid.status_code, 400)

    def test_delete_and_activate_and_deactivate_all(self):
        temporary = UserStorageSettings.objects.create(user=self.user, name='temporary')
        self.assertEqual(
            self.client.delete('/api/v1/bbtalk/settings/storage/999/delete/').status_code, 404)
        deleted = self.client.delete(f'/api/v1/bbtalk/settings/storage/{temporary.id}/delete/')
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(UserStorageSettings.objects.filter(pk=temporary.id).exists())
        activate_missing = self.client.post('/api/v1/bbtalk/settings/storage/999/activate/')
        self.assertEqual(activate_missing.status_code, 404)
        activated = self.client.post(f'/api/v1/bbtalk/settings/storage/{self.inactive.id}/activate/')
        self.assertEqual(activated.status_code, 200)
        self.active.refresh_from_db()
        self.inactive.refresh_from_db()
        self.assertFalse(self.active.is_active)
        self.assertTrue(self.inactive.is_active)
        deactivate = self.client.post('/api/v1/bbtalk/settings/storage/deactivate-all/')
        self.assertEqual(deactivate.status_code, 200)
        self.assertFalse(UserStorageSettings.objects.filter(user=self.user, is_active=True).exists())
        self.assertEqual(
            UserStorageSettings.objects.get(pk=self.inactive.id).is_active, False)


class StorageConnectionTestCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='s3-tester')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.configured = UserStorageSettings.objects.create(
            user=self.user, name='configured', storage_type='s3',
            s3_access_key_id='key', s3_secret_access_key='secret', s3_bucket_name='bucket',
            s3_region_name='eu-west-1', s3_endpoint_url='https://minio.example.test',
            s3_custom_domain='cdn.example.test')
        self.incomplete = UserStorageSettings.objects.create(
            user=self.user, name='incomplete', storage_type='s3', s3_access_key_id='key')

    def test_active_connection_test_requires_active_config(self):
        response = self.client.post('/api/v1/bbtalk/settings/storage/test/')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data['success'])
        self.assertIn('没有激活', response.data['message'])
        self.configured.is_active = True
        self.configured.save()
        with patch('boto3.Session') as session:
            ok = self.client.post('/api/v1/bbtalk/settings/storage/test/')
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.data['success'])
        self.assertIn('bucket', ok.data['message'])
        kwargs = session.call_args.kwargs
        self.assertEqual(kwargs['aws_access_key_id'], 'key')
        self.assertEqual(kwargs['region_name'], 'eu-west-1')
        client_kwargs = session.return_value.client.call_args.kwargs
        self.assertEqual(client_kwargs['endpoint_url'], 'https://minio.example.test')
        session.return_value.client.return_value.list_objects_v2.assert_called_once_with(Bucket='bucket', MaxKeys=1)

    def test_connection_by_id_not_found_and_incomplete_config(self):
        missing = self.client.post(f'/api/v1/bbtalk/settings/storage/999/test/')
        self.assertEqual(missing.status_code, 404)
        self.assertFalse(missing.data['success'])
        incomplete = self.client.post(f'/api/v1/bbtalk/settings/storage/{self.incomplete.id}/test/')
        self.assertEqual(incomplete.status_code, 400)
        self.assertIn('不完整', incomplete.data['message'])

    def test_connection_without_optional_fields_omits_endpoint_override(self):
        UserStorageSettings.objects.filter(pk=self.configured.pk).update(
            s3_endpoint_url='', s3_custom_domain='')
        with patch('boto3.Session') as session:
            response = self.client.post(f'/api/v1/bbtalk/settings/storage/{self.configured.id}/test/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        client_kwargs = session.return_value.client.call_args.kwargs
        self.assertNotIn('endpoint_url', client_kwargs)
        self.assertEqual(session.return_value.client.call_args.args, ('s3',))

    def test_connection_error_mapping(self):
        from botocore.exceptions import ClientError, NoCredentialsError
        url = f'/api/v1/bbtalk/settings/storage/{self.configured.id}/test/'
        with patch('boto3.Session') as session:
            session.return_value.client.return_value.list_objects_v2.side_effect = NoCredentialsError()
            response = self.client.post(url)
        self.assertEqual(response.status_code, 400)
        self.assertIn('凭证无效', response.data['message'])
        with patch('boto3.Session') as session:
            session.return_value.client.return_value.list_objects_v2.side_effect = ClientError(
                {'Error': {'Code': 'AccessDenied', 'Message': 'no access'}}, 'ListObjectsV2')
            response = self.client.post(url)
        self.assertEqual(response.status_code, 400)
        self.assertIn('AccessDenied', response.data['message'])
        self.assertIn('no access', response.data['message'])
        with patch('boto3.Session') as session:
            session.return_value.client.return_value.list_objects_v2.side_effect = OSError('unreachable')
            response = self.client.post(url)
        self.assertEqual(response.status_code, 400)
        self.assertIn('连接失败', response.data['message'])
        self.assertIn('unreachable', response.data['message'])


class DataPortabilityCoverageTests(TestCase):
    def setUp(self):
        self.source = User.objects.create(username='export-source')
        self.target = create_user_with_password('import-target', 'secret-pass')
        tagged = Tag.objects.create(user=self.source, name='exported', color='#00ff00')
        record = BBTalk.objects.create(user=self.source, content='export me')
        record.tags.add(tagged)
        self.client = APIClient()
        self.client.force_authenticate(self.target)

    def exported_json_file(self):
        payload = DataExporter(self.source).export_to_json().encode('utf-8')
        return SimpleUploadedFile('export.json', payload, content_type='application/json')

    def test_export_json_and_zip_formats(self):
        self.client.force_authenticate(self.source)
        as_json = self.client.get('/api/v1/bbtalk/data/export/')
        self.assertEqual(as_json.status_code, 200)
        self.assertEqual(as_json['Content-Type'], 'application/json')
        self.assertIn('attachment; filename="chewybbtalk_export_export-source_', as_json['Content-Disposition'])
        self.assertEqual(json.loads(as_json.content)['bbtalks'][0]['content'], 'export me')
        as_zip = self.client.get('/api/v1/bbtalk/data/export/',
                                 {'export_format': 'zip', 'include_attachments': 'true'})
        self.assertEqual(as_zip.status_code, 200)
        self.assertEqual(as_zip['Content-Type'], 'application/zip')
        self.assertTrue(as_zip.content[:2] == b'PK')

    def test_export_failure_returns_500_with_message(self):
        self.client.force_authenticate(self.source)
        with patch.object(DataExporter, 'export_to_file', side_effect=RuntimeError('disk full')):
            response = self.client.get('/api/v1/bbtalk/data/export/')
        self.assertEqual(response.status_code, 500)
        self.assertIn('导出失败', response.data['error'])

    def test_import_requires_file_and_reports_partial_results(self):
        missing = self.client.post('/api/v1/bbtalk/data/import/', {})
        self.assertEqual(missing.status_code, 400)
        self.assertIn('请上传文件', missing.data['error'])
        ok = self.client.post('/api/v1/bbtalk/data/import/', {'file': self.exported_json_file()}, format='multipart')
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.data['success'])
        self.assertFalse(ok.data['partial'])
        self.assertEqual(ok.data['stats']['bbtalks_created'], 1)
        stats = {'tags_created': 1, 'tags_skipped': 0, 'bbtalks_created': 0, 'bbtalks_skipped': 1,
                 'attachments_created': 0, 'attachments_skipped': 1, 'comments_created': 0,
                 'comments_skipped': 0, 'storage_settings_created': 0, 'errors': ['one error']}
        with patch.object(DataImporter, 'import_from_file', return_value=stats):
            partial = self.client.post('/api/v1/bbtalk/data/import/', {'file': self.exported_json_file()}, format='multipart')
        self.assertEqual(partial.status_code, 200)
        self.assertTrue(partial.data['partial'])
        self.assertIn('部分完成', partial.data['message'])

    def test_import_invalid_file_and_server_error(self):
        bad_bytes = SimpleUploadedFile('broken.bin', b'\xff\xfe not utf8', content_type='application/octet-stream')
        invalid = self.client.post('/api/v1/bbtalk/data/import/', {'file': bad_bytes}, format='multipart')
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(invalid.data['success'])
        with patch.object(DataImporter, 'import_from_file', side_effect=RuntimeError('db down')):
            failure = self.client.post('/api/v1/bbtalk/data/import/', {'file': self.exported_json_file()}, format='multipart')
        self.assertEqual(failure.status_code, 500)
        self.assertIn('导入失败', failure.data['error'])

    def test_validate_import_endpoint_paths(self):
        missing = self.client.post('/api/v1/bbtalk/data/validate/', {})
        self.assertEqual(missing.status_code, 400)
        valid = self.client.post('/api/v1/bbtalk/data/validate/', {'file': self.exported_json_file()}, format='multipart')
        self.assertEqual(valid.status_code, 200)
        self.assertTrue(valid.data['valid'])
        self.assertGreater(valid.data['preview']['bbtalks_count'], 0)
        with patch('bbtalk.views.validate_import_file', side_effect=RuntimeError('boom')):
            broken = self.client.post('/api/v1/bbtalk/data/validate/', {'file': self.exported_json_file()}, format='multipart')
        self.assertEqual(broken.status_code, 400)
        self.assertFalse(broken.data['valid'])


class StorageMigrationViewCoverageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='migrate-owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        from .models import Attachment
        self.attachment = Attachment.objects.create(
            id='018f0000-0000-7000-8000-000000000001', original_name='a.png',
            storage_path='2026/01/a.png', mime_type='image/png', size=3,
            owner_id=str(self.user.id), storage_config_id='')

    def test_preview_and_execute_without_target(self):
        preview = self.client.post('/api/v1/bbtalk/storage/migration/preview/',
                                   {'target_config_id': None}, format='json')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data, {'total': 1, 'need_migrate': 0, 'already_on_target': 1})
        executed = self.client.post('/api/v1/bbtalk/storage/migration/execute/',
                                    {'target_config_id': None}, format='json')
        self.assertEqual(executed.status_code, 200)
        self.assertTrue(executed.data['success'])
        self.assertEqual(executed.data['stats']['skipped'], 1)
        self.assertEqual(executed.data['stats']['migrated'], 0)

    def test_preview_failure_maps_to_400(self):
        with patch('bbtalk.views.StorageMigrationService', side_effect=ValueError('bad config')):
            response = self.client.post('/api/v1/bbtalk/storage/migration/preview/',
                                        {'target_config_id': 'oops'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'bad config')

    def test_execute_reports_failures_and_errors(self):
        service = Mock()
        service.migrate.return_value = {'total': 2, 'migrated': 1, 'skipped': 0, 'failed': 1, 'errors': ['x']}
        with patch('bbtalk.views.StorageMigrationService', return_value=service):
            response = self.client.post('/api/v1/bbtalk/storage/migration/execute/',
                                        {'target_config_id': 1}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['success'])
        service.migrate.side_effect = RuntimeError('cannot migrate')
        with patch('bbtalk.views.StorageMigrationService', return_value=service):
            failure = self.client.post('/api/v1/bbtalk/storage/migration/execute/',
                                       {'target_config_id': 1}, format='json')
        self.assertEqual(failure.status_code, 500)
        self.assertFalse(failure.data['success'])
