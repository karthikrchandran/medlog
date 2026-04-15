import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

function getTodayKey() { return new Date().toISOString().split('T')[0] }
function getWeekDays() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}
function shortDay(s) { return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }) }
function shortDate(s) { return new Date(s + 'T00:00:00').getDate() }
function formatDate(s) { return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function nowTime() {
  const n = new Date()
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`
}

const PILL_COLORS = ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#845EF7','#F08030','#E64980','#74C0FC']
const PRESET_TIMES = ['06:00','07:00','08:00','09:00','12:00','13:00','14:00','18:00','20:00','21:00','22:00']

export default function App({ user }) {
  const [tablets, setTablets] = useState([])
  const [log, setLog] = useState({})       // key -> { id, done, taken_at }
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

  // ── Load tablets for this user ─────────────────────────────────────────────
  useEffect(() => {
    loadAll()
  }, [user])

  async function loadAll() {
    setLoading(true)
    const [{ data: tabs }, { data: logs }] = await Promise.all([
      supabase.from('tablets').select('*').order('created_at'),
      supabase.from('dose_logs').select('*')
    ])
    setTablets(tabs || [])
    // Index logs by composite key
    const logMap = {}
    for (const row of logs || []) {
      logMap[`${row.log_date}__${row.tablet_id}__${row.scheduled_time}`] = row
    }
    setLog(logMap)
    setLoading(false)
  }

  useEffect(() => {
    if (stripRef.current) {
      const btn = stripRef.current.querySelector(`[data-date="${selectedDate}"]`)
      if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [selectedDate, view])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  function logKey(tabletId, scheduledTime, date) {
    return `${date}__${tabletId}__${scheduledTime}`
  }
  function getEntry(tabletId, scheduledTime, date) {
    return log[logKey(tabletId, scheduledTime, date)] || null
  }
  function isDone(tabletId, scheduledTime, date) {
    return getEntry(tabletId, scheduledTime, date)?.done || false
  }

  // ── Tap slot — open modal or unmark ────────────────────────────────────────
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
    setLog(prev => ({ ...prev, [key]: { ...prev[key], done: false } }))
    if (rowId) await supabase.from('dose_logs').update({ done: false }).eq('id', rowId)
    showToast('Unmarked')
  }

  async function confirmModal() {
    if (!modal) return
    const { tablet, scheduledTime, date, takenAt } = modal
    const key = logKey(tablet.id, scheduledTime, date)
    const existing = getEntry(tablet.id, scheduledTime, date)

    if (existing?.id) {
      // Update existing row
      const { data } = await supabase.from('dose_logs')
        .update({ done: true, taken_at: takenAt })
        .eq('id', existing.id)
        .select().single()
      setLog(prev => ({ ...prev, [key]: data }))
    } else {
      // Insert new row
      const { data } = await supabase.from('dose_logs').insert({
        user_id: user.id,
        tablet_id: tablet.id,
        log_date: date,
        scheduled_time: scheduledTime,
        taken_at: takenAt,
        done: true
      }).select().single()
      if (data) setLog(prev => ({ ...prev, [key]: data }))
    }
    showToast(`Logged at ${formatTime(takenAt)} ✓`)
    setModal(null)
  }

  // ── Tablet CRUD ────────────────────────────────────────────────────────────
  async function addTablet() {
    if (!newName.trim() || !newTimes.length) return
    const { data, error } = await supabase.from('tablets').insert({
      user_id: user.id,
      name: newName.trim(),
      dose: newDose.trim() || '1 tablet',
      color: newColor,
      times: [...newTimes].sort()
    }).select().single()
    if (error) return showToast('Error saving tablet')
    setTablets(prev => [...prev, data])
    setNewName(''); setNewDose(''); setNewTimes(['08:00']); setNewColor(PILL_COLORS[1])
    showToast('Tablet added!')
  }

  async function removeTablet(id) {
    await supabase.from('tablets').delete().eq('id', id)
    setTablets(prev => prev.filter(t => t.id !== id))
    showToast('Removed')
  }

  function getDayProgress(dateKey) {
    const total = tablets.reduce((a, t) => a + (t.times?.length || 0), 0)
    if (!total) return 0
    const done = tablets.reduce((a, t) =>
      a + (t.times || []).filter(s => isDone(t.id, s, dateKey)).length, 0)
    return Math.round((done / total) * 100)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const selProgress = getDayProgress(selectedDate)
  const displayName = user.user_metadata?.full_name || user.email

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ECDC4', fontFamily: 'Georgia, serif', fontSize: 18 }}>
      Loading your data…
    </div>
  )

  return (
    <div style={S.root}>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* CONFIRM MODAL */}
      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.modalStripe, background: modal.tablet.color }} />
            <div style={S.modalBody}>
              <div style={S.modalTabletName}>{modal.tablet.name}</div>
              <div style={S.modalDose}>{modal.tablet.dose}</div>
              <div style={S.modalScheduled}>
                Scheduled: <span style={{ color: '#4ECDC4' }}>{formatTime(modal.scheduledTime)}</span>
              </div>
              <div style={S.modalLabel}>Actual time taken</div>
              <input type="time" value={modal.takenAt}
                onChange={e => setModal(m => ({ ...m, takenAt: e.target.value }))}
                style={S.modalTimeInput} autoFocus />
              <div style={S.quickRow}>
                {['now', '-15', '-30', '+15'].map(label => (
                  <button key={label} style={S.quickBtn} onClick={() => {
                    let base = modal.takenAt || nowTime()
                    const [h, m] = base.split(':').map(Number)
                    let mins = h * 60 + m
                    if (label === 'now') mins = new Date().getHours() * 60 + new Date().getMinutes()
                    else if (label === '-15') mins -= 15
                    else if (label === '-30') mins -= 30
                    else if (label === '+15') mins += 15
                    mins = ((mins % 1440) + 1440) % 1440
                    setModal(mo => ({ ...mo, takenAt: `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}` }))
                  }}>{label === 'now' ? 'Now' : label + ' min'}</button>
                ))}
              </div>
              <div style={S.modalActions}>
                <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
                <button style={{ ...S.confirmBtn, background: modal.tablet.color }} onClick={confirmModal}>
                  Mark Taken
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerTop}>
          <span style={S.logo}>💊</span>
          <div style={{ flex: 1 }}>
            <div style={S.title}>MedLog</div>
            <div style={S.subtitle}>{displayName}</div>
          </div>
          <button style={S.signOutBtn} onClick={handleSignOut} title="Sign out">↩</button>
        </div>
        <nav style={S.nav}>
          {[['week','Week'],['manage','Manage']].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ ...S.navBtn, ...(view === v ? S.navActive : {}) }}>{l}</button>
          ))}
        </nav>
      </div>

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div>
          <div style={S.stripWrap} ref={stripRef}>
            {weekDays.map(day => {
              const pct = getDayProgress(day)
              const isSel = day === selectedDate
              const isT = day === getTodayKey()
              return (
                <button key={day} data-date={day} onClick={() => setSelectedDate(day)}
                  style={{ ...S.dayChip, ...(isSel ? S.dayChipSel : {}) }}>
                  <span style={{ ...S.dayName, color: isSel ? '#4ECDC4' : '#6B7094' }}>
                    {isT ? 'Today' : shortDay(day)}
                  </span>
                  <span style={{ ...S.dayNum, color: isSel ? '#fff' : '#aaa' }}>{shortDate(day)}</span>
                  <svg width="28" height="28" style={{ margin: '4px auto 0' }}>
                    <circle cx="14" cy="14" r="11" fill="none" stroke="#1E2238" strokeWidth="3"/>
                    <circle cx="14" cy="14" r="11" fill="none"
                      stroke={pct === 100 ? '#6BCB77' : '#4ECDC4'} strokeWidth="3"
                      strokeDasharray={`${(pct/100)*69.1} 69.1`} strokeLinecap="round"
                      transform="rotate(-90 14 14)" style={{ opacity: pct > 0 ? 1 : 0.2 }}/>
                    <text x="14" y="18" textAnchor="middle"
                      style={{ fontSize: 8, fill: pct === 100 ? '#6BCB77' : '#aaa', fontFamily: 'sans-serif' }}>
                      {pct}%
                    </text>
                  </svg>
                </button>
              )
            })}
          </div>

          <div style={S.content}>
            <div style={S.dayHeading}>
              {selectedDate === getTodayKey() ? 'Today' : formatDate(selectedDate)}
            </div>
            <div style={S.progressBox}>
              <div style={S.progressTop}>
                <span style={S.progressLabel}>Progress</span>
                <span style={{ ...S.progressPct, color: selProgress === 100 ? '#6BCB77' : '#4ECDC4' }}>
                  {selProgress}%
                </span>
              </div>
              <div style={S.progressTrack}>
                <div style={{ ...S.progressFill, width: `${selProgress}%`, background: selProgress === 100 ? '#6BCB77' : '#4ECDC4' }} />
              </div>
            </div>

            {tablets.length === 0
              ? <div style={S.empty}>No tablets yet. Go to <b>Manage</b> to add some.</div>
              : tablets.map(tablet => {
                  const doneCount = (tablet.times||[]).filter(t => isDone(tablet.id, t, selectedDate)).length
                  const totalCount = tablet.times?.length || 0
                  return (
                    <div key={tablet.id} style={S.card}>
                      <div style={S.cardHeader}>
                        <div style={{ ...S.pillDot, background: tablet.color }} />
                        <div style={{ flex: 1 }}>
                          <div style={S.cardName}>{tablet.name}</div>
                          <div style={S.cardDose}>{tablet.dose}</div>
                        </div>
                        <span style={{ ...S.doseCount, color: doneCount === totalCount && totalCount > 0 ? '#6BCB77' : '#6B7094' }}>
                          {doneCount}/{totalCount}
                        </span>
                      </div>
                      <div style={S.timeSlots}>
                        {(tablet.times||[]).map(time => {
                          const done = isDone(tablet.id, time, selectedDate)
                          const entry = getEntry(tablet.id, time, selectedDate)
                          return (
                            <button key={time} onClick={() => openModal(tablet, time, selectedDate)}
                              style={{ ...S.timeBtn, borderColor: done ? tablet.color : '#1E2238', background: done ? tablet.color+'22' : '#0F1117' }}>
                              <span style={S.timeIcon}>🕐</span>
                              <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ ...S.timeText, color: done ? '#fff' : '#aaa' }}>{formatTime(time)}</div>
                                {done && entry?.taken_at && entry.taken_at !== time && (
                                  <div style={S.takenAtLabel}>taken at {formatTime(entry.taken_at)}</div>
                                )}
                              </div>
                              <span style={{ ...S.check, color: done ? tablet.color : '#333' }}>
                                {done ? '✓' : '○'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
              })}
          </div>
        </div>
      )}

      {/* MANAGE */}
      {view === 'manage' && (
        <div style={S.content}>
          <div style={S.sectionTitle}>Add Tablet</div>
          <div style={S.form}>
            <input style={S.input} placeholder="Tablet name (e.g. Vitamin D)"
              value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={S.input} placeholder="Dose (e.g. 500mg)"
              value={newDose} onChange={e => setNewDose(e.target.value)} />
            <div style={S.fieldLabel}>Color</div>
            <div style={S.colorRow}>
              {PILL_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  style={{ ...S.colorDot, background: c, border: newColor===c ? '3px solid #fff' : '3px solid transparent', boxShadow: newColor===c ? `0 0 0 2px ${c}` : 'none' }} />
              ))}
            </div>
            <div style={S.fieldLabel}>Schedule Times</div>
            {newTimes.map((t, idx) => (
              <div key={idx} style={S.timeRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="time" value={t} onChange={e => setNewTimes(p => p.map((x,i)=>i===idx?e.target.value:x))} style={S.timeInput} />
                  {newTimes.length > 1 && <button style={S.removeTimeBtn} onClick={() => setNewTimes(p=>p.filter((_,i)=>i!==idx))}>✕</button>}
                </div>
                <div style={S.presetScroll}>
                  {PRESET_TIMES.map(p => (
                    <button key={p} onClick={() => setNewTimes(arr => arr.map((x,i)=>i===idx?p:x))}
                      style={{ ...S.presetChip, ...(t===p ? S.presetChipActive : {}) }}>{formatTime(p)}</button>
                  ))}
                </div>
              </div>
            ))}
            <button style={S.addTimeBtn} onClick={() => setNewTimes(p=>[...p,'08:00'])}>+ Add another time</button>
            <button style={S.addBtn} onClick={addTablet}>+ Add Tablet</button>
          </div>

          <div style={S.sectionTitle}>Your Tablets</div>
          {tablets.length === 0 && <div style={S.empty}>No tablets added yet.</div>}
          {tablets.map(t => (
            <div key={t.id} style={S.manageCard}>
              <div style={{ ...S.pillDot, background: t.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={S.cardName}>{t.name}</div>
                <div style={S.cardDose}>{t.dose}</div>
                <div style={S.timeTags}>
                  {(t.times||[]).map(tm => (
                    <span key={tm} style={{ ...S.timeTag, borderColor: t.color, color: t.color }}>{formatTime(tm)}</span>
                  ))}
                </div>
              </div>
              <button style={S.removeBtn} onClick={() => removeTablet(t.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const S = {
  root: { minHeight:'100vh', background:'#0F1117', color:'#E8EAF6', fontFamily:"'Georgia','Times New Roman',serif", maxWidth:480, margin:'0 auto', paddingBottom:40 },
  toast: { position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#4ECDC4', color:'#0F1117', padding:'10px 24px', borderRadius:24, fontWeight:'bold', fontSize:14, zIndex:2000, boxShadow:'0 4px 20px rgba(78,205,196,0.4)', letterSpacing:0.5, whiteSpace:'nowrap' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  modalBox: { width:'100%', maxWidth:480, background:'#16192A', borderRadius:'20px 20px 0 0', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,0.5)' },
  modalStripe: { height:5 },
  modalBody: { padding:'20px 20px 36px' },
  modalTabletName: { fontSize:20, fontWeight:'bold', color:'#fff', marginBottom:2 },
  modalDose: { fontSize:13, color:'#6B7094', marginBottom:12 },
  modalScheduled: { fontSize:13, color:'#aaa', marginBottom:16 },
  modalLabel: { fontSize:11, letterSpacing:2, color:'#6B7094', textTransform:'uppercase', marginBottom:8 },
  modalTimeInput: { width:'100%', background:'#0F1117', border:'1.5px solid #2A2D45', borderRadius:12, padding:'14px 16px', color:'#4ECDC4', fontSize:28, fontFamily:'inherit', outline:'none', letterSpacing:3, marginBottom:14, boxSizing:'border-box' },
  quickRow: { display:'flex', gap:8, marginBottom:20 },
  quickBtn: { flex:1, background:'#1E2238', border:'1px solid #2A2D45', borderRadius:10, color:'#aaa', fontSize:12, padding:'8px 4px', cursor:'pointer', fontFamily:'inherit' },
  modalActions: { display:'flex', gap:10 },
  cancelBtn: { flex:1, background:'#1E2238', border:'none', borderRadius:12, color:'#aaa', fontSize:15, padding:'14px 0', cursor:'pointer', fontFamily:'inherit' },
  confirmBtn: { flex:2, border:'none', borderRadius:12, color:'#0F1117', fontSize:15, fontWeight:'bold', padding:'14px 0', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.5 },
  header: { background:'#16192A', padding:'24px 20px 0', borderBottom:'1px solid #1E2238' },
  headerTop: { display:'flex', alignItems:'center', gap:14, marginBottom:20 },
  logo: { fontSize:36 },
  title: { fontSize:26, fontWeight:'bold', letterSpacing:1, color:'#fff' },
  subtitle: { fontSize:12, color:'#6B7094', letterSpacing:0.5 },
  signOutBtn: { background:'#1E2238', border:'1px solid #2A2D45', color:'#6B7094', borderRadius:8, padding:'6px 10px', fontSize:16, cursor:'pointer' },
  nav: { display:'flex' },
  navBtn: { flex:1, padding:'12px 0', background:'none', border:'none', color:'#6B7094', fontSize:14, cursor:'pointer', letterSpacing:1, fontFamily:'inherit', borderBottom:'2px solid transparent', transition:'all 0.2s' },
  navActive: { color:'#4ECDC4', borderBottom:'2px solid #4ECDC4', fontWeight:'bold' },
  stripWrap: { display:'flex', overflowX:'auto', gap:8, padding:'16px 14px', background:'#16192A', borderBottom:'1px solid #1E2238', scrollbarWidth:'none' },
  dayChip: { display:'flex', flexDirection:'column', alignItems:'center', minWidth:64, padding:'10px 8px', borderRadius:14, border:'1.5px solid #1E2238', background:'#0F1117', cursor:'pointer', transition:'all 0.2s', flexShrink:0 },
  dayChipSel: { border:'1.5px solid #4ECDC4', background:'#4ECDC411' },
  dayName: { fontSize:11, letterSpacing:1, textTransform:'uppercase', marginBottom:4 },
  dayNum: { fontSize:20, fontWeight:'bold' },
  content: { padding:'16px 16px' },
  dayHeading: { fontSize:18, fontWeight:'bold', color:'#fff', marginBottom:14 },
  progressBox: { background:'#16192A', borderRadius:14, padding:'14px 16px', marginBottom:16, border:'1px solid #1E2238' },
  progressTop: { display:'flex', justifyContent:'space-between', marginBottom:8 },
  progressLabel: { fontSize:13, color:'#6B7094', letterSpacing:1 },
  progressPct: { fontSize:15, fontWeight:'bold' },
  progressTrack: { height:8, background:'#1E2238', borderRadius:4, overflow:'hidden' },
  progressFill: { height:'100%', borderRadius:4, transition:'width 0.4s ease' },
  card: { background:'#16192A', borderRadius:16, padding:16, marginBottom:14, border:'1px solid #1E2238' },
  cardHeader: { display:'flex', alignItems:'center', gap:12, marginBottom:12 },
  pillDot: { width:20, height:20, borderRadius:'50%' },
  cardName: { fontSize:16, fontWeight:'bold', color:'#fff' },
  cardDose: { fontSize:12, color:'#6B7094', marginTop:2 },
  doseCount: { fontSize:13, fontWeight:'bold' },
  timeSlots: { display:'flex', flexDirection:'column', gap:8 },
  timeBtn: { border:'1.5px solid', borderRadius:10, padding:'11px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all 0.2s', fontFamily:'inherit', width:'100%', boxSizing:'border-box' },
  timeIcon: { fontSize:15 },
  timeText: { fontSize:15 },
  takenAtLabel: { fontSize:11, color:'#6B7094', marginTop:2 },
  check: { fontSize:16, fontWeight:'bold' },
  empty: { color:'#6B7094', textAlign:'center', padding:40, fontSize:15 },
  sectionTitle: { fontSize:12, letterSpacing:2, color:'#6B7094', textTransform:'uppercase', marginBottom:12, marginTop:8 },
  form: { background:'#16192A', borderRadius:16, padding:16, marginBottom:20, border:'1px solid #1E2238', display:'flex', flexDirection:'column', gap:12 },
  fieldLabel: { fontSize:11, color:'#6B7094', letterSpacing:2, textTransform:'uppercase' },
  input: { background:'#0F1117', border:'1.5px solid #1E2238', borderRadius:10, padding:'12px 14px', color:'#E8EAF6', fontSize:15, fontFamily:'inherit', outline:'none' },
  colorRow: { display:'flex', gap:10, flexWrap:'wrap' },
  colorDot: { width:28, height:28, borderRadius:'50%', cursor:'pointer', transition:'all 0.2s' },
  timeRow: { display:'flex', flexDirection:'column', gap:8, background:'#0F1117', borderRadius:10, padding:10 },
  timeInput: { flex:1, background:'#1E2238', border:'1.5px solid #2A2D45', borderRadius:8, padding:'10px 12px', color:'#4ECDC4', fontSize:18, fontFamily:'inherit', outline:'none', letterSpacing:2 },
  presetScroll: { display:'flex', gap:6, flexWrap:'wrap' },
  presetChip: { background:'#1E2238', border:'1px solid #2A2D45', borderRadius:20, padding:'4px 10px', color:'#aaa', fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' },
  presetChipActive: { background:'#4ECDC4', color:'#0F1117', border:'1px solid #4ECDC4', fontWeight:'bold' },
  removeTimeBtn: { background:'none', border:'none', color:'#FF6B6B', fontSize:16, cursor:'pointer', padding:'4px 8px' },
  addTimeBtn: { background:'none', border:'1.5px dashed #2A2D45', borderRadius:10, color:'#6B7094', padding:'10px 0', cursor:'pointer', fontSize:14, fontFamily:'inherit' },
  addBtn: { background:'#4ECDC4', color:'#0F1117', border:'none', borderRadius:10, padding:'13px 0', fontSize:15, fontWeight:'bold', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.5 },
  manageCard: { background:'#16192A', borderRadius:12, padding:'14px 16px', marginBottom:10, border:'1px solid #1E2238', display:'flex', alignItems:'flex-start', gap:12 },
  timeTags: { display:'flex', flexWrap:'wrap', gap:6, marginTop:6 },
  timeTag: { border:'1px solid', borderRadius:12, padding:'2px 8px', fontSize:12, fontWeight:'bold' },
  removeBtn: { background:'none', border:'none', color:'#FF6B6B', fontSize:16, cursor:'pointer', padding:'4px 8px' },
}
