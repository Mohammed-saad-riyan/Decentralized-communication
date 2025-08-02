import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WalletContextProvider } from './contexts/WalletContext'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </React.StrictMode>
) 