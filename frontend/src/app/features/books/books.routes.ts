import { Routes } from '@angular/router';
import { BookListPageComponent } from './pages/book-list-page/book-list-page.component';

export const BOOKS_ROUTES: Routes = [
  { path: '', component: BookListPageComponent },
];
