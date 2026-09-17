"""Backward-compatible durable create requests and conditional record updates."""
import hashlib
import json
import logging
import re

from django.db import IntegrityError, OperationalError, transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_aware
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import SubmissionReceipt

logger = logging.getLogger(__name__)


def validate_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', key):
        raise ValidationError({'error': '提交标识必须是 8–128 位字母、数字、下划线或短横线'})
    return key


def retry_response():
    return Response({'error': '服务器暂时无法确认提交，请保留原提交标识并稍后重试', 'code': 'submission_retry'},
                    status=503, headers={'Retry-After': '1'})


class ReliableSubmissionMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if self.action in {'create', 'update', 'partial_update', 'submission_status'}:
            response['Cache-Control'] = 'no-store'
        return response

    def receipt_response(self, receipt, payload_hash=None):
        if payload_hash is not None and receipt.payload_hash != payload_hash:
            return Response({'error': '此提交标识已用于不同内容，请先核对原提交结果', 'code': 'submission_conflict'}, status=409)
        if receipt.record_id is None:
            return Response({'error': '该提交曾成功，但记录已被删除，不会重复创建', 'code': 'submission_deleted'}, status=410)
        record = self.get_queryset().filter(pk=receipt.record_id).first()
        if record is None:
            return Response({'error': '该提交的记录已不可用', 'code': 'submission_deleted'}, status=410)
        return Response(self.get_serializer(record).data, headers={'Idempotency-Replayed': 'true', 'Cache-Control': 'no-store'})

    def create(self, request, *args, **kwargs):
        key = request.headers.get('Idempotency-Key')
        if key is None:
            return super().create(request, *args, **kwargs)
        validate_key(key)
        payload_hash = hashlib.sha256(json.dumps(request.data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        try:
            receipt = SubmissionReceipt.objects.filter(user=request.user, key=key).first()
            if receipt:
                return self.receipt_response(receipt, payload_hash)
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                # Insert the unique identity before side effects. Concurrent
                # creators either see its committed result or safely retry.
                receipt = SubmissionReceipt.objects.create(user=request.user, key=key, payload_hash=payload_hash)
                self.perform_create(serializer)
                receipt.record = serializer.instance
                receipt.save(update_fields=['record'])
                data = serializer.data
            return Response(data, status=201, headers={'Cache-Control': 'no-store'})
        except IntegrityError:
            receipt = SubmissionReceipt.objects.filter(user=request.user, key=key).first()
            if receipt:
                return self.receipt_response(receipt, payload_hash)
            raise
        except OperationalError:
            logger.exception('Submission database operation failed')
            return retry_response()

    @action(detail=False, methods=['get'], url_path='submission-status')
    def submission_status(self, request):
        key = validate_key(request.query_params.get('key'))
        receipt = get_object_or_404(SubmissionReceipt, user=request.user, key=key)
        return self.receipt_response(receipt)

    def update(self, request, *args, **kwargs):
        expected = request.headers.get('If-Match')
        if expected is None:
            return super().update(request, *args, **kwargs)
        try:
            expected_time = parse_datetime(expected.strip('"'))
        except ValueError:
            expected_time = None
        if expected_time is None or not is_aware(expected_time):
            raise ValidationError({'error': 'If-Match 必须为记录的完整更新时间'})
        try:
            with transaction.atomic():
                # Lock before comparing on databases supporting row locks;
                # SQLite write conflicts fail safely and can be retried.
                instance = get_object_or_404(self.filter_queryset(self.get_queryset()).select_for_update(),
                                             **{self.lookup_field: kwargs[self.lookup_field]})
                self.check_object_permissions(request, instance)
                if instance.update_time != expected_time:
                    return Response({'error': '记录已在其他地方修改，请核对最新内容后再保存',
                                     'code': 'edit_conflict', 'current': self.get_serializer(instance).data}, status=409)
                serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop('partial', False))
                serializer.is_valid(raise_exception=True)
                self.perform_update(serializer)
                instance._prefetched_objects_cache = {}
                return Response(serializer.data)
        except OperationalError:
            logger.exception('Conditional update database operation failed')
            return retry_response()
