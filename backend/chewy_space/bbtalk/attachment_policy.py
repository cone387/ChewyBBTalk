"""An attached file is public only while referenced by an owner's public post."""
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from .models import BBTalk, Attachment
from uuid import UUID


def attachment_ids(items):
    result = set()
    for item in items or []:
        if isinstance(item, dict):
            try:
                result.add(str(UUID(str(item.get('uid') or item.get('id')))))
            except (ValueError, TypeError, AttributeError):
                pass  # Older imported metadata can reference external/non-UUID files.
    return result


@receiver(pre_save, sender=BBTalk)
def remember_attachments(sender, instance, **kwargs):
    old = sender.objects.filter(pk=instance.pk).values_list('attachments', flat=True).first() if instance.pk else []
    instance._previous_attachment_ids = attachment_ids(old)


@receiver(post_save, sender=BBTalk)
@receiver(post_delete, sender=BBTalk)
def sync_attachment_visibility(sender, instance, **kwargs):
    affected = attachment_ids(instance.attachments) | getattr(instance, '_previous_attachment_ids', set())
    if not affected:
        return
    public = set()
    for items in sender.objects.filter(user_id=instance.user_id, visibility='public').values_list('attachments', flat=True):
        public.update(attachment_ids(items))
    files = Attachment.objects.filter(pk__in=affected, owner_id=str(instance.user_id))
    files.filter(pk__in=public).update(is_public=True)
    files.exclude(pk__in=public).update(is_public=False)
