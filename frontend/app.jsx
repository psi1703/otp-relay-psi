const { useEffect, useMemo, useState } = React;

const CONFIG = {
  CLAIM_EXPIRY_SEC: 90,
  OTP_DISPLAY_SEC: 285,
  POLL_INTERVAL_MS: 3000,
  RING_CIRCUMFERENCE: 263.89,
};

const API = {
  async json(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error((data && (data.detail || data.error)) || `Request failed: ${res.status}`);
    return data;
  },
  claimOtp(token) { return this.json('/claim-otp', { method: 'POST', body: JSON.stringify({ token }) }); },
  claimStatus(token) { return this.json(`/claim-status/${encodeURIComponent(token)}`); },
  deleteClaim(token) { return this.json(`/claim-otp/${encodeURIComponent(token)}`, { method: 'DELETE' }); },
  saveWizard(payload) { return this.json('/wizard/progress', { method: 'POST', body: JSON.stringify(payload) }); },
  getWizard(token) { return this.json(`/wizard/progress/${encodeURIComponent(token)}`); },
  adminAuthStatus() { return this.json('/admin/auth/status'); },
  adminAuthSetup(credential, current) { return this.json('/admin/auth/setup', { method: 'POST', body: JSON.stringify({ credential, current }) }); },
  adminAuthLogin(credential) { return this.json('/admin/auth/login', { method: 'POST', body: JSON.stringify({ credential }) }); },
  adminAuthLogout(session) { return this.json('/admin/auth/logout', { method: 'POST', headers: { 'X-Admin-Session': session } }); },
  adminWizard(session) { return this.json('/admin/wizard', { headers: { 'X-Admin-Session': session } }); },
  adminQueue(session) { return this.json('/admin/queue', { headers: session ? { 'X-Admin-Session': session } : {} }); },
  adminUsers(session) { return this.json('/admin/users', { headers: session ? { 'X-Admin-Session': session } : {} }); },
  adminLog(session) { return this.json('/admin/log?limit=500', { headers: session ? { 'X-Admin-Session': session } : {} }); },
  adminConfig(session) { return this.json('/admin/config', { headers: session ? { 'X-Admin-Session': session } : {} }); },
  saveAdminConfig(session, admin_tokens) { return this.json('/admin/config', { method: 'POST', headers: { 'X-Admin-Session': session }, body: JSON.stringify({ admin_tokens }) }); },
  notifyAdminTask(payload) { return this.json('/api/onboard/notify', { method: 'POST', body: JSON.stringify(payload) }); },
};

const STEPS = [
  {
    id: 'form', title: 'Submit the RTA Access Form', owner: 'user', icon: '📝', time: '10 min',
    summary: 'Fill the official access form and send it to Jathin with your signature and required attachments.',
    details: [
      { type: 'info', text: 'Complete the official RTA Access Request form and attach the supporting documents.' },
      { type: 'list', title: 'What to do', items: [
        'Fill the latest access request form.',
        'Sign the document and save it as PDF.',
        'Email it to Jathin and copy Amer + Christian if needed.',
        'Ajith must also send the employee ID copy in PDF to Mustafa.'
      ]},
      { type: 'links', title: 'Useful links', items: [
        { label: 'RTA Access Requests (SharePoint)', href: 'https://initse.sharepoint.com/:f:/r/sites/RTAinternal/Shared%20Documents/RTA%20Documents/PAM/RTA%20Access%20Requests' },
        { label: 'Email template to Jathin', href: 'mailto:jprakash@initse.com?cc=cschilling@initse.com;adarwich@initse.com&subject=RTA-NG-2024%20Request%20RTA%20User%20Account' }
      ]}
    ]
  },
  {
    id: 'account_creation', title: 'RTA Account Creation', owner: 'admin', icon: '🔧', time: '1–3 days', gate: ['form'],
    adminLabel: 'Jathin creates the IITS account',
    summary: 'Jathin applies for your RTA account in the RTA system and shares the IITS username with you.',
    details: [
      { type: 'info', text: 'Jathin applies for your RTA account and notifies you once the IITS username is ready.' }
    ]
  },
  {
    id: 'adm_request', title: 'Request ADM Account & PAM Onboarding', owner: 'admin', icon: '🔧', time: '3–7 days', gate: ['form'],
    adminLabel: 'Amer handles ADM + PAM approvals',
    summary: 'Amer coordinates ADM creation and PAM onboarding approvals.',
    details: [
      { type: 'list', title: 'Approval chain', items: [
        'Mustafa approves the request.',
        'ITD approval: Siby.',
        'SMD approval: Ahmed Jarrah.',
        'After approvals, PAM support is emailed with the chain attached.'
      ]}
    ]
  },
  {
    id: 'save_iits', title: 'Save Your IITS Username', owner: 'user', icon: '👤', time: '2 min', gate: ['account_creation'],
    summary: 'Once Jathin sends you the IITS username, save it here for later use.',
    details: [
      { type: 'info', text: 'You will use the IITS account for VPN login, password resets, and OTP-related RTA access.' }
    ]
  },
  {
    id: 'save_adm', title: 'Save Your ADM Username', owner: 'user', icon: '🗂️', time: '2 min', gate: ['adm_request'],
    summary: 'Once Amer confirms the ADM account, save it here for PAM and server access workflows.',
    details: [
      { type: 'info', text: 'ADM is used for PAM and privileged access workflows inside the RTA environment.' }
    ]
  },
  {
    id: 'password_reset', title: 'Reset RTA Passwords', owner: 'user', icon: '🔐', time: '15 min', gate: ['save_iits', 'save_adm'], expiryKey: 'iits_pw_date', secondExpiryKey: 'adm_pw_date',
    summary: 'Reset your IITS and ADM passwords, then record the reset dates so the 90-day countdown is visible.',
    details: [
      { type: 'info', text: 'The password reset link only works inside UAE. If you are outside UAE, use the Dubai terminal server first.' },
      { type: 'list', title: 'OTP relay sequence', items: [
        'Open the OTP portal and claim your slot first.',
        'Wait until the portal says “Go trigger your OTP now.”',
        'Only then switch to the RTA page and request the OTP.',
        'Enter the OTP from the portal and complete the reset immediately.'
      ]},
      { type: 'list', title: 'Terminal server when outside UAE', items: [
        'Browser: open https://srvterminal.init-db.lan and log in.',
        'Windows RDP: connect to 172.31.10.82 or srvterminal.',
        'Open the RTA reset link inside that remote session.'
      ]},
      { type: 'warn', text: 'Passwords expire every 90 days. No automatic reminder is sent by RTA.' }
    ]
  },
  {
    id: 'oracle_auth', title: 'Configure Oracle Authenticator', owner: 'user', icon: '📱', time: '10 min', gate: ['password_reset'],
    summary: 'Register Oracle Authenticator for TOTP and verify it works for both IITS and ADM flows.',
    details: [
      { type: 'list', title: 'What to do', items: [
        'Install Oracle Authenticator on your phone.',
        'Scan the QR code when prompted during setup.',
        'Verify that a 6-digit TOTP is generated correctly.'
      ]}
    ]
  },
  {
    id: 'vpn_request', title: 'Request VPN / PAM / SFTP Access', owner: 'user', icon: '🌐', time: '20 min', gate: ['oracle_auth'], expiryKey: 'vpn_date',
    summary: 'Submit the VPN request in the RTA Automation portal and include the needed applications and risk IDs.',
    details: [
      { type: 'kv', title: 'Applications to request', items: [
        ['RDP', '10.11.174.39 | Risk ID as per guide'],
        ['PAM', '10.11.174.38'],
        ['SSH/SFTP', '10.11.174.40:122 | Risk ID as per guide']
      ]},
      { type: 'warn', text: 'VPN access also expires every 90 days and must be renewed manually.' }
    ]
  },
  {
    id: 'email_support', title: 'Email RTA IT Support', owner: 'user', icon: '✉️', time: '5 min', gate: ['vpn_request'],
    summary: 'After the request is submitted, email RTA IT support to grant the access and reference the request details.',
    details: [
      { type: 'info', text: 'Use the RTA Automation Portal > IT Help Desk if you need to raise a support ticket or chase approvals.' }
    ]
  },
  {
    id: 'install_vpn', title: 'Install Ivanti and Test Access', owner: 'user', icon: '💻', time: '15 min', gate: ['email_support'],
    summary: 'Install Ivanti Secure Access Client, add the RTA VPN connection, and test VPN/PAM/SFTP access.',
    details: [
      { type: 'kv', title: 'Connection', items: [
        ['Type', 'Policy Secure (UAC) or Connect Secure (VPN)'],
        ['Name', 'RTA VPN'],
        ['Server URL', 'https://ettisal.rta.ae/vendors']
      ]},
      { type: 'info', text: 'For test servers: connect VPN → RDP to Jump Server → then connect to the target server.' }
    ]
  },
];

function getVisibleDone(user, step) {
  if (step.owner === 'admin') return (user.adminCompleted || []).includes(step.id);
  return (user.completed || []).includes(step.id);
}

function allDone(user) {
  return [...(user.completed || []), ...(user.adminCompleted || [])];
}

function isUnlocked(user, step) {
  if (!step.gate || step.gate.length === 0) return true;
  const done = new Set(allDone(user));
  return step.gate.every(id => done.has(id));
}

function nextUserStep(user) {
  return STEPS.find(step => step.owner === 'user' && isUnlocked(user, step) && !getVisibleDone(user, step));
}

function daysLeft(iso) {
  if (!iso) return null;
  const start = new Date(iso);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function countdownTone(days) {
  if (days == null) return 'good';
  if (days <= 0) return 'bad';
  if (days <= 14) return 'warn';
  return 'good';
}

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(v) {
  return v ? new Date(`${v}T00:00:00`).toISOString() : null;
}

function fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 44" height="36" aria-label="INIT — The Future of Mobility">
      <circle cx="10" cy="6" r="5.5" fill="#009D3C"/>
      <rect x="6" y="14" width="8" height="22" rx="4" fill="#009D3C"/>
      <rect x="22" y="8" width="8" height="28" rx="4" fill="#009D3C"/>
      <rect x="22" y="8" width="22" height="8" rx="4" fill="#009D3C"/>
      <rect x="36" y="8" width="8" height="28" rx="4" fill="#009D3C"/>
      <circle cx="56" cy="6" r="5.5" fill="#009D3C"/>
      <rect x="52" y="14" width="8" height="22" rx="4" fill="#009D3C"/>
      <rect x="68" y="8" width="8" height="28" rx="4" fill="#009D3C"/>
      <rect x="62" y="8" width="26" height="8" rx="4" fill="#009D3C"/>
      <polygon points="85,4 96,12 85,20" fill="#009D3C"/>
      <text x="0" y="42" fontFamily="DM Sans, sans-serif" fontSize="8.5" fontWeight="400" fill="#B0B0B0" letterSpacing="0.04em">The Future of Mobility</text>
    </svg>
  );
}

function App() {
  const [view, setView] = useState('otp');
  const [wizardUser, setWizardUser] = useState({ token: '', display_name: '', iits_username: '', adm_username: '', completed: [], adminCompleted: [], iits_pw_date: null, adm_pw_date: null, vpn_date: null });
  const [wizardStatus, setWizardStatus] = useState({ saving: false, message: '' });
  const [openStep, setOpenStep] = useState(null);
  const [faqOpen, setFaqOpen] = useState({});
  const [otp, setOtp] = useState({ tokenChars: ['', '', ''], panel: 'claim', message: '', position: 1, waitEstimate: 0, queueDepth: 0, otpValue: '———', activeRemaining: CONFIG.CLAIM_EXPIRY_SEC, otpRemaining: CONFIG.OTP_DISPLAY_SEC });
  const [admin, setAdmin] = useState({ session: sessionStorage.getItem('adminSession') || '', configured: false, mode: 'login', error: '', credential: '', current: '', confirm: '', data: null, loading: false, configTokens: 'JA, AM, CS' });

  useEffect(() => {
    API.adminAuthStatus().then(d => setAdmin(s => ({ ...s, configured: !!d.configured, mode: d.configured ? 'login' : 'setup' }))).catch(() => {});
  }, []);

  useEffect(() => {
    const token = wizardUser.token?.trim().toUpperCase();
    if (!token) return;
    let cancelled = false;
    API.getWizard(token).then(data => {
      if (cancelled || !data) return;
      setWizardUser(s => ({ ...s, ...data, token }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [wizardUser.token]);

  useEffect(() => {
    if (!otp.panel || otp.panel === 'claim' || !otp.token) return;
    const timer = setInterval(async () => {
      try {
        const data = await API.claimStatus(otp.token);
        if (data.status === 'delivered' && data.otp) {
          setOtp(s => ({ ...s, panel: 'otp', otpValue: data.otp, otpRemaining: data.expires_in || CONFIG.OTP_DISPLAY_SEC }));
        } else if (data.status === 'idle_expired') {
          setOtp(s => ({ ...s, panel: 'expired' }));
        } else if (data.status === 'done') {
          resetClaim();
        } else if (data.status === 'waiting') {
          const pos = data.position || 1;
          setOtp(s => ({
            ...s,
            panel: pos === 1 ? 'active' : 'waiting',
            position: pos,
            waitEstimate: data.wait_estimate || 0,
            queueDepth: data.queue_depth || pos,
            activeRemaining: data.expires_in || CONFIG.CLAIM_EXPIRY_SEC,
          }));
        }
      } catch {}
    }, CONFIG.POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [otp.token, otp.panel]);

  useEffect(() => {
    if (otp.panel !== 'active' && otp.panel !== 'otp') return;
    const tick = setInterval(() => {
      setOtp(s => {
        if (s.panel === 'active') return { ...s, activeRemaining: Math.max(0, s.activeRemaining - 1) };
        if (s.panel === 'otp') return { ...s, otpRemaining: Math.max(0, s.otpRemaining - 1) };
        return s;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [otp.panel]);

  const doneCount = allDone(wizardUser).length;
  const progressPct = Math.round((doneCount / STEPS.length) * 100);
  const nextStep = nextUserStep(wizardUser);
  const pendingAdminTasks = useMemo(() => {
    if (!admin.data?.users) return [];
    const tasks = [];
    admin.data.users.forEach(user => {
      STEPS.filter(s => s.owner === 'admin').forEach(step => {
        if (isUnlocked(user, step) && !getVisibleDone(user, step)) tasks.push({ user, step });
      });
    });
    return tasks;
  }, [admin.data]);

  async function saveWizard(patch) {
    const next = { ...wizardUser, ...patch, token: (patch.token ?? wizardUser.token).trim().toUpperCase() };
    setWizardUser(next);
    if (!next.token) return;
    setWizardStatus({ saving: true, message: 'Saving…' });
    try {
      await API.saveWizard(next);
      setWizardStatus({ saving: false, message: 'Saved to server' });
      setTimeout(() => setWizardStatus(s => s.message === 'Saved to server' ? { ...s, message: '' } : s), 1500);
    } catch (e) {
      setWizardStatus({ saving: false, message: e.message || 'Save failed' });
    }
  }

  async function toggleStep(step) {
    if (step.owner !== 'user') return;
    const list = new Set(wizardUser.completed || []);
    const turningOn = !list.has(step.id);
    if (turningOn) list.add(step.id); else list.delete(step.id);
    const patch = { completed: [...list] };
    if (step.id === 'password_reset' && turningOn) {
      patch.iits_pw_date = wizardUser.iits_pw_date || new Date().toISOString();
      patch.adm_pw_date = wizardUser.adm_pw_date || new Date().toISOString();
    }
    if (step.id === 'vpn_request' && turningOn) {
      patch.vpn_date = wizardUser.vpn_date || new Date().toISOString();
    }
    await saveWizard(patch);
  }

  async function claimOtp() {
    const token = otp.tokenChars.join('').trim().toUpperCase();
    if (token.length < 2) return;
    try {
      const data = await API.claimOtp(token);
      if (data.status === 'otp_ready') {
        setOtp(s => ({ ...s, token, panel: 'otp', otpValue: data.otp || '———', otpRemaining: data.expires_in || CONFIG.OTP_DISPLAY_SEC }));
        return;
      }
      const position = data.position || 1;
      setOtp(s => ({
        ...s,
        token,
        panel: position === 1 ? 'active' : 'waiting',
        position,
        waitEstimate: data.wait_estimate || 0,
        queueDepth: data.queue_depth || position,
        activeRemaining: data.expires_in || CONFIG.CLAIM_EXPIRY_SEC,
      }));
    } catch (e) {
      setOtp(s => ({ ...s, panel: 'error', message: e.message || 'Could not claim slot' }));
    }
  }

  function resetClaim() {
    setOtp({ tokenChars: ['', '', ''], panel: 'claim', message: '', position: 1, waitEstimate: 0, queueDepth: 0, otpValue: '———', activeRemaining: CONFIG.CLAIM_EXPIRY_SEC, otpRemaining: CONFIG.OTP_DISPLAY_SEC, token: '' });
  }

  async function retryOtp() {
    try { if (otp.token) await API.deleteClaim(otp.token); } catch {}
    const token = otp.token;
    setOtp(s => ({ ...s, tokenChars: token ? token.split('').concat(['']).slice(0,3) : ['', '', ''] }));
    if (token) {
      try {
        const data = await API.claimOtp(token);
        const position = data.position || 1;
        setOtp(s => ({ ...s, token, panel: position === 1 ? 'active' : 'waiting', position, waitEstimate: data.wait_estimate || 0, queueDepth: data.queue_depth || position, activeRemaining: data.expires_in || CONFIG.CLAIM_EXPIRY_SEC }));
      } catch (e) {
        setOtp(s => ({ ...s, panel: 'error', message: e.message || 'Could not re-queue' }));
      }
    }
  }

  async function doAdminAuth() {
    setAdmin(s => ({ ...s, error: '', loading: true }));
    try {
      if (admin.mode === 'setup') {
        if (!admin.credential || admin.credential !== admin.confirm) throw new Error('Credentials do not match');
        const data = await API.adminAuthSetup(admin.credential, admin.current || undefined);
        sessionStorage.setItem('adminSession', data.session);
        setAdmin(s => ({ ...s, session: data.session, loading: false, configured: true, mode: 'login', credential: '', current: '', confirm: '' }));
        await loadAdminData(data.session);
      } else {
        const data = await API.adminAuthLogin(admin.credential);
        sessionStorage.setItem('adminSession', data.session);
        setAdmin(s => ({ ...s, session: data.session, loading: false, credential: '' }));
        await loadAdminData(data.session);
      }
    } catch (e) {
      setAdmin(s => ({ ...s, error: e.message, loading: false }));
    }
  }

  async function loadAdminData(session = admin.session) {
    if (!session) return;
    setAdmin(s => ({ ...s, loading: true, error: '' }));
    try {
      const [wizard, queue, users, log, config] = await Promise.all([
        API.adminWizard(session),
        API.adminQueue(session).catch(() => ({ queue: [] })),
        API.adminUsers(session).catch(() => ({ count: 0 })),
        API.adminLog(session).catch(() => ({ total: 0, entries: [] })),
        API.adminConfig(session).catch(() => ({ admin_tokens: ['JA','AM','CS'] })),
      ]);
      setAdmin(s => ({ ...s, data: { users: wizard.users || [], queue: queue.queue || [], log: log.entries || [], logTotal: log.total || 0, userCount: users.count || 0 }, configTokens: (config.admin_tokens || []).join(', '), loading: false }));
    } catch (e) {
      setAdmin(s => ({ ...s, error: e.message, loading: false }));
    }
  }

  async function toggleAdminStep(token, stepId) {
    const current = admin.data?.users?.find(u => u.token === token);
    const completed = new Set(current?.adminCompleted || []);
    if (completed.has(stepId)) completed.delete(stepId); else completed.add(stepId);
    await API.saveWizard({ ...current, token, adminCompleted: [...completed] });
    try { await API.notifyAdminTask({ token, step_id: stepId, action: completed.has(stepId) ? 'done' : 'undone' }); } catch {}
    await loadAdminData();
  }

  async function saveConfig() {
    const tokens = admin.configTokens.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    await API.saveAdminConfig(admin.session, tokens);
    await loadAdminData();
  }

  async function logoutAdmin() {
    try { await API.adminAuthLogout(admin.session); } catch {}
    sessionStorage.removeItem('adminSession');
    setAdmin(s => ({ ...s, session: '', data: null }));
  }

  const sharedSidebar = (
    <div className="side-stack">
      <div className="card side-card">
        <div className="side-card-title">How this works</div>
        <div className="notes-list">
          <div className="small">Claim the OTP slot first, then trigger the RTA OTP only when the portal tells you to.</div>
          <div className="small">The wizard is shared and server-backed, so credentials and reminder dates follow the user token across devices.</div>
          <div className="small">Admins can monitor onboarding progress and complete the admin-owned steps.</div>
        </div>
      </div>
      <div className="card side-card">
        <div className="side-card-title">Quick links</div>
        <div className="quick-links">
          <a className="quick-link" href="https://srvotp26.init-db.lan"><span>OTP Relay</span><small>LAN</small></a>
          <a className="quick-link" href="https://direct.rta.ae"><span>RTA Automation Portal</span><small>Portal</small></a>
          <a className="quick-link" href="https://srvterminal.init-db.lan"><span>Terminal Server</span><small>UAE-only workaround</small></a>
          <a className="quick-link" href="https://ettisal.rta.ae/vendors"><span>Ivanti VPN</span><small>ettisal.rta.ae</small></a>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-left"><Logo /><span className="topbar-title">OTP Portal</span></div>
        <div className="topbar-right">
          {['otp', 'wizard', 'help', 'admin'].map(v => (
            <span key={v} className={`nav-pill ${view === v ? 'active' : ''}`} onClick={() => {
              setView(v);
              if (v === 'admin' && admin.session && !admin.data) loadAdminData();
            }}>{v === 'otp' ? 'OTP' : v === 'wizard' ? 'RTA Wizard' : v === 'help' ? 'Help' : 'Admin'}</span>
          ))}
          {admin.session && view === 'admin' && <button className="btn btn-secondary" onClick={logoutAdmin}>Logout</button>}
        </div>
      </header>
      <main className="app-shell">
        {view === 'otp' && <OtpView otp={otp} setOtp={setOtp} claimOtp={claimOtp} retryOtp={retryOtp} resetClaim={resetClaim} sidebar={sharedSidebar} />}
        {view === 'wizard' && <WizardView user={wizardUser} saveWizard={saveWizard} wizardStatus={wizardStatus} openStep={openStep} setOpenStep={setOpenStep} doneCount={doneCount} progressPct={progressPct} nextStep={nextStep} toggleStep={toggleStep} />}
        {view === 'help' && <HelpView faqOpen={faqOpen} setFaqOpen={setFaqOpen} />}
        {view === 'admin' && <AdminView admin={admin} setAdmin={setAdmin} doAdminAuth={doAdminAuth} loadAdminData={loadAdminData} toggleAdminStep={toggleAdminStep} pendingAdminTasks={pendingAdminTasks} saveConfig={saveConfig} />}
      </main>
    </>
  );
}

function OtpView({ otp, setOtp, claimOtp, retryOtp, resetClaim, sidebar }) {
  const token = otp.tokenChars.join('');
  const claimDisabled = token.trim().length < 2;
  const ringValue = otp.panel === 'otp' ? otp.otpRemaining : otp.activeRemaining;
  const ringTotal = otp.panel === 'otp' ? CONFIG.OTP_DISPLAY_SEC : CONFIG.CLAIM_EXPIRY_SEC;
  const offset = CONFIG.RING_CIRCUMFERENCE * (1 - ringValue / ringTotal);
  const fmt = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2,'0')}`;
  const inputRefs = React.useRef([]);

  function onChar(i, value) {
    const v = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next = [...otp.tokenChars];
    next[i] = v;
    setOtp(s => ({ ...s, tokenChars: next }));
    if (v && i < 2) {
      requestAnimationFrame(() => inputRefs.current[i + 1]?.focus());
    }
  }

  function onKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp.tokenChars[i] && i > 0) {
      requestAnimationFrame(() => inputRefs.current[i - 1]?.focus());
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      inputRefs.current[i - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && i < 2) {
      e.preventDefault();
      inputRefs.current[i + 1]?.focus();
    }
  }

  function onPaste(e) {
    e.preventDefault();
    const paste = (e.clipboardData.getData('text') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    const next = ['', '', ''];
    for (let i = 0; i < paste.length; i++) next[i] = paste[i];
    setOtp(s => ({ ...s, tokenChars: next }));
    const focusIndex = Math.min(paste.length, 2);
    requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus());
  }

  return (
    <div className="user-grid">
      <div>
        {otp.panel === 'claim' && (
          <div className="card claim-card">
            <div className="eyebrow">// Shared OTP relay</div>
            <h1 className="h1">Request your OTP</h1>
            <div className="sub">Enter your personal token and claim your slot. The OTP code will appear right here — no email needed.</div>
            <div className="token-wrap">
              {[0,1,2].map(i => (
                <input
                  key={i}
                  ref={el => (inputRefs.current[i] = el)}
                  className="token-char mono"
                  value={otp.tokenChars[i]}
                  onChange={e => onChar(i, e.target.value)}
                  onKeyDown={e => onKeyDown(i, e)}
                  onPaste={onPaste}
                  placeholder="_"
                  maxLength={1}
                  autoComplete="off"
                  spellCheck="false"
                />
              ))}
            </div>
            <div className="token-hint">2 or 3 characters · letters and digits only</div>
            <button className="btn btn-primary" disabled={claimDisabled} onClick={claimOtp}>Claim my slot →</button>
            <div className="footer-note">Never share your OTP with anyone — not even IT. Especially not IT.</div>
          </div>
        )}

        {otp.panel !== 'claim' && (
          <div className="card status-card">
            {otp.panel === 'active' && (
              <>
                <span className="queue-badge">You have the slot</span>
                <h2 className="status-title">Go trigger your OTP now</h2>
                <div className="sub">Open the platform and request the SMS code. It will appear on this screen within seconds.</div>
              </>
            )}
            {otp.panel === 'waiting' && (
              <>
                <span className="queue-badge warn">Position #{otp.position} in queue</span>
                <h2 className="status-title">Hang tight — almost your turn</h2>
                <div className="sub">Someone is ahead of you. Do not trigger your OTP yet. Wait until this page tells you to.</div>
              </>
            )}
            {otp.panel === 'otp' && (
              <>
                <span className="queue-badge success">OTP received</span>
                <h2 className="status-title">Your one-time password</h2>
                <div className="sub">Use it now — it expires on the platform, not just here.</div>
                <div className="otp-box"><div className="otp-label">One-Time Password</div><div className="otp-code">{otp.otpValue}</div></div>
              </>
            )}
            {otp.panel === 'expired' && (
              <>
                <span className="queue-badge warn">Slot reclaimed</span>
                <h2 className="status-title">Slot reclaimed — no hard feelings</h2>
                <div className="sub">90 seconds passed without an OTP arriving. Claim your slot first, then trigger the OTP in that order.</div>
                <button className="btn btn-primary" onClick={resetClaim}>Try again</button>
              </>
            )}
            {otp.panel === 'error' && (
              <>
                <span className="queue-badge warn">Error</span>
                <h2 className="status-title">Something went wrong</h2>
                <div className="sub">{otp.message || 'Please try again.'}</div>
                <button className="btn btn-danger" onClick={resetClaim}>Try again</button>
              </>
            )}

            {(otp.panel === 'active' || otp.panel === 'otp') && (
              <div className="ring-wrap">
                <svg width="116" height="116" viewBox="0 0 116 116">
                  <circle className="ring-track" cx="58" cy="58" r="42" />
                  <circle className={`ring-fill ${otp.panel === 'otp' ? 'success' : ''} ${otp.panel === 'otp' && otp.otpRemaining < 60 ? 'warn' : ''}`} cx="58" cy="58" r="42" strokeDasharray={CONFIG.RING_CIRCUMFERENCE} strokeDashoffset={offset} />
                </svg>
                <div className="ring-text">{fmt(ringValue)}</div>
              </div>
            )}

            {otp.panel === 'waiting' && (
              <div>
                <div className="sub" style={{ textAlign: 'center', marginTop: 14 }}><span className="mono">Position {otp.position}</span> · <span className="mono">Est. wait {otp.waitEstimate}s</span></div>
                <div className="queue-room">
                  {Array.from({ length: otp.queueDepth || otp.position }, (_, idx) => idx + 1).map(n => (
                    <div key={n} className={`queue-row ${n === 1 ? 'active' : ''} ${n === otp.position ? 'you' : ''}`}>
                      <div className={`dot ${n === 1 ? 'active' : ''}`}>{n}</div>
                      <div className="sub" style={{ margin: 0 }}>{n === 1 ? 'getting OTP now…' : n === otp.position ? 'you' : 'waiting'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(otp.panel === 'active' || otp.panel === 'waiting') && (
              <div className="status-list">
                <div className="status-step"><div className="dot done">✓</div><div>Slot claimed successfully</div></div>
                <div className="status-step"><div className={`dot ${otp.panel === 'active' ? 'active' : ''}`}>2</div><div>{otp.panel === 'active' ? 'Trigger the OTP on the RTA platform now' : 'Wait for the green light before touching the RTA page'}</div></div>
                <div className="status-step"><div className="dot">3</div><div>The OTP appears here automatically</div></div>
              </div>
            )}

            {otp.panel === 'otp' && <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={retryOtp}>↻ Send again</button>}
          </div>
        )}
      </div>
      {sidebar}
    </div>
  );
}

function WizardView({ user, saveWizard, wizardStatus, openStep, setOpenStep, doneCount, progressPct, nextStep, toggleStep }) {
  return (
    <div className="wide-layout">
      <div className="card main-panel">
        <div className="hero-row">
          <div>
            <div className="eyebrow">// RTA onboarding dashboard</div>
            <h1 className="h1">RTA Access Wizard</h1>
            <div className="sub">Manager-style layout, but in the INIT light theme and official RS colors. Your token record is server-backed so reminders and progress persist across devices.</div>
          </div>
          <div className="hero-meta">
            <span className="pill primary">{doneCount} / {STEPS.length} done</span>
            {nextStep && <span className="pill warn">Up next: {nextStep.title}</span>}
          </div>
        </div>

        <div className="card progress-card" style={{ boxShadow: 'none' }}>
          <div className="eyebrow">// Progress</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div><strong>{progressPct}% complete</strong><div className="small">User and admin-owned steps are counted together.</div></div>
            {wizardStatus.message && <div className={wizardStatus.message.includes('failed') ? 'error-box' : 'success-box'}>{wizardStatus.message}</div>}
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }} /></div>
        </div>

        <div className="step-grid">
          {STEPS.map(step => {
            const done = getVisibleDone(user, step);
            const unlocked = isUnlocked(user, step);
            const isNext = nextStep?.id === step.id;
            const open = openStep === step.id;
            return (
              <div key={step.id} className={`step-card ${step.owner === 'admin' ? 'admin' : ''} ${isNext ? 'next' : ''} ${!unlocked ? 'locked' : ''}`}>
                <div className={`rail ${done ? 'done' : isNext ? 'next' : ''}`}>{done ? '✓' : step.icon}</div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                    <div>
                      <h3 className="step-title">{step.title}</h3>
                      <div className="step-summary">{step.summary}</div>
                    </div>
                    <div className="step-tags">
                      <span className={`pill ${step.owner === 'admin' ? 'warn' : 'primary'}`}>{step.owner === 'admin' ? 'Admin' : 'You'}</span>
                      <span className="pill">{step.time}</span>
                      {!unlocked && <span className="pill">Locked</span>}
                    </div>
                  </div>
                  <div className="step-actions">
                    {step.owner === 'user' ? (
                      <button className={`step-check ${done ? 'done' : ''}`} onClick={() => toggleStep(step)} disabled={!unlocked}>{done ? '✓' : '☐'}</button>
                    ) : (
                      <span className={`pill ${done ? 'success' : 'warn'}`}>{done ? 'Completed by admin' : 'Waiting for admin'}</span>
                    )}
                    <button className="btn btn-secondary" onClick={() => setOpenStep(open ? null : step.id)}>{open ? 'Hide guide' : '📖 View guide'}</button>
                    {isNext && !done && <span className="pill primary">← Up next</span>}
                  </div>
                  {open && <Guide step={step} user={user} />}
                </div>
                <div />
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-panel">
        <div className="card side-card">
          <div className="side-card-title">Your credentials</div>
          <div className="form-grid">
            <div className="field"><label>INIT token</label><input value={user.token || ''} onChange={e => saveWizard({ token: e.target.value })} placeholder="2–3 chars" /></div>
            <div className="field"><label>Display name</label><input value={user.display_name || ''} onChange={e => saveWizard({ display_name: e.target.value })} placeholder="e.g. Sara" /></div>
            <div className="field"><label>IITS username</label><input value={user.iits_username || ''} onChange={e => saveWizard({ iits_username: e.target.value })} placeholder="IITS_…" /></div>
            <div className="field"><label>ADM username</label><input value={user.adm_username || ''} onChange={e => saveWizard({ adm_username: e.target.value })} placeholder="ADM_…" /></div>
          </div>
        </div>

        <div className="card side-card">
          <div className="side-card-title">Password expiry</div>
          <CountdownEntry label="IITS Password" date={user.iits_pw_date} onDateChange={d => saveWizard({ iits_pw_date: d })} onReset={() => saveWizard({ iits_pw_date: new Date().toISOString() })} />
          <CountdownEntry label="ADM Password" date={user.adm_pw_date} onDateChange={d => saveWizard({ adm_pw_date: d })} onReset={() => saveWizard({ adm_pw_date: new Date().toISOString() })} />
          <div className="small" style={{ marginTop: 10 }}>Passwords expire every 90 days. No reminders from RTA.</div>
        </div>

        <div className="card side-card">
          <div className="side-card-title">VPN expiry</div>
          <CountdownEntry label="VPN Access" date={user.vpn_date} onDateChange={d => saveWizard({ vpn_date: d })} onReset={() => saveWizard({ vpn_date: new Date().toISOString() })} />
          <div className="small" style={{ marginTop: 10 }}>VPN, PAM, and SFTP access all expire after 90 days.</div>
        </div>

        <div className="card side-card">
          <div className="side-card-title">Quick links</div>
          <div className="quick-links">
            <a className="quick-link" href="https://srvotp26.init-db.lan"><span>OTP Relay</span><small>Claim first</small></a>
            <a className="quick-link" href="https://direct.rta.ae"><span>RTA Automation Portal</span><small>Main portal</small></a>
            <a className="quick-link" href="https://srvterminal.init-db.lan"><span>Terminal Server</span><small>Outside UAE</small></a>
            <a className="quick-link" href="https://ettisal.rta.ae/vendors"><span>Ivanti VPN</span><small>Install/test</small></a>
          </div>
        </div>

        <div className="card side-card">
          <div className="side-card-title">Good to know</div>
          <div className="notes-list">
            <div className="small">Full onboarding usually takes 2–3 weeks.</div>
            <div className="small">Test servers: VPN → Jump Server (RDP) → target.</div>
            <div className="small">File transfer: VPN → WinSCP → SFTP → target server.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Guide({ step }) {
  return (
    <div className="guide-panel">
      {step.details.map((block, idx) => {
        if (block.type === 'info') return <div key={idx} className="guide-block"><div className="inline-info">{block.text}</div></div>;
        if (block.type === 'warn') return <div key={idx} className="guide-block"><div className="inline-note">{block.text}</div></div>;
        if (block.type === 'list') return <div key={idx} className="guide-block"><div className="guide-label">{block.title}</div><ul>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>;
        if (block.type === 'links') return <div key={idx} className="guide-block"><div className="guide-label">{block.title}</div><ul>{block.items.map((item, i) => <li key={i}><a href={item.href}>{item.label}</a></li>)}</ul></div>;
        if (block.type === 'kv') return <div key={idx} className="guide-block"><div className="guide-label">{block.title}</div>{block.items.map((item, i) => <div className="kv" key={i}><div className="kv-key">{item[0]}</div><div>{item[1]}</div></div>)}</div>;
        return null;
      })}
    </div>
  );
}

function CountdownEntry({ label, date, onDateChange, onReset }) {
  const days = daysLeft(date);
  return (
    <div className="side-entry">
      <div className="side-entry-head">
        <div>
          <div className="side-entry-title">{label}</div>
          <div className="small">Last set: {fmtShortDate(date)}</div>
        </div>
        <div className={`countdown ${countdownTone(days)}`}>{days == null ? '—' : days <= 0 ? 'Expired' : `${days}d`}</div>
      </div>
      <div className="date-row">
        <input type="date" value={toDateInputValue(date)} onChange={e => onDateChange(fromDateInputValue(e.target.value))} />
        <button className="btn btn-secondary" onClick={onReset}>↻ Reset</button>
      </div>
    </div>
  );
}

function HelpView({ faqOpen, setFaqOpen }) {
  const sections = [
    ['Using this portal', [
      ['How do I use this portal to get my OTP?', 'Enter your token and claim the slot first. If someone is ahead of you, wait. Only when the portal says “Go trigger your OTP now” should you request the OTP from the RTA platform. The code appears on-screen in the portal.'],
      ['I claimed a slot but the OTP never appeared', 'Your 90-second active slot may have expired, or you triggered the OTP too early. Claim → wait for green light → trigger OTP.'],
      ['Where do I find my token?', 'Your token is assigned by IT. If you do not have one, ask Amer or Jathin to add you to the user list.']
    ]],
    ['Password & accounts', [
      ['What are the RTA password requirements?', 'Use more than 10 characters and include at least one number, one uppercase letter, and one special character. Avoid names, dictionary words, and simple sequences.'],
      ['When do passwords expire?', 'Both IITS and ADM passwords expire after 90 days. No reminder is sent, which is why the dashboard tracks the countdown.'],
      ['What accounts will I have?', 'IITS for VPN and reset flows, ADM for PAM and privileged access. Oracle Authenticator is used as the second factor.']
    ]],
    ['VPN & server access', [
      ['How do I connect to the RTA VPN?', 'Install Ivanti Secure Access Client and add the vendor URL https://ettisal.rta.ae/vendors. Use your IITS account plus Oracle Authenticator TOTP.'],
      ['How do I use PAM?', 'Connect to the VPN, open PAM, log in with rtadom\\IITS_*USERNAME* and the TOTP, search for the account, and use PSM-RDP to connect.'],
      ['How do I transfer files?', 'Use WinSCP to connect to the SFTP host 10.11.174.40 on port 122 via VPN, then move files from SFTP to the target server.']
    ]],
    ['Terminal server', [
      ['Why do I need the terminal server?', 'Some reset links and RTA pages only work inside the UAE. If you are outside the UAE, connect to srvterminal.init-db.lan first.'],
      ['Browser access', 'Open https://srvterminal.init-db.lan, accept the certificate warning, log in, then access the required RTA links inside the remote session.'],
      ['Windows RDP access', 'Use Remote Desktop Connection to 172.31.10.82 or srvterminal, then log in with your domain credentials.']
    ]],
  ];

  return (
    <div className="help-grid">
      <div className="card main-panel">
        <div className="eyebrow">// Documentation</div>
        <h1 className="h1">Help & Docs</h1>
        <div className="sub">This keeps the current help content, but in a wider layout that uses the space properly.</div>
        {sections.map(([label, items]) => (
          <div key={label}>
            <div className="help-section">{label}</div>
            <div className="faq-stack">
              {items.map(([q, a]) => {
                const open = !!faqOpen[q];
                return (
                  <div className="faq" key={q}>
                    <div className="faq-q" onClick={() => setFaqOpen(s => ({ ...s, [q]: !s[q] }))}><span>{q}</span><span>{open ? '▴' : '▾'}</span></div>
                    {open && <div className="faq-a">{a}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="side-panel">
        <div className="card side-card">
          <div className="side-card-title">Contacts</div>
          <div className="contact-card"><strong>Jathin</strong><div className="small">RTA account creation, IAM username, ADM notification</div></div>
          <div className="contact-card"><strong>Amer Darwich</strong><div className="small">ADM account, PAM onboard list, OTP token assignment</div></div>
          <div className="contact-card"><strong>Christian Schilling</strong><div className="small">Admin oversight and escalation</div></div>
          <div className="contact-card"><strong>RTA IT Support</strong><div className="small">VPN access grant and access issues via the RTA Automation Portal → IT Help Desk</div></div>
        </div>
      </div>
    </div>
  );
}

function AdminView({ admin, setAdmin, doAdminAuth, loadAdminData, toggleAdminStep, pendingAdminTasks, saveConfig }) {
  useEffect(() => {
    if (admin.session && !admin.data) loadAdminData();
  }, [admin.session]);

  if (!admin.session) {
    return (
      <div className="auth-wrap">
        <div className="card main-panel">
          <div className="eyebrow">// Admin access</div>
          <h1 className="h1">{admin.mode === 'setup' ? 'Set admin credential' : 'Admin login'}</h1>
          <div className="sub">Use a password or 4-digit PIN. This is shared for portal admins.</div>
          <div className="form-grid" style={{ marginTop: 18 }}>
            {admin.mode === 'setup' && admin.configured && <div className="field"><label>Current credential</label><input type="password" value={admin.current} onChange={e => setAdmin(s => ({ ...s, current: e.target.value }))} /></div>}
            <div className="field"><label>{admin.mode === 'setup' ? 'New credential' : 'Credential'}</label><input type="password" value={admin.credential} onChange={e => setAdmin(s => ({ ...s, credential: e.target.value }))} /></div>
            {admin.mode === 'setup' && <div className="field"><label>Confirm credential</label><input type="password" value={admin.confirm} onChange={e => setAdmin(s => ({ ...s, confirm: e.target.value }))} /></div>}
            {admin.error && <div className="error-box">{admin.error}</div>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-primary" disabled={admin.loading} onClick={doAdminAuth}>{admin.loading ? 'Working…' : admin.mode === 'setup' ? 'Save credential' : 'Login'}</button>
              <button className="btn btn-secondary" onClick={() => setAdmin(s => ({ ...s, mode: s.mode === 'setup' ? 'login' : 'setup', error: '' }))}>{admin.mode === 'setup' ? 'Use login' : 'Change credential'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const users = admin.data?.users || [];
  const queue = admin.data?.queue || [];
  const log = admin.data?.log || [];

  return (
    <div className="admin-layout">
      <div className="admin-top">
        <div className="card stat-card"><div className="stat-label">Wizard users</div><div className="stat-value">{users.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Pending admin tasks</div><div className="stat-value">{pendingAdminTasks.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Queue depth</div><div className="stat-value">{queue.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Audit entries</div><div className="stat-value">{admin.data?.logTotal || 0}</div></div>
      </div>

      <div className="wide-layout">
        <div className="card main-panel">
          <div className="hero-row">
            <div>
              <div className="eyebrow">// Admin dashboard</div>
              <h1 className="h1">RTA Wizard Progress</h1>
              <div className="sub">Users, credentials, progress, and admin-owned steps in one view.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => loadAdminData()}>Refresh</button>
            </div>
          </div>
          {pendingAdminTasks.length > 0 && (
            <div className="card progress-card" style={{ boxShadow: 'none', marginBottom: 14 }}>
              <div className="eyebrow">// Pending admin tasks</div>
              {pendingAdminTasks.map((t, i) => (
                <div key={i} className="admin-task-row">
                  <button className="step-check" onClick={() => toggleAdminStep(t.user.token, t.step.id)}>☐</button>
                  <div className="pill warn">{t.user.token}</div>
                  <div>
                    <div><strong>{t.step.title}</strong></div>
                    <div className="small">{t.step.adminLabel || t.step.summary}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <table className="admin-table">
            <thead>
              <tr><th>Token</th><th>IITS</th><th>ADM</th><th>Progress</th><th>Active</th><th>Admin steps</th></tr>
            </thead>
            <tbody>
              {users.sort((a,b) => a.token.localeCompare(b.token)).map(u => {
                const pct = Math.round((allDone(u).length / STEPS.length) * 100);
                const pending = STEPS.filter(s => s.owner === 'admin' && isUnlocked(u, s) && !getVisibleDone(u, s));
                return (
                  <tr key={u.token}>
                    <td><strong>{u.token}</strong></td>
                    <td className="mono">{u.iits_username || '—'}</td>
                    <td className="mono">{u.adm_username || '—'}</td>
                    <td style={{ minWidth: 180 }}>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                      <div className="small" style={{ marginTop: 6 }}>{pct}%</div>
                    </td>
                    <td>{fmtShortDate(u.updated_at || u.lastActive)}</td>
                    <td>
                      {STEPS.filter(s => s.owner === 'admin').map(s => {
                        const done = getVisibleDone(u, s);
                        return <button key={s.id} className={`btn ${done ? 'btn-secondary' : 'btn-outline'}`} style={{ marginRight: 6, marginBottom: 6, padding: '6px 10px' }} onClick={() => toggleAdminStep(u.token, s.id)}>{done ? '✓' : '☐'} {s.title}</button>;
                      })}
                      {pending.length === 0 && <div className="small">No pending admin steps</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="side-panel">
          <div className="card side-card">
            <div className="side-card-title">Admin token config</div>
            <div className="field"><label>Admin tokens</label><input value={admin.configTokens} onChange={e => setAdmin(s => ({ ...s, configTokens: e.target.value }))} /></div>
            <div className="small" style={{ marginTop: 10 }}>Seeded for Jathin, Amer, and Christian, but editable from the portal.</div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={saveConfig}>Save config</button>
          </div>
          <div className="card side-card">
            <div className="side-card-title">Live queue</div>
            {queue.length === 0 ? <div className="small">Nobody is in the queue right now.</div> : queue.map((q, i) => <div className="queue-row" key={i}><div className="dot active">{q.position || i+1}</div><div><strong>{q.token}</strong><div className="small">{q.name || q.email || ''}</div></div></div>)}
          </div>
          <div className="card side-card">
            <div className="side-card-title">Recent audit log</div>
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              {log.slice(0, 15).map((entry, i) => <div key={i} className="small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}><strong>{entry.event}</strong> · {entry.token || '—'}<br />{entry.detail || ''}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
