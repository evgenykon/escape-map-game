import { createApp } from 'vue'

// cache-bust marker 2026-07-02T19:40Z
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
