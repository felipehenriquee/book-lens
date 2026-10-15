export const environment = {
  production: false,
  apiUrl: '/api/v1', // Proxied via proxy.conf.json to localhost:8000
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSizeMB: 10,
};
