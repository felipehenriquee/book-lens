from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.models.ocr import EnrichedBookScanResult


class ScanJobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    DONE = "DONE"
    FAILED = "FAILED"


class ScanJobRead(BaseModel):
    """Resumo de um job da fila de scans, usado na listagem "Meus scans"."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ScanJobStatus
    original_filename: str | None = None
    book_count: int | None = Field(default=None, description="Livros encontrados (quando DONE)")
    error_message: str | None = Field(default=None, description="Motivo da falha (quando FAILED)")
    has_thumbnail: bool = Field(default=False, description="Se há miniatura da foto para a revisão")
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ScanJobDetail(ScanJobRead):
    """Job com o resultado completo da detecção, usado na tela de revisão."""

    result: EnrichedBookScanResult | None = None


class RejectedFile(BaseModel):
    """Foto de um upload que não entrou na fila, com o motivo para mostrar ao usuário."""

    filename: str | None = None
    reason: str


class ScanUploadResult(BaseModel):
    """Resultado de um upload: as fotos que entraram na fila e as recusadas."""

    jobs: list[ScanJobRead]
    rejected: list[RejectedFile] = Field(default_factory=list)


class ScanJobFiles(BaseModel):
    """Chaves no storage dos arquivos de um job (uso interno, nunca exposto na API)."""

    image_key: str | None = None
    thumbnail_key: str | None = None
