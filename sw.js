/*
 * Service worker for Study Planner.
 *
 * The app is one HTML file plus a manifest and icons, and all user data lives in
 * localStorage, so caching the shell is enough to make it work fully offline.
 *
 * Strategy:
 *   - navigations  cache-first, with a background refresh, so launching from the
 *                  home screen is instant and works with no connection. A new
 *                  deploy is picked up on the launch after the one that fetched it.
 *   - same-origin
 *     GET assets   stale-while-revalidate.
 *   - everything
 *     else         left to the network.
 *
 * Bump CACHE_VERSION when the list of precached files changes; the old cache is
 * deleted on activate. Changing index.html alone needs no bump — the background
 * refresh above keeps it current.
 */
var CACHE_VERSION = "v3";
var CACHE_NAME = "study-planner-" + CACHE_VERSION;
var INDEX = "./index.html";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Added one at a time: a single 404 (a host that won't serve "./", say)
      // must not fail the whole install and leave the app uncached.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: "reload" }))["catch"](function () {});
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME && key.indexOf("study-planner-") === 0) return caches["delete"](key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function refresh(cache, request, cacheKey) {
  return fetch(request).then(function (response) {
    if (response && response.ok && response.type === "basic") {
      cache.put(cacheKey || request, response.clone());
    }
    return response;
  })["catch"](function () {
    return null;
  });
}

var OFFLINE_FALLBACK =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Study Planner</title>' +
  '<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f6f8;color:#161b22;' +
  'font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}' +
  '@media(prefers-color-scheme:dark){body{background:#10151b;color:#e8edf2}}</style></head><body><div>' +
  "<h1>Offline</h1><p>Open Study Planner once with a connection, then it will work offline.</p>" +
  "</div></body></html>";

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // The cached shell answers for the app's own address only. Other pages
    // under the same scope — /classic/, the archived first version — must come
    // from the network, or this worker would hand back the current app for a
    // page that is deliberately a different one.
    var appRoot = new URL("./", self.location.href).pathname;
    if (url.pathname !== appRoot && url.pathname !== appRoot + "index.html") {
      event.respondWith(
        caches.open(CACHE_NAME).then(function (cache) {
          return refresh(cache, request).then(function (response) {
            if (response) return response;
            return cache.match(request, { ignoreSearch: true }).then(function (cached) {
              return cached || new Response(OFFLINE_FALLBACK, {
                status: 200,
                headers: { "Content-Type": "text/html; charset=utf-8" }
              });
            });
          });
        })
      );
      return;
    }

    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(INDEX).then(function (cached) {
          var network = refresh(cache, new Request(INDEX, { cache: "reload" }), INDEX);
          if (cached) return cached;
          return network.then(function (response) {
            return response || new Response(OFFLINE_FALLBACK, {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        var network = refresh(cache, request);
        if (cached) return cached;
        return network.then(function (response) {
          return response || Response.error();
        });
      });
    })
  );
});

// A reminder is only useful if tapping it lands you in the app. Focus a window
// that is already open on this app, otherwise open one on the Today view.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL("./#today", self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (client.url.indexOf(self.registration.scope) === 0) {
          if ("navigate" in client) { try { client.navigate(target); } catch (e) {} }
          if ("focus" in client) return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
