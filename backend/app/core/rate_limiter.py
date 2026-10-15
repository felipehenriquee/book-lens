from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.security import decode_access_token


def _rate_limit_key(request: Request) -> str:
    """Chave de rate limiting por usuário autenticado (via JWT), com fallback por IP.

    Necessário porque a rota de OCR deve limitar 10 chamadas/minuto POR USUÁRIO,
    e não por IP, para proteger a quota da Gemini API de forma justa entre clientes
    atrás do mesmo NAT/proxy.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        user_id = decode_access_token(token)
        if user_id:
            return f"user:{user_id}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_rate_limit_key)
