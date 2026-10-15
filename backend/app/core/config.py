from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações globais da aplicação, carregadas exclusivamente do .env.

    Nenhum segredo deve ser hardcoded no código-fonte: todos os valores
    sensíveis (chaves de API, credenciais de banco, segredo JWT) vêm do
    ambiente via pydantic-settings.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "BookLens API"
    API_V1_PREFIX: str = "/api/v1"

    # Banco de dados (MySQL/MariaDB, driver assíncrono aiomysql ou asyncmy)
    # Ex.: mysql+asyncmy://usuario:senha@host:3306/booklens
    DATABASE_URL: str
    DATABASE_POOL_PRE_PING: bool = True
    DATABASE_POOL_RECYCLE: int = 3600

    # Segurança / JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Gemini API
    GEMINI_API_KEY: str

    # Google Books API (opcional, usado para enriquecimento de metadados)
    GOOGLE_BOOKS_API_KEY: str | None = None

    # CORS - apenas o domínio do frontend Angular deve ser aceito
    CORS_ORIGINS: list[str] = ["http://localhost:4200"]

    # Rate limiting
    OCR_RATE_LIMIT: str = "10/minute"

    # Chave liga/desliga temporária: quando true, /ocr/scan não chama a Gemini
    # API de verdade (evita estourar cota/limite durante desenvolvimento) e
    # retorna sempre "O Chamado do Cuco" como livro detectado, seguindo o
    # fluxo normal de enriquecimento via Google Books.
    OCR_MOCK_ENABLED: bool = False

    # Usuário de desenvolvimento criado automaticamente ao subir a API.
    # Deixe vazio em produção para não criar nada.
    DEV_USER_EMAIL: str | None = None
    DEV_USER_PASSWORD: str | None = None

    # Upload de arquivos
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_IMAGE_CONTENT_TYPES: set[str] = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
