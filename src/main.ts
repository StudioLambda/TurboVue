import { createApp } from 'vue'
import App from './App.vue'
import { configure } from 'turbo-query'

configure({
  async fetcher(key, { signal }) {
    console.log('Fetching...')
    await new Promise((r) => setTimeout(r, 2000))
    const response = await fetch(key, { signal })
    if (!response.ok) throw new Error('There was an error')
    console.log('Fetched')
    return await response.json()
  },
})

createApp(App).mount('#app')
