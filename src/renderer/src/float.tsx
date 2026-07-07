import './tauri-bridge'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { FloatApp } from './FloatApp'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatApp />
  </React.StrictMode>
)
