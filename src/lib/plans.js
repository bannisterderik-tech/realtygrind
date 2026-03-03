// ── Plan definitions — single source of truth ─────────────────────────────────

export const PLANS = [
  { id:'solo', name:'Solo', price:29, priceAnn:24, badge:null, color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Skip & restore habits','Print daily checklist PDF','Pipeline & closing tracker','Personal rank & streak','Annual production report','50 AI coaching credits/mo'],
    maxMembers:0, cta:'Start Free Trial' },
  { id:'team', name:'Team', price:199, priceAnn:166, badge:'Most Popular', color:'#d97706',
    desc:'For team leaders who demand accountability.',
    features:['Everything in Solo','Up to 15 agents','Roster & leaderboard','Accountability groups','Daily standup feed','Coaching notes per agent','Team challenges & XP bonuses','Active listings board','250 AI coaching credits/mo'],
    maxMembers:15, cta:'Get Started' },
  { id:'brokerage', name:'Brokerage', price:499, priceAnn:416, badge:'Best Value', color:'#8b5cf6',
    desc:'For brokers running a full operation.',
    features:['Everything in Team','50 agents included · $7/extra seat','Multiple groups','Priority support','Early access to new features','500 AI coaching credits/mo'],
    maxMembers:50, extraSeatPrice:7, cta:'Get Started' },
]

export function getPlan(planId) {
  return PLANS.find(p => p.id === planId) || null
}

export function getMaxMembers(planId) {
  const plan = getPlan(planId)
  return plan ? plan.maxMembers : 0
}

export function isActiveBilling(status) {
  return status === 'active' || status === 'trialing'
}

// Platform admins have full access to all features regardless of plan
export function isPlatformAdmin(profile) {
  return profile?.app_role === 'admin'
}

export function canUseTeams(profile) {
  if (!profile) return false
  if (isPlatformAdmin(profile)) return true
  const plan = getPlan(profile.plan)
  if (!plan) return false
  return isActiveBilling(profile.billing_status) && plan.maxMembers > 0
}

// Is this user a team member (not owner)? They're covered by their team's plan.
export function isTeamMember(profile, userId) {
  if (!profile?.team_id || !profile?.teams) return false
  return profile.teams.created_by !== userId
}

// ── AI credit limits per plan (1 credit = 1 AI message) ─────────────────────
export const AI_CREDIT_LIMITS = { solo: 50, team: 250, brokerage: 500 }

export function getAICreditLimit(plan) {
  return AI_CREDIT_LIMITS[plan] ?? 0
}

export function getPlanBadge(profile, userId) {
  // Platform admin — special badge, no plan needed
  if (isPlatformAdmin(profile)) {
    return { label:'Admin', color:'#8b5cf6' }
  }
  // Team member (non-owner) — show they're covered
  if (userId && isTeamMember(profile, userId)) {
    return { label:'Team Member', color:'#d97706' }
  }
  if (!profile?.plan) return { label:'Free', color:'#706b62' }
  const plan = getPlan(profile.plan)
  if (!plan) return { label:'Free', color:'#706b62' }
  if (!isActiveBilling(profile.billing_status)) {
    const statusText = profile.billing_status || 'inactive'
    return { label:`${plan.name} (${statusText})`, color:'#dc2626' }
  }
  if (profile.billing_status === 'trialing') {
    return { label:`${plan.name} (Trial)`, color:plan.color }
  }
  return { label:plan.name, color:plan.color }
}
