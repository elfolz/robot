self.addEventListener('install', event => {
	self.skipWaiting()
})

self.addEventListener('fetch', event => {
	event.respondWith(
		caches.open('robot')
		.then(cache => {
			return cache.match(event.request)
			.then(cachedResponse => {
				let fetchedResponse = fetch(event.request)
				.then(networkResponse => {
					if (networkResponse.status == 200) cache.put(event.request, networkResponse.clone())
					return networkResponse
				})
				return cachedResponse || fetchedResponse
			})
		})
		.catch(() => {
			return fetch(event.request)
		})
	)
})