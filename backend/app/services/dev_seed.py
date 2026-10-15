import logging
from datetime import date

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.domain.models.auth import UserCreate
from app.infrastructure.db.repository import SQLAlchemyUserRepository
from app.services.auth_service import AuthService

logger = logging.getLogger("uvicorn.error")


async def ensure_dev_user() -> None:
    """Cria o usuário de desenvolvimento definido no .env, se ainda não existir.

    Só roda quando DEV_USER_EMAIL e DEV_USER_PASSWORD estão definidos — em
    produção basta não declarar essas variáveis.
    """
    if not settings.DEV_USER_EMAIL or not settings.DEV_USER_PASSWORD:
        return

    async with AsyncSessionLocal() as session:
        repository = SQLAlchemyUserRepository(session)
        if await repository.get_by_email(settings.DEV_USER_EMAIL) is not None:
            return

        await AuthService(repository).register(
            UserCreate(
                email=settings.DEV_USER_EMAIL,
                password=settings.DEV_USER_PASSWORD,
                full_name="Usuário Dev",
                birth_date=date(2000, 1, 1),
            )
        )
        logger.info("Usuário de desenvolvimento criado: %s", settings.DEV_USER_EMAIL)
