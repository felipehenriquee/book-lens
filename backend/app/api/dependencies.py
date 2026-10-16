from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.domain.interfaces.gemini_interface import GeminiClientInterface
from app.domain.interfaces.image_processor_interface import ImageProcessorInterface
from app.domain.interfaces.repository_interface import (
    BookRepositoryInterface,
    ScanJobRepositoryInterface,
    UserRepositoryInterface,
)
from app.domain.interfaces.storage_interface import StorageInterface
from app.domain.interfaces.task_queue_interface import TaskQueueInterface
from app.domain.models.auth import UserRead
from app.infrastructure.db.repository import (
    SQLAlchemyBookRepository,
    SQLAlchemyScanJobRepository,
    SQLAlchemyUserRepository,
)
from app.infrastructure.gemini.client import GeminiOCRClient
from app.infrastructure.images.processor import PillowImageProcessor
from app.infrastructure.notifications.redis_broker import RedisStreamTokenStore
from app.infrastructure.queue.celery_queue import CeleryTaskQueue
from app.infrastructure.redis.client import create_redis
from app.infrastructure.storage.local_disk import LocalDiskStorage
from app.services.auth_service import AuthService
from app.services.book_service import BookService
from app.services.ocr_service import OCRService
from app.services.scan_job_service import ScanJobService

_bearer_scheme = HTTPBearer(auto_error=True)

DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_user_repository(session: DBSession) -> UserRepositoryInterface:
    return SQLAlchemyUserRepository(session)


def get_book_repository(session: DBSession) -> BookRepositoryInterface:
    return SQLAlchemyBookRepository(session)


def get_gemini_client() -> GeminiClientInterface:
    return GeminiOCRClient()


@lru_cache
def get_scan_storage() -> StorageInterface:
    return LocalDiskStorage(settings.SCAN_STORAGE_DIR)


@lru_cache
def get_image_processor() -> ImageProcessorInterface:
    return PillowImageProcessor(settings.SCAN_IMAGE_MAX_SIDE, settings.SCAN_THUMBNAIL_MAX_SIDE)


@lru_cache
def get_redis() -> Redis:
    return create_redis(settings.REDIS_URL)


def get_stream_token_store() -> RedisStreamTokenStore:
    return RedisStreamTokenStore(get_redis(), settings.SSE_TOKEN_TTL_SECONDS)


@lru_cache
def get_task_queue() -> TaskQueueInterface:
    return CeleryTaskQueue()


def get_scan_job_repository(session: DBSession) -> ScanJobRepositoryInterface:
    return SQLAlchemyScanJobRepository(session)


def get_auth_service(
    user_repository: Annotated[UserRepositoryInterface, Depends(get_user_repository)],
) -> AuthService:
    return AuthService(user_repository)


def get_book_service(
    book_repository: Annotated[BookRepositoryInterface, Depends(get_book_repository)],
) -> BookService:
    return BookService(book_repository)


def get_scan_job_service(
    repository: Annotated[ScanJobRepositoryInterface, Depends(get_scan_job_repository)],
    storage: Annotated[StorageInterface, Depends(get_scan_storage)],
    image_processor: Annotated[ImageProcessorInterface, Depends(get_image_processor)],
    task_queue: Annotated[TaskQueueInterface, Depends(get_task_queue)],
) -> ScanJobService:
    return ScanJobService(repository, storage, image_processor, task_queue)


def get_ocr_service(
    gemini_client: Annotated[GeminiClientInterface, Depends(get_gemini_client)],
) -> OCRService:
    return OCRService(gemini_client)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    user_repository: Annotated[UserRepositoryInterface, Depends(get_user_repository)],
) -> UserRead:
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await user_repository.get_by_id(UUID(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[UserRead, Depends(get_current_user)]
