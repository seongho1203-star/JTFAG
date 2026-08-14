// 라운드 알림 수신용 서비스워커.
// 앱이 닫혀 있어도 브라우저가 이 파일을 깨워 알림을 띄운다.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 크롬이 '설치 가능'으로 판정하려면 fetch 핸들러가 있어야 한다.
// 일부러 캐시를 두지 않는다 — 캐시하면 코드를 고쳐도 예전 화면이 남는다.
self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

    const title = data.title || '⛳ JTFAG 라운드 알림';
    const options = {
        body: data.body || '다음 라운드가 다가옵니다.',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'jtfag-round',   // 같은 tag면 알림이 쌓이지 않고 갱신된다
        renotify: true,
        data: { url: data.url || './' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            // 이미 열려 있는 창이 있으면 그 창을 앞으로 가져온다
            for (const client of list) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(target);
        })
    );
});
