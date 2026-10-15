from abc import ABC, abstractmethod
from datetime import date
from uuid import UUID

from app.domain.models.auth import UserRead
from app.domain.models.book import BookCreate, BookResponse, BookUpdate


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
