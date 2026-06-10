// Service Worker - 簡化版，不攔截任何事件
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
