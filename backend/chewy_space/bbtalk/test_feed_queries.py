from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import BBTalk, Comment, Tag, User


class FeedQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='feed-owner')
        self.other = User.objects.create(username='feed-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_multi_tag_search_preserves_comment_counts_and_account_scope(self):
        record = BBTalk.objects.create(user=self.user, content='body')
        empty = BBTalk.objects.create(user=self.user, content='needle empty')
        for name in ['needle', 'needle-extra']:
            record.tags.add(Tag.objects.create(user=self.user, name=name))
        for _ in range(3):
            Comment.objects.create(user=self.user, bbtalk=record, content='comment')
        BBTalk.objects.create(user=self.other, content='needle secret')
        response = self.client.get('/api/v1/bbtalk/', {'search': 'needle'})
        self.assertEqual(response.status_code, 200)
        rows = response.data['results']
        self.assertEqual(response.data['count'], 2)
        self.assertEqual({row['uid']: row['comment_count'] for row in rows}, {record.uid: 3, empty.uid: 0})
        filtered = self.client.get('/api/v1/bbtalk/', {'tags__name': 'needle'})
        self.assertEqual(filtered.data['count'], 1)
        self.assertEqual(filtered.data['results'][0]['comment_count'], 3)

    def test_equal_timestamps_have_stable_non_overlapping_pages(self):
        records = BBTalk.objects.bulk_create([BBTalk(user=self.user, content=str(i)) for i in range(105)])
        BBTalk.objects.filter(user=self.user).update(update_time=timezone.now())
        BBTalk.objects.filter(pk=records[0].pk).update(is_pinned=True)
        with self.assertNumQueries(3):
            first = self.client.get('/api/v1/bbtalk/').data
        second = self.client.get('/api/v1/bbtalk/', {'page': 2}).data
        actual = [row['uid'] for row in first['results'] + second['results']]
        self.assertEqual(actual, [records[0].uid] + [record.uid for record in reversed(records[1:])])
        self.assertEqual(first['count'], 105)
