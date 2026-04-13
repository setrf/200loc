import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { maybeLoadReactGrab } from './devtools'
import './index.css'
import App from './App.tsx'

void maybeLoadReactGrab(import.meta.env.DEV)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
