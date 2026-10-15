import { Component, Input, signal } from '@angular/core';

// Cores das capas de exemplo do design, usadas como placeholder quando o
// livro não tem imagem do Google Books (par fundo/texto).
const PLACEHOLDER_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#2B3A2F', '#F1E9D2'],
  ['#B5532A', '#FFFFFF'],
  ['#E6DFCC', '#1C1C1C'],
  ['#B3122B', '#FFFFFF'],
  ['#1F3B73', '#F5D76E'],
  ['#6B4E2E', '#F3E6CC'],
  ['#F2C230', '#1C1C1C'],
  ['#3D2C5E', '#FFFFFF'],
  ['#D98A3D', '#1C1C1C'],
  ['#2F6F73', '#FFFFFF'],
];

/**
 * Capa do livro: imagem do Google Books ou placeholder colorido.
 * O texto do placeholder é dimensionado em unidades de container (cqw), então
 * a mesma capa funciona da grade (184px) à miniatura de lista (36px).
 */
@Component({
  selector: 'app-book-cover',
  standalone: true,
  template: `
    <div class="[container-type:inline-size]">
      @if (coverUrl && !imageFailed()) {
        <img
          [src]="coverUrl"
          [alt]="'Capa de ' + title"
          (error)="imageFailed.set(true)"
          class="block w-full aspect-[2/3] object-cover rounded-[2cqw_5.5cqw_5.5cqw_2cqw] shadow-cover"
        />
      } @else {
        <div
          class="w-full aspect-[2/3] rounded-[2cqw_5.5cqw_5.5cqw_2cqw] shadow-cover box-border flex flex-col justify-between overflow-hidden px-[7.6cqw] py-[9.8cqw]"
          [style.background]="palette[0]"
          [style.color]="palette[1]"
          [attr.aria-hidden]="!showText"
        >
          @if (showText) {
            <span class="font-display font-bold text-[11.5cqw] leading-[1.08] tracking-[-0.01em] [overflow-wrap:anywhere] line-clamp-4">{{ title }}</span>
            <span class="font-medium text-[6.5cqw] leading-tight line-clamp-2">{{ author }}</span>
          }
        </div>
      }
    </div>
  `,
})
export class BookCoverComponent {
  @Input({ required: true }) title!: string;
  @Input() author = '';
  @Input() coverUrl?: string;
  /** Desligue em miniaturas, onde o texto ficaria ilegível. */
  @Input() showText = true;

  readonly imageFailed = signal(false);

  /** Cor estável por título, para a mesma obra sempre ter a mesma capa. */
  get palette(): readonly [string, string] {
    let hash = 0;
    for (const char of this.title) {
      hash = (hash * 31 + char.charCodeAt(0)) | 0;
    }
    return PLACEHOLDER_PALETTE[Math.abs(hash) % PLACEHOLDER_PALETTE.length];
  }
}
