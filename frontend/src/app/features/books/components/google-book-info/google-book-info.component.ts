import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { DetectedBook } from '../../models/ocr-scan.model';

/**
 * Bloco somente-leitura com o que veio do Google Books (capa, autores,
 * editora, sinopse, categorias, preço de tabela...). Reaproveitado no
 * formulário de detalhes/edição e no "ver mais detalhes" da página do livro.
 */
@Component({
  selector: 'app-google-book-info',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './google-book-info.component.html',
})
export class GoogleBookInfoComponent {
  @Input({ required: true }) book!: DetectedBook;
  /** Desliga quando a capa já aparece em outro lugar da tela (ex.: "ver mais detalhes"). */
  @Input() showCover = true;

  get formattedListPrice(): string | null {
    if (this.book.listPriceAmount == null) {
      return null;
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: this.book.listPriceCurrency || 'BRL',
    }).format(this.book.listPriceAmount);
  }

  openOnGoogleBooks(): void {
    if (this.book.previewLink) {
      window.open(this.book.previewLink, '_blank', 'noopener');
    }
  }
}
