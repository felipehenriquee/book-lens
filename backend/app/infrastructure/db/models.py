import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.mysql import CHAR, ENUM as MySQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.domain.models.book import BookFormat, ReadingStatus


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
