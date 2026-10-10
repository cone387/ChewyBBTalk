from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get('/healthz', tags=['System'])
def health():
    return {'status': 'ok'}


@router.get('/privacy-policy/', response_class=HTMLResponse, include_in_schema=False)
def privacy():
    return (Path(__file__).parents[2] / 'templates/privacy_policy_view.html').read_text(
        encoding='utf8'
    )


@router.get('/support/', response_class=HTMLResponse, include_in_schema=False)
def support():
    return (Path(__file__).parents[2] / 'templates/support_view.html').read_text(encoding='utf8')
