"""Montagem das dependências dentro de cada processo worker do Celery.

O Celery cria os processos filhos com fork: conexões (banco, Redis) não podem
ser herdadas do processo pai. Por isso tudo aqui é criado sob demanda, uma vez
por processo filho, e `reset()` é chamado logo após o fork.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.domain.interfaces.repository_interface import ScanJobRepositoryInterface
from app.infrastructure.db.repository import SQLAlchemyScanJobRepository
from app.infrastructure.gemini.client import GeminiOCRClient
from app.infrastructure.notifications.redis_broker import RedisNotifier
from app.infrastructure.redis.client import create_redis
from app.infrastructure.redis.limits import RedisModelRateLimiter, RedisUserSlots
from app.infrastructure.storage.local_disk import LocalDiskStorage
from app.services.scan_processor import ScanProcessor

_processor: ScanProcessor | None = None


@asynccontextmanager
async def _repository_scope() -> AsyncIterator[ScanJobRepositoryInterface]:
    async with AsyncSessionLocal() as session:
        yield SQLAlchemyScanJobRepository(session)


def get_processor() -> ScanProcessor:
    global _processor
    if _processor is None:
        redis = create_redis(settings.REDIS_URL)
        _processor = ScanProcessor(
            repository_scope=_repository_scope,
            storage=LocalDiskStorage(settings.SCAN_STORAGE_DIR),
            gemini_client=GeminiOCRClient(
                rate_limiter=RedisModelRateLimiter(redis, settings.GEMINI_MAX_REQUESTS_PER_MINUTE)
            ),
            notifier=RedisNotifier(redis),
            user_slots=RedisUserSlots(
                redis,
                max_per_user=settings.SCAN_MAX_CONCURRENT_PER_USER,
                # A vaga expira sozinha se o worker morrer sem liberá-la.
                ttl_seconds=settings.SCAN_TASK_TIME_LIMIT_SECONDS * 2,
            ),
            user_busy_retry_seconds=settings.SCAN_USER_BUSY_RETRY_SECONDS,
            max_wait_for_quota_seconds=settings.GEMINI_MAX_WAIT_FOR_QUOTA_SECONDS,
        )
    return _processor


def reset() -> None:
    """Chamado logo após o fork: descarta o que veio do processo pai."""
    global _processor
    _processor = None
    # Conexões do pool do pai não podem ser usadas pelo filho; close=False não
    # fecha as do pai, só faz o filho começar com um pool vazio.
    engine.sync_engine.dispose(close=False)
