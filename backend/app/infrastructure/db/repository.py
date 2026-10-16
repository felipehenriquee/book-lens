from datetime import date
from uuid import UUID

from sqlalchemy import and_, delete, func, literal_column, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.interfaces.repository_interface import (
    BookRepositoryInterface,
    ScanJobRepositoryInterface,
    UserRepositoryInterface,
)
from app.domain.models.auth import UserRead
from app.domain.models.book import BookCreate, BookResponse, BookUpdate
from app.domain.models.ocr import EnrichedBookScanResult
from app.domain.models.scan_job import ScanJobDetail, ScanJobFiles, ScanJobRead, ScanJobStatus
from app.infrastructure.db.models import BookModel, ScanJobModel, UserModel


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


def _scan_job_read(job: ScanJobModel) -> ScanJobRead:
    return ScanJobRead(
        id=UUID(job.id),
        status=job.status,
        original_filename=job.original_filename,
        book_count=job.book_count,
        error_message=job.error_message,
        has_thumbnail=job.thumbnail_key is not None,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


class SQLAlchemyScanJobRepository(ScanJobRepositoryInterface):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        user_id: UUID,
        image_key: str,
        thumbnail_key: str,
        original_filename: str | None,
    ) -> ScanJobRead:
        job = ScanJobModel(
            user_id=str(user_id),
            image_key=image_key,
            thumbnail_key=thumbnail_key,
            original_filename=original_filename,
        )
        self._session.add(job)
        await self._session.commit()
        await self._session.refresh(job)
        return _scan_job_read(job)

    async def list_by_owner(self, user_id: UUID) -> list[ScanJobRead]:
        result = await self._session.execute(
            select(ScanJobModel)
            .where(ScanJobModel.user_id == str(user_id))
            .order_by(ScanJobModel.created_at.desc())
        )
        return [_scan_job_read(job) for job in result.scalars().all()]

    async def get_by_id(self, job_id: UUID, user_id: UUID) -> ScanJobDetail | None:
        job = await self._get_owned(job_id, user_id)
        if job is None:
            return None
        result = (
            EnrichedBookScanResult.model_validate_json(job.result_json) if job.result_json else None
        )
        return ScanJobDetail(**_scan_job_read(job).model_dump(), result=result)

    async def get_files(self, job_id: UUID) -> ScanJobFiles | None:
        job = await self._session.get(ScanJobModel, str(job_id))
        if job is None:
            return None
        return ScanJobFiles(image_key=job.image_key, thumbnail_key=job.thumbnail_key)

    async def get_with_owner(self, job_id: UUID) -> tuple[UUID, ScanJobRead] | None:
        job = await self._session.get(ScanJobModel, str(job_id))
        if job is None:
            return None
        return UUID(job.user_id), _scan_job_read(job)

    async def claim(self, job_id: UUID, allow_reclaim: bool = False) -> bool:
        claimable = [ScanJobStatus.QUEUED]
        if allow_reclaim:
            claimable.append(ScanJobStatus.PROCESSING)
        # UPDATE condicional = operação atômica no banco: entre dois workers com a
        # mesma tarefa, só um vê rowcount == 1.
        result = await self._session.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == str(job_id), ScanJobModel.status.in_(claimable))
            .values(status=ScanJobStatus.PROCESSING, started_at=func.now(6), error_message=None)
        )
        await self._session.commit()
        return result.rowcount == 1

    async def release_to_queue(self, job_id: UUID) -> None:
        await self._session.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == str(job_id), ScanJobModel.status == ScanJobStatus.PROCESSING)
            .values(status=ScanJobStatus.QUEUED, started_at=None)
        )
        await self._session.commit()

    async def mark_done(self, job_id: UUID, result: EnrichedBookScanResult) -> None:
        await self._session.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == str(job_id))
            .values(
                status=ScanJobStatus.DONE,
                result_json=result.model_dump_json(),
                book_count=len(result.detected_books),
                error_message=None,
                finished_at=func.now(6),
            )
        )
        await self._session.commit()

    async def mark_failed(self, job_id: UUID, error_message: str) -> None:
        await self._session.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == str(job_id))
            .values(
                status=ScanJobStatus.FAILED,
                error_message=error_message[:500],
                finished_at=func.now(6),
            )
        )
        await self._session.commit()

    async def clear_image_key(self, job_id: UUID) -> None:
        await self._session.execute(
            update(ScanJobModel).where(ScanJobModel.id == str(job_id)).values(image_key=None)
        )
        await self._session.commit()

    async def requeue(self, job_id: UUID, user_id: UUID) -> ScanJobRead | None:
        job = await self._get_owned(job_id, user_id)
        if job is None or job.status != ScanJobStatus.FAILED or job.image_key is None:
            return None
        job.status = ScanJobStatus.QUEUED
        job.error_message = None
        job.started_at = None
        job.finished_at = None
        job.enqueued_at = None
        await self._session.commit()
        await self._session.refresh(job)
        return _scan_job_read(job)

    async def mark_enqueued(self, job_id: UUID) -> None:
        await self._session.execute(
            update(ScanJobModel).where(ScanJobModel.id == str(job_id)).values(enqueued_at=func.now(6))
        )
        await self._session.commit()

    async def find_stuck(
        self, unpublished_after_s: int, processing_after_s: int, published_after_s: int
    ) -> list[UUID]:
        def ago(seconds: int):
            return func.date_sub(func.now(6), literal_column(f"INTERVAL {int(seconds)} SECOND"))

        await self._session.execute(
            update(ScanJobModel)
            .where(ScanJobModel.status == ScanJobStatus.PROCESSING, ScanJobModel.started_at < ago(processing_after_s))
            .values(status=ScanJobStatus.QUEUED, started_at=None, enqueued_at=None)
        )
        result = await self._session.execute(
            select(ScanJobModel.id).where(
                ScanJobModel.status == ScanJobStatus.QUEUED,
                or_(
                    and_(ScanJobModel.enqueued_at.is_(None), ScanJobModel.created_at < ago(unpublished_after_s)),
                    ScanJobModel.enqueued_at < ago(published_after_s),
                ),
            )
        )
        await self._session.commit()
        return [UUID(job_id) for job_id in result.scalars().all()]

    async def delete(self, job_id: UUID, user_id: UUID) -> ScanJobFiles | None:
        job = await self._get_owned(job_id, user_id)
        if job is None:
            return None
        files = ScanJobFiles(image_key=job.image_key, thumbnail_key=job.thumbnail_key)
        await self._session.delete(job)
        await self._session.commit()
        return files

    async def delete_older_than_days(self, days: int) -> list[ScanJobFiles]:
        # O prazo usa o relógio do banco (o mesmo de created_at), não o da API.
        cutoff = func.date_sub(func.now(6), literal_column(f"INTERVAL {int(days)} DAY"))
        # Jobs em processamento ficam de fora para não apagar a foto no meio da chamada à Gemini.
        result = await self._session.execute(
            select(ScanJobModel).where(
                ScanJobModel.created_at < cutoff,
                ScanJobModel.status != ScanJobStatus.PROCESSING,
            )
        )
        jobs = result.scalars().all()
        files = [ScanJobFiles(image_key=job.image_key, thumbnail_key=job.thumbnail_key) for job in jobs]
        for job in jobs:
            await self._session.delete(job)
        await self._session.commit()
        return files

    async def _get_owned(self, job_id: UUID, user_id: UUID) -> ScanJobModel | None:
        result = await self._session.execute(
            select(ScanJobModel).where(
                ScanJobModel.id == str(job_id), ScanJobModel.user_id == str(user_id)
            )
        )
        return result.scalar_one_or_none()
