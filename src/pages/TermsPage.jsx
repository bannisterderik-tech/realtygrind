import { useAuth } from '../lib/AuthContext'

export default function TermsPage({ onNavigate, theme }) {
  const { user } = useAuth()
  const gold = '#d97706'

  const Section = ({ id, title, children }) => (
    <section id={id} style={{ marginBottom:40 }}>
      <h2 className="serif" style={{ fontSize:22, color:'var(--text)', marginBottom:12, borderBottom:'1px solid var(--b1)', paddingBottom:8 }}>{title}</h2>
      <div style={{ fontSize:14, color:'var(--text2)', lineHeight:1.85 }}>{children}</div>
    </section>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      {/* Back nav */}
      <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--b1)', background:'var(--surface)',
        display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => onNavigate(user ? 'dashboard' : 'landing')}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:gold, fontWeight:600,
            fontFamily:"'Poppins',sans-serif" }}>
          ← Back
        </button>
        <span className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Legal</span>
      </div>

      <div style={{ maxWidth:740, margin:'0 auto', padding:'40px 24px 80px' }}>
        {/* Jump links */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:36, fontSize:13,
          fontFamily:"'Poppins',sans-serif" }}>
          <a href="#terms" style={{ color:gold, textDecoration:'none', fontWeight:600 }}>Terms of Service</a>
          <a href="#privacy" style={{ color:gold, textDecoration:'none', fontWeight:600 }}>Privacy Policy</a>
          <a href="#disclaimers" style={{ color:gold, textDecoration:'none', fontWeight:600 }}>Disclaimers</a>
          <a href="#contact" style={{ color:gold, textDecoration:'none', fontWeight:600 }}>Contact</a>
        </div>

        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:32, fontFamily:"'Poppins',sans-serif" }}>
          Last updated: March 4, 2026
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        <Section id="terms" title="Terms of Service">
          <p style={{ marginBottom:14 }}>
            Welcome to RealtyGrind. By creating an account or using this platform you agree to these Terms of Service. If you do not agree, please do not use the service.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>1. The Service</h3>
          <p style={{ marginBottom:14 }}>
            RealtyGrind is a habit-tracking, accountability, and coaching platform designed for real estate professionals. The platform includes daily habit tracking, pipeline management, team collaboration, AI-powered coaching, and related tools.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>2. Accounts</h3>
          <p style={{ marginBottom:14 }}>
            You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials and for all activity under your account. You must be at least 18 years old to use this service.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>3. Billing &amp; Subscriptions</h3>
          <p style={{ marginBottom:14 }}>
            Paid plans are billed on a recurring monthly or annual basis through Stripe. The Solo plan includes a 14-day free trial. You may cancel at any time from the Billing page or the Stripe customer portal. Cancellations take effect at the end of the current billing period — no prorated refunds are issued. We reserve the right to change pricing with 30 days' notice.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>4. Team Plans</h3>
          <p style={{ marginBottom:14 }}>
            Team plan subscribers may invite members to their team. The team owner is responsible for the subscription cost. Team members who leave or are removed from a team will lose access to team features and will need their own subscription to continue using paid features.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>5. Acceptable Use</h3>
          <p style={{ marginBottom:14 }}>
            You agree not to: (a) use the service for any unlawful purpose; (b) attempt to gain unauthorized access to any part of the service; (c) upload malicious code or interfere with service operations; (d) resell or redistribute the service without written permission; (e) use the service to store client phone numbers, email addresses, or financial details (see Disclaimers below).
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>6. Intellectual Property</h3>
          <p style={{ marginBottom:14 }}>
            All content, design, and code on RealtyGrind is owned by RealtyGrind and protected by copyright. Your data remains yours — we claim no ownership over user-generated content.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>7. Termination</h3>
          <p style={{ marginBottom:14 }}>
            We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time by contacting us. Upon termination, your data will be deleted within 30 days.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>8. Limitation of Liability</h3>
          <p style={{ marginBottom:14 }}>
            RealtyGrind is provided "as is" without warranties of any kind. To the maximum extent permitted by law, RealtyGrind and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the service.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>9. Changes to Terms</h3>
          <p>
            We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the revised terms.
          </p>
        </Section>

        {/* ═══════════════════════════════════════════════════════════ */}
        <Section id="privacy" title="Privacy Policy">
          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Information We Collect</h3>
          <p style={{ marginBottom:14 }}>
            When you create an account we collect your email address and name. As you use the platform we store your habit data, pipeline entries, goals, coaching notes, and other content you create. We also collect basic usage analytics to improve the service.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>How We Use Your Data</h3>
          <p style={{ marginBottom:14 }}>
            Your data is used solely to operate the service — displaying your dashboard, powering AI coaching, enabling team features, and processing billing. We do not sell your personal information to third parties.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Third-Party Services</h3>
          <p style={{ marginBottom:14 }}>
            We use the following third-party services to operate the platform:
          </p>
          <ul style={{ paddingLeft:20, marginBottom:14 }}>
            <li style={{ marginBottom:6 }}><strong>Supabase</strong> — database, authentication, and backend infrastructure</li>
            <li style={{ marginBottom:6 }}><strong>Stripe</strong> — payment processing (we never store your card details)</li>
            <li style={{ marginBottom:6 }}><strong>OpenAI</strong> — AI coaching features (your data is not used to train AI models)</li>
            <li style={{ marginBottom:6 }}><strong>Resend</strong> — transactional email delivery</li>
            <li style={{ marginBottom:6 }}><strong>Vercel</strong> — application hosting</li>
          </ul>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Cookies</h3>
          <p style={{ marginBottom:14 }}>
            We use essential cookies and local storage for authentication and remembering your preferences (such as theme). We do not use third-party tracking cookies.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Data Retention</h3>
          <p style={{ marginBottom:14 }}>
            Your data is retained as long as your account is active. If you cancel or request deletion, your data will be removed within 30 days. Stripe retains payment records separately per their own retention policy.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Your Rights</h3>
          <p>
            You may request a copy of your data or request deletion at any time by contacting us. If you are a California resident, you have additional rights under the CCPA. If you are located in the EU, you have rights under GDPR. Contact us to exercise any of these rights.
          </p>
        </Section>

        {/* ═══════════════════════════════════════════════════════════ */}
        <Section id="disclaimers" title="Disclaimers">
          <div style={{ background:'rgba(217,119,6,.06)', border:'1px solid rgba(217,119,6,.2)', borderRadius:10,
            padding:20, marginBottom:20 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:gold, marginBottom:8 }}>⚠️ Educational &amp; Informational Purposes Only</h3>
            <p style={{ marginBottom:0, color:'var(--text)' }}>
              RealtyGrind is designed for <strong>educational and informational purposes only</strong>. The platform provides habit-tracking tools, accountability frameworks, and AI-generated coaching suggestions to support your professional development. None of the content, suggestions, or features on this platform constitute professional, financial, or legal advice.
            </p>
          </div>

          <div style={{ background:'rgba(220,38,38,.04)', border:'1px solid rgba(220,38,38,.18)', borderRadius:10,
            padding:20, marginBottom:20 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#dc2626', marginBottom:8 }}>🚫 No Income Guarantees</h3>
            <p style={{ marginBottom:0, color:'var(--text)' }}>
              <strong>RealtyGrind makes no promises, representations, or guarantees regarding income, earnings, or business results.</strong> Any examples of production numbers, commissions, or results shown on the platform are for illustrative purposes only. Your results will depend entirely on your own effort, market conditions, skills, and many other factors. There is no guarantee that you will earn any specific amount of money using this platform.
            </p>
          </div>

          <div style={{ background:'rgba(59,130,246,.05)', border:'1px solid rgba(59,130,246,.18)', borderRadius:10,
            padding:20, marginBottom:20 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#2563eb', marginBottom:8 }}>🔒 Client Data Guidelines</h3>
            <p style={{ marginBottom:0, color:'var(--text)' }}>
              <strong>RealtyGrind is not a CRM.</strong> You may enter client names and property addresses for listings and buyer tracking, but <strong>do not store client phone numbers, email addresses, or financial details</strong> on this platform. That information belongs in your existing CRM system (e.g., Follow Up Boss, KVCore, LionDesk, etc.). RealtyGrind is not responsible for any client contact data entered into the platform.
            </p>
          </div>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>AI Coaching Disclaimer</h3>
          <p style={{ marginBottom:14 }}>
            The AI coaching feature uses artificial intelligence to generate suggestions and feedback. AI-generated content may contain errors, may not be applicable to your specific situation, and should not be relied upon as the sole basis for business decisions. Always use your own professional judgment.
          </p>

          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginTop:20, marginBottom:8 }}>Service Availability</h3>
          <p>
            We strive for high availability but do not guarantee uninterrupted service. RealtyGrind may experience downtime for maintenance, updates, or unforeseen issues. We are not liable for any losses resulting from service interruptions.
          </p>
        </Section>

        {/* ═══════════════════════════════════════════════════════════ */}
        <Section id="contact" title="Contact Us">
          <p style={{ marginBottom:14 }}>
            If you have questions about these terms, your privacy, or anything else, reach out:
          </p>
          <div style={{ background:'var(--surface)', border:'1px solid var(--b1)', borderRadius:10, padding:20 }}>
            <div style={{ marginBottom:8 }}><strong>Derik Bannister</strong></div>
            <div style={{ marginBottom:6 }}>
              📞 <a href="tel:5307367085" style={{ color:gold, fontWeight:600, textDecoration:'none' }}>(530) 736-7085</a>
            </div>
            <div>
              ✉️ <a href="mailto:support@realtygrind.co" style={{ color:gold, fontWeight:600, textDecoration:'none' }}>support@realtygrind.co</a>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
