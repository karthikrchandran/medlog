import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

function getTodayKey() {
  return new Date().toISOString().split('T')[0]
}

function getWeekDays() {
  const days = []
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function shortDay(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

function shortDate(dateString) {
  return new Date(`${dateString}T00:00:00`).getDate()
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(timeValue) {
  if (!timeValue) return ''
  const [hours, minutes] = timeValue.split(':').map(Number)
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

function nowTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const PILL_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#845EF7', '#F08030', '#E64980', '#74C0FC']
const PRESET_TIMES = ['06:00', '07:00', '08:00', '09:00', '12:00', '13:00', '14:00', '18:00', '20:00', '21:00', '22:00']

export default function App({ user }) {
  const [tablets, setTablets] = useState([])
  const [log, setLog] = useState({})
  const [selectedDate, setSelectedDate] = useState(getTodayKey())
  const [view, setView] = useState('week')
  const [modal, setModal] = useState(null)
  const [newName, setNewName] = useState('')
  const [newDose, setNewDose] = useState('')
  const [newColor, setNewColor] = useState(PILL_COLORS[1])
  const [newTimes, setNewTimes] = useState(['08:00'])
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  const weekDays = getWeekDays()
  const stripRef = useRef(null)

  useEffect(() => {
    loadAll()
  }, [user])

  useEffect(() => {
    if (!stripRef.current) return
    const button = stripRef.current.querySelector(`[data-date="${selectedDate}"]`)
    if (button) {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [selectedDate, view])

  async function loadAll() {
    setLoading(true)
    const [{ data: tabs }, { data: logs }] = await Promise.all([
      supabase.from('tablets').select('*').order('created_at'),
      supabase.from('dose_logs').select('*'),
    ])

    setTablets(tabs || [])

    const logMap = {}
    for (const row of logs || []) {
      logMap[`${row.log_date}__${row.tablet_id}__${row.scheduled_time}`] = row
    }
    setLog(logMap)
    setLoading(false)
  }

  function showToast(message) {
    setToast(message)
    setTimeout(() => setToast(null), 2200)
  }

  function logKey(tabletId, scheduledTime, date) {
    return `${date}__${tabletId}__${scheduledTime}`
  }

  function getEntry(tabletId, scheduledTime, date) {
    return log[logKey(tabletId, scheduledTime, date)] || null
  }

  function isDone(tabletId, scheduledTime, date) {
    return getEntry(tabletId, scheduledTime, date)?.done || false
  }

  function openModal(tablet, scheduledTime, date) {
    const entry = getEntry(tablet.id, scheduledTime, date)
    if (entry?.done) {
      unmarkDose(tablet.id, scheduledTime, date, entry.id)
      return
    }

    const defaultTime = date === getTodayKey() ? nowTime() : scheduledTime
    setModal({ tablet, scheduledTime, date, takenAt: defaultTime })
  }

  async function unmarkDose(tabletId, scheduledTime, date, rowId) {
    const key = logKey(tabletId, scheduledTime, date)
    setLog((prev) => ({ ...prev, [key]: { ...prev[key], done: false } }))
    if (rowId) {
      await supabase.from('dose_logs').update({ done: false }).eq('id', rowId)
    }
    showToast('Unmarked')
  }

  async function confirmModal() {
    if (!modal) return

    const { tablet, scheduledTime, date, takenAt } = modal
    const key = logKey(tablet.id, scheduledTime, date)
    const existing = getEntry(tablet.id, scheduledTime, date)

    if (existing?.id) {
      const { data } = await supabase
        .from('dose_logs')
        .update({ done: true, taken_at: takenAt })
        .eq('id', existing.id)
        .select()
        .single()
      setLog((prev) => ({ ...prev, [key]: data }))
    } else {
      const { data } = await supabase
        .from('dose_logs')
        .insert({
          user_id: user.id,
          tablet_id: tablet.id,
          log_date: date,
          scheduled_time: scheduledTime,
          taken_at: takenAt,
          done: true,
        })
        .select()
        .single()
      if (data) setLog((prev) => ({ ...prev, [key]: data }))
    }

    showToast(`Logged at ${formatTime(takenAt)} ✓`)
    setModal(null)
  }

  async function addTablet() {
    if (!newName.trim() || !newTimes.length) return

    const { data, error } = await supabase
      .from('tablets')
      .insert({
        user_id: user.id,
        name: newName.trim(),
        dose: newDose.trim() || '1 tablet',
        color: newColor,
        times: [...newTimes].sort(),
      })
      .select()
      .single()

    if (error) {
      showToast('Error saving tablet')
      return
    }

    setTablets((prev) => [...prev, data])
    setNewName('')
    setNewDose('')
    setNewTimes(['08:00'])
    setNewColor(PILL_COLORS[1])
    showToast('Tablet added')
  }

  async function removeTablet(id) {
    await supabase.from('tablets').delete().eq('id', id)
    setTablets((prev) => prev.filter((tablet) => tablet.id !== id))
    showToast('Removed')
  }

  function getDayProgress(dateKey) {
    const total = tablets.reduce((sum, tablet) => sum + (tablet.times?.length || 0), 0)
    if (!total) return 0

    const done = tablets.reduce(
      (sum, tablet) => sum + (tablet.times || []).filter((time) => isDone(tablet.id, time, dateKey)).length,
      0,
    )

    return Math.round((done / total) * 100)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const selectedProgress = getDayProgress(selectedDate)
  const displayName = user.user_metadata?.full_name || user.email
  const selectedTotalDoses = tablets.reduce((sum, tablet) => sum + (tablet.times?.length || 0), 0)
  const selectedCompletedDoses = tablets.reduce(
    (sum, tablet) => sum + (tablet.times || []).filter((time) => isDone(tablet.id, time, selectedDate)).length,
    0,
  )
  const selectedRemainingDoses = Math.max(selectedTotalDoses - selectedCompletedDoses, 0)

  if (loading) {
    return (
      <div className="loading-screen">
        Loading your data…
      </div>
    )
  }

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-stripe" style={{ background: modal.tablet.color }} />
            <div className="modal-content">
              <div className="modal-title">{modal.tablet.name}</div>
              <div className="modal-subtitle">{modal.tablet.dose}</div>
              <div className="modal-scheduled">
                Scheduled: <span>{formatTime(modal.scheduledTime)}</span>
              </div>

              <div className="eyebrow">Actual time taken</div>
              <input
                autoFocus
                type="time"
                value={modal.takenAt}
                onChange={(event) => setModal((current) => ({ ...current, takenAt: event.target.value }))}
                className="time-field modal-time-field"
              />

              <div className="modal-quick-actions">
                {['now', '-15', '-30', '+15'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="chip-button"
                    onClick={() => {
                      const base = modal.takenAt || nowTime()
                      const [hours, minutes] = base.split(':').map(Number)
                      let totalMinutes = hours * 60 + minutes

                      if (label === 'now') totalMinutes = new Date().getHours() * 60 + new Date().getMinutes()
                      if (label === '-15') totalMinutes -= 15
                      if (label === '-30') totalMinutes -= 30
                      if (label === '+15') totalMinutes += 15

                      totalMinutes = ((totalMinutes % 1440) + 1440) % 1440
                      setModal((current) => ({
                        ...current,
                        takenAt: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`,
                      }))
                    }}
                  >
                    {label === 'now' ? 'Now' : `${label} min`}
                  </button>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: modal.tablet.color, color: '#0F1117' }}
                  onClick={confirmModal}
                >
                  Mark Taken
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="app-header">
        <div className="app-header-inner page-frame">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">💊</span>
            <div className="brand-copy">
              <div className="brand-title">MedLog</div>
              <div className="brand-subtitle">{displayName}</div>
            </div>
            <button type="button" className="icon-button" onClick={handleSignOut} title="Sign out">
              ↩
            </button>
          </div>

          <nav className="top-tabs" aria-label="MedLog sections">
            {[
              ['week', 'Week'],
              ['manage', 'Manage'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`tab-button ${view === value ? 'is-active' : ''}`}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="page-frame page-body">
        {view === 'week' && (
          <section className="week-section">
            <div className="date-strip" ref={stripRef}>
              {weekDays.map((day) => {
                const pct = getDayProgress(day)
                const isSelected = day === selectedDate
                const isToday = day === getTodayKey()
                const circleColor = pct === 100 ? '#6BCB77' : '#4ECDC4'

                return (
                  <button
                    key={day}
                    type="button"
                    data-date={day}
                    className={`date-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span className="date-card-label">{isToday ? 'Today' : shortDay(day)}</span>
                    <span className="date-card-number">{shortDate(day)}</span>
                    <svg width="34" height="34" viewBox="0 0 34 34" className="progress-ring" aria-hidden="true">
                      <circle cx="17" cy="17" r="13" fill="none" stroke="#1E2238" strokeWidth="3" />
                      <circle
                        cx="17"
                        cy="17"
                        r="13"
                        fill="none"
                        stroke={circleColor}
                        strokeWidth="3"
                        strokeDasharray={`${(pct / 100) * 81.68} 81.68`}
                        strokeLinecap="round"
                        transform="rotate(-90 17 17)"
                        style={{ opacity: pct > 0 ? 1 : 0.18 }}
                      />
                      <text x="17" y="20" textAnchor="middle" className="ring-label">
                        {pct}%
                      </text>
                    </svg>
                  </button>
                )
              })}
            </div>

            <div className="week-grid">
              <aside className="summary-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-title">{selectedDate === getTodayKey() ? 'Today' : formatDate(selectedDate)}</div>
                    <div className="panel-subtitle">Dose completion for the selected day</div>
                  </div>
                </div>

                <div className="progress-card">
                  <div className="progress-header-row">
                    <span className="muted-label">Progress</span>
                    <span className="progress-value" style={{ color: selectedProgress === 100 ? '#6BCB77' : '#4ECDC4' }}>
                      {selectedProgress}%
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${selectedProgress}%`,
                        background: selectedProgress === 100 ? '#6BCB77' : '#4ECDC4',
                      }}
                    />
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Scheduled</div>
                    <div className="stat-value">{selectedTotalDoses}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Completed</div>
                    <div className="stat-value">{selectedCompletedDoses}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Remaining</div>
                    <div className="stat-value">{selectedRemainingDoses}</div>
                  </div>
                </div>
              </aside>

              <section className="doses-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Medication schedule</div>
                    <div className="panel-subtitle">Tap a slot to mark it taken. Tap again to unmark it.</div>
                  </div>
                </div>

                {tablets.length === 0 ? (
                  <div className="empty-state">No tablets yet. Go to <b>Manage</b> to add some.</div>
                ) : (
                  <div className="dose-card-stack">
                    {tablets.map((tablet) => {
                      const doneCount = (tablet.times || []).filter((time) => isDone(tablet.id, time, selectedDate)).length
                      const totalCount = tablet.times?.length || 0

                      return (
                        <article key={tablet.id} className="med-card">
                          <div className="med-card-header">
                            <div className="pill-dot" style={{ background: tablet.color }} />
                            <div className="med-card-copy">
                              <div className="med-card-title">{tablet.name}</div>
                              <div className="med-card-dose">{tablet.dose}</div>
                            </div>
                            <div className="med-card-count" style={{ color: doneCount === totalCount && totalCount > 0 ? '#6BCB77' : '#6B7094' }}>
                              {doneCount}/{totalCount}
                            </div>
                          </div>

                          <div className="time-grid">
                            {(tablet.times || []).map((time) => {
                              const done = isDone(tablet.id, time, selectedDate)
                              const entry = getEntry(tablet.id, time, selectedDate)

                              return (
                                <button
                                  key={time}
                                  type="button"
                                  className={`dose-button ${done ? 'is-done' : ''}`}
                                  style={{
                                    borderColor: done ? tablet.color : '#1E2238',
                                    background: done ? `${tablet.color}22` : '#0F1117',
                                  }}
                                  onClick={() => openModal(tablet, time, selectedDate)}
                                >
                                  <span className="dose-icon" aria-hidden="true">🕐</span>
                                  <span className="dose-copy">
                                    <span className="dose-time">{formatTime(time)}</span>
                                    {done && entry?.taken_at && entry.taken_at !== time && (
                                      <span className="dose-meta">Taken at {formatTime(entry.taken_at)}</span>
                                    )}
                                  </span>
                                  <span className="dose-check" style={{ color: done ? tablet.color : '#3A3D55' }}>
                                    {done ? '✓' : '○'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}

        {view === 'manage' && (
          <section className="manage-grid">
            <div className="manage-form-card">
              <div className="section-kicker">Add tablet</div>
              <div className="manage-title">Create a medication schedule</div>
              <div className="manage-subtitle">Set the label, dose, color, and one or more reminder times.</div>

              <div className="form-stack">
                <input
                  className="text-field"
                  placeholder="Tablet name (e.g. Vitamin D)"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <input
                  className="text-field"
                  placeholder="Dose (e.g. 500mg)"
                  value={newDose}
                  onChange={(event) => setNewDose(event.target.value)}
                />

                <div>
                  <div className="eyebrow">Color</div>
                  <div className="color-picker-row">
                    {PILL_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${newColor === color ? 'is-selected' : ''}`}
                        style={{ background: color, boxShadow: newColor === color ? `0 0 0 2px ${color}` : 'none' }}
                        onClick={() => setNewColor(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">Schedule times</div>
                  <div className="schedule-list">
                    {newTimes.map((timeValue, index) => (
                      <div key={`${timeValue}-${index}`} className="schedule-card">
                        <div className="schedule-card-header">
                          <input
                            type="time"
                            value={timeValue}
                            className="time-field"
                            onChange={(event) => {
                              const value = event.target.value
                              setNewTimes((current) => current.map((timeItem, timeIndex) => (timeIndex === index ? value : timeItem)))
                            }}
                          />
                          {newTimes.length > 1 && (
                            <button
                              type="button"
                              className="danger-link"
                              onClick={() => setNewTimes((current) => current.filter((_, timeIndex) => timeIndex !== index))}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="preset-grid">
                          {PRESET_TIMES.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`chip-button ${timeValue === preset ? 'is-active' : ''}`}
                              onClick={() => {
                                setNewTimes((current) => current.map((timeItem, timeIndex) => (timeIndex === index ? preset : timeItem)))
                              }}
                            >
                              {formatTime(preset)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={() => setNewTimes((current) => [...current, '08:00'])}>
                    + Add another time
                  </button>
                  <button type="button" className="primary-button" onClick={addTablet}>
                    + Add Tablet
                  </button>
                </div>
              </div>
            </div>

            <div className="manage-list-card">
              <div className="section-kicker">Your tablets</div>
              <div className="manage-title">Current medication list</div>
              <div className="manage-subtitle">Review and remove schedules from here.</div>

              {tablets.length === 0 ? (
                <div className="empty-state">No tablets added yet.</div>
              ) : (
                <div className="manage-list-grid">
                  {tablets.map((tablet) => (
                    <article key={tablet.id} className="manage-item-card">
                      <div className="manage-item-top">
                        <div className="pill-dot" style={{ background: tablet.color }} />
                        <div className="manage-item-copy">
                          <div className="med-card-title">{tablet.name}</div>
                          <div className="med-card-dose">{tablet.dose}</div>
                        </div>
                        <button type="button" className="danger-link icon-only" onClick={() => removeTablet(tablet.id)}>
                          ✕
                        </button>
                      </div>

                      <div className="tag-row">
                        {(tablet.times || []).map((timeValue) => (
                          <span
                            key={timeValue}
                            className="time-tag"
                            style={{ borderColor: `${tablet.color}55`, color: tablet.color, background: `${tablet.color}14` }}
                          >
                            {formatTime(timeValue)}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
