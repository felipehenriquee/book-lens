import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { BookService } from '../../services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StarRatingComponent } from '../../../../shared/components/star-rating/star-rating.component';
import { ReadingStatusPipe } from '../../../../shared/pipes/reading-status.pipe';
import { BookFormatPipe } from '../../../../shared/pipes/book-format.pipe';
import { MonthYearDisplayPipe } from '../../../../shared/pipes/month-year-display.pipe';
import { GoogleBookInfoComponent } from '../../components/google-book-info/google-book-info.component';
import { BookPreviewDialogComponent } from '../../components/book-preview-dialog/book-preview-dialog.component';
import { Book } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';

@Component({
  selector: 'app-book-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    CurrencyPipe,
    ReadingStatusPipe,
    BookFormatPipe,
    MonthYearDisplayPipe,
    StarRatingComponent,
    GoogleBookInfoComponent,
    BookPreviewDialogComponent,
  ],
  templateUrl: './book-detail-page.component.html',
})
export class BookDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly isLoading = signal(false);
  readonly book = signal<Book | null>(null);

  readonly isEditModalOpen = signal(false);
  readonly editModalBook = signal<DetectedBook | null>(null);
  readonly isLoadingEditData = signal(false);

  readonly isDetailsExpanded = signal(false);
  readonly googleBookInfo = signal<DetectedBook | null>(null);
  readonly isLoadingDetails = signal(false);

  statusBadgeClass(book: Book): string {
    switch (book.readingStatus) {
      case 'READ':
        return 'badge-read';
      case 'READING':
        return 'badge-reading';
      default:
        return 'badge-unread';
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadBook(id);
    }
  }

  toggleDetails(): void {
    if (this.isDetailsExpanded()) {
      this.isDetailsExpanded.set(false);
      return;
    }
    this.isDetailsExpanded.set(true);

    const googleBooksId = this.book()?.googleBooksId;
    if (!googleBooksId || this.googleBookInfo()) {
      return;
    }

    this.isLoadingDetails.set(true);
    this.bookService.getGoogleBookById(googleBooksId).subscribe({
      next: (info) => {
        this.googleBookInfo.set(info);
        this.isLoadingDetails.set(false);
      },
      error: () => this.isLoadingDetails.set(false),
    });
  }

  openEditModal(): void {
    const current = this.book();
    if (!current) {
      return;
    }

    this.isLoadingEditData.set(true);
    const googleData$ = current.googleBooksId
      ? this.bookService.getGoogleBookById(current.googleBooksId)
      : of<DetectedBook | null>(null);

    googleData$.subscribe({
      next: (googleBook) => this.startEdit(current, googleBook),
      // Sem dados do Google Books ainda dá pra editar com o que já está salvo.
      error: () => this.startEdit(current, null),
    });
  }

  onEditClosed(): void {
    this.isEditModalOpen.set(false);
    this.editModalBook.set(null);
  }

  onEditSaved(updated: DetectedBook): void {
    const current = this.book();
    if (!current) {
      return;
    }

    const payload = new Book(
      current.id,
      current.title,
      current.author,
      current.publisher,
      current.coverUrl,
      current.googleBooksId,
      updated.format,
      updated.readingStatus,
      updated.rating,
      updated.purchaseDate,
      updated.isGifted,
      updated.paidPrice,
      updated.readDate,
      updated.userNotes
    );

    this.bookService.update(current.id, payload).subscribe((saved) => {
      this.book.set(saved);
      this.onEditClosed();
      this.notificationService.success('Livro atualizado.');
    });
  }

  deleteBook(): void {
    const current = this.book();
    if (!current) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remover livro',
        message: 'Tem certeza que deseja remover este livro da sua coleção?',
        confirmText: 'Remover',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.bookService.delete(current.id).subscribe(() => {
        this.notificationService.success('Livro removido da coleção.');
        this.router.navigate(['/app/books']);
      });
    });
  }

  private startEdit(current: Book, googleBook: DetectedBook | null): void {
    const base =
      googleBook ?? new DetectedBook(current.title, [current.author], current.publisher, 1);

    this.editModalBook.set(
      new DetectedBook(
        current.title,
        base.authors,
        current.publisher ?? base.publisher,
        1,
        current.googleBooksId,
        current.coverUrl ?? base.coverUrl,
        base.previewLink,
        base.description,
        base.publishedDate,
        base.pageCount,
        base.categories,
        base.averageRating,
        base.isbn13,
        base.listPriceAmount,
        base.listPriceCurrency,
        current.format,
        current.readingStatus,
        current.rating,
        current.purchaseDate,
        current.isGifted,
        current.paidPrice,
        current.readDate,
        current.userNotes
      )
    );
    this.isLoadingEditData.set(false);
    this.isEditModalOpen.set(true);
  }

  private loadBook(id: string): void {
    this.isLoading.set(true);
    this.bookService.getById(id).subscribe({
      next: (book) => {
        this.book.set(book);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }
}
