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
    # Só com o mock ligado: atraso artificial por foto, para simular a demora da
    # Gemini em testes de carga/concorrência sem gastar cota.
    OCR_MOCK_DELAY_SECONDS: float = 0.0

    # Usuário de desenvolvimento criado automaticamente ao subir a API.
    # Deixe vazio em produção para não criar nada.
    DEV_USER_EMAIL: str | None = None
    DEV_USER_PASSWORD: str | None = None

    # Infraestrutura da fila (ver docs de arquitetura no README)
    # Redis: pub/sub das notificações, tokens do SSE, rate limits e vagas por usuário.
    REDIS_URL: str = "redis://localhost:6379/0"
    # RabbitMQ: broker do Celery (entrega das tarefas aos workers).
    CELERY_BROKER_URL: str = "amqp://booklens:booklens@localhost:5672//"

    # Fila de scans (fotos processadas em background pelos workers do Celery)
    SCAN_STORAGE_DIR: str = "storage/scans"
    SCAN_MAX_FILES_PER_UPLOAD: int = 10
    SCAN_UPLOAD_RATE_LIMIT: str = "10/minute"
    # Jobs (e miniaturas) não revisados são apagados após este prazo.
    SCAN_JOB_RETENTION_DAYS: int = 7
    # Fotos processadas ao mesmo tempo por cada processo worker.
    SCAN_WORKER_CONCURRENCY: int = 4
    # Justiça entre usuários: no máximo N fotos de um mesmo usuário em análise ao
    # mesmo tempo; as excedentes voltam para o fim da fila e os outros passam.
    SCAN_MAX_CONCURRENT_PER_USER: int = 2
    SCAN_USER_BUSY_RETRY_SECONDS: int = 5
    # Tempo máximo de uma tarefa (a Gemini tem 45s de timeout por modelo).
    SCAN_TASK_TIME_LIMIT_SECONDS: int = 180
    # Reconciliador (roda a cada minuto) — republica tarefas que se perderam:
    # job nunca publicado (RabbitMQ fora do ar no upload) após este prazo;
    SCAN_RECONCILE_UNPUBLISHED_SECONDS: int = 60
    # job PROCESSING sem terminar (worker morreu e a mensagem se perdeu);
    SCAN_RECONCILE_PROCESSING_SECONDS: int = 300
    # rede de segurança: job publicado mas parado na fila há muito tempo.
    # Alto de propósito: sob carga, esperar na fila é normal e republicar
    # cedo só encheria o RabbitMQ de duplicatas.
    SCAN_RECONCILE_PUBLISHED_SECONDS: int = 1800

    # Limites da Gemini compartilhados por todos os workers (via Redis)
    # Chamadas por minuto, por modelo, somando todos os workers. Ajuste ao plano contratado.
    GEMINI_MAX_REQUESTS_PER_MINUTE: int = 10
    # Se todos os modelos estiverem sem cota por mais que isso, o scan falha em vez
    # de esperar (ex.: cota diária esgotada só volta em horas).
    GEMINI_MAX_WAIT_FOR_QUOTA_SECONDS: int = 900
    # Lado maior da foto enviada à Gemini e da miniatura mostrada na revisão.
    SCAN_IMAGE_MAX_SIDE: int = 2048
    SCAN_THUMBNAIL_MAX_SIDE: int = 1024

    # Notificações em tempo real (SSE)
    # Validade do token de uso único que abre o stream (vai na URL).
    SSE_TOKEN_TTL_SECONDS: int = 60
    # Intervalo do "ping" que mantém a conexão viva atrás de proxies.
    SSE_HEARTBEAT_SECONDS: int = 15

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
