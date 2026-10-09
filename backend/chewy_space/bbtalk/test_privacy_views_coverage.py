"""Coverage for the static privacy and support pages."""
from django.test import TestCase


class StaticPageTests(TestCase):
    def test_support_page_renders_html_and_rejects_post(self):
        response = self.client.get('/support/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/html')
        self.assertIn(b'ChewyBBTalk', response.content)
        self.assertIn(b'cone@cone387.top', response.content)
        self.assertEqual(self.client.post('/support/').status_code, 405)

    def test_privacy_policy_page_renders_html_and_rejects_post(self):
        response = self.client.get('/privacy-policy/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/html')
        self.assertIn('隐私政策'.encode('utf-8'), response.content)
        self.assertEqual(self.client.post('/privacy-policy/').status_code, 405)
