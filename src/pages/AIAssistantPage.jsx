import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Loader } from '../design'
import { isActiveBilling, isTeamMember, isPlatformAdmin } from '../lib/plans'

// Get a fresh access token (refreshes if expired)
async function getFreshToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const expiresAt = session.expires_at ?? 0
    if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
      const { data } = await supabase.auth.refreshSession()
      return data.session?.access_token || null
    }
    return session.access_token
  }
  const { data } = await supabase.auth.refreshSession()
  return data.session?.access_token || null
}

const QUICK_ACTIONS = [
  { label: 'Analyze My Listings', prompt: 'Analyze my current active listings and suggest strategies to reduce days on market and maximize sale price for each one.' },
  { label: 'Review My Pipeline', prompt: 'Review my current pipeline — offers made, pending deals, and recent closings. What should I focus on next?' },
  { label: 'Goal Progress Check', prompt: 'How am I tracking against my goals this month? Where are the gaps and what specific actions should I take to catch up?' },
  { label: 'Buyer Search Strategies', prompt: 'Review my buyer rep agreements — their search criteria, location preferences, must-haves, nice-to-haves, and timelines. Suggest search refinements, areas to expand into, and strategies to compete in the current market for each buyer.' },
  { label: 'Budget Clarification Call', prompt: 'Review my buyer rep agreements\' financial details — pre-approval amounts, comfortable payment ranges, and down payments. For each active buyer, give me talking points for a budget clarification call: flag any red flags or mismatches between their pre-approval and search criteria, suggest questions to ask, and recommend whether to push for an updated pre-approval letter.' },
  { label: 'Prospecting Tips', prompt: 'Based on my activity patterns this month, give me specific prospecting recommendations and time-blocking suggestions.' },
  { label: 'Find Comps', prompt: 'Help me analyze comparable sales for my active listings. What pricing adjustments should I consider based on market trends?' },
]

// Escape HTML entities to prevent XSS
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Basic markdown: **bold**, # headers, - bullets, `code`
function renderMarkdown(text) {
  if (!text) return ''
  // Escape HTML first to prevent XSS, then apply markdown transforms
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px;font-size:14px;font-weight:700;color:var(--text)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:14px 0 6px;font-size:16px;font-weight:700;color:var(--text)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:16px 0 8px;font-size:18px;font-weight:700;color:var(--text)">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--b1);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px;position:relative"><span style="position:absolute;left:4px">&#8226;</span>$1</div>')
    .replace(/^\d+\. (.+)$/gm, (_, content, offset, str) => {
      const before = str.slice(0, offset)
      const num = (before.match(/^\d+\. /gm) || []).length + 1
      return `<div style="padding-left:20px;position:relative"><span style="position:absolute;left:0;color:var(--muted);font-size:12px">${num}.</span>${content}</div>`
    })
    .replace(/\n/g, '<br/>')
}

export default function AIAssistantPage({ onNavigate, theme, onToggleTheme }) {
  const { user, profile } = useAuth()
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [streaming, setStreaming]      = useState(false)
  const [creditsUsed, setCreditsUsed] = useState(0)
  const creditsUsedRef = useRef(0); creditsUsedRef.current = creditsUsed
  const [creditsLimit, setCreditsLimit] = useState(0)
  const [effectivePlan, setEffectivePlan] = useState('')
  const [gateError, setGateError]     = useState(null)  // 'subscription_required' | 'disabled_by_team' | 'credits_exhausted'
  const [loadingCredits, setLoadingCredits] = useState(true)
  const abortRef     = useRef(null)
  const scrollRef    = useRef(null)
  const textareaRef  = useRef(null)
  const messagesRef  = useRef(messages)
  const sendingRef   = useRef(false) // double-submit guard
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  // Fetch credit info when user is available — AbortController prevents setState after unmount
  useEffect(() => {
    if (!user?.id) return
    const controller = new AbortController()
    fetchCredits(controller.signal)
    return () => controller.abort()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchCredits(signal) {
    if (!supabase) return
    try {
      const token = await getFreshToken()
      if (!token || signal?.aborted) return
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'GET',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          signal,
        }
      )
      const data = await resp.json()
      if (signal?.aborted) return
      if (resp.ok) {
        setCreditsUsed(data.credits_used || 0)
        setCreditsLimit(data.credits_limit === -1 ? -1 : (data.credits_limit || 0))
        setEffectivePlan(data.plan || '')
        setGateError(null)
      } else {
        if (data.error === 'subscription_required' || data.error === 'disabled_by_team') {
          setGateError(data.error)
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('fetchCredits error:', err)
    } finally {
      if (!signal?.aborted) setLoadingCredits(false)
    }
  }

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || sendingRef.current) return
    sendingRef.current = true
    const userMsg = { role: 'user', content: text.trim() }
    const newMessages = [...messagesRef.current, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setGateError(null)

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = await getFreshToken()
      if (!token) throw new Error('Not authenticated')

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        }
      )

      // Handle error responses (non-streaming)
      if (!resp.ok) {
        let errData = {}
        try { errData = await resp.json() } catch { /* non-JSON error */ }
        if (errData.error === 'credits_exhausted') {
          setGateError('credits_exhausted')
          setCreditsUsed(errData.used || creditsUsedRef.current)
          setMessages(messagesRef.current)
          setStreaming(false)
          return
        }
        const errMsg = errData.message || errData.error || `HTTP ${resp.status}`
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${errMsg}` }])
        setStreaming(false)
        return
      }

      // Parse SSE stream — throttle UI updates to avoid excessive re-renders
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''
      let lastUpdate = 0
      const THROTTLE_MS = 50

      setMessages([...newMessages, { role: 'assistant', content: '' }])

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                assistantText += parsed.delta.text
                const now = Date.now()
                if (now - lastUpdate >= THROTTLE_MS) {
                  setMessages([...newMessages, { role: 'assistant', content: assistantText }])
                  lastUpdate = now
                }
              }
            } catch {
              // Skip non-JSON SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Finalize — always commit final text
      if (assistantText) {
        setMessages([...newMessages, { role: 'assistant', content: assistantText }])
      }
      setCreditsUsed(prev => prev + 1)
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled — keep partial response
      } else {
        console.error('sendMessage error:', err)
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message || 'Something went wrong. Please try again.'}` }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      sendingRef.current = false
    }
  }, [])

  function stopStreaming() {
    if (abortRef.current) abortRef.current.abort()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
  }

  // Gate checks
  const hasBilling = isPlatformAdmin(profile) || isActiveBilling(profile?.billing_status) || isTeamMember(profile, user?.id)
  const isDisabledByTeam = profile?.teams?.team_prefs?.ai_tools?.assistant_enabled === false

  if (loadingCredits) {
    return <div className="page-inner" style={{ maxWidth: 760 }}><Loader /></div>
  }

  // Credit display
  const isUnlimited = creditsLimit === -1
  const creditText = isUnlimited ? `${creditsUsed} used · ∞ credits` : `${creditsUsed}/${creditsLimit} credits`
  const creditPct = isUnlimited ? 0 : (creditsLimit > 0 ? (creditsUsed / creditsLimit) * 100 : 100)

  const nextPlan = effectivePlan === 'solo' ? 'Team' : effectivePlan === 'team' ? 'Brokerage' : null

  return (
    <>
      <div className="page-inner" style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', padding: '0 16px' }}>

          {/* ── Header ───────────────────────────────────── */}
          <div style={{ padding: '20px 0 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <button onClick={() => onNavigate('directory')} style={{
                background: 'none', border: '1px solid var(--b2)', borderRadius: 8,
                color: 'var(--muted)', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
              }}>
                ← Tools
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <span style={{ fontSize: 24 }}>🤖</span>
                <div className="serif" style={{ fontSize: 24, color: 'var(--text)' }}>AI Assistant</div>
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                  background: 'rgba(139,92,246,.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,.25)',
                  fontFamily: "'JetBrains Mono',monospace", letterSpacing: .5,
                }}>BETA</span>
              </div>
              {/* Credit counter */}
              {hasBilling && !isDisabledByTeam && (
                <div style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 20,
                  background: creditPct >= 90 ? 'rgba(220,38,38,.08)' : 'rgba(139,92,246,.08)',
                  color: creditPct >= 90 ? '#dc2626' : '#8b5cf6',
                  border: `1px solid ${creditPct >= 90 ? 'rgba(220,38,38,.25)' : 'rgba(139,92,246,.25)'}`,
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {creditText}
                </div>
              )}
            </div>
          </div>

          {/* ── Gate: Not subscribed ─────────────────────── */}
          {(!hasBilling || gateError === 'subscription_required') && (
            <div className="card" style={{ padding: 40, textAlign: 'center', margin: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
                AI Assistant requires a subscription
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
                Subscribe to Solo, Team, or Brokerage to unlock AI-powered real estate coaching and listing analysis.
              </div>
              <button className="btn-gold" style={{ padding: '12px 28px', fontSize: 14 }}
                onClick={() => onNavigate('billing')}>
                View Plans
              </button>
            </div>
          )}

          {/* ── Gate: Disabled by team ───────────────────── */}
          {hasBilling && (isDisabledByTeam || gateError === 'disabled_by_team') && (
            <div className="card" style={{ padding: 40, textAlign: 'center', margin: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
              <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
                AI Assistant is disabled
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                Your team owner has disabled AI tools. Contact them to re-enable access.
              </div>
            </div>
          )}

          {/* ── Gate: Credits exhausted ──────────────────── */}
          {hasBilling && !isDisabledByTeam && gateError === 'credits_exhausted' && (
            <div className="card" style={{
              padding: 28, textAlign: 'center', margin: '20px 0',
              border: '1px solid rgba(220,38,38,.25)', background: 'rgba(220,38,38,.04)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
              <div className="serif" style={{ fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>
                You've used all {creditsLimit} AI credits this month
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
                {nextPlan
                  ? `Upgrade to ${nextPlan} for more AI credits.`
                  : 'Credits reset at the beginning of each month.'}
              </div>
              {nextPlan && (
                <button className="btn-gold" style={{ padding: '10px 24px', fontSize: 13 }}
                  onClick={() => onNavigate('billing')}>
                  Upgrade to {nextPlan}
                </button>
              )}
            </div>
          )}

          {/* ── Main chat area ───────────────────────────── */}
          {hasBilling && !isDisabledByTeam && gateError !== 'subscription_required' && gateError !== 'disabled_by_team' && (
            <>
              {/* Messages */}
              <div ref={scrollRef} style={{
                flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0,
              }}>
                {/* Quick actions — shown when no messages */}
                {messages.length === 0 && !gateError && (
                  <div style={{ padding: '40px 0 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
                    <div className="serif" style={{ fontSize: 20, color: 'var(--text)', marginBottom: 6 }}>
                      How can I help you today?
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
                      I can analyze your listings, review your pipeline, track your goals, and give personalized coaching advice.
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 10, maxWidth: 600, margin: '0 auto',
                    }}>
                      {QUICK_ACTIONS.map(qa => (
                        <button key={qa.label} onClick={() => sendMessage(qa.prompt)} style={{
                          padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                          background: 'var(--surface)', border: '1px solid var(--b2)',
                          color: 'var(--text)', fontSize: 12, fontWeight: 600,
                          textAlign: 'left', lineHeight: 1.4, transition: 'all .15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = 'rgba(139,92,246,.05)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b2)'; e.currentTarget.style.background = 'var(--surface)' }}
                        >
                          {qa.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message bubbles */}
                {messages.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 12, padding: '0 4px',
                  }}>
                    <div style={{
                      maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                      fontSize: 13, lineHeight: 1.7, wordBreak: 'break-word',
                      ...(msg.role === 'user' ? {
                        background: 'rgba(217,119,6,.1)', border: '1px solid rgba(217,119,6,.2)',
                        color: 'var(--text)', borderBottomRightRadius: 4,
                      } : {
                        background: 'var(--surface)', border: '1px solid var(--b2)',
                        color: 'var(--text)', borderBottomLeftRadius: 4,
                      }),
                    }}>
                      {msg.role === 'assistant' ? (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      ) : msg.content}
                      {/* Streaming cursor */}
                      {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                        <span style={{
                          display: 'inline-block', width: 6, height: 16, background: '#8b5cf6',
                          marginLeft: 2, verticalAlign: 'text-bottom', borderRadius: 1,
                          animation: 'blink 1s infinite',
                        }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Input area ───────────────────────────────── */}
              <div style={{
                flexShrink: 0, padding: '12px 0 20px',
                borderTop: '1px solid var(--b1)',
              }}>
                {gateError === 'credits_exhausted' ? null : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <textarea
                      ref={textareaRef}
                      className="field-input"
                      value={input}
                      onChange={e => { setInput(e.target.value); autoResize(e) }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your listings, pipeline, goals…"
                      rows={1}
                      disabled={streaming}
                      style={{
                        flex: 1, resize: 'none', padding: '12px 16px', fontSize: 13,
                        lineHeight: 1.5, minHeight: 44, maxHeight: 150,
                        borderRadius: 12,
                      }}
                    />
                    {streaming ? (
                      <button onClick={stopStreaming} style={{
                        padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.3)',
                        color: '#dc2626', fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        Stop
                      </button>
                    ) : (
                      <button onClick={() => sendMessage(input)} disabled={!input.trim()} style={{
                        padding: '10px 18px', borderRadius: 10, cursor: input.trim() ? 'pointer' : 'not-allowed',
                        background: input.trim() ? 'rgba(139,92,246,.12)' : 'transparent',
                        border: `1px solid ${input.trim() ? 'rgba(139,92,246,.3)' : 'var(--b2)'}`,
                        color: input.trim() ? '#8b5cf6' : 'var(--dim)',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        Send
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

      {/* Blink animation for streaming cursor */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1 }
          51%, 100% { opacity: 0 }
        }
      `}</style>
    </>
  )
}
