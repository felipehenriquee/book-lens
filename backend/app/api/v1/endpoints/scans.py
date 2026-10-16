from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status

from app.api.dependencies import CurrentUser, get_scan_job_service
from app.core.config import settings
from app.core.rate_limiter import limiter
from app.domain.models.scan_job import ScanJobDetail, ScanJobRead, ScanUploadResult
from app.services.scan_job_service import ScanJobService

router = APIRouter()

ScanJobServiceDep = Annotated[ScanJobService, Depends(get_scan_job_service)]


@router.post("", response_model=ScanUploadResult, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.SCAN_UPLOAD_RATE_LIMIT)
async def upload_scans(
    request: Request,
    current_user: CurrentUser,
    service: ScanJobServiceDep,
    files: Annotated[list[UploadFile], File(description="Uma ou mais fotos de livros")],
) -> ScanUploadResult:
    """Coloca as fotos na fila e responde na hora (202); o resultado sai em background.

    Fotos inválidas não bloqueiam as outras: voltam em `rejected` com o motivo.
    """
    return await service.enqueue(current_user.id, files)


@router.get("", response_model=list[ScanJobRead])
async def list_scans(current_user: CurrentUser, service: ScanJobServiceDep) -> list[ScanJobRead]:
    return await service.list_jobs(current_user.id)


@router.get("/{job_id}", response_model=ScanJobDetail)
async def get_scan(job_id: UUID, current_user: CurrentUser, service: ScanJobServiceDep) -> ScanJobDetail:
    return await service.get_job(current_user.id, job_id)


@router.get("/{job_id}/thumbnail", response_class=Response)
async def get_scan_thumbnail(job_id: UUID, current_user: CurrentUser, service: ScanJobServiceDep) -> Response:
    data = await service.get_thumbnail(current_user.id, job_id)
    # A miniatura de um job nunca muda: o navegador pode reaproveitar (só para este usuário).
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/{job_id}/retry", response_model=ScanJobRead)
async def retry_scan(job_id: UUID, current_user: CurrentUser, service: ScanJobServiceDep) -> ScanJobRead:
    return await service.retry(current_user.id, job_id)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(job_id: UUID, current_user: CurrentUser, service: ScanJobServiceDep) -> None:
    await service.delete(current_user.id, job_id)
