import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    registerSW({immediate: true});
  } else {
    navigator.serviceWorker
      .getRegistrations?.()
      .then((registrations) => {
        for (const registration of registrations) {
          const url =
            registration.active?.scriptURL ||
            registration.waiting?.scriptURL ||
            registration.installing?.scriptURL ||
            '';
          if (url.includes('dev-sw.js') || url.endsWith('/sw.js')) {
            registration.unregister();
          }
        }
      })
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            if (key.includes('workbox-precache')) {
              caches.delete(key);
            }
          }
        })
        .catch(() => {});
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
