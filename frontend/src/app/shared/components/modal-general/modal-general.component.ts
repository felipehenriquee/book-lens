import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

// Conta quantos ModalGeneral estão abertos ao mesmo tempo (modal dentro de
// modal), para só liberar o scroll do body quando o último deles fechar.
let openModalsCount = 0;

/**
 * Shell de modal reutilizável: header (título + fechar), corpo livre (slot,
 * via ng-content) e rodapé com Cancelar/Salvar. Quem monta o corpo e reage
 * aos eventos é sempre o componente pai — este componente não sabe nada
 * sobre o que está sendo editado dentro dele.
 */
@Component({
  selector: 'app-modal-general',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './modal-general.component.html',
})
export class ModalGeneralComponent implements OnInit, OnDestroy {
  @Input() title = '';
  /** Aceita um preset ('sm'|'md'|'lg'|'xl') ou uma classe Tailwind de largura arbitrária (ex.: 'max-w-[70vw]'). */
  @Input() size: ModalSize | string = 'md';
  @Input() hideFooter = false;
  @Input() saveLabel = 'Salvar';
  @Input() cancelLabel = 'Cancelar';
  @Input() saveDisabled = false;
  /** Permite empilhar um modal aberto de dentro de outro (ex.: detalhes sobre o de scan). */
  @Input() zIndex = 40;

  @Output() closeRequested = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  get sizeClass(): string {
    return SIZE_CLASSES[this.size as ModalSize] ?? this.size;
  }

  ngOnInit(): void {
    openModalsCount++;
    document.body.style.overflow = 'hidden';
    // Move o próprio host para o final do <body>: dentro do layout da app
    // (mat-sidenav-container, toolbars com transform, etc.) qualquer
    // ancestral que vire "containing block" quebra o position:fixed e faz
    // elementos do layout ficarem por cima do modal. Anexar direto no body
    // é a mesma estratégia que o CDK Overlay do Angular Material usa.
    this.renderer.appendChild(document.body, this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    openModalsCount = Math.max(0, openModalsCount - 1);
    if (openModalsCount === 0) {
      document.body.style.overflow = '';
    }
    if (this.elementRef.nativeElement.parentNode === document.body) {
      this.renderer.removeChild(document.body, this.elementRef.nativeElement);
    }
  }
}
