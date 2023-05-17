self.addEventListener('install', event => {
	self.skipWaiting()
})

self.addEventListener('fetch', event => {
	event.respondWith(caches.open('robot').then(cache => {
		return cache.match(event.request)
		.then(cachedResponse => {
			let cachedFile = cachedResponse?.clone().blob()
			let fetchedResponse
			if (cachedFile) {
				cachedFile.then(response => {
					if (response?.size >= 1024000) return cachedResponse
					fetchedResponse = fetchNewData(event, cache, response)
				})
			} else {
				fetchedResponse = fetchNewData(event, cache)
			}
			return cachedResponse || fetchedResponse
		})
		.catch(() => {
			return fetch(event.request)
		})
	}))
})

function fetchNewData(event, cache, cachedFile) {
	return fetch(event.request)
	.then(networkResponse => {
		if (event.request.method == 'GET' && networkResponse.status == 200) cache.put(event.request, networkResponse.clone())
		if (cachedFile && event.clientId) {
			networkResponse.clone().blob()
			.then(response => {
				if (response.size === cachedFile.size) return
				self.clients.get(event.clientId)
				.then(client => {
					client?.postMessage('update')
				})
			})
		}
		return networkResponse
	})
}