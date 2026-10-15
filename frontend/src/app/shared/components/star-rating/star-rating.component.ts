import { Component, Input, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

/**
 * Seletor de avaliação de 1 a 5 estrelas. Implementa ControlValueAccessor
 * para funcionar como qualquer outro controle de Reactive Forms via
 * formControlName="rating". Também pode ser usado fora de um formulário,
 * como exibição pura, passando [value] e [isReadonly]="true".
 */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './star-rating.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => StarRatingComponent),
      multi: true,
    },
  ],
})
export class StarRatingComponent implements ControlValueAccessor {
  @Input() max = 5;
  /** Modo de exibição pura (páginas de detalhe): ignora cliques/hover. */
  @Input() isReadonly = false;
  /** Permite usar fora de um formulário, passando a nota direto via binding. */
  @Input() set value(value: number | null) {
    this.writeValue(value ?? null);
  }

  readonly stars = Array.from({ length: this.max }, (_, i) => i + 1);
  readonly currentValue = signal<number | null>(null);
  readonly hoverValue = signal<number | null>(null);
  disabled = false;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.currentValue.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  selectStar(star: number): void {
    if (this.disabled || this.isReadonly) {
      return;
    }
    this.currentValue.set(star);
    this.onChange(star);
    this.onTouched();
  }

  onEnter(star: number): void {
    if (!this.disabled && !this.isReadonly) {
      this.hoverValue.set(star);
    }
  }

  onLeave(): void {
    this.hoverValue.set(null);
  }

  isFilled(star: number): boolean {
    const active = this.hoverValue() ?? this.currentValue();
    return active !== null && star <= active;
  }
}
