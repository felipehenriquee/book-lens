export const environment = {
  production: true,
  apiUrl: '/api/v1', // Proxied via Nginx reverse proxy
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSizeMB: 10,
};
