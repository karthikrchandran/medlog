import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
  const [mode, setMode] = useState('login') // login | register | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'error'|'success', text }

  function msg(type, text) { setMessage({ type, text }) }

  async function handleRegister() {
    if (!name.trim()) return msg('error', 'Please enter your name')
    if (!email.trim()) return msg('error', 'Please enter your email')
    if (password.length < 6) return msg('error', 'Password must be at least 6 characters')
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } }
    })
    setLoading(false)
    if (error) return msg('error', error.message)
    msg('success', 'Account created! Check your email to confirm, then log in.')
    setMode('login')
  }

  async function handleLogin() {
    if (!email.trim() || !password) return msg('error', 'Please fill in all fields')
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return msg('error', error.message)
    // App component will pick up the session change
  }

  async function handleForgot() {
    if (!email.trim()) return msg('error', 'Enter your email above')
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (error) return msg('error', error.message)
    msg('success', 'Password reset link sent to your email.')
  }

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.logoRow}>
          <span style={S.logo}>💊</span>
          <div>
            <div style={S.title}>MedLog</div>
            <div style={S.subtitle}>Your private tablet tracker</div>
          </div>
        </div>

        {message && (
          <div style={{ ...S.banner, background: message.type === 'error' ? '#FF6B6B22' : '#6BCB7722', borderColor: message.type === 'error' ? '#FF6B6B' : '#6BCB77', color: message.type === 'error' ? '#FF6B6B' : '#6BCB77' }}>
            {message.text}
          </div>
        )}

        {mode === 'register' && (
          <input style={S.input} placeholder="Your name" value={name}
            onChange={e => setName(e.target.value)} />
        )}
        <input style={S.input} placeholder="Email address" type="email" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())} />
        {mode !== 'forgot' && (
          <input style={S.input} placeholder="Password" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())} />
        )}

        {mode === 'login' && (
          <>
            <button style={S.primaryBtn} onClick={handleLogin} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <button style={S.linkBtn} onClick={() => { setMode('forgot'); setMessage(null) }}>
              Forgot password?
            </button>
            <div style={S.divider}><span>or</span></div>
            <button style={S.secondaryBtn} onClick={() => { setMode('register'); setMessage(null) }}>
              Create an account
            </button>
          </>
        )}

        {mode === 'register' && (
          <>
            <button style={S.primaryBtn} onClick={handleRegister} disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            <button style={S.linkBtn} onClick={() => { setMode('login'); setMessage(null) }}>
              Already have an account? Sign in
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <button style={S.primaryBtn} onClick={handleForgot} disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button style={S.linkBtn} onClick={() => { setMode('login'); setMessage(null) }}>
              Back to sign in
            </button>
          </>
        )}

        <div style={S.privacy}>
          🔒 Your prescription data is private and only visible to you.
        </div>
      </div>
    </div>
  )
}

const S = {
  root: { minHeight: '100vh', background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, background: '#16192A', borderRadius: 20, padding: 28, border: '1px solid #1E2238', display: 'flex', flexDirection: 'column', gap: 12 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 },
  logo: { fontSize: 40 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' },
  subtitle: { fontSize: 13, color: '#6B7094', letterSpacing: 1 },
  banner: { border: '1px solid', borderRadius: 10, padding: '10px 14px', fontSize: 13 },
  input: { background: '#0F1117', border: '1.5px solid #1E2238', borderRadius: 10, padding: '13px 14px', color: '#E8EAF6', fontSize: 15, fontFamily: 'Georgia, serif', outline: 'none' },
  primaryBtn: { background: '#4ECDC4', color: '#0F1117', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: 4 },
  secondaryBtn: { background: '#1E2238', color: '#E8EAF6', border: '1.5px solid #2A2D45', borderRadius: 10, padding: '13px 0', fontSize: 15, cursor: 'pointer', fontFamily: 'Georgia, serif' },
  linkBtn: { background: 'none', border: 'none', color: '#6B7094', fontSize: 13, cursor: 'pointer', fontFamily: 'Georgia, serif', textDecoration: 'underline' },
  divider: { textAlign: 'center', color: '#2A2D45', fontSize: 13, position: 'relative' },
  privacy: { fontSize: 12, color: '#3A3D55', textAlign: 'center', marginTop: 8 },
}
