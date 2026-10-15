import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseHttpService } from '../../../core/services/base-http.service';
import { Book } from '../models/book.model';
import { BookScanResult, DetectedBook } from '../models/ocr-scan.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BookService extends BaseHttpService<Book> {
  protected endpointUrl = '/books';

  constructor(http: HttpClient) {
    super(http, Book.fromJson);
  }

  /**
   * Sends image file/blob to backend Gemini OCR endpoint
   */
  scanBooksImage(file: File): Observable<BookScanResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<any>(`${environment.apiUrl}/ocr/scan`, formData)
      .pipe(map((response) => BookScanResult.fromJson(response)));
  }

  /**
   * Confirma e persiste um ou mais livros catalogados.
   * O backend expõe /books como um endpoint em lote ({ books: [...] } -> Book[]),
   * por isso não reaproveita o post() de item único herdado de BaseHttpService.
   */
  createMany(books: Book[]): Observable<Book[]> {
    const payload = { books: books.map((book) => book.toJson()) };
    return this.http
      .post<any[]>(this.fullUrl, payload)
      .pipe(map((items) => items.map((item) => Book.fromJson(item))));
  }

  /**
   * Autocomplete por título, usado no cadastro manual de livros.
   */
  searchGoogleBooks(query: string): Observable<DetectedBook[]> {
    const params = new HttpParams().set('q', query);
    return this.http
      .get<any[]>(`${environment.apiUrl}/google-books/search`, { params })
      .pipe(map((items) => items.map((item) => DetectedBook.fromJson(item))));
  }

  /**
   * Detalhes completos de um volume já conhecido (google_books_id salvo),
   * usado no "ver mais detalhes" e para pré-popular o modal de edição.
   */
  getGoogleBookById(volumeId: string): Observable<DetectedBook> {
    return this.http
      .get<any>(`${environment.apiUrl}/google-books/${volumeId}`)
      .pipe(map((item) => DetectedBook.fromJson(item)));
  }

  /**
   * Atualiza os dados pessoais de um livro já salvo (PATCH, não PUT — o
   * put() genérico herdado de BaseHttpService não serve aqui).
   */
  update(id: string, book: Book): Observable<Book> {
    return this.http
      .patch<any>(`${this.fullUrl}/${id}`, book.toJson())
      .pipe(map((item) => Book.fromJson(item)));
  }
}
