from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.domain.interfaces.gemini_interface import GeminiClientInterface
from app.domain.interfaces.repository_interface import (
    BookRepositoryInterface,
    UserRepositoryInterface,
)
from app.domain.models.auth import UserRead
from app.infrastructure.db.repository import SQLAlchemyBookRepository, SQLAlchemyUserRepository
from app.infrastructure.gemini.client import GeminiOCRClient
from app.services.auth_service import AuthService
from app.services.book_service import BookService
from app.services.ocr_service import OCRService

_bearer_scheme = HTTPBearer(auto_error=True)

DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_user_repository(session: DBSession) -> UserRepositoryInterface:
    return SQLAlchemyUserRepository(session)


def get_book_repository(session: DBSession) -> BookRepositoryInterface:
    return SQLAlchemyBookRepository(session)


def get_gemini_client() -> GeminiClientInterface:
    return GeminiOCRClient()


def get_auth_service(
    user_repository: Annotated[UserRepositoryInterface, Depends(get_user_repository)],
) -> AuthService:
    return AuthService(user_repository)


def get_book_service(
    book_repository: Annotated[BookRepositoryInterface, Depends(get_book_repository)],
) -> BookService:
    return BookService(book_repository)


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
