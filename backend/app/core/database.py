from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base declarativa para os modelos ORM (SQLAlchemy 2.0)."""


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # MySQL/MariaDB encerram conexões ociosas (wait_timeout); pre_ping evita
    # erros "MySQL server has gone away" e recycle renova antes do timeout.
    pool_pre_ping=settings.DATABASE_POOL_PRE_PING,
    pool_recycle=settings.DATABASE_POOL_RECYCLE,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependência FastAPI que fornece uma sessão assíncrona por requisição."""
    async with AsyncSessionLocal() as session:
        yield session
