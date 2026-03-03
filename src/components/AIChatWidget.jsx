import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { isActiveBilling, isTeamMember } from '../lib/plans'

const QUICK_ACTIONS = [
  { label: 'Analyze My Listings', prompt: 'Analyze my current active listings and suggest strategies to reduce days on market and maximize sale price for each one.' },
  { label: 'Review My Pipeline', prompt: 'Review my current pipeline — offers made, pending deals, and recent closings. What should I focus on next?' },
  { label: 'Goal Progress Check', prompt: 'How am I tracking against my goals this month? Where are the gaps and what specific actions should I take to catch up?' },
  { label: 'Marketing Plan', prompt: 'Write me a comprehensive marketing plan based on my current listings, buyer rep agreements, and my agent profile/bio. Include social media content ideas, open house strategies, email campaigns, and targeted outreach tactics personalized to my market and specialties.' },
  { label: 'Buyer Search Strategies', prompt: 'Review my buyer rep agreements — their search criteria, location preferences, must-haves, nice-to-haves, and timelines. Suggest search refinements, areas to expand into, and strategies to compete in the current market for each buyer.' },
  { label: 'Budget Clarification Call', prompt: 'Review my buyer rep agreements\' financial details — pre-approval amounts, comfortable payment ranges, and down payments. For each active buyer, give me talking points for a budget clarification call: flag any red flags or mismatches between their pre-approval and search criteria, suggest questions to ask, and recommend whether to push for an updated pre-approval letter.' },
  { label: 'Prospecting Tips', prompt: 'Based on my activity patterns this month, give me specific prospecting recommendations and time-blocking suggestions.' },
  { label: 'Find Comps', prompt: 'Help me analyze comparable sales for my active listings. What pricing adjustments should I consider based on market trends?' },
]

// Escape HTML entities
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Basic markdown rendering
function renderMarkdown(text) {
  if (!text) return ''
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 3px;font-size:13px;font-weight:700;color:var(--text)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 4px;font-size:14px;font-weight:700;color:var(--text)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:14px 0 6px;font-size:15px;font-weight:700;color:var(--text)">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--b1);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:14px;position:relative"><span style="position:absolute;left:3px">&#8226;</span>$1</div>')
    .replace(/^\d+\. (.+)$/gm, (_, content, offset, str) => {
      const before = str.slice(0, offset)
      const num = (before.match(/^\d+\. /gm) || []).length + 1
      return `<div style="padding-left:18px;position:relative"><span style="position:absolute;left:0;color:var(--muted);font-size:11px">${num}.</span>${content}</div>`
    })
    .replace(/\n/g, '<br/>')
}

export default function AIChatWidget({ isOpen, onToggle, onClose, onNavigate, theme }) {
  const { user, profile } = useAuth()

  // Chat state — persists across open/close
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState('')
  const [streaming, setStreaming]        = useState(false)
  const [creditsUsed, setCreditsUsed]   = useState(0)
  const creditsUsedRef = useRef(0); creditsUsedRef.current = creditsUsed
  const [creditsLimit, setCreditsLimit] = useState(0)
  const [effectivePlan, setEffectivePlan] = useState('')
  const [gateError, setGateError]       = useState(null)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [connError, setConnError]       = useState(false)
  const [hasNewReply, setHasNewReply]   = useState(false)

  const abortRef    = useRef(null)
  const scrollRef   = useRef(null)
  const textareaRef = useRef(null)
  const messagesRef = useRef(messages)
  const panelRef    = useRef(null)
  const isOpenRef   = useRef(isOpen)
  const sendingRef  = useRef(false) // double-submit guard
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming, isOpen])

  // Fetch credits when user is available
  useEffect(() => { if (user?.id) fetchCredits() }, [user?.id])

  // Clear new-reply indicator when opening
  useEffect(() => { if (isOpen) setHasNewReply(false) }, [isOpen])

  async function fetchCredits() {
    if (!supabase) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'GET',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )
      const data = await resp.json()
      if (resp.ok) {
        setCreditsUsed(data.credits_used || 0)
        setCreditsLimit(data.credits_limit === -1 ? 500 : (data.credits_limit || 0))
        setEffectivePlan(data.plan || '')
        setGateError(null)
      } else {
        if (data.error === 'subscription_required' || data.error === 'disabled_by_team') {
          setGateError(data.error)
        }
      }
    } catch (err) {
      console.error('AI widget fetchCredits error:', err)
      setConnError(true)
    } finally {
      setLoadingCredits(false)
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

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        }
      )

      if (!resp.ok) {
        let errData = {}
        try { errData = await resp.json() } catch { /* non-JSON */ }
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

      // Parse SSE stream
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
            } catch { /* skip non-JSON SSE lines */ }
          }
        }
      } finally {
        reader.releaseLock()
      }

      if (assistantText) {
        setMessages([...newMessages, { role: 'assistant', content: assistantText }])
        if (!isOpenRef.current) setHasNewReply(true)
      }
      setCreditsUsed(prev => prev + 1)
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('AI widget sendMessage error:', err)
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message || 'Something went wrong.'}` }])
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

  function resetChat() {
    if (streaming) stopStreaming()
    setMessages([])
    setInput('')
    setGateError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const [copiedIdx, setCopiedIdx] = useState(null)
  const copyTimerRef = useRef(null)
  function copyMessage(text, idx) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopiedIdx(null), 1500)
    })
  }
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // Gate checks
  const hasBilling = isActiveBilling(profile?.billing_status) || isTeamMember(profile, user?.id)
  const isDisabledByTeam = profile?.teams?.team_prefs?.ai_tools?.assistant_enabled === false

  // Credit display
  const creditText = `${creditsUsed}/${creditsLimit}`
  const creditPct = creditsLimit > 0 ? (creditsUsed / creditsLimit) * 100 : 100
  const nextPlan = effectivePlan === 'solo' ? 'Team' : effectivePlan === 'team' ? 'Brokerage' : null

  const canChat = hasBilling && !isDisabledByTeam && gateError !== 'subscription_required' && gateError !== 'disabled_by_team'

  return (
    <>
      {/* ── Backdrop (click-outside-to-close) ── */}
      {isOpen && (
        <div onClick={onClose} style={{
          position:'fixed', inset:0, zIndex:100000, background:'transparent',
        }}/>
      )}

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div ref={panelRef} onClick={e => e.stopPropagation()} style={{
          position:'fixed', bottom:92, right:24, width:'min(400px, calc(100vw - 48px))', maxHeight:'70vh',
          borderRadius:16, background:'var(--surface)', border:'1px solid var(--b2)',
          boxShadow:'0 8px 40px rgba(0,0,0,.18), 0 2px 12px rgba(0,0,0,.08)',
          display:'flex', flexDirection:'column', zIndex:100002,
          animation:'slideUpWidget .22s ease', overflow:'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{
            padding:'14px 16px', borderBottom:'1px solid var(--b1)',
            display:'flex', alignItems:'center', gap:10, flexShrink:0,
            background:'linear-gradient(135deg, rgba(139,92,246,.06), rgba(139,92,246,.02))',
          }}>
            <span style={{ fontSize:22 }}>🤖</span>
            <span className="serif" style={{ fontSize:16, color:'var(--text)', flex:1 }}>AI Assistant</span>
            <span style={{
              fontSize:8, padding:'2px 6px', borderRadius:3, fontWeight:700,
              background:'rgba(139,92,246,.12)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.25)',
              fontFamily:"'JetBrains Mono',monospace", letterSpacing:.5,
            }}>BETA</span>
            {canChat && (
              <span style={{
                fontSize:10, padding:'3px 8px', borderRadius:12,
                background: creditPct >= 90 ? 'rgba(220,38,38,.08)' : 'rgba(139,92,246,.08)',
                color: creditPct >= 90 ? '#dc2626' : '#8b5cf6',
                border:`1px solid ${creditPct >= 90 ? 'rgba(220,38,38,.2)' : 'rgba(139,92,246,.2)'}`,
                fontFamily:"'JetBrains Mono',monospace", fontWeight:600,
              }}>
                {creditText}
              </span>
            )}
            {messages.length > 0 && (
              <button onClick={resetChat} title="New chat" style={{
                background:'none', border:'1px solid var(--b2)', borderRadius:7,
                width:26, height:26, cursor:'pointer', color:'var(--muted)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:12,
                transition:'all .15s',
              }}>↺</button>
            )}
            <button onClick={onClose} style={{
              background:'none', border:'1px solid var(--b2)', borderRadius:7,
              width:26, height:26, cursor:'pointer', color:'var(--muted)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
              transition:'all .15s',
            }}>✕</button>
          </div>

          {/* ── Gate: Not subscribed ── */}
          {(!hasBilling || gateError === 'subscription_required') && (
            <div style={{ padding:'36px 24px', textAlign:'center', flex:1 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div className="serif" style={{ fontSize:17, color:'var(--text)', marginBottom:6 }}>
                Subscription required
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20, lineHeight:1.6 }}>
                Subscribe to unlock AI-powered coaching.
              </div>
              <button className="btn-gold" style={{ padding:'10px 22px', fontSize:12 }}
                onClick={() => { onClose(); onNavigate?.('billing') }}>
                View Plans
              </button>
            </div>
          )}

          {/* ── Gate: Disabled by team ── */}
          {hasBilling && (isDisabledByTeam || gateError === 'disabled_by_team') && (
            <div style={{ padding:'36px 24px', textAlign:'center', flex:1 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🚫</div>
              <div className="serif" style={{ fontSize:17, color:'var(--text)', marginBottom:6 }}>
                AI Assistant disabled
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                Your team owner has disabled AI tools.
              </div>
            </div>
          )}

          {/* ── Credits exhausted inline banner ── */}
          {canChat && gateError === 'credits_exhausted' && (
            <div style={{
              padding:'16px', margin:'8px 12px', borderRadius:10, textAlign:'center',
              border:'1px solid rgba(220,38,38,.2)', background:'rgba(220,38,38,.04)',
            }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>
                Credits used up this month
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5 }}>
                {nextPlan ? `Upgrade to ${nextPlan} for more credits.` : 'Resets next month.'}
              </div>
              {nextPlan && (
                <button className="btn-gold" style={{ padding:'7px 16px', fontSize:11 }}
                  onClick={() => { onClose(); onNavigate?.('billing') }}>
                  Upgrade
                </button>
              )}
            </div>
          )}

          {/* ── Chat content ── */}
          {canChat && (
            <>
              {/* Scrollable messages */}
              <div ref={scrollRef} style={{
                flex:1, overflowY:'auto', padding:'8px 0', minHeight:0,
              }}>
                {/* Quick actions — no messages yet */}
                {messages.length === 0 && !gateError && (
                  <div style={{ padding:'24px 16px 12px' }}>
                    <div style={{ textAlign:'center', marginBottom:18 }}>
                      <div style={{ fontSize:36, marginBottom:8 }}>🤖</div>
                      <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:4 }}>
                        How can I help?
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>
                        Listings, pipeline, goals, buyer analysis, and more.
                      </div>
                    </div>
                    <div style={{
                      display:'grid', gridTemplateColumns:'1fr 1fr', gap:7,
                    }}>
                      {QUICK_ACTIONS.map(qa => (
                        <button key={qa.label} onClick={() => sendMessage(qa.prompt)} style={{
                          padding:'10px 11px', borderRadius:9, cursor:'pointer',
                          background:'var(--surface)', border:'1px solid var(--b2)',
                          color:'var(--text)', fontSize:11, fontWeight:600,
                          textAlign:'left', lineHeight:1.35, transition:'all .15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor='#8b5cf6'; e.currentTarget.style.background='rgba(139,92,246,.05)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--b2)'; e.currentTarget.style.background='var(--surface)' }}
                        >
                          {qa.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message bubbles */}
                <div style={{ padding:'0 12px' }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{
                      display:'flex', flexDirection:'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom:10,
                    }}>
                      <div style={{
                        maxWidth:'88%', padding:'10px 14px', borderRadius:12,
                        fontSize:12, lineHeight:1.65, wordBreak:'break-word',
                        ...(msg.role === 'user' ? {
                          background:'rgba(217,119,6,.1)', border:'1px solid rgba(217,119,6,.2)',
                          color:'var(--text)', borderBottomRightRadius:3,
                        } : {
                          background:'var(--bg2)', border:'1px solid var(--b1)',
                          color:'var(--text)', borderBottomLeftRadius:3,
                        }),
                      }}>
                        {msg.role === 'assistant' ? (
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                        ) : msg.content}
                        {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                          <span style={{
                            display:'inline-block', width:5, height:14, background:'#8b5cf6',
                            marginLeft:2, verticalAlign:'text-bottom', borderRadius:1,
                            animation:'blink 1s infinite',
                          }} />
                        )}
                      </div>
                      {msg.role === 'assistant' && msg.content && !(streaming && i === messages.length - 1) && (
                        <button onClick={() => copyMessage(msg.content, i)} style={{
                          background:'none', border:'none', cursor:'pointer', padding:'3px 0',
                          fontSize:10, color: copiedIdx === i ? 'var(--green)' : 'var(--dim)',
                          fontFamily:"'JetBrains Mono',monospace", transition:'color .15s',
                        }}>
                          {copiedIdx === i ? '✓ Copied' : '📋 Copy'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Input area ── */}
              <div style={{
                flexShrink:0, padding:'10px 12px 14px',
                borderTop:'1px solid var(--b1)',
                background:'var(--surface)',
              }}>
                {gateError !== 'credits_exhausted' && (
                  <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                    <textarea
                      ref={textareaRef}
                      className="field-input"
                      value={input}
                      onChange={e => { setInput(e.target.value); autoResize(e) }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything..."
                      rows={1}
                      disabled={streaming}
                      style={{
                        flex:1, resize:'none', padding:'10px 13px', fontSize:12,
                        lineHeight:1.5, minHeight:38, maxHeight:120, borderRadius:10,
                      }}
                    />
                    {streaming ? (
                      <button onClick={stopStreaming} style={{
                        padding:'8px 14px', borderRadius:9, cursor:'pointer',
                        background:'rgba(220,38,38,.1)', border:'1px solid rgba(220,38,38,.3)',
                        color:'#dc2626', fontSize:11, fontWeight:700, flexShrink:0,
                      }}>
                        Stop
                      </button>
                    ) : (
                      <button onClick={() => sendMessage(input)} disabled={!input.trim()} style={{
                        padding:'8px 14px', borderRadius:9,
                        cursor: input.trim() ? 'pointer' : 'not-allowed',
                        background: input.trim() ? 'rgba(139,92,246,.12)' : 'transparent',
                        border:`1px solid ${input.trim() ? 'rgba(139,92,246,.3)' : 'var(--b2)'}`,
                        color: input.trim() ? '#8b5cf6' : 'var(--dim)',
                        fontSize:11, fontWeight:700, flexShrink:0,
                        transition:'all .15s',
                      }}>
                        Send
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Loading state */}
          {loadingCredits && !connError && (
            <div style={{ padding:'40px 0', textAlign:'center', flex:1 }}>
              <div style={{ width:20, height:20, border:'2px solid var(--b2)', borderTopColor:'#8b5cf6',
                borderRadius:'50%', animation:'spin .6s linear infinite', margin:'0 auto' }} />
            </div>
          )}

          {/* Connection error */}
          {connError && (
            <div style={{ padding:'36px 24px', textAlign:'center', flex:1 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>⚠️</div>
              <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:6 }}>
                Can't reach AI Assistant
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.6 }}>
                Check your connection or try again.
              </div>
              <button onClick={() => { setConnError(false); setLoadingCredits(true); fetchCredits() }} style={{
                padding:'8px 20px', borderRadius:9, cursor:'pointer', fontSize:12, fontWeight:700,
                background:'rgba(139,92,246,.12)', border:'1px solid rgba(139,92,246,.3)', color:'#8b5cf6',
                transition:'all .15s',
              }}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FAB Button ── */}
      <button onClick={onToggle} style={{
        position:'fixed', bottom:24, right:24, width:56, height:56,
        borderRadius:'50%', border:'none', cursor:'pointer',
        background: isOpen
          ? 'var(--surface)'
          : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        color: isOpen ? 'var(--text)' : '#fff',
        fontSize: isOpen ? 20 : 26,
        boxShadow: isOpen
          ? '0 2px 12px rgba(0,0,0,.12)'
          : '0 4px 20px rgba(139,92,246,.4), 0 2px 8px rgba(0,0,0,.1)',
        zIndex:100001,
        display:'flex', alignItems:'center', justifyContent:'center',
        transition:'transform .2s, background .2s, box-shadow .2s',
        animation: !isOpen && messages.length === 0 ? 'pulseGlow 2.5s ease infinite' : 'none',
        transform: isOpen ? 'rotate(0deg)' : 'rotate(0deg)',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {isOpen ? '✕' : '🤖'}
        {/* New reply indicator */}
        {!isOpen && hasNewReply && (
          <span style={{
            position:'absolute', top:2, right:2, width:12, height:12,
            borderRadius:'50%', background:'#10b981', border:'2px solid var(--surface)',
            animation:'pulseGlow 1.5s ease infinite',
          }} />
        )}
      </button>

      {/* ── Widget-specific styles ── */}
      <style>{`
        @keyframes slideUpWidget {
          from { opacity:0; transform:translateY(16px) scale(.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,.35); }
          50%      { box-shadow: 0 0 0 10px rgba(139,92,246,0); }
        }
        @keyframes blink {
          0%, 50%  { opacity:1 }
          51%, 100% { opacity:0 }
        }
        @keyframes spin {
          to { transform: rotate(360deg) }
        }
        @media (max-width: 500px) {
          /* override fixed panel to go near-full-width on small screens */
        }
      `}</style>
    </>
  )
}
