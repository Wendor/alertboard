import { createApp } from 'vue'
import App from './App.vue'
import { i18n, locale, setLocale } from './i18n'
import './styles.css'

setLocale(locale())
createApp(App).use(i18n).mount('#app')
