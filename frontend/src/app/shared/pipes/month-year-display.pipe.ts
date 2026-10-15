import { Pipe, PipeTransform } from '@angular/core';

/** Converte "YYYY-MM" (formato salvo/backend) para exibição "MM/YYYY". */
@Pipe({
  name: 'monthYearDisplay',
  standalone: true,
})
export class MonthYearDisplayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    const match = value?.match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[2]}/${match[1]}` : (value ?? '');
  }
}
