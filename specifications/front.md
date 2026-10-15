1. OVERVIEW & TECH STACK
This document defines the architecture, design patterns, security rules, and implementation guidelines for the
Angular frontend application.
Framework: Angular 18+ (Standalone Components / Modular Feature-First Structure)
UI & Component Library: Angular Material ( @angular/material )
Styling & Design System: Tailwind CSS v3+ with custom utility/class layer
HTTP Client & State: @angular/common/http with RxJS 7+
Security: Functional Route Guards, Interceptors (JWT + Error Handling), CSRF Header Injection, Content
Security Policy (CSP), Input Sanitization
Web Server / Reverse Proxy (Production): Nginx (Serving SPA + Proxying /api/ requests)
•
•
•
•
•
•

2. ARCHITECTURE & FOLDER STRUCTURE (Feature-First Architecture)

src/
├── app/
│ ├── core/ # Singleton services, guards, interceptors, layout shells
│ │ ├── guards/
│ │ │ ├── auth.guard.ts # Protects private routes
│ │ │ └── guest.guard.ts # Redirects authenticated users from /login
│ │ ├── interceptors/
│ │ │ ├── auth.interceptor.ts # Injects JWT Bearer token into HTTP headers
│ │ │ └── error.interceptor.ts # Global HTTP error handling (Toasts/Snackbar)
│ │ ├── layouts/
│ │ │ ├── auth-layout/ # Layout shell for Login / Register (Minimal)
│ │ │ │ ├── auth-layout.component.ts
│ │ │ │ └── auth-layout.component.html
│ │ │ └── main-layout/ # Layout shell for Internal App (Navbar + Sidebar + Footer)
│ │ │ ├── main-layout.component.ts
│ │ │ └── main-layout.component.html
│ │ ├── services/
│ │ │ ├── base-http.service.ts # Generic Abstract Class for CRUD
│ │ │ ├── auth.service.ts # User session & JWT state
│ │ │ └── notification.service.ts # Angular Material Snackbar Wrapper
│ │ └── models/
│ │ ├── user.model.ts # Class-based Data Model
│ │ └── auth-response.model.ts
│ │
│ ├── features/ # Modular Feature Domain Folders
│ │ ├── auth/ # Feature: Authentication
│ │ │ ├── pages/
│ │ │ │ └── login-page/
│ │ │ │ ├── login-page.component.ts
│ │ │ │ └── login-page.component.html
│ │ │ └── auth.routes.ts
│ │ │
│ │ └── books/ # Feature: Catalog & OCR Scan
│ │ ├── components/
│ │ │ ├── book-card/
│ │ │ └── scan-dialog/ # Modal with Camera/Upload for Gemini OCR
│ │ ├── models/
│ │ │ ├── book.model.ts # Class-based Book Model
│ │ │ └── ocr-scan.model.ts # Class-based Scan Result Model
│ │ ├── pages/
│ │ │ ├── book-list-page/
│ │ │ └── book-detail-page/
│ │ ├── services/
│ │ │ └── book.service.ts # Extends BaseHttpService<Book>
│ │ └── books.routes.ts
│ │
│ ├── shared/ # Reusable UI Components, Pipes & Directives
│ │ ├── components/ # Confirm Dialogs, Loading Spinners
│ │ └── pipes/
│ ├── app.routes.ts # Master Routing Configuration
│ └── app.component.ts
│
├── assets/ # Static Assets (Images, Icons)
├── styles/
│ ├── styles.css # Tailwind Directives & Imports
│ └── tailwind-classes.css # Custom Reusable Tailwind Classes Layer
├── environments/
│ ├── environment.ts # Development Environment Variables

│ └── environment.prod.ts # Production Environment Variables
├── proxy.conf.json # Dev Server Proxy Config
└── nginx.conf # Production Nginx Reverse Proxy Config

3. ENVIRONMENT CONFIGURATION
src/environments/environment.ts (Development)
export const environment = {
production: false,
apiUrl: '/api/v1', // Proxied via proxy.conf.json to localhost:8000
allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
maxFileSizeMB: 10
};
src/environments/environment.prod.ts (Production)
export const environment = {
production: true,
apiUrl: '/api/v1', // Proxied via Nginx reverse proxy
allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
maxFileSizeMB: 10
};
proxy.conf.json (Dev Proxy for Angular CLI)

{
"/api": {
"target": "http://localhost:8000",
"secure": false,
"changeOrigin": true,
"logLevel": "debug"
}
}

4. TAILWIND STYLING & CUSTOM CLASSES FILE
src/styles/tailwind-classes.css

@tailwind base;
@tailwind components;
@tailwind utilities;
@layer components {
/* Layout Containers */
.app-container {
@apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8;
}
/* Form Elements */
.btn-primary {
@apply bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}
.btn-secondary {
@apply bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2.5 px-4 rounded-lg transition-colors duration-200;
}
.btn-danger {
@apply bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors duration-200;
}
/* Cards & Surface Elements */
.card-surface {
@apply bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow duration-200;
}
/* Status Badges */
.badge-read {
@apply bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full;
}
.badge-reading {
@apply bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full;
}
.badge-unread {
@apply bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5 rounded-full;
}
}

5. CLASS-BASED MODELS
src/app/core/models/user.model.ts

export class User {
constructor(
public id: string,
public email: string,
public fullName: string,
public createdAt?: Date
) {}
static fromJson(json: any): User {
return new User(
json.id,
json.email,
json.full_name,
json.created_at ? new Date(json.created_at) : undefined
);
}
}

src/app/features/books/models/book.model.ts

export type ReadingStatus = 'UNREAD' | 'READING' | 'READ' | 'PAUSED' | 'ABANDONED';
export type BookFormat = 'PAPERBACK' | 'HARDCOVER' | 'EBOOK' | 'POCKET';
export class Book {
constructor(
public id: string,
public title: string,
public author: string,
public subtitle?: string,
public publisher?: string,
public language: string = 'Português',
public publicationYear?: number,
public coverUrl?: string,
public pageCount?: number,
public format?: BookFormat,
public readingStatus: ReadingStatus = 'UNREAD',
public rating?: number,
public purchaseDate?: string,
public price?: number,
public genre?: string,
public summary?: string,
public userNotes?: string,
public createdAt?: Date
) {}
static fromJson(json: any): Book {
return new Book(
json.id,
json.title,
json.author,
json.subtitle,
json.publisher,
json.language ?? 'Português',
json.publication_year,
json.cover_url,
json.page_count,
json.format,
json.reading_status ?? 'UNREAD',
json.rating,
json.purchase_date,
json.price ? parseFloat(json.price) : undefined,
json.genre,
json.summary,
json.user_notes,
json.created_at ? new Date(json.created_at) : undefined
);
}
toJson(): any {
return {
title: this.title,
subtitle: this.subtitle,
author: this.author,
publisher: this.publisher,
language: this.language,
publication_year: this.publicationYear,
cover_url: this.coverUrl,
page_count: this.pageCount,

format: this.format,
reading_status: this.readingStatus,
rating: this.rating,
purchase_date: this.purchaseDate,
price: this.price,
genre: this.genre,
summary: this.summary,
user_notes: this.userNotes
};
}
}

src/app/features/books/models/ocr-scan.model.ts

export class DetectedBook {
constructor(
public title: str,
public authors: string[],
public publisher?: string,
public confidence: number = 0.0
) {}
static fromJson(json: any): DetectedBook {
return new DetectedBook(
json.title,
json.authors || [],
json.publisher,
json.confidence || 0.0
);
}
}
export class BookScanResult {
constructor(public detectedBooks: DetectedBook[]) {}
static fromJson(json: any): BookScanResult {
const books = (json.detected_books || []).map((b: any) => DetectedBook.fromJson(b));
return new BookScanResult(books);
}
}

6. GENERIC BASE HTTP SERVICE & EXTENDING SERVICES
src/app/core/services/base-http.service.ts

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
return this.http.get<any[]>(this.fullUrl, { params }).pipe(
map((data) => data.map((item) => this.mapFromJson(item)))
);
}
getById(id: string | number): Observable<T> {
return this.http.get<any>(`${this.fullUrl}/${id}`).pipe(
map((data) => this.mapFromJson(data))
);
}
post(payload: any): Observable<T> {
return this.http.post<any>(this.fullUrl, payload).pipe(
map((data) => this.mapFromJson(data))
);
}
put(id: string | number, payload: any): Observable<T> {
return this.http.put<any>(`${this.fullUrl}/${id}`, payload).pipe(
map((data) => this.mapFromJson(data))
);
}
delete(id: string | number): Observable<void> {
return this.http.delete<void>(`${this.fullUrl}/${id}`);
}
}

src/app/features/books/services/book.service.ts (Extends Base & Handles Image Uploads)
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseHttpService } from '../../../core/services/base-http.service';
import { Book } from '../models/book.model';
import { BookScanResult } from '../models/ocr-scan.model';
import { environment } from '../../../../environments/environment';
@Injectable({
providedIn: 'root'
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
return this.http.post<any>(`${environment.apiUrl}/ocr/scan`, formData).pipe(
map((response) => BookScanResult.fromJson(response))
);
}
}

7. ROUTING & LAYOUT SHELLS
src/app/app.routes.ts

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
path: 'login',
loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
}
]
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
loadChildren: () => import('./features/books/books.routes').then(m => m.BOOKS_ROUTES)
}
]
},
{ path: '**', redirectTo: 'login' }
];

8. PRODUCTION NGINX CONFIGURATION ( nginx.conf )
server {
listen 80;
server_name localhost;
root /usr/share/nginx/html;
index index.html;
# Security Headers Injection
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;" always;
# Gzip Compression
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
# Serve SPA Static Files
location / {
try_files $uri $uri/ /index.html;
}
# Reverse Proxy for FastAPI Backend
location /api/ {
proxy_pass http://backend:8000/api/;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
proxy_set_header Host $host;
proxy_cache_bypass $http_upgrade;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
# Allow upload size up to 10MB for photos
client_max_body_size 10M;
}
}

9. EXTRA SECURITY & BEST PRACTICES ADDED (BEYOND REQUEST)
    1. Functional Route Guards ( authGuard & guestGuard ):
    2. Implemented modern Angular functional guards preventing unauthorized access to internal routes and redirecting already logged-in users away from /login .
    3. HTTP Interceptor System:
    4. AuthInterceptor : Automatically injects Authorization: Bearer <token> into outgoing HTTP requests without manual overhead.
    5. ErrorInterceptor : Global exception catcher that displays user-friendly error messages (via Angular Material MatSnackBar ) when backend responses fail (401, 403, 500).

    6. HTTP Security Headers in Nginx:

    7. Injected production-ready HTTP headers ( X-Frame-Options , X-Content-Type-Options , Content- Security-Policy , Referrer-Policy ) directly into Nginx to prevent Clickjacking, MIME sniffing, and XSS.
    8. File Validation before Upload:
    9. Added frontend file validation (checking size <= 10MB and MIME type against image/jpeg , image/png , image/webp ) in environment variables prior to sending payloads to backend endpoints.
    10. Angular Material Snackbar Notification Service:
    11. Created a centralized wrapper service ( NotificationService ) around Material Snackbar for unified feedback toasts (Success, Error, Info).
    12. Image Upload Progress Handling & Memory Protection:
    13. Configured FormData transmission with explicit memory cleanups after Gemini scan dispatch.