from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_auth_service
from app.domain.models.auth import Token, UserCreate, UserLogin, UserRead
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserCreate,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserRead:
    return await auth_service.register(payload)


@router.post("/login", response_model=Token)
async def login(
    payload: UserLogin,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> Token:
    return await auth_service.login(payload)
