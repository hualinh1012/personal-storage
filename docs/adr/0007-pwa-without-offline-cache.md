# Installable on phones, with no offline cache

The SPA has a web app manifest and icons so it can be added to a phone's home screen, but deliberately no app service worker or offline cache. The drive is useless offline (everything is in S3), and a caching service worker would fight the deploy's `no-cache` entry points and serve stale builds. The only service worker is Storage Browser's own download worker.
