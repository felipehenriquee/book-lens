from fastapi import HTTPException, status

from app.core.security import create_access_token, hash_password, verify_password
from app.domain.interfaces.repository_interface import UserRepositoryInterface
from app.domain.models.auth import Token, UserCreate, UserLogin, UserRead


class AuthService:
    def __init__(self, user_repository: UserRepositoryInterface) -> None:
        self._user_repository = user_repository

    async def register(self, payload: UserCreate) -> UserRead:
        existing = await self._user_repository.get_by_email(payload.email)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Usuário já cadastrado."
            )
        hashed = hash_password(payload.password)
        return await self._user_repository.create(
            email=payload.email,
            hashed_password=hashed,
            full_name=payload.full_name,
            birth_date=payload.birth_date,
        )

    async def login(self, payload: UserLogin) -> Token:
        hashed_password = await self._user_repository.get_hashed_password(payload.email)
        if hashed_password is None or not verify_password(payload.password, hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas.",
            )
        user = await self._user_repository.get_by_email(payload.email)
        assert user is not None
        # Data de aniversário embutida no token para uso direto no front (ex.: ano
        # inicial dos seletores de data) sem precisar de uma chamada extra à API.
        # OBS: o payload do JWT é apenas assinado, não criptografado — qualquer
        # um com o token consegue decodificar essa data.
        extra_claims = {"birth_date": user.birth_date.isoformat()} if user.birth_date else {}
        access_token = create_access_token(subject=str(user.id), extra_claims=extra_claims)
        return Token(access_token=access_token)
