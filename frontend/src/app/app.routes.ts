import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './core/layouts/auth-layout/auth-layout.component';
import { MainLayoutComponent } from './core/layouts/main-layout/main-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  // Auth Layout (Public)
  {
    path: '',
    component: AuthLayoutComponent,
    canActivate: [guestGuard],
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: '',
        loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
      },
    ],
  },
  // Revisão de um scan: tela cheia com header próprio (etapas), fora do MainLayout.
  {
    path: 'app/escanear/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/scans/pages/scan-review-page/scan-review-page.component').then(
        (m) => m.ScanReviewPageComponent
      ),
  },
  // Detalhe do livro: também tem header próprio (breadcrumb), fora do MainLayout.
  {
    path: 'app/books/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/books/pages/book-detail-page/book-detail-page.component').then(
        (m) => m.BookDetailPageComponent
      ),
  },
  // Main App Layout (Authenticated)
  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'books', pathMatch: 'full' },
      {
        path: 'books',
        loadChildren: () => import('./features/books/books.routes').then((m) => m.BOOKS_ROUTES),
      },
      {
        path: 'escanear',
        loadComponent: () =>
          import('./features/scans/pages/scans-page/scans-page.component').then((m) => m.ScansPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
