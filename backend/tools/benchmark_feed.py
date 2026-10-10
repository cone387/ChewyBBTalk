"""Benchmark the real native feed against an isolated, disposable SQLite database."""

import argparse
import json
import math
import platform
import statistics
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event

from application import create_app
from core.config import Settings
from database.upgrade import upgrade
from models import BBTalk, Comment, Tag, User
from services.security import token_pair


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sizes', nargs='+', type=int, default=[1000, 10000])
    parser.add_argument('--repeats', type=int, default=10)
    args = parser.parse_args()
    if min(args.sizes) < 100 or args.repeats < 2:
        parser.error('sizes must be >= 100 and repeats >= 2')
    report = {
        'environment': {
            'python': platform.python_version(),
            'platform': platform.platform(),
            'database': 'temporary SQLite',
            'backend': 'native FastAPI',
            'repeats': args.repeats,
        },
        'samples': [],
    }
    with tempfile.TemporaryDirectory(prefix='chewy-feed-benchmark-') as directory:
        root = Path(directory)
        config = Settings(
            database_url='sqlite:///' + (root / 'db.sqlite3').as_posix(),
            data_dir=root,
            media_root=root / 'media',
            secret_key='isolated-benchmark-not-for-production',
        )
        app = create_app(config)
        upgrade(app.state.engine)
        queries = []

        def capture(*args):
            queries.append(args[2])

        event.listen(app.state.engine, 'before_cursor_execute', capture)
        try:
            with TestClient(app) as client:
                for size in args.sizes:
                    with app.state.sessions() as db:
                        user = User(username=f'benchmark-{size}')
                        db.add(user)
                        db.flush()
                        tags = [
                            Tag(user_id=user.id, name=name)
                            for name in ('topic', 'topic-extra', 'daily')
                        ]
                        db.add_all(tags)
                        records = [
                            BBTalk(
                                user_id=user.id,
                                content=f'Record {i}: '
                                + ('needle ' if i % 10 == 0 else '')
                                + 'A daily note. ' * 15,
                                is_pinned=i % 200 == 0,
                                tags=tags,
                            )
                            for i in range(size)
                        ]
                        db.add_all(records)
                        db.flush()
                        db.add_all(
                            Comment(user_id=user.id, bbtalk_id=record.id, content=f'Comment {i}')
                            for record in records
                            for i in range(3)
                        )
                        tokens = token_pair(db, user, config)
                        db.commit()
                    client.headers['Authorization'] = 'Bearer ' + tokens['access']
                    cases = {
                        'first': {},
                        'last': {'page': math.ceil(size / 100)},
                        'content_search': {'search': 'needle'},
                        'tag_search': {'search': 'topic'},
                        'tag_filter': {'tags__name': 'daily'},
                    }
                    for name, params in cases.items():
                        durations, counts = [], []
                        for repetition in range(-1, args.repeats):
                            queries.clear()
                            started = time.perf_counter()
                            response = client.get('/api/v1/bbtalk/', params=params)
                            elapsed = (time.perf_counter() - started) * 1000
                            assert response.status_code == 200, response.text
                            rows = response.json()['results']
                            assert all(row['comment_count'] == 3 for row in rows)
                            assert len({row['uid'] for row in rows}) == len(rows)
                            if repetition >= 0:
                                durations.append(elapsed)
                                counts.append(len(queries))
                        report['samples'].append(
                            {
                                'records': size,
                                'case': name,
                                'p50_ms': round(statistics.median(durations), 2),
                                'p95_ms': round(
                                    sorted(durations)[math.ceil(0.95 * args.repeats) - 1], 2
                                ),
                                'queries': sorted(set(counts)),
                                'returned': len(rows),
                                'bytes': len(response.content),
                            }
                        )
        finally:
            app.state.engine.dispose()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
