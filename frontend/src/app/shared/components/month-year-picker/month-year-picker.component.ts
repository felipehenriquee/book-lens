import { Component, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/services/auth.service';

// Usado quando o token não traz a data de aniversário do usuário (ex.: tokens
// emitidos antes desse campo existir).
const FALLBACK_MIN_YEAR = 1995;

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function buildYearRange(minYear: number): number[] {
  const currentYear = new Date().getFullYear();
  const start = Math.min(minYear, currentYear);
  return Array.from({ length: currentYear - start + 1 }, (_, i) => currentYear - i);
}

/**
 * Seletor de mês/ano que se comporta como um único FormControl de string
 * "YYYY-MM" (ou null se algum dos dois não estiver selecionado) — mesmo
 * formato que o backend já espera para purchase_date/read_date. O ano mais
 * antigo disponível começa no ano de nascimento do usuário (vindo do token).
 */
@Component({
  selector: 'app-month-year-picker',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './month-year-picker.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonthYearPickerComponent),
      multi: true,
    },
  ],
})
export class MonthYearPickerComponent implements ControlValueAccessor {
  private readonly authService = inject(AuthService);
  private readonly minYear = this.authService.getBirthYear() ?? FALLBACK_MIN_YEAR;

  readonly months = MONTH_LABELS.map((label, index) => ({ value: index + 1, label }));
  readonly years = signal<number[]>(buildYearRange(this.minYear));

  readonly month = signal<number | null>(null);
  readonly year = signal<number | null>(null);
  disabled = false;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const match = value?.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      // Um valor salvo antes de existir o ano mínimo (ou de outro usuário)
      // pode ser mais antigo que o início calculado; nesse caso, estende a
      // lista pra baixo em vez de esconder o valor já selecionado.
      if (year < this.minYear) {
        this.years.set(buildYearRange(year));
      }
      this.year.set(year);
      this.month.set(Number(match[2]));
    } else {
      this.year.set(null);
      this.month.set(null);
    }
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onMonthChange(month: number | null): void {
    this.month.set(month);
    this.emitValue();
  }

  onYearChange(year: number | null): void {
    this.year.set(year);
    this.emitValue();
  }

  private emitValue(): void {
    const month = this.month();
    const year = this.year();
    this.onChange(month && year ? `${year}-${String(month).padStart(2, '0')}` : null);
    this.onTouched();
  }
}
