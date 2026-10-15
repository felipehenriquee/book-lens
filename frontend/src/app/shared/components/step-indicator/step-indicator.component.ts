import { Component, Input } from '@angular/core';

/** Indicador de etapas do fluxo de scan (Foto → Revisar → Completar). */
@Component({
  selector: 'app-step-indicator',
  standalone: true,
  template: `
    <ol aria-label="Etapas" class="list-none m-0 p-0 flex flex-wrap items-center gap-2.5">
      @for (step of steps; track step; let i = $index; let last = $last) {
        <li
          class="flex items-center gap-2 text-sm"
          [attr.aria-current]="i === current ? 'step' : null"
          [class]="i < current ? 'font-medium text-[#17603C]' : i === current ? 'font-semibold text-ink' : 'font-medium text-muted'"
        >
          @if (i < current) {
            <span class="w-[26px] h-[26px] rounded-full bg-[#E3F3EA] flex items-center justify-center">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#17603C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg>
            </span>
          } @else if (i === current) {
            <span class="w-[26px] h-[26px] rounded-full bg-primary text-white flex items-center justify-center text-[13px]">{{ i + 1 }}</span>
          } @else {
            <span class="w-[26px] h-[26px] rounded-full border border-solid border-line-input flex items-center justify-center text-[13px] box-border">{{ i + 1 }}</span>
          }
          <span class="hidden sm:inline">{{ step }}</span>
        </li>
        @if (!last) {
          <li aria-hidden="true" class="w-7 h-px bg-line-input"></li>
        }
      }
    </ol>
  `,
})
export class StepIndicatorComponent {
  @Input({ required: true }) steps!: string[];
  /** Índice (0-based) da etapa atual. */
  @Input() current = 0;
}
