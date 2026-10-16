import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize, switchMap } from 'rxjs';
import { BookService } from '../../../books/services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Book } from '../../../books/models/book.model';
import { DetectedBook } from '../../../books/models/ocr-scan.model';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';
import { StepIndicatorComponent } from '../../../../shared/components/step-indicator/step-indicator.component';
import { BookPreviewDialogComponent } from '../../../books/components/book-preview-dialog/book-preview-dialog.component';
import { BookSearchComponent } from '../../../books/components/book-search/book-search.component';
import { ScanJob } from '../../models/scan-job.model';
import { ScanJobService } from '../../services/scan-job.service';
import { ScanJobsStore } from '../../services/scan-jobs.store';

/** Abaixo disso a detecção pede confirmação da edição (DESIGN.md). */
const LOW_CONFIDENCE = 0.8;

type Step = 'photo' | 'review';

interface ScanItem {
  book: DetectedBook;
  selected: boolean;
  /**
   * Edições candidatas (a sugestão original primeiro, depois outras do Google
   * Books), carregadas só para detecções de baixa confiança.
   */
  editions: DetectedBook[];
  /** O usuário trocou o livro pela busca manual ("Não é este livro?"). */
  chosenByUser?: boolean;
}

/** Revisão de um scan concluído: foto com as molduras → seleção → adicionar à biblioteca. */
@Component({
  selector: 'app-scan-review-page',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressSpinnerModule,
    BookCoverComponent,
    StepIndicatorComponent,
    BookPreviewDialogComponent,
    BookSearchComponent,
  ],
  templateUrl: './scan-review-page.component.html',
})
export class ScanReviewPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly scanJobService = inject(ScanJobService);
  private readonly store = inject(ScanJobsStore);
  private readonly notificationService = inject(NotificationService);

  readonly steps = ['Foto', 'Revisar', 'Completar'];

  readonly isLoading = signal(true);
  readonly job = signal<ScanJob | null>(null);
  readonly step = signal<Step>('photo');
  readonly photoUrl = signal<string | null>(null);
  readonly items = signal<ScanItem[]>([]);
  readonly isSaving = signal(false);
  /** Índice do item com o modal "Completar meus dados" aberto. */
  readonly editingIndex = signal<number | null>(null);
  /** Índice do item com a busca manual ("Não é este livro?") aberta. */
  readonly searchingIndex = signal<number | null>(null);

  readonly selectedCount = computed(() => this.items().filter((item) => item.selected).length);
  readonly allSelected = computed(
    () => this.items().length > 0 && this.selectedCount() === this.items().length
  );
  readonly currentStepIndex = computed(() =>
    this.editingIndex() !== null ? 2 : this.step() === 'review' ? 1 : 0
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigateByUrl('/app/escanear');
      return;
    }
    this.load(id);
  }

  ngOnDestroy(): void {
    const url = this.photoUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  isLowConfidence(book: DetectedBook): boolean {
    return book.confidence < LOW_CONFIDENCE;
  }

  confidencePct(book: DetectedBook): number {
    return Math.round(book.confidence * 100);
  }

  year(book: DetectedBook): string {
    return book.publishedDate?.slice(0, 4) || '—';
  }

  authors(book: DetectedBook): string {
    return book.authors.join(', ') || 'Autor desconhecido';
  }

  /** Posição da moldura em % da imagem, a partir do box_2d (0–1000). */
  boxStyle(book: DetectedBook): Record<string, string> | null {
    if (book.box2d.length !== 4) {
      return null;
    }
    const [ymin, xmin, ymax, xmax] = book.box2d;
    return {
      top: `${ymin / 10}%`,
      left: `${xmin / 10}%`,
      width: `${(xmax - xmin) / 10}%`,
      height: `${(ymax - ymin) / 10}%`,
    };
  }

  editionIndex(item: ScanItem): number {
    return Math.max(0, item.editions.indexOf(item.book));
  }

  editionLabel(book: DetectedBook): string {
    const parts = [book.publisher || 'Editora desconhecida'];
    if (book.publishedDate) {
      parts.push(book.publishedDate.slice(0, 4));
    }
    return `${book.title} — ${parts.join(' · ')}`;
  }

  goToReview(): void {
    this.step.set('review');
    window.scrollTo({ top: 0 });
  }

  backToPhoto(): void {
    this.step.set('photo');
    window.scrollTo({ top: 0 });
  }

  toggle(index: number): void {
    this.items.update((items) =>
      items.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  }

  toggleAll(): void {
    const select = !this.allSelected();
    this.items.update((items) => items.map((item) => ({ ...item, selected: select })));
  }

  chooseEdition(index: number, editionIndex: number): void {
    const item = this.items()[index];
    const chosen = item.editions[editionIndex];
    if (!chosen || chosen === item.book) {
      return;
    }
    this.replaceBook(index, this.withDetectionAndUserData(chosen, item.book, item.book.confidence));
  }

  openSearch(index: number): void {
    this.searchingIndex.set(this.searchingIndex() === index ? null : index);
  }

  closeSearch(): void {
    this.searchingIndex.set(null);
  }

  /** O usuário escolheu o livro certo manualmente: troca os dados e dá a detecção por confirmada. */
  onSearchSelected(index: number, chosen: DetectedBook): void {
    const item = this.items()[index];
    const book = this.withDetectionAndUserData(chosen, item.book, 1);
    this.items.update((items) =>
      items.map((current, i) => (i === index ? { book, selected: true, editions: [], chosenByUser: true } : current))
    );
    this.searchingIndex.set(null);
  }

  openCompletion(index: number): void {
    this.editingIndex.set(index);
  }

  closeCompletion(): void {
    this.editingIndex.set(null);
  }

  onCompletionSaved(updated: DetectedBook): void {
    const index = this.editingIndex();
    if (index === null) {
      return;
    }
    updated.box2d = this.items()[index].book.box2d;
    this.replaceBook(index, updated);
    this.editingIndex.set(null);
  }

  /** Salva os selecionados e apaga o scan (o resultado e a miniatura já cumpriram seu papel). */
  addToLibrary(): void {
    const job = this.job();
    const books = this.items()
      .filter((item) => item.selected)
      .map((item) => this.toBook(item.book));
    if (!job || books.length === 0) {
      return;
    }

    this.isSaving.set(true);
    this.bookService
      .createMany(books)
      .pipe(
        switchMap((created) => {
          this.notificationService.success(
            `${created.length} ${created.length === 1 ? 'livro adicionado' : 'livros adicionados'} à biblioteca.`
          );
          return this.scanJobService.delete(job.id);
        }),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe(() => {
        this.store.remove(job.id);
        // Ainda há outros scans prontos? Volta para a lista; senão, para a biblioteca.
        this.router.navigateByUrl(this.store.readyCount() > 0 ? '/app/escanear' : '/app/books');
      });
  }

  /** Descarta o scan sem adicionar nada. */
  discard(): void {
    const job = this.job();
    if (!job) {
      return;
    }
    this.scanJobService.delete(job.id).subscribe(() => {
      this.store.remove(job.id);
      this.notificationService.info('Scan descartado.');
      this.router.navigateByUrl('/app/escanear');
    });
  }

  private load(id: string): void {
    this.scanJobService
      .get(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (detail) => {
          this.job.set(detail.job);
          this.items.set(detail.detectedBooks.map((book) => ({ book, selected: true, editions: [] })));
          if (detail.job.hasThumbnail) {
            this.scanJobService.thumbnailUrl(id).subscribe((url) => this.photoUrl.set(url));
          }
          this.loadAlternativeEditions();
        },
        error: () => this.router.navigateByUrl('/app/escanear'),
      });
  }

  /** Para detecções incertas, busca outras edições no Google Books para o usuário confirmar. */
  private loadAlternativeEditions(): void {
    this.items().forEach((item, index) => {
      if (!this.isLowConfidence(item.book)) {
        return;
      }
      this.bookService.searchGoogleBooks(item.book.title).subscribe((results) => {
        const others = results.filter(
          (alt) => alt.googleBooksId && alt.googleBooksId !== item.book.googleBooksId
        );
        const editions = [item.book, ...others];
        this.items.update((items) =>
          items.map((current, i) => (i === index ? { ...current, editions } : current))
        );
      });
    });
  }

  /**
   * Usa os metadados de `chosen` (outro resultado do Google Books), mas mantém
   * a posição na foto e o que o usuário já preencheu em "Completar meus dados".
   */
  private withDetectionAndUserData(chosen: DetectedBook, current: DetectedBook, confidence: number): DetectedBook {
    const book = Object.assign(Object.create(Object.getPrototypeOf(chosen)), chosen) as DetectedBook;
    book.confidence = confidence;
    book.box2d = current.box2d;
    book.format = current.format;
    book.readingStatus = current.readingStatus;
    book.rating = current.rating;
    book.purchaseDate = current.purchaseDate;
    book.isGifted = current.isGifted;
    book.paidPrice = current.paidPrice;
    book.readDate = current.readDate;
    book.userNotes = current.userNotes;
    return book;
  }

  private replaceBook(index: number, book: DetectedBook): void {
    this.items.update((items) =>
      items.map((item, i) => (i === index ? { ...item, book } : item))
    );
  }

  private toBook(detected: DetectedBook): Book {
    const book = new Book(
      '',
      detected.title,
      this.authors(detected),
      detected.publisher,
      detected.coverUrl,
      detected.googleBooksId,
      detected.format,
      detected.readingStatus,
      detected.rating,
      detected.purchaseDate,
      detected.isGifted,
      detected.paidPrice,
      detected.readDate,
      detected.userNotes
    );
    book.pageCount = detected.pageCount;
    return book;
  }
}
