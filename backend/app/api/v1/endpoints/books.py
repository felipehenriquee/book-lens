from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies import CurrentUser, get_book_service
from app.domain.models.book import BookCollectionCreate, BookResponse, BookUpdate
from app.services.book_service import BookService

router = APIRouter()


@router.get("", response_model=list[BookResponse])
async def list_books(
    current_user: CurrentUser,
    book_service: Annotated[BookService, Depends(get_book_service)],
) -> list[BookResponse]:
    return await book_service.list_books(current_user.id)


@router.post("", response_model=list[BookResponse], status_code=status.HTTP_201_CREATED)
async def create_books(
    payload: BookCollectionCreate,
    current_user: CurrentUser,
    book_service: Annotated[BookService, Depends(get_book_service)],
) -> list[BookResponse]:
    return await book_service.create_books(current_user.id, payload.books)


@router.get("/{book_id}", response_model=BookResponse)
async def get_book(
    book_id: UUID,
    current_user: CurrentUser,
    book_service: Annotated[BookService, Depends(get_book_service)],
) -> BookResponse:
    return await book_service.get_book(book_id, current_user.id)


@router.patch("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: UUID,
    payload: BookUpdate,
    current_user: CurrentUser,
    book_service: Annotated[BookService, Depends(get_book_service)],
) -> BookResponse:
    return await book_service.update_book(book_id, current_user.id, payload)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: UUID,
    current_user: CurrentUser,
    book_service: Annotated[BookService, Depends(get_book_service)],
) -> None:
    await book_service.delete_book(book_id, current_user.id)
