const CACHE_NAME = 'releve-prix-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// التثبيت وحفظ الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// التفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// جلب الملفات (العمل بدون إنترنت)
self.addEventListener('fetch', (event) => {
  // تجاهل الطلبات التي ليست من نوع GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // إرجاع الملف من الذاكرة إذا كان موجوداً
      if (cachedResponse) {
        return cachedResponse;
      }
      // إذا لم يكن موجوداً، قم بجلبه من الإنترنت
      return fetch(event.request);
    })
  );
});
