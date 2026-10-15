// 라운드 알림 수신 + 등급 이미지 전용 캐시.
// HTML·CSS·JS·정산 데이터는 캐시하지 않아 배포와 실시간 데이터가 바로 반영된다.
const RANK_ICON_CACHE_PREFIX = 'jtfag-rank-icons-';
const RANK_ICON_CACHE = RANK_ICON_CACHE_PREFIX + 'v1';  // 같은 주소의 그림을 교체하면 버전을 올린다.
const RANK_ICON_BASE = 'https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/';
const RANK_ICON_URLS = ['IMG_8343.png', 'IMG_8331.png', 'IMG_8333.png', 'IMG_8335.png', 'IMG_8606.gif'].map(file => RANK_ICON_BASE + file);
const rankIconRequests = new Map();

async function cachedRankIcon(url) {
    let cache;
    try {
        cache = await caches.open(RANK_ICON_CACHE);
        const saved = await cache.match(url);
        if (saved) return saved;
    } catch (e) {}  // 저장 공간을 사용할 수 없는 기기도 그림은 표시한다.

    let pending = rankIconRequests.get(url);
    if (!pending) {
        pending = (async () => {
            const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (cache && response.ok && (response.headers.get('content-type') || '').startsWith('image/')) {
                try { await cache.put(url, response.clone()); } catch (e) {}
            }
            return response;
        })();
        rankIconRequests.set(url, pending);
        pending.then(() => rankIconRequests.delete(url), () => rankIconRequests.delete(url));
    }
    return (await pending).clone();
}

// 한 장이 실패해도 나머지 그림·서비스워커 설치는 완료한다. 다음 실행 때 빠진 그림만 다시 저장한다.
const cacheRankIcons = () => Promise.allSettled(RANK_ICON_URLS.map(cachedRankIcon));
self.addEventListener('install', event => {
    event.waitUntil(cacheRankIcons().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => key.startsWith(RANK_ICON_CACHE_PREFIX) && key !== RANK_ICON_CACHE).map(key => caches.delete(key)));
        } catch (e) {}
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CACHE_RANK_ICONS') event.waitUntil(cacheRankIcons());
});

// 등급 이미지는 저장본을 먼저 쓰며, 캐시가 있으면 네트워크 요청·재검증을 하지 않는다.
self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET' && RANK_ICON_URLS.includes(event.request.url)) {
        event.respondWith(cachedRankIcon(event.request.url));
    } else if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
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
