from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile

from app.api.dependencies import CurrentUser, get_ocr_service
from app.core.config import settings
from app.core.rate_limiter import limiter
from app.domain.models.ocr import EnrichedBookScanResult
from app.services.ocr_service import OCRService

router = APIRouter()


@router.post("/scan", response_model=EnrichedBookScanResult)
@limiter.limit(settings.OCR_RATE_LIMIT)
async def scan(
    request: Request,
    current_user: CurrentUser,
    ocr_service: Annotated[OCRService, Depends(get_ocr_service)],
    file: UploadFile,
) -> EnrichedBookScanResult:
    return await ocr_service.scan_upload(file)
