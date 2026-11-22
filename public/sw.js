/*
 * Mealtill service worker.
 *
 * - Pages: always from the network, so members never see stale meals or money. Only when the
 *   network fails does the member get /offline.html instead of the browser's error page.
 * - App files that never change (/_next/static, /icons): cache first, so the app opens fast.
 * - The API and everything else: untouched, never cached (balances must always be live).
 *
 * Bump VERSION when this file or offline.html changes; old caches are removed on activate.
 */
const VERSION = "v1";
const STATIC_CACHE = `mealtill-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mealtill-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

function isImmutableAsset(url) {
    return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    // Page loads: network, falling back to the offline screen
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(async () => {
                const cache = await caches.open(STATIC_CACHE);
                return (await cache.match(OFFLINE_URL)) || Response.error();
            }),
        );
        return;
    }

    // Hashed build files and icons never change: serve from cache, fill it on first use
    if (isImmutableAsset(url)) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async (cache) => {
                const hit = await cache.match(request);
                if (hit) return hit;
                const res = await fetch(request);
                if (res.ok) cache.put(request, res.clone());
                return res;
            }),
        );
    }
    // Anything else (API, images from Blob via the API, etc.): the browser's normal handling
});
