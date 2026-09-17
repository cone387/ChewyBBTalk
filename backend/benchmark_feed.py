"""Reproducible feed API benchmark; always uses a disposable SQLite database."""
import argparse
import json
import math
import os
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sizes', nargs='+', type=int, default=[1000, 10000])
    parser.add_argument('--repeats', type=int, default=10)
    args = parser.parse_args()
    if min(args.sizes) < 100 or args.repeats < 2:
        parser.error('sizes must be >= 100 and repeats >= 2')
    with tempfile.TemporaryDirectory(prefix='chewy-feed-benchmark-') as directory:
        root = Path(directory)
        os.environ.update(DJANGO_SETTINGS_MODULE='chewy_space.settings', DATABASE_URL='sqlite:///' + str(root / 'db.sqlite3'),
                          DATA_DIR=directory, SECRET_KEY='isolated-feed-benchmark-only', DEBUG='false', ALLOWED_HOSTS='testserver')
        sys.path.insert(0, str(Path(__file__).resolve().parent / 'chewy_space'))
        import django
        from django.conf import settings
        settings.DATABASES['default']['NAME'] = str(root / 'db.sqlite3')
        django.setup()
        from django.core.management import call_command
        from django.db import connection, connections
        from rest_framework.test import APIClient
        from bbtalk.models import User, BBTalk, Tag, Comment
        from bbtalk.views import BBTalkViewSet, BBTalkFilter
        from django.db.models import Count
        import django_filters

        # Frozen query behavior from commit 80bce0f for paired comparisons.
        def baseline_queryset(view):
            return BBTalk.objects.filter(user=view.request.user).prefetch_related('tags').annotate(
                comment_count=Count('comments')).order_by('-is_pinned', '-update_time').distinct()

        class BaselineFilter(BBTalkFilter):
            tags__name = django_filters.CharFilter(field_name='tags__name')

        variants = {'before': (baseline_queryset, BaselineFilter),
                    'after': (BBTalkViewSet.get_queryset, BBTalkFilter)}
        call_command('migrate', interactive=False, verbosity=0)
        report = {'environment': {'python': platform.python_version(), 'django': django.get_version(),
                                 'platform': platform.platform(), 'database': 'temporary SQLite', 'repeats': args.repeats},
                  'samples': []}
        try:
            for size in args.sizes:
                user = User.objects.create(username=f'benchmark-{size}')
                tags = [Tag.objects.create(user=user, name=name) for name in ['topic', 'topic-extra', 'daily']]
                records = BBTalk.objects.bulk_create([
                    BBTalk(user=user, content=f'Record {i}: ' + ('needle ' if i % 10 == 0 else '') + 'A personal daily note. ' * 15,
                           is_pinned=i % 200 == 0) for i in range(size)
                ])
                through = BBTalk.tags.through
                through.objects.bulk_create([through(bbtalk_id=record.pk, tag_id=tag.pk) for record in records for tag in tags])
                Comment.objects.bulk_create([Comment(user=user, bbtalk=record, content=f'Comment {i}') for record in records for i in range(3)])
                client = APIClient()
                client.force_authenticate(user)
                cases = {'first': {}, 'last': {'page': math.ceil(size / 100)}, 'content_search': {'search': 'needle'},
                         'tag_search': {'search': 'topic'}, 'tag_filter': {'tags__name': 'daily'}}
                for name, params in cases.items():
                    def request():
                        response = client.get('/api/v1/bbtalk/', params)
                        assert response.status_code == 200, response.status_code
                        return response
                    samples = {variant: {'times': [], 'sql_times': [], 'counts': []} for variant in variants}
                    # Alternate variants within each repetition, reversing their order
                    # on alternate passes to reduce cache/load ordering bias.
                    for repetition in range(-1, args.repeats):
                        for variant in (list(variants) if repetition % 2 else list(reversed(variants))):
                            queryset, filterset = variants[variant]
                            with patch.object(BBTalkViewSet, 'get_queryset', queryset), patch.object(BBTalkViewSet, 'filterset_class', filterset):
                                queries = []
                                def capture(execute, sql, parameters, many, context):
                                    query_start = time.perf_counter()
                                    try:
                                        return execute(sql, parameters, many, context)
                                    finally:
                                        queries.append((sql, (time.perf_counter() - query_start) * 1000))
                                start = time.perf_counter()
                                with connection.execute_wrapper(capture):
                                    response = request()
                                    payload = response.content
                                elapsed = (time.perf_counter() - start) * 1000
                            rows = response.json()['results']
                            assert all(row['comment_count'] == 3 for row in rows)
                            assert len({row['uid'] for row in rows}) == len(rows)
                            if repetition < 0:
                                continue
                            sample = samples[variant]
                            sample['times'].append(elapsed)
                            sample['counts'].append(len(queries))
                            sample['sql_times'].append(sum(duration for _, duration in queries))
                            sample['returned'], sample['bytes'] = len(rows), len(payload)
                    for variant, sample in samples.items():
                        report['samples'].append({'records': size, 'case': name, 'variant': variant,
                                                  'p50_ms': round(statistics.median(sample['times']), 2),
                                                  'p95_ms': round(sorted(sample['times'])[math.ceil(.95 * args.repeats) - 1], 2),
                                                  'sql_p50_ms': round(statistics.median(sample['sql_times']), 2),
                                                  'queries': sorted(set(sample['counts'])), 'returned': sample['returned'], 'bytes': sample['bytes']})
            print(json.dumps(report, indent=2))
        finally:
            connections.close_all()


if __name__ == '__main__':
    main()
