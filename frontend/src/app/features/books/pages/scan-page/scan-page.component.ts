import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { BookService } from '../../services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Book } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';
import { StepIndicatorComponent } from '../../../../shared/components/step-indicator/step-indicator.component';
import { BookPreviewDialogComponent } from '../../components/book-preview-dialog/book-preview-dialog.component';

/** Abaixo disso a detecção pede confirmação da edição (DESIGN.md). */
const LOW_CONFIDENCE = 0.8;

type Step = 'photo' | 'review';
type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';

interface ScanItem {
  book: DetectedBook;
  selected: boolean;
  /**
   * Edições candidatas (a sugestão original primeiro, depois outras do Google
   * Books), carregadas só para detecções de baixa confiança.
   */
  editions: DetectedBook[];
}

interface Tip {
  title: string;
  text: string;
  icon: string;
}

@Component({
  selector: 'app-scan-page',
  standalone: true,
  imports: [RouterLink, BookCoverComponent, StepIndicatorComponent, BookPreviewDialogComponent],
  templateUrl: './scan-page.component.html',
  styles: [
    `
      @keyframes scan-sweep {
        0% { top: 0; }
        100% { top: 100%; }
      }
      .scan-line {
        animation: scan-sweep 1.8s ease-in-out infinite alternate;
      }
    `,
  ],
})
export class ScanPageComponent implements OnDestroy {
  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly steps = ['Foto', 'Revisar', 'Completar'];
  readonly acceptedTypes = environment.allowedImageTypes.join(',');
  readonly maxFileSizeMB = environment.maxFileSizeMB;

  readonly step = signal<Step>('photo');
  readonly status = signal<ScanStatus>('idle');
  readonly previewUrl = signal<string | null>(null);
  readonly items = signal<ScanItem[]>([]);
  readonly isDragging = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isSaving = signal(false);
  /** Índice do item com o modal "Completar meus dados" aberto. */
  readonly editingIndex = signal<number | null>(null);

  readonly selectedCount = computed(() => this.items().filter((item) => item.selected).length);
  readonly allSelected = computed(
    () => this.items().length > 0 && this.selectedCount() === this.items().length
  );
  readonly currentStepIndex = computed(() =>
    this.editingIndex() !== null ? 2 : this.step() === 'review' ? 1 : 0
  );

  readonly progress = computed(() => {
    const status = this.status();
    const hasPhoto = status !== 'idle';
    const finished = status === 'done';
    return [
      { label: 'Foto recebida', state: hasPhoto ? 'done' : 'pending' },
      { label: 'Títulos reconhecidos na imagem', state: finished ? 'done' : status === 'scanning' ? 'active' : 'pending' },
      { label: 'Dados buscados no Google Books', state: finished ? 'done' : status === 'scanning' ? 'active' : 'pending' },
    ];
  });

  readonly tips: Tip[] = [
    {
      title: 'Boa iluminação',
      text: 'Luz natural ou clara, sem reflexo em capas plásticas.',
      icon: 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    },
    {
      title: 'Títulos visíveis',
      text: 'Capas de frente ou lombadas alinhadas na estante funcionam.',
      icon: 'M4 6h16M4 12h10M4 18h7',
    },
    {
      title: 'Vários de uma vez',
      text: 'Fotografe vários livros juntos; você revisa cada um antes de salvar.',
      icon: 'M4 4h6v16H4zM14 4h6v16h-6z',
    },
  ];

  ngOnDestroy(): void {
    this.releasePreview();
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

  // ---- Foto ----

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.startScan(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.startScan(file);
    }
  }

  goToReview(): void {
    this.step.set('review');
    window.scrollTo({ top: 0 });
  }

  backToPhoto(): void {
    this.step.set('photo');
    window.scrollTo({ top: 0 });
  }

  // ---- Revisão ----

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
    // Mantém o que veio da detecção (confiança e posição na foto) e troca só os metadados.
    chosen.confidence = item.book.confidence;
    chosen.box2d = item.book.box2d;
    this.replaceBook(index, chosen);
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

  addToLibrary(): void {
    const books = this.items()
      .filter((item) => item.selected)
      .map((item) => this.toBook(item.book));
    if (books.length === 0) {
      return;
    }

    this.isSaving.set(true);
    this.bookService
      .createMany(books)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe((created) => {
        this.notificationService.success(
          `${created.length} ${created.length === 1 ? 'livro adicionado' : 'livros adicionados'} à biblioteca.`
        );
        this.router.navigateByUrl('/app/books');
      });
  }

  private startScan(file: File): void {
    if (!this.isFileValid(file)) {
      return;
    }

    this.releasePreview();
    this.previewUrl.set(URL.createObjectURL(file));
    this.items.set([]);
    this.step.set('photo');
    this.status.set('scanning');

    this.bookService.scanBooksImage(file).subscribe({
      next: (result) => {
        this.items.set(
          result.detectedBooks.map((book) => ({ book, selected: true, editions: [] }))
        );
        this.status.set('done');
        this.loadAlternativeEditions();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.error?.detail ?? null);
        this.status.set('error');
      },
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

  private replaceBook(index: number, book: DetectedBook): void {
    this.items.update((items) =>
      items.map((item, i) => (i === index ? { ...item, book } : item))
    );
  }

  private isFileValid(file: File): boolean {
    if (!environment.allowedImageTypes.includes(file.type)) {
      this.notificationService.error('Formato inválido. Envie uma imagem JPEG, PNG ou WEBP.');
      return false;
    }
    if (file.size > environment.maxFileSizeMB * 1024 * 1024) {
      this.notificationService.error(`Arquivo excede o limite de ${environment.maxFileSizeMB}MB.`);
      return false;
    }
    return true;
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

  private releasePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
