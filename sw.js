const CACHE_NAME = 'proverbios-4toa-v9';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './fondo.jpg',
  './manifest.json',
  './plantilla1.pdf',
  './plantilla2.pdf',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://unpkg.com/lucide@latest'
  // pdf.js y pdf-lib NO se precargan: se descargan solo la primera vez que
  // alguien abre un PDF o usa "Crear con IA", y de ahí en adelante quedan
  // en caché igual (ver estrategia network-first más abajo).
];

// Mostrar la notificación push cuando llega
self.addEventListener('push', (event) => {
  let data = { title: '📚 Nueva clase publicada', body: '' };
  try { data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './favicon.png',
      badge: './favicon.png',
      tag: 'nueva-clase'
    })
  );
});

// Al tocar la notificación, abrir (o enfocar) la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// Instalar y guardar recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia Network First (prioriza internet, usa caché si no hay conexión).
// cache:'no-store' evita que el navegador sirva una copia vieja guardada en su
// caché HTTP normal — así siempre se pide la versión más nueva del servidor.
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
