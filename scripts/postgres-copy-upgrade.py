"""Back up PostgreSQL deployments and switch through an independently verified copy.

Run on the Linux deployment host. Never alters/drops the source database.
Secrets and diagnostics remain in a mode-0700 backup directory on that host.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import tarfile
import subprocess
import sys
import time
from urllib.parse import parse_qs, unquote, urlsplit, urlunsplit

IMAGE_RE = r'ghcr\.io/cone387/chewy-bbtalk@sha256:[a-f0-9]{64}'
RUN_RE = r'[a-z0-9][a-z0-9_]{5,35}'
BOOT = r'''set -eu
cd /app/backend
mkdir -p "$DATA_DIR" "$MEDIA_ROOT"
chown -R www-data:www-data /app/data
case "$NGINX_CLIENT_MAX_BODY_SIZE" in *[!0-9kKmMgG]*|'') exit 2;; esac
sed "s/\${NGINX_CLIENT_MAX_BODY_SIZE}/$NGINX_CLIENT_MAX_BODY_SIZE/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
'''
PROBE = '''import json, urllib.request, urllib.error
for path, expected in [('/', 200), ('/health', 200), ('/api/schema/', 200), ('/api/v1/bbtalk/user/me', 401)]:
    try:
        response = urllib.request.urlopen('http://127.0.0.1:4010' + path, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, (path, response.status)
        if path == '/api/schema/':
            value = json.load(response)
            assert value['info']['title'] == 'ChewyBBTalk API'
print('HTTP_SMOKE_OK')
'''


def env_file(path, values):
    for key, value in values.items():
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or '\n' in value or '\r' in value or '\0' in value:
            raise RuntimeError('Environment cannot be represented safely in a container env file')
    path.write_text(''.join(f'{key}={value}\n' for key, value in sorted(values.items())), encoding='utf8')
    path.chmod(0o600)


def database_env(url, target=None):
    parsed = urlsplit(url)
    if parsed.scheme not in ('postgres', 'postgresql', 'postgresql+psycopg2'):
        raise RuntimeError('PostgreSQL deployment required')
    values = {'PGHOST': parsed.hostname or '', 'PGPORT': str(parsed.port or 5432),
              'PGUSER': unquote(parsed.username or ''), 'PGPASSWORD': unquote(parsed.password or ''),
              'PGDATABASE': target or unquote(parsed.path.lstrip('/')), 'PGCONNECT_TIMEOUT': '15'}
    allowed = {'sslmode': 'PGSSLMODE', 'connect_timeout': 'PGCONNECT_TIMEOUT', 'application_name': 'PGAPPNAME'}
    for key, value in parse_qs(parsed.query).items():
        if key not in allowed or len(value) != 1:
            raise RuntimeError('Unsupported database connection parameter; inspect before proceeding')
        values[allowed[key]] = value[0]
    if not all(values[key] for key in ('PGHOST', 'PGUSER', 'PGDATABASE')):
        raise RuntimeError('Incomplete PostgreSQL connection settings')
    return values


def target_url(url, target):
    parsed = urlsplit(url)
    return urlunsplit(parsed._replace(path='/' + target))


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def manifest(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Data contains symbolic links; inspect their targets before copying')
        if path.is_file():
            result[str(path.relative_to(root))] = file_hash(path)
    return result


class Upgrade:
    def __init__(self, args):
        self.args = args
        self.directory = Path.cwd().resolve()
        self.root = self.directory.parent / 'migration-backups' / args.run_id
        self.root.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.root.chmod(0o700)
        self.worker = Path(__file__).with_name('postgres-copy-worker.py').resolve()
        self.target = 'chewy_bbtalk_native_' + args.run_id
        self.candidate = 'chewy-bbtalk-check-' + args.run_id
        self.old = 'chewy-bbtalk'
        self.legacy = 'chewy-bbtalk-legacy-' + args.run_id
        self.stopped = False
        self.published = False
        self.renamed = False
        self.runtime_image = args.image
        self.pg_image = 'postgres:16'

    def run(self, *command, timeout=300, input=None, quiet=False):
        result = subprocess.run(command, input=input, capture_output=True, timeout=timeout)
        if result.returncode:
            with (self.root / 'diagnostics.log').open('ab') as output:
                output.write(result.stdout + result.stderr)
            raise RuntimeError('Command failed; restricted diagnostics retained on server')
        if not quiet and result.stdout:
            print(result.stdout.decode('utf8', errors='replace').strip(), flush=True)
        return result.stdout

    def docker(self, *command, **kwargs):
        return self.run('docker', *command, **kwargs)

    def worker_task(self, task):
        output = self.docker('run', '--rm', '--env-file', str(self.root / 'source.env'),
                    '-e', 'TARGET_DATABASE=' + self.target, '-e', 'PYTHONPATH=/app/backend',
                    '-v', str(self.worker.parent) + ':/ops:ro', '-w', '/app/backend',
                    '--entrypoint', 'python', self.runtime_image, '/ops/postgres-copy-worker.py', task,
                    quiet=True)
        (self.root / (task + '.json')).write_bytes(output)
        print(output.decode().strip(), flush=True)

    def inspect(self):
        raw = self.docker('inspect', self.old, quiet=True)
        (self.root / 'old-container.json').write_bytes(raw)
        info = json.loads(raw)[0]
        if not info['State']['Running']:
            raise RuntimeError('Expected the original service to be running')
        self.source = dict(item.split('=', 1) for item in info['Config']['Env'] if '=' in item)
        if self.source.get('MEDIA_ROOT') != '/app/data/media' or self.source.get('BACKUP_ROOT'):
            raise RuntimeError('Nonstandard media/backup layout requires explicit review')
        if not self.source.get('SECRET_KEY'):
            raise RuntimeError('Effective SECRET_KEY must be preserved explicitly')
        mounts = info['Mounts']
        if len(mounts) != 1 or mounts[0]['Destination'] != '/app/data' or mounts[0]['Type'] != 'bind':
            raise RuntimeError('Unreviewed container mounts')
        self.data = Path(mounts[0]['Source']).resolve()
        if not self.data.is_dir() or self.data == self.directory or self.data == Path('/'):
            raise RuntimeError('Unsafe or missing source data directory')
        # Refuse to silently miss persistent files in an unmounted runtime path.
        runtime = self.source.get('DATA_DIR', '/app/data')
        if runtime != '/app/data' and not runtime.startswith('/app/data/'):
            self.docker('exec', self.old, 'python', '-c',
                        'import pathlib,sys; sys.exit(1 if pathlib.Path(sys.argv[1]).exists() else 0)', runtime, quiet=True)
        ports = info['HostConfig']['PortBindings'].get('4010/tcp')
        if not ports or len(ports) != 1 or len(info['HostConfig']['PortBindings']) != 1:
            raise RuntimeError('Unreviewed published ports')
        self.port = ports[0]['HostPort']
        self.host_ip = ports[0].get('HostIp') or '0.0.0.0'
        if not self.port.isdigit() or ':' in self.host_ip:
            raise RuntimeError('Unreviewed port binding')
        shutil.copy2(self.directory / '.env', self.root / 'root.env.before')
        (self.root / 'old-container-changes.txt').write_bytes(self.docker('diff', self.old, quiet=True))
        env_file(self.root / 'source.env', self.source)
        env_file(self.root / 'pg-source.env', database_env(self.source['DATABASE_URL']))
        env_file(self.root / 'pg-target.env', database_env(self.source['DATABASE_URL'], self.target))
        pg = database_env(self.source['DATABASE_URL'])
        if pg['PGDATABASE'] == self.target:
            raise RuntimeError('Source and target must differ')
        print(json.dumps({'backup_directory': str(self.root), 'source_database': pg['PGDATABASE'],
                          'target_database': self.target, 'old_image': info['Config']['Image'],
                          'data_directory': str(self.data), 'port': self.port}), flush=True)

    def pg(self, env, *command):
        self.docker('run', '--rm', '--env-file', str(self.root / env), '-v',
                    str(self.root) + ':/backup', '--entrypoint', command[0], self.pg_image, *command[1:], quiet=True)

    def backup_and_clone(self):
        self.pg('pg-source.env', 'pg_dump', '--format=custom', '--file=/backup/database.dump')
        self.pg('pg-source.env', 'pg_restore', '--list', '/backup/database.dump')
        before = manifest(self.data)
        shutil.copytree(self.data, self.root / 'data', symlinks=True)
        if manifest(self.root / 'data') != before or manifest(self.data) != before:
            raise RuntimeError('Source files changed while backing up; no cutover performed')
        (self.root / 'files.sha256.json').write_text(json.dumps(before, sort_keys=True), encoding='utf8')
        self.run('tar', '-czpf', str(self.root / 'data.tar.gz'), '-C', str(self.root), 'data', quiet=True)
        archived = {}
        with tarfile.open(self.root / 'data.tar.gz', 'r:gz') as archive:
            for member in archive.getmembers():
                if member.isfile():
                    with archive.extractfile(member) as source:
                        archived[str(Path(member.name).relative_to('data'))] = hashlib.sha256(source.read()).hexdigest()
        if archived != before:
            raise RuntimeError('File archive content verification failed')
        self.worker_task('create')
        self.pg('pg-target.env', 'pg_restore', '--no-owner', '--exit-on-error', '--single-transaction',
                '--dbname=' + self.target, '/backup/database.dump')
        self.worker_task('verify-restore')
        self.worker_task('migrate')
        self.worker_task('verify')
        checksums = {name: file_hash(self.root / name)
                     for name in ('database.dump', 'data.tar.gz', 'root.env.before', 'old-container.json')}
        (self.root / 'backup.sha256.json').write_text(json.dumps(checksums, sort_keys=True), encoding='utf8')
        print(json.dumps({'backup_verified': True, 'local_files': len(before), 'sha256': checksums}), flush=True)

    def prepare_service(self):
        skip = {'PATH', 'PYTHON_VERSION', 'PYTHON_SHA256', 'PYTHON_PIP_VERSION',
                'PYTHON_SETUPTOOLS_VERSION', 'GPG_KEY', 'HOSTNAME', 'HOME', 'LANG', 'LC_ALL', 'PYTHONPATH'}
        self.target_env = {k: v for k, v in self.source.items() if k not in skip}
        self.target_env.update(DATABASE_URL=target_url(self.source['DATABASE_URL'], self.target),
                               DATA_DIR='/app/data', MEDIA_ROOT='/app/data/media',
                               CREATE_DEMO_USER='false', WEB_CONCURRENCY='2',
                               NGINX_CLIENT_MAX_BODY_SIZE='513M')
        env_file(self.root / 'target.env', self.target_env)
        self.live_data = self.directory.parent / ('chewy-bbtalk-data-' + self.args.run_id)
        shutil.copytree(self.root / 'data', self.live_data, symlinks=True)
        if manifest(self.live_data) != manifest(self.root / 'data'):
            raise RuntimeError('Live data copy verification failed')
        self.launch(self.candidate, '127.0.0.1:4011:4010', restart='no')
        self.health(self.candidate)
        self.authenticated_health(self.candidate)
        self.docker('stop', self.candidate, quiet=True)
        print('ISOLATED_CANDIDATE_HEALTHY', flush=True)

    def authenticated_health(self, name):
        source = self.worker.with_name('postgres-copy-smoke.py').read_bytes()
        output = self.docker('exec', '-i', '-w', '/app/backend', name, 'python', '-', input=source, quiet=True)
        (self.root / 'authenticated-smoke.json').write_bytes(output)
        print(output.decode().strip(), flush=True)

    def launch(self, name, port, restart):
        self.docker('run', '-d', '--name', name, '--restart', restart, '-p', port,
                    '--env-file', str(self.root / 'target.env'), '-v', str(self.live_data) + ':/app/data',
                    '--entrypoint', '/bin/bash', self.runtime_image, '-c', BOOT, quiet=True)

    def health(self, name):
        for _ in range(45):
            result = subprocess.run(['docker', 'exec', name, 'python', '-c', PROBE], capture_output=True)
            if result.returncode == 0:
                print('HTTP_SMOKE_OK', flush=True)
                return
            time.sleep(2)
        (self.root / 'health-error.log').write_bytes(result.stdout + result.stderr)
        self.docker('logs', name, quiet=True)
        raise RuntimeError('New service health check failed')

    def publish(self):
        self.worker_task('quiescent')
        self.worker_task('verify')
        # Source database, old container and original mounted data remain unchanged.
        self.docker('rename', self.old, self.legacy, quiet=True)
        self.renamed = True
        updated = (self.directory / '.env').read_text(encoding='utf8')
        replacements = {key: self.target_env[key] for key in ('DATABASE_URL', 'SECRET_KEY', 'DATA_DIR',
                        'MEDIA_ROOT', 'WEB_CONCURRENCY', 'CREATE_DEMO_USER', 'NGINX_CLIENT_MAX_BODY_SIZE')}
        replacements['HOST_DATA_DIR'] = str(self.live_data)
        lines = [line for line in updated.splitlines()
                 if not re.match(r'^\s*(?:export\s+)?(' + '|'.join(replacements) + r')\s*=', line)]
        # deploy-env.sh uses literal KEY=VALUE parsing, matching Docker env files.
        env_work = self.directory / '.tmp' / 'server-migration'
        env_work.mkdir(mode=0o700, parents=True, exist_ok=True)
        new_env = env_work / (self.args.run_id + '.env.next')
        new_env.write_text('\n'.join(lines) + '\n' + ''.join(f'{k}={v}\n' for k, v in replacements.items()), encoding='utf8')
        new_env.chmod(0o600)
        os.replace(new_env, self.directory / '.env')
        self.published = True  # From this point user writes may occur; never automatically revert them.
        self.launch(self.old, f'{self.host_ip}:{self.port}:4010', restart='unless-stopped')
        self.health(self.old)
        self.authenticated_health(self.old)
        (self.root / 'CUTOVER_COMPLETE').write_text(self.target + '\n', encoding='utf8')
        print(json.dumps({'cutover_complete': True, 'database': self.target,
                          'retained_container': self.legacy, 'persistent_data': str(self.live_data)}), flush=True)

    def prepare_images(self):
        staged = self.args.staged_images_run_id
        if staged:
            if not re.fullmatch(RUN_RE, staged):
                raise RuntimeError('Invalid staged image run ID')
            directory = self.directory / '.tmp' / 'migration-images' / staged
            if not (directory / 'READY').is_file():
                raise RuntimeError('Staged images have not been verified')
            if (directory / 'READY').read_text(encoding='utf8').strip() != file_hash(directory / 'image-map.json'):
                raise RuntimeError('Staged image mapping checksum mismatch')
            mapping = json.loads((directory / 'image-map.json').read_text(encoding='utf8'))
            if mapping.get('image') != self.args.image or not re.fullmatch(r'[a-f0-9]{40}', mapping.get('revision', '')):
                raise RuntimeError('Staged image provenance differs from requested image')
            for key in ('image_id', 'postgres_image_id'):
                expected = mapping.get(key, '')
                if not re.fullmatch(r'sha256:[a-f0-9]{64}', expected):
                    raise RuntimeError('Invalid staged image content ID')
                info = json.loads(self.docker('image', 'inspect', expected.removeprefix('sha256:'), quiet=True))[0]
                actual = str(info.get('Id') or info.get('ID') or '').removeprefix('sha256:')
                if actual != expected.removeprefix('sha256:'):
                    raise RuntimeError('Loaded image content ID mismatch')
                if key == 'image_id' and info.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != mapping['revision']:
                    raise RuntimeError('Loaded application revision mismatch')
            self.runtime_image = mapping['image_id'].removeprefix('sha256:')
            self.pg_image = mapping['postgres_image_id'].removeprefix('sha256:')
            print('VERIFIED_STAGED_IMAGES_READY', flush=True)
            return
        for image in (self.args.image, 'postgres:16'):
            cached = subprocess.run(['docker', 'image', 'inspect', image], capture_output=True, timeout=30)
            if cached.returncode == 0:
                print('USING_CACHED_IMAGE ' + image, flush=True)
                continue
            print('PULLING ' + image, flush=True)
            self.docker('pull', image, timeout=600, quiet=True)

    def execute(self):
        self.inspect()
        self.prepare_images()
        self.worker_task('preflight')
        if shutil.disk_usage(self.root).free < 512 * 1024 * 1024:
            raise RuntimeError('Less than 512 MiB free before backup')
        try:
            if self.args.phase == 'cutover':
                self.stopped = True
                self.docker('stop', '--time', '45', self.old, quiet=True)
                self.worker_task('quiescent')
                print('MAINTENANCE_STARTED', flush=True)
            self.backup_and_clone()
            self.prepare_service()
            if self.args.phase == 'cutover':
                self.publish()
            else:
                print('REHEARSAL_COMPLETE_ORIGINAL_SERVICE_UNCHANGED', flush=True)
        except Exception:
            if self.stopped and not self.published:
                subprocess.run(['docker', 'stop', self.candidate], capture_output=True)
                if self.renamed:
                    self.docker('rename', self.legacy, self.old, quiet=True)
                    shutil.copy2(self.root / 'root.env.before', self.directory / '.env')
                self.docker('start', self.old, quiet=True)
                print('ORIGINAL_SERVICE_RESTARTED_ORIGINAL_DATABASE_UNCHANGED', flush=True)
            elif self.published:
                print('PUBLIC_CUTOVER_ATTEMPTED: manual inspection required; no automatic database rollback', flush=True)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['rehearse', 'cutover'])
    parser.add_argument('--image', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--staged-images-run-id', default='')
    args = parser.parse_args()
    if not re.fullmatch(IMAGE_RE, args.image) or not re.fullmatch(RUN_RE, args.run_id):
        parser.error('An immutable project image and safe unique run ID are required')
    os.umask(0o077)
    def interrupted(signum, frame):
        raise RuntimeError('Operational process interrupted before completion')
    for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(signum, interrupted)
    import fcntl
    with Path('.deploy-image.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        Upgrade(args).execute()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('UPGRADE_STOPPED: ' + type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
