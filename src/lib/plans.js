// ── Plan definitions — single source of truth ─────────────────────────────────

export const PLANS = [
  { id:'solo', name:'Solo', price:9, priceAnn:7, badge:null, color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Skip & restore habits','Print daily checklist PDF','Pipeline & closing tracker','Personal rank & streak','Annual production report'],
    maxMembers:0, cta:'Get Started' },
  { id:'team', name:'Team', price:99, priceAnn:82, badge:'Most Popular', color:'#d97706',
    desc:'For team leaders who demand accountability.',
    features:['Everything in Solo','Up to 15 agents','Roster & leaderboard','Accountability groups','Daily standup feed','Coaching notes per agent','Team challenges & XP bonuses','Active listings board'],
    maxMembers:15, cta:'Start Free Trial' },
  { id:'brokerage', name:'Brokerage', price:299, priceAnn:249, badge:'Best Value', color:'#8b5cf6',
    desc:'For brokers running a full operation.',
    features:['Everything in Team','Unlimited agents','Multiple groups','Priority support','Early access to new features'],
    maxMembers:Infinity, cta:'Start Free Trial' },
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

export function canUseTeams(profile) {
  if (!profile) return false
  const plan = getPlan(profile.plan)
  if (!plan) return false
  return isActiveBilling(profile.billing_status) && plan.maxMembers > 0
}

export function getPlanBadge(profile) {
  if (!profile?.plan) return { label:'Free', color:'#706b62' }
  const plan = getPlan(profile.plan)
  if (!plan) return { label:'Free', color:'#706b62' }
  if (!isActiveBilling(profile.billing_status)) {
    return { label:`${plan.name} (${profile.billing_status})`, color:'#dc2626' }
  }
  if (profile.billing_status === 'trialing') {
    return { label:`${plan.name} (Trial)`, color:plan.color }
  }
  return { label:plan.name, color:plan.color }
}
