from abc import ABC, abstractmethod
from datetime import date
from uuid import UUID

from app.domain.models.auth import UserRead
from app.domain.models.book import BookCreate, BookResponse, BookUpdate
from app.domain.models.ocr import EnrichedBookScanResult
from app.domain.models.scan_job import ScanJobDetail, ScanJobFiles, ScanJobRead


class UserRepositoryInterface(ABC):
    @abstractmethod
    async def get_by_email(self, email: str) -> UserRead | None: ...

    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> UserRead | None: ...

    @abstractmethod
    async def create(
        self, email: str, hashed_password: str, full_name: str | None, birth_date: date
    ) -> UserRead: ...

    @abstractmethod
    async def get_hashed_password(self, email: str) -> str | None: ...


class BookRepositoryInterface(ABC):
    @abstractmethod
    async def list_by_owner(self, user_id: UUID) -> list[BookResponse]: ...

    @abstractmethod
    async def get_by_id(self, book_id: UUID, user_id: UUID) -> BookResponse | None: ...

    @abstractmethod
    async def create_many(self, user_id: UUID, books: list[BookCreate]) -> list[BookResponse]: ...

    @abstractmethod
    async def update(
        self, book_id: UUID, user_id: UUID, payload: BookUpdate
    ) -> BookResponse | None: ...

    @abstractmethod
    async def delete(self, book_id: UUID, user_id: UUID) -> bool: ...


class ScanJobRepositoryInterface(ABC):
    @abstractmethod
    async def create(
        self,
        user_id: UUID,
        image_key: str,
        thumbnail_key: str,
        original_filename: str | None,
    ) -> ScanJobRead: ...

    @abstractmethod
    async def list_by_owner(self, user_id: UUID) -> list[ScanJobRead]: ...

    @abstractmethod
    async def get_by_id(self, job_id: UUID, user_id: UUID) -> ScanJobDetail | None: ...

    @abstractmethod
    async def get_files(self, job_id: UUID) -> ScanJobFiles | None: ...

    @abstractmethod
    async def get_with_owner(self, job_id: UUID) -> tuple[UUID, ScanJobRead] | None:
        """Resumo do job e o id do dono (para o worker notificar quem enviou a foto)."""

    @abstractmethod
    async def claim(self, job_id: UUID, allow_reclaim: bool = False) -> bool:
        """Reserva o job para processamento (QUEUED → PROCESSING), de forma atômica.

        Só um worker consegue: se a mesma tarefa for entregue duas vezes, a
        segunda recebe False e não processa de novo (idempotência). Com
        `allow_reclaim`, também retoma um job PROCESSING (entrega repetida
        porque o worker anterior morreu no meio).
        """

    @abstractmethod
    async def release_to_queue(self, job_id: UUID) -> None:
        """Devolve um job PROCESSING para QUEUED (ex.: nenhum modelo de IA disponível agora)."""

    @abstractmethod
    async def mark_done(self, job_id: UUID, result: EnrichedBookScanResult) -> None: ...

    @abstractmethod
    async def mark_failed(self, job_id: UUID, error_message: str) -> None: ...

    @abstractmethod
    async def clear_image_key(self, job_id: UUID) -> None:
        """Esquece a foto original (já apagada do storage) após o processamento."""

    @abstractmethod
    async def requeue(self, job_id: UUID, user_id: UUID) -> ScanJobRead | None:
        """Devolve um job FAILED para a fila (só se a foto original ainda existir)."""

    @abstractmethod
    async def mark_enqueued(self, job_id: UUID) -> None:
        """Registra que a tarefa foi publicada na fila (padrão outbox)."""

    @abstractmethod
    async def find_stuck(
        self, unpublished_after_s: int, processing_after_s: int, published_after_s: int
    ) -> list[UUID]:
        """Jobs cuja tarefa se perdeu e precisa ser republicada (para o reconciliador).

        - QUEUED nunca publicados há mais de `unpublished_after_s`;
        - PROCESSING há mais de `processing_after_s` (voltam para QUEUED: o worker
          que os pegou morreu, já que a tarefa tem tempo máximo bem menor);
        - QUEUED publicados há mais de `published_after_s` (rede de segurança).
        """

    @abstractmethod
    async def delete(self, job_id: UUID, user_id: UUID) -> ScanJobFiles | None:
        """Remove o job do dono e devolve as chaves dos arquivos para apagar do storage."""

    @abstractmethod
    async def delete_older_than_days(self, days: int) -> list[ScanJobFiles]:
        """Remove jobs criados há mais de `days` dias e devolve as chaves dos arquivos para apagar."""
