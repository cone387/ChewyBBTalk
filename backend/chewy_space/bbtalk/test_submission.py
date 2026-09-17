from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from .models import BBTalk, SubmissionReceipt, Tag, User
from .views import BBTalkViewSet


class SubmissionTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create(username='submission-owner')
        self.other = User.objects.create(username='submission-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.payload = {'content': 'one intent', 'post_tags': 'test', 'visibility': 'private'}
        self.key = 'submission-key-001'

    def submit(self, payload=None, key=None):
        return self.client.post('/api/v1/bbtalk/', payload or self.payload, format='json', HTTP_IDEMPOTENCY_KEY=key or self.key)

    def test_replay_and_lookup_return_same_record_without_duplicate_tags(self):
        first = self.submit()
        self.assertEqual(first.status_code, 201)
        replay = self.submit()
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.data['uid'], replay.data['uid'])
        self.assertEqual(replay['Idempotency-Replayed'], 'true')
        self.assertEqual(BBTalk.objects.count(), 1)
        self.assertEqual(Tag.objects.count(), 1)
        lookup = self.client.get('/api/v1/bbtalk/submission-status/', {'key': self.key})
        self.assertEqual(lookup.data['uid'], first.data['uid'])

    def test_changed_payload_conflicts_but_account_keys_are_independent(self):
        self.submit()
        conflict = self.submit({'content': 'different'})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data['code'], 'submission_conflict')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/v1/bbtalk/submission-status/', {'key': self.key}).status_code, 404)
        self.assertEqual(self.submit().status_code, 201)
        self.assertEqual(BBTalk.objects.count(), 2)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/v1/bbtalk/submission-status/', {'key': self.key}).status_code, 401)

    def test_deleted_submission_is_not_resurrected(self):
        self.submit()
        BBTalk.objects.all().delete()
        self.assertEqual(self.submit().status_code, 410)
        self.assertEqual(self.client.get('/api/v1/bbtalk/submission-status/', {'key': self.key}).status_code, 410)
        self.assertEqual(SubmissionReceipt.objects.count(), 1)
        self.assertEqual(BBTalk.objects.count(), 0)

    def test_atomic_failure_rolls_back_receipt_record_and_tags(self):
        original = BBTalkViewSet.perform_create
        def fail_after_save(view, serializer):
            original(view, serializer)
            raise RuntimeError('simulated failure before commit')
        with patch.object(BBTalkViewSet, 'perform_create', fail_after_save):
            with self.assertRaises(RuntimeError):
                self.submit()
        self.assertEqual(SubmissionReceipt.objects.count(), 0)
        self.assertEqual(BBTalk.objects.count(), 0)
        self.assertEqual(Tag.objects.count(), 0)
        self.assertEqual(self.submit().status_code, 201)

    def test_concurrent_creators_can_retry_without_duplicate_records(self):
        barrier = Barrier(2)
        def worker():
            close_old_connections()
            client = APIClient()
            client.force_authenticate(self.user)
            try:
                barrier.wait(timeout=5)
                return client.post('/api/v1/bbtalk/', self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key).status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(worker)
            second = pool.submit(worker)
            statuses = [first.result(timeout=10), second.result(timeout=10)]
        self.assertTrue(all(code in (200, 201, 503) for code in statuses), statuses)
        # SQLite may reject either writer; retrying the same key is safe.
        self.assertIn(self.submit().status_code, (200, 201))
        self.assertEqual(BBTalk.objects.count(), 1)
        self.assertEqual(SubmissionReceipt.objects.count(), 1)

    def test_key_validation_and_legacy_clients(self):
        self.assertEqual(self.submit(key='bad').status_code, 400)
        self.assertEqual(SubmissionReceipt.objects.count(), 0)
        self.assertEqual(self.client.post('/api/v1/bbtalk/', self.payload, format='json').status_code, 201)
        self.assertEqual(SubmissionReceipt.objects.count(), 0)

    def test_cross_origin_headers_and_non_cacheable_status(self):
        response = self.client.options('/api/v1/bbtalk/', HTTP_ORIGIN='http://localhost:4010',
                                       HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
                                       HTTP_ACCESS_CONTROL_REQUEST_HEADERS='idempotency-key,if-match')
        self.assertEqual(response.status_code, 200)
        self.assertIn('idempotency-key', response['Access-Control-Allow-Headers'])
        self.assertIn('if-match', response['Access-Control-Allow-Headers'])
        missing = self.client.get('/api/v1/bbtalk/submission-status/', {'key': self.key})
        self.assertEqual(missing['Cache-Control'], 'no-store')

    def test_concurrent_conditional_edits_do_not_both_overwrite(self):
        record = self.submit().data
        barrier = Barrier(2)
        def worker(content):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(self.user)
            try:
                barrier.wait(timeout=5)
                return client.patch(f"/api/v1/bbtalk/{record['uid']}/", {'content': content}, format='json',
                                    HTTP_IF_MATCH=record['update_time']).status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(worker, 'edit A')
            b = pool.submit(worker, 'edit B')
            statuses = [a.result(timeout=10), b.result(timeout=10)]
        self.assertTrue(all(code in (200, 409, 503) for code in statuses), statuses)
        self.assertLessEqual(statuses.count(200), 1)

    def test_conditional_update_rejects_stale_versions_and_preserves_content(self):
        first = self.submit().data
        path = f"/api/v1/bbtalk/{first['uid']}/"
        saved = self.client.patch(path, {'content': 'new server text'}, format='json', HTTP_IF_MATCH=f'"{first["update_time"]}"')
        self.assertEqual(saved.status_code, 200)
        stale = self.client.patch(path, {'content': 'stale text'}, format='json', HTTP_IF_MATCH=first['update_time'])
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data['current']['content'], 'new server text')
        self.assertEqual(BBTalk.objects.get().content, 'new server text')
        self.assertEqual(self.client.patch(path, {'content': 'bad'}, format='json', HTTP_IF_MATCH='invalid').status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(path, {'content': 'other'}, format='json', HTTP_IF_MATCH=saved.data['update_time']).status_code, 404)
