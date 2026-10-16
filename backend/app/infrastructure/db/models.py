import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.mysql import CHAR, DATETIME, ENUM as MySQLEnum, MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.domain.models.book import BookFormat, ReadingStatus
from app.domain.models.scan_job import ScanJobStatus


def _generate_uuid() -> str:
    return str(uuid.uuid4())


class UserModel(Base):
    __tablename__ = "users"

    # MySQL/MariaDB não possuem tipo UUID nativo: armazenado como CHAR(36).
    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Nullable no banco para não quebrar contas criadas antes deste campo existir;
    # a obrigatoriedade no cadastro é imposta pelo schema Pydantic (UserCreate).
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    books: Mapped[list["BookModel"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    scan_jobs: Mapped[list["ScanJobModel"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class BookModel(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_generate_uuid)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    google_books_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    format: Mapped[BookFormat | None] = mapped_column(
        MySQLEnum(BookFormat, values_callable=lambda enum_cls: [member.value for member in enum_cls]),
        nullable=True,
    )
    reading_status: Mapped[ReadingStatus] = mapped_column(
        MySQLEnum(ReadingStatus, values_callable=lambda enum_cls: [member.value for member in enum_cls]),
        nullable=False,
        default=ReadingStatus.UNREAD,
        server_default=ReadingStatus.UNREAD.value,
    )

    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchase_date: Mapped[str | None] = mapped_column(String(7), nullable=True)
    is_gifted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    paid_price: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2), nullable=True)
    read_date: Mapped[str | None] = mapped_column(String(7), nullable=True)
    user_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    gifted_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    current_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    user_id: Mapped[str] = mapped_column(
        CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    owner: Mapped["UserModel"] = relationship(back_populates="books")


class ScanJobModel(Base):
    """Foto enviada para a fila de scan. A imagem fica no storage (não no banco):
    aqui só ficam as chaves dos arquivos, o status e o resultado da detecção."""

    __tablename__ = "scan_jobs"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_generate_uuid)
    status: Mapped[ScanJobStatus] = mapped_column(
        MySQLEnum(ScanJobStatus, values_callable=lambda enum_cls: [member.value for member in enum_cls]),
        nullable=False,
        default=ScanJobStatus.QUEUED,
        server_default=ScanJobStatus.QUEUED.value,
        index=True,
    )
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Foto normalizada enviada à Gemini: apagada assim que o processamento termina
    # com sucesso (fica só em caso de falha, para permitir "tentar de novo").
    image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Miniatura para desenhar as molduras na revisão; some junto com o job.
    thumbnail_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # JSON do EnrichedBookScanResult (MEDIUMTEXT: as sinopses do Google Books
    # de vários livros podem passar dos 64KB de um TEXT).
    result_json: Mapped[str | None] = mapped_column(MEDIUMTEXT, nullable=True)
    book_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Precisão de microssegundos: fotos enviadas no mesmo segundo mantêm a ordem na fila.
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=func.now(6), index=True
    )
    # Quando a tarefa foi publicada no RabbitMQ pela última vez (padrão outbox):
    # NULL = a publicação falhou e o reconciliador precisa republicar.
    enqueued_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    user_id: Mapped[str] = mapped_column(
        CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner: Mapped["UserModel"] = relationship(back_populates="scan_jobs")
