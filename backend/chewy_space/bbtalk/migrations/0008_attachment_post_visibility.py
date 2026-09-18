from uuid import UUID
from django.db import migrations


def align_visibility(apps, schema_editor):
    Post = apps.get_model('bbtalk', 'BBTalk')
    Attachment = apps.get_model('bbtalk', 'Attachment')
    for user_id in Post.objects.values_list('user_id', flat=True).distinct().iterator():
        referenced, public = set(), set()
        for items, visibility in Post.objects.filter(user_id=user_id).values_list('attachments', 'visibility').iterator():
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                try:
                    uid = UUID(str(item.get('uid') or item.get('id')))
                except (ValueError, TypeError, AttributeError):
                    continue
                referenced.add(uid)
                if visibility == 'public':
                    public.add(uid)
        # Batch to remain under SQLite's parameter limit on large libraries.
        for ids, value in ((list(public), True), (list(referenced - public), False)):
            for offset in range(0, len(ids), 400):
                Attachment.objects.filter(owner_id=str(user_id), pk__in=ids[offset:offset + 400]).update(is_public=value)


class Migration(migrations.Migration):
    dependencies = [('bbtalk', '0007_desktopauthorization')]
    operations = [migrations.RunPython(align_visibility, migrations.RunPython.noop)]
