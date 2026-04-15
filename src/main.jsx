import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './supabase'
import Auth from './Auth'
import App from './App'

function Root() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ECDC4', fontFamily: 'Georgia, serif', fontSize: 18 }}>
      Loading…
    </div>
  )

  if (!session) return <Auth />
  return <App user={session.user} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Root /></React.StrictMode>
)
