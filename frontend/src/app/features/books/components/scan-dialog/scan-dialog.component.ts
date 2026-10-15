import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { BookService } from '../../services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Book } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';
import { BookPreviewDialogComponent } from '../book-preview-dialog/book-preview-dialog.component';
import { ModalGeneralComponent } from '../../../../shared/components/modal-general/modal-general.component';

@Component({
  selector: 'app-scan-dialog',
  standalone: true,
  imports: [
    ModalGeneralComponent,
    BookPreviewDialogComponent,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './scan-dialog.component.html',
})
export class ScanDialogComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Book[]>();

  readonly isScanning = signal(false);
  readonly results = signal<DetectedBook[]>([]);
  readonly previewUrl = signal<string | null>(null);
  /** Índice do item cujo modal de detalhes está aberto, ou null se nenhum. */
  readonly previewIndex = signal<number | null>(null);

  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);

  get saveLabel(): string {
    const count = this.results().length;
    return `Adicionar ${count || ''} ${count === 1 ? 'livro' : 'livros'}`.trim();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!this.isFileValid(file)) {
      input.value = '';
      return;
    }

    this.previewUrl.set(URL.createObjectURL(file));
    this.scan(file);
  }

  removeResult(index: number): void {
    this.results.update((current) => current.filter((_, i) => i !== index));
  }

  openPreview(index: number): void {
    this.previewIndex.set(index);
  }

  closePreview(): void {
    this.previewIndex.set(null);
  }

  onPreviewSaved(updated: DetectedBook): void {
    const index = this.previewIndex();
    if (index === null) {
      return;
    }
    this.results.update((current) => current.map((item, i) => (i === index ? updated : item)));
    this.previewIndex.set(null);
  }

  confirm(): void {
    const books = this.results().map((detected) => this.toBook(detected));
    this.saved.emit(books);
  }

  close(): void {
    this.releasePreview();
    this.closed.emit();
  }

  private scan(file: File): void {
    this.isScanning.set(true);
    this.results.set([]);

    this.bookService
      .scanBooksImage(file)
      .pipe(finalize(() => this.isScanning.set(false)))
      .subscribe({
        next: (result) => {
          this.results.set(result.detectedBooks);
          if (result.detectedBooks.length === 0) {
            this.notificationService.info('Nenhum livro foi identificado na imagem.');
          }
        },
      });
  }

  private isFileValid(file: File): boolean {
    if (!environment.allowedImageTypes.includes(file.type)) {
      this.notificationService.error('Formato inválido. Envie uma imagem JPEG, PNG ou WEBP.');
      return false;
    }

    const maxBytes = environment.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.notificationService.error(`Arquivo excede o limite de ${environment.maxFileSizeMB}MB.`);
      return false;
    }

    return true;
  }

  private toBook(detected: DetectedBook): Book {
    return new Book(
      '',
      detected.title,
      detected.authors.join(', ') || 'Autor desconhecido',
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
  }

  private releasePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
