from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser
from app.domain.models.ocr import EnrichedDetectedBook
from app.infrastructure.external_apis.google_books import (
    GoogleBooksClient,
    build_enriched_detected_book,
)

router = APIRouter()


@router.get("/search", response_model=list[EnrichedDetectedBook])
async def search_books(
    current_user: CurrentUser,
    q: Annotated[str, Query(min_length=2, max_length=255)],
) -> list[EnrichedDetectedBook]:
    """Autocomplete por título, usado no cadastro manual de livros."""
    client = GoogleBooksClient()
    items = await client.search_books(q)
    return [build_enriched_detected_book(item) for item in items]


# Precisa vir depois de /search: rota registrada primeiro "ganha" no FastAPI,
# senão "search" seria interpretado como um volume_id.
@router.get("/{volume_id}", response_model=EnrichedDetectedBook)
async def get_book_by_id(current_user: CurrentUser, volume_id: str) -> EnrichedDetectedBook:
    """Busca os detalhes completos de um volume já conhecido (google_books_id salvo)."""
    client = GoogleBooksClient()
    item = await client.get_by_id(volume_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Livro não encontrado no Google Books."
        )
    return build_enriched_detected_book(item)
