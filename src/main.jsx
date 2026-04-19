import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

if (Capacitor.isNativePlatform()) {
  Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]).then(([{ StatusBar, Style }, { SplashScreen }]) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
    SplashScreen.hide().catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
