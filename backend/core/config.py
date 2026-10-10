"""Environment configuration shared by HTTP, CLI and migrations."""

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

SOURCE_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = SOURCE_ROOT if (SOURCE_ROOT / 'pyproject.toml').is_file() else Path.cwd()


def default_runtime_root():
    """New installs use var/; existing local data stays at its original path."""
    legacy = BACKEND_DIR / 'chewy_space'
    if (
        (legacy / 'db.sqlite3').is_file()
        or (legacy / 'data/.secret_key').is_file()
        or (legacy / 'media').exists()
    ):
        return legacy
    return BACKEND_DIR / 'var'


def boolean(name, default=False):
    return os.getenv(name, str(default)).lower() in {'1', 'true', 'yes'}


def secret_key(directory):
    if value := os.getenv('SECRET_KEY'):
        return value
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / '.secret_key'
    try:
        with path.open('x', encoding='utf8') as output:
            value = secrets.token_urlsafe(48)
            output.write(value)
        path.chmod(0o600)
        return value
    except FileExistsError:
        value = path.read_text(encoding='utf8').strip()
        if not value:
            raise RuntimeError('SECRET_KEY 文件为空')
        return value


@dataclass
class Settings:
    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv('DATA_DIR', str(default_runtime_root() / 'data')))
    )
    database_url: str = field(
        default_factory=lambda: os.getenv('DATABASE_URL', 'sqlite:///db.sqlite3')
    )
    secret_key: str = ''
    media_root: Path = field(
        default_factory=lambda: Path(os.getenv('MEDIA_ROOT', str(default_runtime_root() / 'media')))
    )
    debug: bool = field(default_factory=lambda: boolean('DEBUG', True))
    allowed_hosts: list[str] = field(
        default_factory=lambda: os.getenv('ALLOWED_HOSTS', '*').split(',')
    )
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv(
            'CORS_ALLOWED_ORIGINS',
            'http://localhost:4010,http://localhost:3000,http://localhost:8081,http://127.0.0.1:4010,http://127.0.0.1:8081',
        ).split(',')
    )
    cors_all: bool = field(default_factory=lambda: boolean('CORS_ORIGIN_ALLOW_ALL'))
    cors_credentials: bool = field(default_factory=lambda: boolean('CORS_ALLOW_CREDENTIALS', True))
    registration_enabled: bool = field(default_factory=lambda: boolean('REGISTRATION_ENABLED'))
    recovery_enabled: bool = field(default_factory=lambda: boolean('PASSWORD_RECOVERY_ENABLED'))
    login_rate: str = field(default_factory=lambda: os.getenv('AUTH_LOGIN_RATE', '30/minute'))
    registration_rate: str = field(
        default_factory=lambda: os.getenv('AUTH_REGISTRATION_RATE', '5/minute')
    )
    refresh_rate: str = field(default_factory=lambda: os.getenv('AUTH_REFRESH_RATE', '120/minute'))
    recovery_rate: str = field(
        default_factory=lambda: os.getenv('PASSWORD_RECOVERY_RATE', '5/minute')
    )
    max_file_size: int = field(
        default_factory=lambda: int(os.getenv('ATTACHMENT_MAX_FILE_SIZE', 10 * 1024 * 1024))
    )
    max_import_size: int = field(
        default_factory=lambda: int(os.getenv('IMPORT_MAX_FILE_SIZE', 512 * 1024 * 1024))
    )
    timezone: ZoneInfo = field(
        default_factory=lambda: ZoneInfo(os.getenv('TIME_ZONE', 'Asia/Shanghai'))
    )
    cookie_secure: bool = field(default_factory=lambda: boolean('SESSION_COOKIE_SECURE'))

    def __post_init__(self):
        self.data_dir = Path(self.data_dir).resolve()
        self.media_root = Path(self.media_root).resolve()
        self.secret_key = self.secret_key or secret_key(self.data_dir)
        if self.database_url.startswith('sqlite:///'):
            value = self.database_url[len('sqlite:///') :]
            if value != ':memory:':
                path = Path(value)
                if not path.is_absolute():
                    legacy = BACKEND_DIR / 'chewy_space' / path
                    path = legacy if legacy.is_file() else default_runtime_root() / path
                self.database_url = 'sqlite:///' + path.resolve().as_posix()
        elif self.database_url.startswith(('postgres://', 'postgresql://')):
            # Choose the installed driver explicitly; SQLAlchemy's default may
            # change between releases (psycopg2 versus psycopg).
            self.database_url = 'postgresql+psycopg2://' + self.database_url.split('://', 1)[1]
        elif self.database_url.startswith('mysql://'):
            self.database_url = self.database_url.replace('mysql://', 'mysql+pymysql://', 1)

    @property
    def storage_root(self):
        return self.media_root / 'attachments'

    @property
    def backup_root(self):
        return Path(os.getenv('BACKUP_ROOT', str(self.data_dir / 'backups'))).resolve()
