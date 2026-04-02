// TanQ Service Worker v1.0
const CACHE_NAME = 'tanq-v1';
const ASSETS = ['./'];

// ── Install: cache the app shell ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fallback to cache ──
self.addEventListener('fetch', e => {
  // Only cache same-origin GET requests
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Update cache with fresh response
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Alarm system (background notifications) ──
let alarms = [];
let alarmTimer = null;

self.addEventListener('message', e => {
  if (e.data?.type === 'SET_ALARMS') {
    alarms = e.data.alarms || [];
    scheduleAlarms();
  }
  if (e.data?.type === 'CLEAR_ALARMS') {
    alarms = [];
    clearTimeout(alarmTimer);
  }
});

function scheduleAlarms() {
  clearTimeout(alarmTimer);
  if (alarms.length === 0) return;

  const now = Date.now();
  // Find the next alarm that hasn't fired yet
  const next = alarms
    .filter(a => a.notifAt > now)
    .sort((a, b) => a.notifAt - b.notifAt)[0];

  if (!next) return;

  const delay = next.notifAt - now;
  alarmTimer = setTimeout(() => fireAlarm(next), delay);
}

function fireAlarm(alarm) {
  self.registration.showNotification('📚 もうすぐ授業です', {
    body: `${alarm.period}　${alarm.subj}${alarm.room ? '\n📍 ' + alarm.room : ''}\n15分後に開始（${alarm.startTime}〜）`,
    icon: './学生自治会.png',
    badge: './学生自治会.png',
    tag: `class-${alarm.period}`,
    renotify: false,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {alarm},
  });

  // Notify the main thread too
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({type: 'CLASS_ALARM', alarm}))
  );

  // Schedule next alarm
  alarms = alarms.filter(a => a.notifAt !== alarm.notifAt);
  scheduleAlarms();
}

// ── Push (for future server-side push support) ──
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'TanQ', {
      body: data.body || '',
      icon: './icon-192.png',
      tag: data.tag || 'tanq-push',
    })
  );
});

// ── Notification click: open the app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
});
