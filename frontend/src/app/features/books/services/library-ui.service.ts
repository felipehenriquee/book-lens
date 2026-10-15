import { Injectable, signal } from '@angular/core';

/**
 * Estado de UI compartilhado entre o header (MainLayout) e a página da
 * biblioteca: a busca e o botão "Manual" ficam no header, mas a filtragem e o
 * modal de cadastro pertencem à listagem.
 */
@Injectable({
  providedIn: 'root',
})
export class LibraryUiService {
  readonly search = signal('');
  readonly isAddModalOpen = signal(false);
}
