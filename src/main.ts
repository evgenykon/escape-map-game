import { createApp } from 'vue'

// cache-bust marker 2026-07-06T12:00Z
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
