import { Routes } from '@angular/router';
import { BookListPageComponent } from './pages/book-list-page/book-list-page.component';
import { BookDetailPageComponent } from './pages/book-detail-page/book-detail-page.component';

export const BOOKS_ROUTES: Routes = [
  { path: '', component: BookListPageComponent },
  { path: ':id', component: BookDetailPageComponent },
];
