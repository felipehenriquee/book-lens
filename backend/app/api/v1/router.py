from fastapi import APIRouter

from app.api.v1.endpoints import auth, books, google_books, notifications, ocr, scans

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(books.router, prefix="/books", tags=["books"])
api_router.include_router(ocr.router, prefix="/ocr", tags=["ocr"])
api_router.include_router(scans.router, prefix="/scans", tags=["scans"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(google_books.router, prefix="/google-books", tags=["google-books"])
