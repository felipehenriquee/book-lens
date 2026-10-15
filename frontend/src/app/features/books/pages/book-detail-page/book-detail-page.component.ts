import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';
import { BookService } from '../../services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';
import { MonthYearPickerComponent } from '../../../../shared/components/month-year-picker/month-year-picker.component';
import { StatusBadgeComponent, STATUS_COLORS } from '../../../../shared/components/status-badge/status-badge.component';
import { Book, BookFormat, ReadingStatus } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';

const RATING_TEXT = ['Sem avaliação', 'Não gostei', 'Mais ou menos', 'Bom', 'Muito bom', 'Favorito'];

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'UNREAD', label: 'Não lido' },
  { value: 'READING', label: 'Lendo' },
  { value: 'READ', label: 'Lido' },
  { value: 'PAUSED', label: 'Pausado' },
  { value: 'ABANDONED', label: 'Abandonado' },
];

const FORMAT_OPTIONS: { value: BookFormat; label: string; icon: string }[] = [
  { value: 'PAPERBACK', label: 'Brochura', icon: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11' },
  { value: 'HARDCOVER', label: 'Capa dura', icon: 'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3zM4 18a3 3 0 0 1 3-3h13M9 7h6M9 10h4' },
  { value: 'EBOOK', label: 'E-book', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2' },
  { value: 'POCKET', label: 'Livro de bolso', icon: 'M8 7h8a1.5 1.5 0 0 1 1.5 1.5V19H9.5A1.5 1.5 0 0 1 8 17.5zM8 17a1.5 1.5 0 0 1 1.5-1.5h8' },
];

@Component({
  selector: 'app-book-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    BookCoverComponent,
    MonthYearPickerComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './book-detail-page.component.html',
})
export class BookDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);

  readonly statusOptions = STATUS_OPTIONS;
  readonly formatOptions = FORMAT_OPTIONS;
  readonly statusColors = STATUS_COLORS;
  readonly stars = [1, 2, 3, 4, 5];

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly book = signal<Book | null>(null);
  readonly googleInfo = signal<DetectedBook | null>(null);
  readonly isLoadingGoogle = signal(false);
  readonly isSummaryExpanded = signal(false);

  readonly form = this.formBuilder.group({
    rating: [null as number | null],
    readingStatus: ['UNREAD' as ReadingStatus],
    currentPage: [null as number | null],
    format: [null as BookFormat | null],
    isGifted: [false],
    giftedBy: [''],
    paidPrice: [''],
    purchaseDate: [null as string | null],
    readDate: [null as string | null],
    userNotes: [''],
  });

  /** Valores do formulário como signal, para o template reagir sem subscriptions. */
  private readonly formValue = signal(this.form.getRawValue());
  readonly status = computed(() => this.formValue().readingStatus ?? 'UNREAD');
  readonly rating = computed(() => this.formValue().rating ?? 0);
  readonly ratingText = computed(() => RATING_TEXT[this.rating()]);
  readonly isGifted = computed(() => !!this.formValue().isGifted);

  readonly pageCount = computed(() => this.book()?.pageCount ?? this.googleInfo()?.pageCount);

  /** Sinopse do Google Books em texto puro (a API de volume devolve HTML). */
  readonly summary = computed(() => {
    const html = this.googleInfo()?.description;
    if (!html) {
      return '';
    }
    const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
    const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
    return text.replace(/\n{3,}/g, '\n\n').trim();
  });

  readonly languageLabel = computed(() => {
    const code = this.googleInfo()?.language;
    if (!code) {
      return null;
    }
    try {
      const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code);
      return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
    } catch {
      return code;
    }
  });

  readonly genre = computed(() => {
    // Categorias do Google Books vêm como "Fiction / Romance": mostra só a última parte.
    const category = this.googleInfo()?.categories?.[0];
    return category ? category.split('/').pop()!.trim() : null;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadBook(id);
    }
  }

  setRating(star: number): void {
    // Clicar de novo na estrela atual zera a avaliação (DESIGN.md).
    this.form.controls.rating.setValue(this.rating() === star ? null : star);
    this.form.markAsDirty();
  }

  setStatus(status: ReadingStatus): void {
    this.form.controls.readingStatus.setValue(status);
    // Ao marcar como lido, já sugere o mês atual como data de leitura.
    if (status === 'READ' && !this.form.controls.readDate.value) {
      const now = new Date();
      this.form.controls.readDate.setValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    this.form.markAsDirty();
  }

  setFormat(format: BookFormat): void {
    this.form.controls.format.setValue(this.form.controls.format.value === format ? null : format);
    this.form.markAsDirty();
  }

  toggleGift(): void {
    this.form.controls.isGifted.setValue(!this.isGifted());
    this.form.markAsDirty();
  }

  save(): void {
    const current = this.book();
    if (!current) {
      return;
    }

    const raw = this.form.getRawValue();
    const status = raw.readingStatus ?? 'UNREAD';
    const payload = new Book(
      current.id,
      current.title,
      current.author,
      current.publisher,
      current.coverUrl,
      current.googleBooksId,
      raw.format ?? undefined,
      status,
      raw.rating ?? undefined,
      raw.purchaseDate ?? undefined,
      !!raw.isGifted,
      raw.isGifted ? undefined : this.parsePrice(raw.paidPrice),
      status === 'READ' ? raw.readDate ?? undefined : current.readDate,
      raw.userNotes?.trim() || undefined
    );
    payload.giftedBy = raw.isGifted ? raw.giftedBy?.trim() || undefined : undefined;
    payload.currentPage = status === 'READING' ? raw.currentPage ?? undefined : current.currentPage;
    payload.pageCount = this.pageCount();

    this.isSaving.set(true);
    this.bookService
      .update(current.id, payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe((saved) => {
        this.book.set(saved);
        this.fillForm(saved);
        this.notificationService.success('Alterações salvas.');
      });
  }

  deleteBook(): void {
    const current = this.book();
    if (!current) {
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover livro',
          message: `Tem certeza que deseja remover "${current.title}" da sua biblioteca?`,
          confirmText: 'Remover',
        },
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (!confirmed) {
          return;
        }
        this.bookService.delete(current.id).subscribe(() => {
          this.notificationService.success('Livro removido da biblioteca.');
          this.router.navigate(['/app/books']);
        });
      });
  }

  private loadBook(id: string): void {
    this.isLoading.set(true);
    this.bookService
      .getById(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe((book) => {
        this.book.set(book);
        this.fillForm(book);
        this.loadGoogleInfo(book);
      });
  }

  private loadGoogleInfo(book: Book): void {
    if (!book.googleBooksId) {
      return;
    }
    this.isLoadingGoogle.set(true);
    this.bookService
      .getGoogleBookById(book.googleBooksId)
      .pipe(finalize(() => this.isLoadingGoogle.set(false)))
      .subscribe((info) => this.googleInfo.set(info));
  }

  private fillForm(book: Book): void {
    this.form.reset({
      rating: book.rating ?? null,
      readingStatus: book.readingStatus,
      currentPage: book.currentPage ?? null,
      format: book.format ?? null,
      isGifted: book.isGifted,
      giftedBy: book.giftedBy ?? '',
      paidPrice: book.paidPrice != null ? book.paidPrice.toFixed(2).replace('.', ',') : '',
      purchaseDate: book.purchaseDate ?? null,
      readDate: book.readDate ?? null,
      userNotes: book.userNotes ?? '',
    });
  }

  /** "39,90", "39.90" ou "R$ 1.234,50" → número; vazio/ inválido → undefined. */
  private parsePrice(value: string | null | undefined): number | undefined {
    const cleaned = (value ?? '').replace(/[^\d,.]/g, '');
    if (!cleaned) {
      return undefined;
    }
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const price = Number(normalized);
    return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : undefined;
  }
}
