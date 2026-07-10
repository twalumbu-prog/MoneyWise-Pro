import React from 'react'
import ReactDOM from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import App from './App.tsx'
import './index.css'
import './lib/posthog'
import { queryClient, persister, CACHE_BUSTER, MAX_CACHE_AGE_MS } from './lib/queryClient'

// <SpeedInsights/> lives inside App.tsx (within the Router), not here — it needs
// useLocation() to track SPA route changes. See SpeedInsightsRouteTracker.

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, buster: CACHE_BUSTER, maxAge: MAX_CACHE_AGE_MS }}
        >
            <App />
        </PersistQueryClientProvider>
    </React.StrictMode>,
)
