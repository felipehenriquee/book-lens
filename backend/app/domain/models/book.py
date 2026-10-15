import re
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from typing_extensions import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_YEAR_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_year_month(value: str | None) -> str | None:
    if value is not None and not _YEAR_MONTH_PATTERN.match(value):
        raise ValueError("deve estar no formato 'YYYY-MM'.")
    return value


class BookFormat(str, Enum):
    PAPERBACK = "PAPERBACK"
    HARDCOVER = "HARDCOVER"
    EBOOK = "EBOOK"
    POCKET = "POCKET"


class ReadingStatus(str, Enum):
    UNREAD = "UNREAD"
    READING = "READING"
    READ = "READ"
    PAUSED = "PAUSED"
    ABANDONED = "ABANDONED"


class BookBase(BaseModel):
    # Identidade mínima do livro: mantida localmente para listar/exibir sem
    # depender de uma chamada à API do Google Books a cada requisição.
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    publisher: str | None = Field(default=None, max_length=255)
    cover_url: str | None = Field(default=None, max_length=500)

    # Referência ao volume no Google Books, usada para reabrir o modal de
    # detalhes sem precisar buscar por título/autor de novo.
    google_books_id: str | None = Field(default=None, max_length=32)

    # Dados que só existem porque são MEUS: opinião, posse e acompanhamento
    # de leitura. Tudo o mais (sinopse, páginas, gênero, idioma...) é exibido
    # sob demanda a partir do Google Books, não persistido aqui.
    format: BookFormat | None = None
    reading_status: ReadingStatus = ReadingStatus.UNREAD
    rating: int | None = Field(default=None, ge=1, le=5)
    purchase_date: str | None = Field(
        default=None, max_length=7, description="Data de compra ou do presente, formato 'YYYY-MM'"
    )
    is_gifted: bool = Field(default=False, description="Se o livro foi ganhado (não comprado)")
    paid_price: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2, description="Preço que paguei"
    )
    read_date: str | None = Field(
        default=None, max_length=7, description="Data em que terminei de ler, formato 'YYYY-MM'"
    )
    user_notes: str | None = None
    gifted_by: str | None = Field(default=None, max_length=120, description="Quem me deu o livro")
    current_page: int | None = Field(default=None, ge=0, description="Página em que parei (status Lendo)")
    # Exceção à regra acima: o total de páginas fica salvo para mostrar o
    # progresso de leitura na listagem sem consultar o Google Books.
    page_count: int | None = Field(default=None, ge=1, description="Total de páginas do livro")

    @field_validator("purchase_date", "read_date")
    @classmethod
    def _check_year_month(cls, value: str | None) -> str | None:
        return _validate_year_month(value)

    @model_validator(mode="after")
    def _clear_price_when_gifted(self) -> Self:
        # Regra de negócio aplicada no servidor, não só escondida na UI:
        # um livro ganhado não tem preço pago por mim, e um comprado não tem
        # quem presenteou.
        if self.is_gifted:
            self.paid_price = None
        else:
            self.gifted_by = None
        return self


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    """Payload de atualização parcial: todos os campos são opcionais."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    author: str | None = Field(default=None, min_length=1, max_length=255)
    publisher: str | None = Field(default=None, max_length=255)
    cover_url: str | None = Field(default=None, max_length=500)
    google_books_id: str | None = Field(default=None, max_length=32)
    format: BookFormat | None = None
    reading_status: ReadingStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    purchase_date: str | None = Field(default=None, max_length=7)
    is_gifted: bool | None = None
    paid_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    read_date: str | None = Field(default=None, max_length=7)
    user_notes: str | None = None
    gifted_by: str | None = Field(default=None, max_length=120)
    current_page: int | None = Field(default=None, ge=0)
    page_count: int | None = Field(default=None, ge=1)

    @field_validator("purchase_date", "read_date")
    @classmethod
    def _check_year_month(cls, value: str | None) -> str | None:
        return _validate_year_month(value)

    @model_validator(mode="after")
    def _clear_price_when_gifted(self) -> Self:
        if self.is_gifted:
            self.paid_price = None
        elif self.is_gifted is False:
            self.gifted_by = None
        return self


class BookResponse(BookBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class BookCollectionCreate(BaseModel):
    """Payload usado para confirmar e persistir um ou mais livros catalogados."""

    books: list[BookCreate] = Field(min_length=1)
