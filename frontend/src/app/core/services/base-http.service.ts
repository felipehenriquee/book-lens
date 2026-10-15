import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export abstract class BaseHttpService<T> {
  protected abstract endpointUrl: string;

  constructor(
    protected http: HttpClient,
    protected mapFromJson: (json: any) => T
  ) {}

  protected get fullUrl(): string {
    return `${environment.apiUrl}${this.endpointUrl}`;
  }

  getAll(queryParams?: Record<string, any>): Observable<T[]> {
    let params = new HttpParams();
    if (queryParams) {
      Object.keys(queryParams).forEach((key) => {
        if (queryParams[key] !== null && queryParams[key] !== undefined) {
          params = params.set(key, queryParams[key]);
        }
      });
    }
    return this.http
      .get<any[]>(this.fullUrl, { params })
      .pipe(map((data) => data.map((item) => this.mapFromJson(item))));
  }

  getById(id: string | number): Observable<T> {
    return this.http.get<any>(`${this.fullUrl}/${id}`).pipe(map((data) => this.mapFromJson(data)));
  }

  post(payload: any): Observable<T> {
    return this.http.post<any>(this.fullUrl, payload).pipe(map((data) => this.mapFromJson(data)));
  }

  put(id: string | number, payload: any): Observable<T> {
    return this.http
      .put<any>(`${this.fullUrl}/${id}`, payload)
      .pipe(map((data) => this.mapFromJson(data)));
  }

  delete(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.fullUrl}/${id}`);
  }
}
