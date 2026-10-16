import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ScanJob, ScanJobDetail, ScanUploadResult } from '../models/scan-job.model';

/** Lado maior da foto enviada (o backend normaliza para o mesmo tamanho). */
const UPLOAD_MAX_SIDE = 2048;

/** Chamadas HTTP da fila de scans (/api/v1/scans). */
@Injectable({
  providedIn: 'root',
})
export class ScanJobService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/scans`;

  upload(files: File[]): Observable<ScanUploadResult> {
    return from(Promise.all(files.map((file) => shrinkPhoto(file)))).pipe(
      switchMap((prepared) => {
        const form = new FormData();
        prepared.forEach((file) => form.append('files', file, file.name));
        return this.http.post<any>(this.url, form);
      }),
      map((json) => ({
        jobs: (json.jobs ?? []).map((item: any) => ScanJob.fromJson(item)),
        rejected: json.rejected ?? [],
      }))
    );
  }

  list(): Observable<ScanJob[]> {
    return this.http.get<any[]>(this.url).pipe(map((items) => items.map((item) => ScanJob.fromJson(item))));
  }

  get(id: string): Observable<ScanJobDetail> {
    return this.http.get<any>(`${this.url}/${id}`).pipe(map((json) => ScanJobDetail.fromJson(json)));
  }

  /**
   * A miniatura exige o header Authorization, então não dá para usar a URL
   * direto num <img>: baixa como Blob e devolve uma object URL (quem chama
   * deve liberar com URL.revokeObjectURL).
   */
  thumbnailUrl(id: string): Observable<string> {
    return this.http
      .get(`${this.url}/${id}/thumbnail`, { responseType: 'blob' })
      .pipe(map((blob) => URL.createObjectURL(blob)));
  }

  retry(id: string): Observable<ScanJob> {
    return this.http.post<any>(`${this.url}/${id}/retry`, {}).pipe(map((json) => ScanJob.fromJson(json)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}

/**
 * Reduz a foto no navegador antes do upload (fotos de celular têm 3–8MB e o
 * backend redimensiona para 2048px de qualquer jeito): upload bem mais rápido
 * em rede móvel. Se o navegador não conseguir decodificar (ex.: HEIC), envia o
 * original e o backend decide.
 */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    // imageOrientation "from-image" aplica a rotação do EXIF antes de redimensionar.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
      return file;
    }
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
