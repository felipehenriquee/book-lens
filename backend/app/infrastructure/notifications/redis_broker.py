import json
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from redis.asyncio import Redis

from app.domain.interfaces.notifier_interface import NotifierInterface


def _channel(user_id: UUID) -> str:
    return f"notifications:{user_id}"


@dataclass(frozen=True)
class ServerSentEvent:
    event: str
    data: dict[str, Any]

    def encode(self) -> str:
        """Formato do protocolo SSE: linhas "event:" e "data:" terminadas por linha em branco."""
        return f"event: {self.event}\ndata: {json.dumps(self.data, default=str)}\n\n"


class RedisNotifier(NotifierInterface):
    """Publica eventos num canal Redis por usuário.

    Quem publica (um worker do Celery) e quem entrega (a conexão SSE, em
    qualquer instância da API) podem estar em processos ou máquinas
    diferentes: o Redis faz a ponte. Sem ninguém ouvindo, o evento se perde
    (pub/sub não guarda mensagens) — o estado continua no banco.
    """

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def publish(self, user_id: UUID, event: str, data: dict[str, Any]) -> None:
        await self._redis.publish(_channel(user_id), json.dumps({"event": event, "data": data}, default=str))


async def subscribe(redis: Redis, user_id: UUID, timeout: float) -> AsyncIterator[ServerSentEvent | None]:
    """Eventos do usuário; emite None a cada `timeout` segundos sem eventos (hora do ping)."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(_channel(user_id))
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)
            if message is None:
                yield None
                continue
            try:
                payload = json.loads(message["data"])
                yield ServerSentEvent(event=payload["event"], data=payload["data"])
            except (ValueError, KeyError, TypeError):
                continue
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()


class RedisStreamTokenStore:
    """Tokens de uso único para abrir o stream SSE, guardados no Redis.

    O EventSource do navegador não envia o header Authorization, então o token
    vai na URL. Para não expor o JWT, a URL leva um token próprio: aleatório,
    válido por poucos segundos e apagado no primeiro uso (GETDEL é atômico).
    No Redis, um token emitido por uma instância da API vale em qualquer outra.
    """

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self.ttl_seconds = ttl_seconds

    async def issue(self, user_id: UUID) -> str:
        token = secrets.token_urlsafe(32)
        await self._redis.set(f"sse_token:{token}", str(user_id), ex=self.ttl_seconds)
        return token

    async def consume(self, token: str) -> UUID | None:
        user_id = await self._redis.getdel(f"sse_token:{token}")
        return UUID(user_id) if user_id else None
