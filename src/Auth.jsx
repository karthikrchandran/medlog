import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  function msg(type, text) {
    setMessage({ type, text })
  }

  async function handleRegister() {
    if (!name.trim()) return msg('error', 'Please enter your name')
    if (!email.trim()) return msg('error', 'Please enter your email')
    if (password.length < 6) return msg('error', 'Password must be at least 6 characters')

    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    })

    setLoading(false)
    if (error) return msg('error', error.message)

    msg('success', 'Account created. Check your email to confirm, then sign in.')
    setMode('login')
  }

  async function handleLogin() {
    if (!email.trim() || !password) return msg('error', 'Please fill in all fields')

    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) return msg('error', error.message)
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

  function submitOnEnter(event) {
    if (event.key !== 'Enter') return
    if (mode === 'login') handleLogin()
    if (mode === 'register') handleRegister()
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-badge">Private medication tracker</div>
          <div className="auth-brand-row">
            <span className="auth-logo" aria-hidden="true">💊</span>
            <div>
              <div className="auth-title">MedLog</div>
              <div className="auth-subtitle">Reliable tablet tracking across phone, tablet, and desktop.</div>
            </div>
          </div>

          <div className="auth-copy-block">
            <h1 className="auth-heading">Track every dose without fighting the layout.</h1>
            <p className="auth-body">
              The interface now expands cleanly for larger screens instead of staying locked to a phone-sized column.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-card">
              <div className="auth-feature-title">Responsive layout</div>
              <div className="auth-feature-text">Uses fluid widths and desktop breakpoints instead of a fixed 480px shell.</div>
            </div>
            <div className="auth-feature-card">
              <div className="auth-feature-title">Private by default</div>
              <div className="auth-feature-text">Your prescription data remains visible only to your account.</div>
            </div>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="section-kicker">{mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Welcome back'}</div>
          <div className="manage-title auth-panel-title">
            {mode === 'register' ? 'Set up MedLog' : mode === 'forgot' ? 'Recover access' : 'Sign in to MedLog'}
          </div>
          <div className="manage-subtitle auth-panel-subtitle">
            {mode === 'register'
              ? 'Create a private account for your medication schedules.'
              : mode === 'forgot'
                ? 'Enter your email and we will send you a reset link.'
                : 'Use your email and password to access your tracker.'}
          </div>

          {message && (
            <div className={`message-banner ${message.type === 'error' ? 'is-error' : 'is-success'}`}>
              {message.text}
            </div>
          )}

          <div className="form-stack">
            {mode === 'register' && (
              <input
                className="text-field"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}

            <input
              className="text-field"
              placeholder="Email address"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={submitOnEnter}
            />

            {mode !== 'forgot' && (
              <input
                className="text-field"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={submitOnEnter}
              />
            )}
          </div>

          <div className="auth-action-stack">
            {mode === 'login' && (
              <>
                <button type="button" className="primary-button auth-main-button" onClick={handleLogin} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
                <button type="button" className="text-link" onClick={() => { setMode('forgot'); setMessage(null) }}>
                  Forgot password?
                </button>
                <div className="divider-line"><span>or</span></div>
                <button type="button" className="secondary-button auth-main-button" onClick={() => { setMode('register'); setMessage(null) }}>
                  Create an account
                </button>
              </>
            )}

            {mode === 'register' && (
              <>
                <button type="button" className="primary-button auth-main-button" onClick={handleRegister} disabled={loading}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
                <button type="button" className="text-link" onClick={() => { setMode('login'); setMessage(null) }}>
                  Already have an account? Sign in
                </button>
              </>
            )}

            {mode === 'forgot' && (
              <>
                <button type="button" className="primary-button auth-main-button" onClick={handleForgot} disabled={loading}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <button type="button" className="text-link" onClick={() => { setMode('login'); setMessage(null) }}>
                  Back to sign in
                </button>
              </>
            )}
          </div>

          <div className="auth-footnote">🔒 Your prescription data is private and only visible to you.</div>
        </section>
      </div>
    </div>
  )
}
