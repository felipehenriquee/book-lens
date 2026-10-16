from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from redis.asyncio import Redis

from app.api.dependencies import CurrentUser, get_redis, get_stream_token_store
from app.core.config import settings
from app.infrastructure.notifications.redis_broker import RedisStreamTokenStore, ServerSentEvent, subscribe

router = APIRouter()

RedisDep = Annotated[Redis, Depends(get_redis)]
TokenStoreDep = Annotated[RedisStreamTokenStore, Depends(get_stream_token_store)]


class StreamToken(BaseModel):
    token: str
    expires_in: int


@router.post("/stream-token", response_model=StreamToken)
async def create_stream_token(current_user: CurrentUser, token_store: TokenStoreDep) -> StreamToken:
    """Token de uso único para abrir o stream (o EventSource não envia o header Authorization)."""
    return StreamToken(token=await token_store.issue(current_user.id), expires_in=token_store.ttl_seconds)


@router.get("/stream")
async def stream(
    request: Request,
    redis: RedisDep,
    token_store: TokenStoreDep,
    token: Annotated[str, Query(min_length=1)],
) -> StreamingResponse:
    """Stream SSE com os eventos do usuário (ex.: `scan_job` quando um scan muda de estado).

    Os eventos são publicados pelos workers do Celery num canal Redis do
    usuário; qualquer instância da API entrega para a conexão aberta.
    O token é consumido aqui: uma reconexão com a mesma URL recebe 401, e o
    front pede um token novo antes de reconectar.
    """
    user_id = await token_store.consume(token)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de notificações inválido ou expirado.")

    return StreamingResponse(
        _event_stream(request, redis, user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Impede o nginx de acumular a resposta em buffer (o evento chegaria atrasado).
            "X-Accel-Buffering": "no",
        },
    )


async def _event_stream(request: Request, redis: Redis, user_id: UUID) -> AsyncIterator[str]:
    # Confirma a conexão e sugere ao navegador esperar 5s antes de reconectar.
    yield "retry: 5000\n" + ServerSentEvent("ready", {}).encode()
    async for message in subscribe(redis, user_id, timeout=settings.SSE_HEARTBEAT_SECONDS):
        if await request.is_disconnected():
            break
        if message is None:
            # Comentário SSE (ignorado pelo navegador): mantém a conexão viva
            # atrás de proxies e é o momento de perceber que o cliente foi embora.
            yield ": ping\n\n"
            continue
        yield message.encode()
