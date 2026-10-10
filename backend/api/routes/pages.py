import json
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, Response

from core.public_config import public_config
from schemas.responses import HealthOutput

router = APIRouter()


@router.get('/api/public-config', include_in_schema=False)
def browser_config():
    payload = json.dumps(public_config(), ensure_ascii=True).replace('<', '\\u003c')
    return Response(
        'window.__BBTALK_CONFIG__ = ' + payload + ';',
        media_type='application/javascript',
        headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
    )


@router.get('/healthz', tags=['System'], response_model=HealthOutput)
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
