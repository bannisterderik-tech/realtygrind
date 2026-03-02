import { useState, useEffect, useCallback } from 'react'

const STEPS = [
  { id: 'stats',       title: 'Your Dashboard',       body: 'Track your daily progress, monthly stats, streaks, and XP — all at a glance.', placement: 'bottom' },
  { id: 'habits',      title: 'Daily Habits',          body: 'Check off tasks each day to build streaks and earn XP. Consistency compounds.', placement: 'bottom' },
  { id: 'listings',    title: 'Listings Tracker',       body: 'Add your active listings and track them through status changes — from active to pending to closed.', placement: 'top' },
  { id: 'pipeline',    title: 'Transaction Pipeline',   body: 'Log offers, pending deals, and closings. Each stage earns XP and tracks your volume.', placement: 'top' },
  { id: 'teams-nav',   title: 'Teams',                  body: 'Join or create a team to collaborate with your brokerage. Team leaders can coach and track standups.', placement: 'bottom' },
  { id: 'profile-nav', title: 'Profile & Goals',        body: 'Set your monthly closing goals, customize your habits, and update your bio.', placement: 'bottom' },
]

function getPosition(el, placement) {
  const rect = el.getBoundingClientRect()
  const scrollY = window.scrollY
  const scrollX = window.scrollX
  const GAP = 14

  if (placement === 'bottom') {
    return {
      top: rect.bottom + scrollY + GAP,
      left: rect.left + scrollX + rect.width / 2,
      arrowSide: 'top',
    }
  }
  // top
  return {
    top: rect.top + scrollY - GAP,
    left: rect.left + scrollX + rect.width / 2,
    arrowSide: 'bottom',
  }
}

export default function WalkthroughTour({ active, onComplete }) {
  const [step, setStep] = useState(0)
  const [pos, setPos] = useState(null)
  const [targetRect, setTargetRect] = useState(null)

  const positionTooltip = useCallback(() => {
    if (!active) return
    const s = STEPS[step]
    if (!s) return
    const el = document.querySelector(`[data-tour="${s.id}"]`)
    if (!el || el.offsetParent === null) {
      // Element hidden (e.g. mobile) — skip step
      if (step < STEPS.length - 1) setStep(step + 1)
      else onComplete()
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height })
      setPos(getPosition(el, s.placement))
    }, 350)
  }, [active, step, onComplete])

  useEffect(() => {
    if (active) positionTooltip()
  }, [active, step, positionTooltip])

  // Reposition on resize
  useEffect(() => {
    if (!active) return
    const h = () => positionTooltip()
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [active, positionTooltip])

  function goNext() {
    if (step >= STEPS.length - 1) onComplete()
    else setStep(s => s + 1)
  }

  if (!active || !pos || !targetRect) return null

  const s = STEPS[step]
  const isTop = s.placement === 'top'

  return (
    <>
      {/* Backdrop */}
      <div onClick={onComplete} style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(0,0,0,0.4)',
        cursor: 'pointer',
      }}/>

      {/* Spotlight cutout */}
      <div style={{
        position: 'absolute',
        top: targetRect.top - 6,
        left: targetRect.left - 6,
        width: targetRect.width + 12,
        height: targetRect.height + 12,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
        zIndex: 9991,
        pointerEvents: 'none',
      }}/>

      {/* Tooltip */}
      <div style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        transform: isTop ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        zIndex: 9992,
        background: 'var(--surface)',
        border: '1px solid var(--b2)',
        borderRadius: 14,
        padding: '18px 22px',
        maxWidth: 340,
        width: 'max-content',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        fontFamily: "'Poppins', sans-serif",
      }}>
        {/* Arrow */}
        <div style={{
          position: 'absolute',
          [pos.arrowSide]: -7,
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: 14, height: 14,
          background: 'var(--surface)',
          borderTop: pos.arrowSide === 'top' ? '1px solid var(--b2)' : 'none',
          borderLeft: pos.arrowSide === 'top' ? '1px solid var(--b2)' : 'none',
          borderBottom: pos.arrowSide === 'bottom' ? '1px solid var(--b2)' : 'none',
          borderRight: pos.arrowSide === 'bottom' ? '1px solid var(--b2)' : 'none',
        }}/>

        {/* Step counter */}
        <div style={{ fontSize: 10, color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 5 }}>
          {step + 1} of {STEPS.length}
        </div>

        {/* Title */}
        <div className="serif" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
          {s.title}
        </div>

        {/* Body */}
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
          {s.body}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onComplete} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: 12, cursor: 'pointer', padding: '4px 0',
          }}>Skip tour</button>
          <button onClick={goNext} style={{
            background: '#d97706', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', transition: 'all .15s',
          }}>
            {step >= STEPS.length - 1 ? 'Got it!' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}
