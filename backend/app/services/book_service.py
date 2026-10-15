from uuid import UUID

from fastapi import HTTPException, status

from app.domain.interfaces.repository_interface import BookRepositoryInterface
from app.domain.models.book import BookCreate, BookResponse, BookUpdate


class BookService:
    def __init__(self, book_repository: BookRepositoryInterface) -> None:
        self._book_repository = book_repository

    async def list_books(self, user_id: UUID) -> list[BookResponse]:
        return await self._book_repository.list_by_owner(user_id)

    async def get_book(self, book_id: UUID, user_id: UUID) -> BookResponse:
        book = await self._book_repository.get_by_id(book_id, user_id)
        if book is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Livro não encontrado."
            )
        return book

    async def create_books(self, user_id: UUID, books: list[BookCreate]) -> list[BookResponse]:
        return await self._book_repository.create_many(user_id, books)

    async def update_book(self, book_id: UUID, user_id: UUID, payload: BookUpdate) -> BookResponse:
        book = await self._book_repository.update(book_id, user_id, payload)
        if book is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Livro não encontrado."
            )
        return book

    async def delete_book(self, book_id: UUID, user_id: UUID) -> None:
        deleted = await self._book_repository.delete(book_id, user_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Livro não encontrado."
            )
