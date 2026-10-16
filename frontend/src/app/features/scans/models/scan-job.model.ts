import { DetectedBook } from '../../books/models/ocr-scan.model';

export type ScanJobStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';

/** Foto enviada para a fila de scan (resumo, usado na lista "Meus scans"). */
export class ScanJob {
  constructor(
    public id: string,
    public status: ScanJobStatus,
    public createdAt: Date,
    public originalFilename?: string,
    public bookCount?: number,
    public errorMessage?: string,
    public hasThumbnail: boolean = false,
    public startedAt?: Date,
    public finishedAt?: Date
  ) {}

  get isPending(): boolean {
    return this.status === 'QUEUED' || this.status === 'PROCESSING';
  }

  static fromJson(json: any): ScanJob {
    return new ScanJob(
      json.id,
      json.status,
      new Date(json.created_at),
      json.original_filename ?? undefined,
      json.book_count ?? undefined,
      json.error_message ?? undefined,
      !!json.has_thumbnail,
      json.started_at ? new Date(json.started_at) : undefined,
      json.finished_at ? new Date(json.finished_at) : undefined
    );
  }
}

/** Job com o resultado da detecção, usado na tela de revisão. */
export class ScanJobDetail {
  constructor(
    public job: ScanJob,
    public detectedBooks: DetectedBook[]
  ) {}

  static fromJson(json: any): ScanJobDetail {
    const books = (json.result?.detected_books ?? []).map((b: any) => DetectedBook.fromJson(b));
    return new ScanJobDetail(ScanJob.fromJson(json), books);
  }
}

export interface RejectedFile {
  filename?: string;
  reason: string;
}

export interface ScanUploadResult {
  jobs: ScanJob[];
  rejected: RejectedFile[];
}
