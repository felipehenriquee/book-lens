import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LibraryUiService } from '../../../features/books/services/library-ui.service';
import { ScanJobsStore } from '../../../features/scans/services/scan-jobs.store';

const LIBRARY_URL = '/app/books';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly libraryUi = inject(LibraryUiService);
  readonly scanJobs = inject(ScanJobsStore);

  onSearch(value: string): void {
    this.libraryUi.search.set(value);
    this.goToLibrary();
  }

  openScan(): void {
    this.router.navigateByUrl('/app/escanear');
  }

  openManual(): void {
    this.goToLibrary();
    this.libraryUi.isAddModalOpen.set(true);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  /** Busca e o modal manual vivem na listagem: a partir de outra tela, volta para ela. */
  private goToLibrary(): void {
    if (this.router.url.split('?')[0] !== LIBRARY_URL) {
      this.router.navigateByUrl(LIBRARY_URL);
    }
  }
}
