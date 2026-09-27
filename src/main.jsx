import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

if (window.uamsPlatform?.kind !== 'windows-desktop') {
  registerSW({ immediate: true })
}

if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)