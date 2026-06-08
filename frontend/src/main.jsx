// Node polyfills (Buffer, process, util, etc.) are injected automatically by
// vite-plugin-node-polyfills configured in vite.config.js — required by the
// Circle Web SDK's transitive jsonwebtoken/jws dependency. See vite.config.js.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
