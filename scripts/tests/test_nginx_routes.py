"""Exercise deployed Nginx templates against an isolated upstream and private file."""

import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(os.getenv('RUN_NGINX_TESTS') == '1', 'Set RUN_NGINX_TESTS=1 with Docker available')
class NginxRoutesTests(unittest.TestCase):
    def test_backend_routes_and_private_media_in_both_deployments(self):
        for relative in ('nginx.conf', 'frontend/nginx.conf'):
            with self.subTest(config=relative), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                root.chmod(0o755)
                (root / 'private.txt').write_text('private-file-must-not-be-public')
                (root / 'index.html').write_text('frontend-shell')
                (root / 'private.txt').chmod(0o644)
                (root / 'index.html').chmod(0o644)
                template = (ROOT / relative).read_text(encoding='utf8')
                template = template.replace('${NGINX_CLIENT_MAX_BODY_SIZE}', '513M')
                template = template.replace('user www-data;', 'user nginx;')
                template = template.replace('http://chewybbtalk-backend:8020', 'http://127.0.0.1:8020')
                upstream = '''
server {
    listen 8020;
    location = /api/proxy-context {
        default_type text/plain;
        return 200 "$http_host|$http_x_forwarded_proto";
    }
    location / { default_type text/plain; return 200 "upstream:$request_uri"; }
}
server {
    listen 4011;
    location / {
        proxy_pass http://127.0.0.1:4010;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
'''
                if relative.startswith('frontend/'):
                    config = 'events {}\nhttp {\ninclude /etc/nginx/mime.types;\n' + template + upstream + '\n}'
                else:
                    position = template.rfind('}')
                    config = template[:position] + upstream + template[position:]
                path = root / 'nginx.conf'
                path.write_text(config, encoding='utf8', newline='\n')
                name = 'bbtalk-nginx-test-' + uuid4().hex[:10]
                command = ['docker', 'run', '-d', '--rm', '--name', name,
                           '-p', '127.0.0.1::4010', '-p', '127.0.0.1::4011']
                for source, target in (
                    (path, '/etc/nginx/nginx.conf'),
                    (root, '/app/data/media'),
                    (root, '/app/media'),
                    (root, '/app/frontend'),
                    (root, '/usr/share/nginx/html'),
                ):
                    command.extend(['--mount', f'type=bind,source={source},target={target},readonly'])
                command.append(os.getenv('NGINX_TEST_IMAGE', 'nginx:alpine'))
                try:
                    subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)
                    ports = json.loads(subprocess.check_output(
                        ['docker', 'inspect', name, '--format', '{{json .NetworkSettings.Ports}}'], text=True
                    ))
                    port = ports['4010/tcp'][0]['HostPort']
                    base = f'http://127.0.0.1:{port}'
                    for attempt in range(40):
                        try:
                            with urlopen(base + '/', timeout=1) as response:
                                self.assertEqual(response.read(), b'frontend-shell')
                            break
                        except (URLError, ConnectionError):
                            if attempt == 39:
                                raise
                            time.sleep(0.1)
                    for route in ('/api/v1/bbtalk/user/me', '/admin/', '/admin/statics/css/theme.css',
                                  '/privacy-policy/', '/support/', '/healthz'):
                        with self.subTest(route=route), urlopen(base + route, timeout=3) as response:
                            self.assertEqual(response.read().decode(), 'upstream:' + route, route)
                    with self.assertRaises(HTTPError) as blocked:
                        urlopen(base + '/media/private.txt', timeout=3)
                    self.assertEqual(blocked.exception.code, 404)
                    blocked.exception.close()
                    for listener, scheme in (('4010/tcp', 'http'), ('4011/tcp', 'https')):
                        external_port = ports[listener][0]['HostPort']
                        with self.subTest(scheme=scheme), urlopen(
                            f'http://127.0.0.1:{external_port}/api/proxy-context', timeout=3
                        ) as response:
                            self.assertEqual(response.read().decode(),
                                             f'127.0.0.1:{external_port}|{scheme}')
                finally:
                    subprocess.run(['docker', 'rm', '-f', name], check=False, capture_output=True, timeout=30)


if __name__ == '__main__':
    unittest.main()
