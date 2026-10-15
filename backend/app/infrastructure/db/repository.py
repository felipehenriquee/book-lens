from datetime import date
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.interfaces.repository_interface import (
    BookRepositoryInterface,
    UserRepositoryInterface,
)
from app.domain.models.auth import UserRead
from app.domain.models.book import BookCreate, BookResponse, BookUpdate
from app.infrastructure.db.models import BookModel, UserModel


class SQLAlchemyUserRepository(UserRepositoryInterface):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str) -> UserRead | None:
        result = await self._session.execute(select(UserModel).where(UserModel.email == email))
        user = result.scalar_one_or_none()
        return UserRead.model_validate(user) if user else None

    async def get_by_id(self, user_id: UUID) -> UserRead | None:
        user = await self._session.get(UserModel, str(user_id))
        return UserRead.model_validate(user) if user else None

    async def get_hashed_password(self, email: str) -> str | None:
        result = await self._session.execute(select(UserModel).where(UserModel.email == email))
        user = result.scalar_one_or_none()
        return user.hashed_password if user else None

    async def create(
        self, email: str, hashed_password: str, full_name: str | None, birth_date: date
    ) -> UserRead:
        user = UserModel(
            email=email, hashed_password=hashed_password, full_name=full_name, birth_date=birth_date
        )
        self._session.add(user)
        await self._session.commit()
        await self._session.refresh(user)
        return UserRead.model_validate(user)


class SQLAlchemyBookRepository(BookRepositoryInterface):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_owner(self, user_id: UUID) -> list[BookResponse]:
        result = await self._session.execute(
            select(BookModel)
            .where(BookModel.user_id == str(user_id))
            .order_by(BookModel.created_at.desc())
        )
        return [BookResponse.model_validate(book) for book in result.scalars().all()]

    async def get_by_id(self, book_id: UUID, user_id: UUID) -> BookResponse | None:
        result = await self._session.execute(
            select(BookModel).where(
                BookModel.id == str(book_id), BookModel.user_id == str(user_id)
            )
        )
        book = result.scalar_one_or_none()
        return BookResponse.model_validate(book) if book else None

    async def create_many(self, user_id: UUID, books: list[BookCreate]) -> list[BookResponse]:
        book_models = [
            BookModel(
                title=book.title,
                author=book.author,
                publisher=book.publisher,
                cover_url=book.cover_url,
                google_books_id=book.google_books_id,
                format=book.format,
                reading_status=book.reading_status,
                rating=book.rating,
                purchase_date=book.purchase_date,
                is_gifted=book.is_gifted,
                paid_price=book.paid_price,
                read_date=book.read_date,
                user_notes=book.user_notes,
                gifted_by=book.gifted_by,
                current_page=book.current_page,
                page_count=book.page_count,
                user_id=str(user_id),
            )
            for book in books
        ]
        self._session.add_all(book_models)
        await self._session.commit()
        for book_model in book_models:
            await self._session.refresh(book_model)
        return [BookResponse.model_validate(book) for book in book_models]

    async def update(
        self, book_id: UUID, user_id: UUID, payload: BookUpdate
    ) -> BookResponse | None:
        result = await self._session.execute(
            select(BookModel).where(
                BookModel.id == str(book_id), BookModel.user_id == str(user_id)
            )
        )
        book = result.scalar_one_or_none()
        if book is None:
            return None

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(book, field, value)

        await self._session.commit()
        await self._session.refresh(book)
        return BookResponse.model_validate(book)

    async def delete(self, book_id: UUID, user_id: UUID) -> bool:
        result = await self._session.execute(
            delete(BookModel).where(
                BookModel.id == str(book_id), BookModel.user_id == str(user_id)
            )
        )
        await self._session.commit()
        return result.rowcount > 0
