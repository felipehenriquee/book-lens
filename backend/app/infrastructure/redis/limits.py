import time
from uuid import UUID

from redis.asyncio import Redis

from app.domain.interfaces.limits_interface import ModelRateLimiterInterface, UserSlotsInterface


class RedisModelRateLimiter(ModelRateLimiterInterface):
    """Limite de chamadas por minuto por modelo, somando todos os workers.

    Janela fixa de 1 minuto: um contador por modelo e por minuto (INCR é
    atômico no Redis, então dois workers nunca "pegam" a mesma vaga).
    """

    def __init__(self, redis: Redis, max_per_minute: int) -> None:
        self._redis = redis
        self._max_per_minute = max_per_minute

    async def try_acquire(self, model: str) -> bool:
        key = f"gemini:rpm:{model}:{int(time.time() // 60)}"
        async with self._redis.pipeline(transaction=True) as pipe:
            count, _ = await pipe.incr(key).expire(key, 120).execute()
        if count > self._max_per_minute:
            return False
        return True

    async def cooldown(self, model: str, seconds: float) -> None:
        await self._redis.set(f"gemini:cooldown:{model}", "1", ex=max(1, int(seconds)))

    async def cooldown_remaining(self, model: str) -> float:
        ttl = await self._redis.ttl(f"gemini:cooldown:{model}")
        return float(ttl) if ttl > 0 else 0.0


class RedisUserSlots(UserSlotsInterface):
    """Contador de fotos em análise por usuário.

    A chave expira sozinha (`ttl_seconds`): se um worker morrer sem liberar a
    vaga, ela não fica presa para sempre.
    """

    def __init__(self, redis: Redis, max_per_user: int, ttl_seconds: int) -> None:
        self._redis = redis
        self._max_per_user = max_per_user
        self._ttl_seconds = ttl_seconds

    def _key(self, user_id: UUID) -> str:
        return f"scan:user_slots:{user_id}"

    async def try_acquire(self, user_id: UUID) -> bool:
        key = self._key(user_id)
        async with self._redis.pipeline(transaction=True) as pipe:
            count, _ = await pipe.incr(key).expire(key, self._ttl_seconds).execute()
        if count > self._max_per_user:
            await self._redis.decr(key)
            return False
        return True

    async def release(self, user_id: UUID) -> None:
        key = self._key(user_id)
        if await self._redis.decr(key) <= 0:
            await self._redis.delete(key)
