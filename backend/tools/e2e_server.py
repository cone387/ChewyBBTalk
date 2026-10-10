"""Loopback-only FastAPI server with disposable data for browser regression tests."""

import os
import tempfile
from pathlib import Path


def main():
    with tempfile.TemporaryDirectory(prefix='chewybbtalk-e2e-') as directory:
        root = Path(directory)
        os.environ.update(
            {
                'DATABASE_URL': 'sqlite:///' + str(root / 'db.sqlite3'),
                'DATA_DIR': directory,
                'MEDIA_ROOT': str(root / 'media'),
                'STATIC_ROOT': str(root / 'static'),
                'SECRET_KEY': 'isolated-browser-tests-only-not-a-production-key',
                'DEBUG': 'false',
                'REGISTRATION_ENABLED': 'true',
                'AUTH_LOGIN_RATE': '10000/minute',
                'AUTH_REGISTRATION_RATE': '10000/minute',
                'AUTH_REFRESH_RATE': '10000/minute',
                'ALLOWED_HOSTS': '127.0.0.1,localhost',
            }
        )
        from chewy_api.db.upgrade import upgrade
        from chewy_api.main import app

        upgrade(app.state.engine)
        import uvicorn

        try:
            uvicorn.run(app, host='127.0.0.1', port=18020, proxy_headers=False)
        finally:
            app.state.engine.dispose()


if __name__ == '__main__':
    main()
