/* ════════════════════════════════════════
   ศรีสะเกษโรโบติกส์ 2026 - App JavaScript
   ════════════════════════════════════════ */

const API = '/api';
let token = localStorage.getItem('ssk_token') || null;
let currentUser = null;
let allCompetitions = [];
let lbRefreshTimer = null;
let currentLbCompId = null;

// ─── UTILITIES ───────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'เกิดข้อผิดพลาด');
  return data;
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.classList.remove('show'); }, 3500);
}

function showModal(id) {
  document.getElementById('modalOverlay')?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
}

function showAlert(elId, msg, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function formatTime(secs) {
  if (!secs || secs === Infinity) return '-';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${s}` : `${parseFloat(secs).toFixed(2)}s`;
}

// แสดงเวลาในหน่วย "วินาที" ล้วน ๆ (ใช้กับคอลัมน์ "เวลาดีที่สุด" ซึ่งคำนวนจาก timeUsedSeconds ของแต่ละรอบ)
// ตัวอย่าง: 95.5 → "95.50 วิ",  0 / Infinity / ไม่มีค่า → "-"
function formatSeconds(secs) {
  if (secs === null || secs === undefined) return '-';
  const n = Number(secs);
  if (!isFinite(n) || n <= 0) return '-';
  return `${n.toFixed(2)} วิ`;
}

function getCategoryIcon(cat) {
  return { autonomous: '🤖', manual: '🕹️', battle: '⚔️', line_following: '🏎️' }[cat] || '🏆';
}
function getCategoryTag(cat) {
  const map = { autonomous: ['tag-auto','อัตโนมัติ'], manual: ['tag-manual','บังคับมือ'], battle: ['tag-battle','Battle'], line_following: ['tag-line','Line Fast'] };
  return map[cat] || ['tag-auto', cat];
}
function getAgeTag(age) {
  if (age === 'open') return ['tag-open', 'รุ่นทั่วไป'];
  return ['tag-age', `อายุ ${age} ปี`];
}
function getStatusLabel(status) {
  return { upcoming:'กำลังจะมา', registration:'เปิดรับสมัคร', active:'กำลังแข่งขัน', completed:'เสร็จสิ้น' }[status] || status;
}

// ─── NAVIGATION ──────────────────────────────────────────────

// Pages that a judge can access (in addition to the always-allowed admin/login)
const JUDGE_ALLOWED_PAGES = ['home', 'competitions', 'leaderboard', 'comp-detail', 'admin', 'login'];

function navigate(page, data = null) {
  // Restricted users (viewer / unknown roles): only score entry + login
  if (isRestrictedUser() && page !== 'admin' && page !== 'login') {
    page = 'admin';
  }
  // Judges: allow public pages + score entry, block other pages
  else if (isJudge() && !JUDGE_ALLOWED_PAGES.includes(page)) {
    page = 'admin';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (!el) return;
  el.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  closeMenu();
  if (lbRefreshTimer) clearInterval(lbRefreshTimer);

  if (page === 'home') loadHome();
  else if (page === 'competitions') loadCompetitions();
  else if (page === 'leaderboard') { loadLeaderboard(); lbRefreshTimer = setInterval(loadLeaderboard, 30000); }
  else if (page === 'admin') loadAdmin();
  else if (page === 'comp-detail' && data) loadCompDetail(data);
}

function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}
function closeMenu() {
  document.getElementById('navLinks').classList.remove('open');
}

// ─── AUTH ─────────────────────────────────────────────────────

async function checkAuth() {
  if (!token) { updateNavForAuth(false); return; }
  try {
    const res = await apiFetch('/auth/me');
    currentUser = res.user;
    updateNavForAuth(true);
  } catch {
    token = null; currentUser = null;
    localStorage.removeItem('ssk_token');
    updateNavForAuth(false);
  }
}

function isAdmin() {
  return !!(currentUser && currentUser.role === 'admin');
}

function isJudge() {
  return !!(currentUser && currentUser.role === 'judge');
}

function isViewer() {
  return !!(currentUser && currentUser.role === 'viewer');
}

// Logged-in user that is NOT admin (judge, viewer, ...)
function isNonAdmin() {
  return !!(currentUser && currentUser.role && currentUser.role !== 'admin');
}

// Restricted = logged-in but NOT admin and NOT judge (e.g. viewer or unknown roles)
// Restricted users can only access the score-entry page.
// Judges can additionally browse the public pages (home / competitions / leaderboard).
function isRestrictedUser() {
  return isNonAdmin() && !isJudge();
}

function getRoleLabel(role) {
  return ({
    admin:  'ผู้ดูแลระบบ',
    judge:  'กรรมการ',
    viewer: 'ผู้ชม'
  })[role] || role || '-';
}

function updateNavForAuth(loggedIn) {
  const admin      = loggedIn && isAdmin();
  const nonAdmin   = loggedIn && isNonAdmin();
  const restricted = loggedIn && isRestrictedUser();

  document.getElementById('loginNavLink').style.display  = loggedIn ? 'none' : '';
  document.getElementById('logoutNavLink').style.display = loggedIn ? '' : 'none';
  document.getElementById('adminNavLink').style.display  = admin    ? '' : 'none';
  // "บันทึกคะแนน" quick link appears for any non-admin logged-in user
  document.getElementById('judgeNavLink').style.display  = nonAdmin ? '' : 'none';
  // Public nav links (หน้าหลัก / ประเภทการแข่งขัน / ตารางคะแนน):
  //   - guest & admin: visible
  //   - judge: visible (can browse public pages)
  //   - restricted users (viewer ฯลฯ): hidden
  const publicLinks = ['homeNavLink', 'compsNavLink', 'lbNavLink'];
  publicLinks.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = restricted ? 'none' : '';
  });

  if (loggedIn && currentUser) {
    // Admin-only tabs (ทีม / จัดการคะแนน / Battle / ผู้ใช้งาน): admin only
    const teamsTabBtn       = document.getElementById('tabBtn-teams');
    const scoreTableTabBtn  = document.getElementById('tabBtn-scoreTable');
    const matchesTabBtn     = document.getElementById('tabBtn-matches');
    const usersTabBtn       = document.getElementById('tabBtn-users');
    const scoresheetTabBtn  = document.getElementById('tabBtn-scoresheet');
    if (teamsTabBtn)      teamsTabBtn.style.display      = admin ? '' : 'none';
    if (scoreTableTabBtn) scoreTableTabBtn.style.display = admin ? '' : 'none';
    if (matchesTabBtn)    matchesTabBtn.style.display    = admin ? '' : 'none';
    if (usersTabBtn)      usersTabBtn.style.display      = admin ? '' : 'none';
    if (scoresheetTabBtn) scoresheetTabBtn.style.display = admin ? '' : 'none';
    const badge = document.getElementById('userBadge');
    if (badge) badge.textContent = `👤 ${currentUser.name} (${getRoleLabel(currentUser.role)})`;

    // Update admin page title for non-admin users
    const adminTitle = document.getElementById('adminPageTitle');
    if (adminTitle) adminTitle.textContent = nonAdmin ? '📝 บันทึกคะแนน' : '⚙️ จัดการระบบ';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value
      })
    });
    token = res.token;
    currentUser = res.user;
    localStorage.setItem('ssk_token', token);
    updateNavForAuth(true);
    showToast(`ยินดีต้อนรับ ${res.user.name}! 🎉`, 'success');
    navigate('admin');
  } catch (err) {
    showAlert('loginError', err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
}

function logout() {
  // Only restricted users (viewer ฯลฯ) go to login after logout; admins & judges return home
  const wasRestricted = isRestrictedUser();
  token = null; currentUser = null;
  localStorage.removeItem('ssk_token');
  // Stop any background auto-refresh timers
  if (typeof stopScoreAutoRefresh === 'function') stopScoreAutoRefresh();
  updateNavForAuth(false);
  navigate(wasRestricted ? 'login' : 'home');
  showToast('ออกจากระบบเรียบร้อย', 'info');
}

// ─── HOME ─────────────────────────────────────────────────────

async function loadHome() {
  try {
    if (allCompetitions.length === 0) {
      const res = await apiFetch('/competitions');
      allCompetitions = res.data;
    }
    renderHomeCompGrid(allCompetitions);
    loadHomeStats();
  } catch (err) {
    document.getElementById('homeCompGrid').innerHTML = `<p class="text-muted">ไม่สามารถโหลดข้อมูลได้: ${err.message}</p>`;
  }
}

async function loadHomeStats() {
  try {
    const [teamsRes, rankRes] = await Promise.allSettled([
      apiFetch('/teams'),
      apiFetch('/rankings')
    ]);
    if (teamsRes.status === 'fulfilled') {
      document.getElementById('statTeams').textContent = teamsRes.value.count || 0;
    }
    if (rankRes.status === 'fulfilled') {
      const total = rankRes.value.data?.reduce((s, r) => s + (r.scoresCount || 0), 0) || 0;
      document.getElementById('statScores').textContent = total;
    }
  } catch {}
}

function renderHomeCompGrid(comps) {
  const grid = document.getElementById('homeCompGrid');
  if (!comps.length) { grid.innerHTML = '<p class="text-muted text-center">ไม่มีข้อมูลประเภทการแข่งขัน</p>'; return; }
  grid.innerHTML = comps.slice(0,9).map(c => renderCompCard(c)).join('');
}

function renderCompCard(c) {
  const [catClass, catLabel] = getCategoryTag(c.category);
  const [ageClass, ageLabel] = getAgeTag(c.ageGroup);
  const icon = getCategoryIcon(c.category);
  const statusLabel = getStatusLabel(c.status);
  const statusClass = c.status === 'active' ? 'active' : c.status === 'completed' ? 'completed' : c.status === 'registration' ? 'registration' : 'upcoming';
  return `
    <div class="comp-card" onclick="navigate('comp-detail', '${c._id}')">
      <div class="comp-card-header">
        <div class="comp-icon">${icon}</div>
        <div>
          <div class="comp-code">${c.code}</div>
          <div class="comp-name">${c.name}</div>
        </div>
      </div>
      <div class="comp-tags">
        <span class="tag ${catClass}">${catLabel}</span>
        <span class="tag ${ageClass}">${ageLabel}</span>
        ${c.scoringType === 'BATTLE' ? '<span class="tag tag-battle">Battle</span>' : ''}
        ${c.scoringType === 'TIME' ? '<span class="tag tag-line">⏱ เวลา</span>' : ''}
      </div>
      <div class="comp-footer">
        <div class="comp-status">
          <div class="status-dot ${statusClass}"></div>
          <span>${statusLabel}</span>
        </div>
        <div class="comp-round-badge">${c.totalRounds} รอบ · ${Math.floor(c.timePerRoundSeconds/60)} นาที</div>
      </div>
    </div>`;
}

// ─── COMPETITIONS PAGE ────────────────────────────────────────

async function loadCompetitions() {
  const list = document.getElementById('compList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>กำลังโหลด...</p></div>';
  try {
    if (allCompetitions.length === 0) {
      const res = await apiFetch('/competitions');
      allCompetitions = res.data;
    }
    renderCompList(allCompetitions);
    populateCompSelects();
  } catch (err) {
    list.innerHTML = `<p class="text-muted">ข้อผิดพลาด: ${err.message}</p>`;
  }
}

function filterCompetitions() {
  const cat = document.getElementById('filterCategory').value;
  const age = document.getElementById('filterAge').value;
  let filtered = allCompetitions;
  if (cat) filtered = filtered.filter(c => c.category === cat);
  if (age) filtered = filtered.filter(c => c.ageGroup === age);
  renderCompList(filtered);
}

function renderCompList(comps) {
  const list = document.getElementById('compList');
  if (!comps.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>ไม่พบประเภทที่ตรงกับเงื่อนไข</p></div>';
    return;
  }
  list.innerHTML = comps.map(c => {
    const [catClass, catLabel] = getCategoryTag(c.category);
    const [ageClass, ageLabel] = getAgeTag(c.ageGroup);
    const icon = getCategoryIcon(c.category);
    return `
      <div class="comp-row" onclick="navigate('comp-detail', '${c._id}')">
        <div class="comp-row-icon">${icon}</div>
        <div class="comp-row-info">
          <div class="comp-row-name">${c.name}</div>
          <div class="comp-row-desc">${c.description || ''}</div>
          <div class="comp-tags" style="margin-top:6px">
            <span class="tag ${catClass}">${catLabel}</span>
            <span class="tag ${ageClass}">${ageLabel}</span>
          </div>
        </div>
        <div class="comp-row-right">
          <div class="comp-round-badge">${c.totalRounds} รอบ</div>
          <div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px">${getStatusLabel(c.status)}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── COMPETITION DETAIL ───────────────────────────────────────

async function loadCompDetail(compId) {
  const content = document.getElementById('compDetailContent');
  const title = document.getElementById('detailTitle');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const [compRes, teamsRes, rankRes] = await Promise.allSettled([
      apiFetch(`/competitions/${compId}`),
      apiFetch(`/teams?competition=${compId}`),
      apiFetch(`/rankings/${compId}`)
    ]);
    const comp = compRes.status === 'fulfilled' ? compRes.value.data : null;
    const teams = teamsRes.status === 'fulfilled' ? teamsRes.value.data : [];
    const rankData = rankRes.status === 'fulfilled' ? rankRes.value : null;

    if (!comp) { content.innerHTML = '<p>ไม่พบข้อมูล</p>'; return; }
    title.textContent = comp.name;

    const icon = getCategoryIcon(comp.category);
    const [catClass, catLabel] = getCategoryTag(comp.category);
    const [ageClass, ageLabel] = getAgeTag(comp.ageGroup);

    content.innerHTML = `
      <div class="detail-grid">
        <div>
          <div class="detail-card" style="margin-bottom:1rem">
            <h3 style="margin-bottom:1rem;font-size:1rem">${icon} ข้อมูลการแข่งขัน</h3>
            <div class="detail-info-item"><span class="detail-info-label">รหัส</span><span class="detail-info-value">${comp.code}</span></div>
            <div class="detail-info-item"><span class="detail-info-label">ประเภท</span><span class="detail-info-value"><span class="tag ${catClass}">${catLabel}</span></span></div>
            <div class="detail-info-item"><span class="detail-info-label">กลุ่มอายุ</span><span class="detail-info-value"><span class="tag ${ageClass}">${ageLabel}</span></span></div>
            <div class="detail-info-item"><span class="detail-info-label">จำนวนรอบ</span><span class="detail-info-value">${comp.totalRounds} รอบ</span></div>
            <div class="detail-info-item"><span class="detail-info-label">เวลา/รอบ</span><span class="detail-info-value">${Math.floor(comp.timePerRoundSeconds/60)} นาที ${comp.timePerRoundSeconds%60} วินาที</span></div>
            <div class="detail-info-item"><span class="detail-info-label">ระบบคะแนน</span><span class="detail-info-value">${comp.scoringType === 'TIME' ? '⏱ วัดเวลา' : comp.scoringType === 'BATTLE' ? '⚔️ Battle' : '🏆 คะแนน'}</span></div>
            <div class="detail-info-item"><span class="detail-info-label">วิธีจัดลำดับ</span><span class="detail-info-value">${comp.rankingMethod === 'SUM' ? 'รวมทุกรอบ' : comp.rankingMethod === 'BEST' ? 'รอบที่ดีที่สุด' : 'รอบสุดท้าย'}</span></div>
            <div class="detail-info-item"><span class="detail-info-label">ทีมที่ลงทะเบียน</span><span class="detail-info-value">${teams.length} ทีม</span></div>
            <div class="detail-info-item"><span class="detail-info-label">สถานะ</span><span class="detail-info-value">${getStatusLabel(comp.status)}</span></div>
          </div>
          ${comp.scoringCriteria?.length ? `
          <div class="detail-card">
            <h3 style="margin-bottom:1rem;font-size:1rem">📋 เกณฑ์การให้คะแนน</h3>
            <table class="criteria-table">
              <thead><tr><th>รายการ</th><th>คะแนน/หน่วย</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                ${comp.scoringCriteria.map(cr => `
                  <tr>
                    <td>${cr.label}</td>
                    <td style="color:${cr.isPenalty?'var(--danger)':'var(--accent)'}">
                      ${cr.isPenalty ? '-' : '+'}${cr.pointsPerUnit || cr.points}
                    </td>
                    <td style="font-size:0.75rem;color:var(--text-muted)">${cr.description || '-'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div style="margin-top:1rem;font-size:0.85rem;color:var(--danger);font-weight:600;">
              **หมายเหตุ : เกณฑ์ที่แสดงเป็นเพียงเกณฑ์การให้คะแนนพื้นฐาน กติกาเพิ่มเติม รวมถึงเงื่อนไขการฟาล์วหรือกติกาพิเศษ จะชี้แจงโดยกรรมการ ณ สนามแข่งขัน**
            </div>
          </div>` : ''}
        </div>
        <div>
          <div class="detail-card">
            <h3 style="margin-bottom:1rem;font-size:1rem">📊 ตารางลำดับ</h3>
            ${renderRankingTable(rankData, comp)}
          </div>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<p class="text-muted">เกิดข้อผิดพลาด: ${err.message}</p>`;
  }
}

function renderRankingTable(rankData, comp) {
  if (!rankData || !rankData.data?.length) {
    return '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>ยังไม่มีคะแนน</p></div>';
  }
  if (rankData.type === 'BATTLE') {
    return `<p class="text-muted">ดูผล Battle ในหน้าตารางคะแนน</p>`;
  }
  if (rankData.type === 'TIME') {
    return `
      <table class="data-table">
        <thead><tr><th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th><th>เวลาดีที่สุด</th><th>สำเร็จ</th></tr></thead>
        <tbody>
          ${rankData.data.map(r => `
            <tr>
              <td><span class="rank-badge rank-${r.rank <= 3 ? r.rank : 'n'}">${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</span></td>
              <td><strong>${r.team?.teamName || '-'}</strong><br><small style="color:var(--text-dim)">${r.team?.teamNumber}</small></td>
              <td style="font-size:0.8rem">${r.team?.schoolName || '-'}</td>
              <td><strong>${r.taskCompleted ? formatSeconds(r.bestScore) : '–'}</strong></td>
              <td>${r.taskCompleted ? '✅' : '❌'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  const isSum = comp.rankingMethod === 'SUM';
  return `
    <table class="data-table">
      <thead><tr><th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th><th>คะแนนรวม</th><th>${isSum ? 'เวลารวม (วิ)' : 'รอบที่แข่ง'}</th></tr></thead>
      <tbody>
        ${rankData.data.map(r => `
          <tr>
            <td><span class="rank-badge rank-${r.rank <= 3 ? r.rank : 'n'}">${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</span></td>
            <td><strong>${r.team?.teamName || '-'}</strong><br><small style="color:var(--text-dim)">${r.team?.teamNumber}</small></td>
            <td style="font-size:0.8rem">${r.team?.schoolName || '-'}</td>
            <td style="color:var(--accent);font-weight:700;font-size:1.1rem">${r.finalScore ?? 0}</td>
            <td style="color:var(--text-muted)">${isSum ? (r.totalTime ? r.totalTime.toFixed(2) : '–') : `${r.roundsCompleted}/${comp.totalRounds}`}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── LEADERBOARD ──────────────────────────────────────────────

// ─── ADMIN ────────────────────────────────────────────────────

function loadAdmin() {
  if (!token) { navigate('login'); return; }
  updateNavForAuth(true);
  // Non-admin goes straight to score entry; admin starts on teams tab
  if (isNonAdmin()) {
    switchAdminTabDirect('scores');
  } else {
    switchAdminTabDirect('teams');
  }
}

// Tabs that admin-only users can access. Non-admin users are locked to 'scores'.
const ADMIN_ONLY_TABS = ['teams', 'matches', 'users', 'scoreTable', 'scoresheet'];

const JUDGE_ALLOWED_TABS = ['scores'];

function switchAdminTabDirect(tab) {
  // Non-admin users: only scores allowed
  if (isNonAdmin() && !JUDGE_ALLOWED_TABS.includes(tab)) {
    tab = 'scores';
  }
  // Extra guard: admin-only tabs require admin role
  if (ADMIN_ONLY_TABS.includes(tab) && !isAdmin()) {
    tab = 'scores';
  }
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`adminTab-${tab}`)?.classList.add('active');
  // Activate matching tab button
  const btn = document.getElementById(`tabBtn-${tab}`);
  if (btn) btn.classList.add('active');
  // Stop score auto-refresh when leaving the scores tab to avoid background work
  if (tab !== 'scores' && typeof stopScoreAutoRefresh === 'function') {
    stopScoreAutoRefresh();
  }
  if (tab === 'teams') loadTeams();
  else if (tab === 'scores') loadScoreForm();
  else if (tab === 'scoreTable') loadScoresTableInit();
  else if (tab === 'matches') loadMatchFilters();
  else if (tab === 'users') loadUsers();
  else if (tab === 'scoresheet') loadScoresheetTab();
}

function switchAdminTab(tab) {
  if (isNonAdmin() && !JUDGE_ALLOWED_TABS.includes(tab)) {
    showToast('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 'error');
    return;
  }
  if (ADMIN_ONLY_TABS.includes(tab) && !isAdmin()) {
    showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error');
    return;
  }
  switchAdminTabDirect(tab);
  // Also highlight the clicked button (event.target from inline onclick)
  if (typeof event !== 'undefined' && event && event.target) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
  }
}

// ─── TEAMS ADMIN ──────────────────────────────────────────────

async function loadTeams() {
  const compFilter = document.getElementById('teamCompFilter')?.value || '';
  await populateCompSelects();
  try {
    const url = compFilter ? `/teams?competition=${compFilter}` : '/teams';
    const res = await apiFetch(url);
    const tbody = document.getElementById('teamsTableBody');
    if (!res.data.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:2rem">ยังไม่มีทีม</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map((t, i) => `
      <tr>
        <td>${i+1}</td>
        <td><strong>${t.teamNumber}</strong></td>
        <td>${t.teamName}</td>
        <td style="font-size:0.82rem">${t.schoolName}</td>
        <td style="font-size:0.78rem">${t.competition?.code || '-'}</td>
        <td>
          <span class="tag ${t.checkedIn ? 'tag-auto' : 'tag-age'}" style="font-size:0.7rem">
            ${t.checkedIn ? '✅ เช็คอิน' : '⏳ รอ'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline btn-icon" onclick="editTeam('${t._id}')" title="แก้ไข">✏️</button>
          ${!t.checkedIn ? `<button class="btn btn-sm btn-outline btn-icon" onclick="checkInTeam('${t._id}')" title="เช็คอิน">✅</button>` : ''}
          <button class="btn btn-sm btn-outline btn-icon" onclick="deleteTeam('${t._id}')" title="ลบ" style="color:var(--danger)">🗑️</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    showToast(`โหลดทีมล้มเหลว: ${err.message}`, 'error');
  }
}

async function populateCompSelects() {
  if (allCompetitions.length === 0) {
    const res = await apiFetch('/competitions');
    allCompetitions = res.data;
  }
  const selects = ['teamCompFilter', 'teamComp', 'scoreCompetition', 'matchCompFilter'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    const firstOpt = id === 'teamCompFilter' ? '<option value="">ทุกประเภท</option>' :
                     id === 'matchCompFilter' ? '<option value="">ประเภท Battle...</option>' :
                     '<option value="">เลือกประเภท...</option>';
    el.innerHTML = firstOpt + allCompetitions.map(c =>
      `<option value="${c._id}" ${c._id === current ? 'selected' : ''}>${c.name.substring(0,50)}</option>`
    ).join('');
  });
}

function showTeamModal(team = null) {
  document.getElementById('teamId').value = team?._id || '';
  document.getElementById('teamName').value = team?.teamName || '';
  document.getElementById('teamSchool').value = team?.schoolName || '';
  document.getElementById('teamCoach').value = team?.coachName || '';
  const members = team?.members || [];
  document.getElementById('teamMember1').value = members[0]?.name || '';
  document.getElementById('teamMember2').value = members[1]?.name || '';
  document.getElementById('teamMember3').value = members[2]?.name || '';
  if (team?.competition) {
    document.getElementById('teamComp').value = typeof team.competition === 'object' ? team.competition._id : team.competition;
  }
  document.getElementById('teamModalTitle').textContent = team ? 'แก้ไขทีม' : 'เพิ่มทีม';
  document.getElementById('teamModalMsg').style.display = 'none';
  showModal('teamModal');
}

async function editTeam(id) {
  try {
    const res = await apiFetch(`/teams/${id}`);
    showTeamModal(res.data);
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveTeam() {
  const id = document.getElementById('teamId').value;
  const m1 = document.getElementById('teamMember1').value.trim();
  const m2 = document.getElementById('teamMember2').value.trim();
  const m3 = document.getElementById('teamMember3').value.trim();
  const members = [];
  if (m1) members.push({ name: m1, role: 'competitor' });
  if (m2) members.push({ name: m2, role: 'competitor' });
  if (m3) members.push({ name: m3, role: 'competitor' });
  const payload = {
    competition: document.getElementById('teamComp').value,
    teamName: document.getElementById('teamName').value.trim(),
    schoolName: document.getElementById('teamSchool').value.trim(),
    coachName: document.getElementById('teamCoach').value.trim(),
    members
  };
  if (!payload.competition || !payload.teamName || !payload.schoolName) {
    showAlert('teamModalMsg', 'กรุณากรอกข้อมูลที่จำเป็น', 'error'); return;
  }
  try {
    if (id) await apiFetch(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await apiFetch('/teams', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(); showToast('บันทึกทีมเรียบร้อย ✅', 'success'); loadTeams();
  } catch (err) { showAlert('teamModalMsg', err.message, 'error'); }
}
async function downloadDynamicTemplate() {
  if (allCompetitions.length === 0) {
    try {
      const res = await apiFetch('/competitions');
      allCompetitions = res.data;
    } catch (err) {
      return showToast('ไม่สามารถโหลดข้อมูลประเภทการแข่งขันได้', 'error');
    }
  }

  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += "รหัสประเภท (Code),ประเภทการแข่งขัน,ชื่อทีม,ชื่อโรงเรียน,ชื่อโค้ช,สมาชิก1,สมาชิก2,สมาชิก3\n";

  if (allCompetitions.length === 0) {
    csvContent += "NO_COMPETITION,ตัวอย่างการแข่งขัน,ทีม A,รร. ทดสอบ,ครูฝึก,นร.1,นร.2,นร.3\n";
  } else {
    allCompetitions.forEach(c => {
      const safeName = c.name.replace(/"/g, '""');
      const formattedName = safeName.includes(',') ? `"${safeName}"` : safeName;
      csvContent += `${c.code},${formattedName},ทีม...,โรงเรียน...,โค้ช...,แบบคั่นด้วยลูกน้ำ,,,\n`;
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "template-teams.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function parseCSVRow(str) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inQuotes) {
      if (char === '"' && str[i+1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { current += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
  }
  result.push(current.trim());
  return result;
}

async function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = text.split(/\r?\n|\r/).filter(r => r.trim() !== '');
  if (rows.length < 2) return showToast('ไฟล์ CSV ว่างหรือไม่มีข้อมูล', 'error');

  if (allCompetitions.length === 0) {
    const res = await apiFetch('/competitions');
    allCompetitions = res.data;
  }

  const teamsData = [];
  for (let i = 1; i < rows.length; i++) {
    // Robust CSV parsing
    const cols = parseCSVRow(rows[i]);
    if (cols.length < 3) continue;

    const compCode = cols[0] || '';
    // cols[1] ถูกใช้งานเป็นคอลัมน์ชื่อประเภทเพื่อให้มนุษย์อ่าน (Display Only) จะไม่ถูกนำเข้า
    const teamName = cols[2] || '';
    const schoolName = cols[3] || '';
    const coachName = cols[4] || '';

    const members = [];
    if (cols[5]) members.push({ name: cols[5], role: 'competitor' });
    if (cols[6]) members.push({ name: cols[6], role: 'competitor' });
    if (cols[7]) members.push({ name: cols[7], role: 'competitor' });

    const compMatch = allCompetitions.find(c => c.code.toLowerCase() === compCode.toLowerCase());
    if (!compMatch) {
      console.warn(`ไม่พบรหัสประเภทการแข่งขัน: ${compCode} ข้ามรายการนี้`);
      continue;
    }

    if (teamName && schoolName) {
      teamsData.push({
        competition: compMatch._id,
        teamName,
        schoolName,
        coachName,
        members
      });
    }
  }

  if (teamsData.length === 0) {
    event.target.value = '';
    return showToast('ไม่พบข้อมูลทีมที่นำเข้าได้ อาจเพราะรหัสประเภทผิด', 'error');
  }

  try {
    const res = await apiFetch('/teams/bulk', {
      method: 'POST',
      body: JSON.stringify({ teams: teamsData })
    });
    showToast(`นำเข้าสำเร็จ ${res.count} ทีม ✅`, 'success');
    loadTeams();
  } catch (err) {
    showToast(`นำเข้าผิดพลาด: ${err.message}`, 'error');
  }
  event.target.value = '';
}

async function checkInTeam(id) {
  try {
    await apiFetch(`/teams/${id}/checkin`, { method: 'PATCH' });
    showToast('เช็คอินสำเร็จ ✅', 'success'); loadTeams();
  } catch (err) { showToast(err.message, 'error'); }
}

async function checkInAllTeams() {
  const compFilter = document.getElementById('teamCompFilter')?.value || '';
  if (!confirm(compFilter ? 'ยืนยันเช็คอินทีมทั้งหมดในประเภทการแข่งขันนี้?' : 'ยืนยันเช็คอิน "ทุกทีมในระบบ" ทั้งหมด?')) return;
  try {
    const res = await apiFetch('/teams/bulk-checkin', {
      method: 'PATCH',
      body: JSON.stringify({ competition: compFilter })
    });
    showToast(`เช็คอินทั้งหมดสำเร็จ (${res.count} ทีม) ✅`, 'success');
    loadTeams();
  } catch (err) {
    showToast(`เช็คอินทั้งหมดผิดพลาด: ${err.message}`, 'error');
  }
}

async function deleteTeam(id) {
  if (!confirm('ยืนยันลบทีมนี้อย่างถาวร?')) return;
  try {
    await apiFetch(`/teams/${id}`, { method: 'DELETE' });
    showToast('ลบทีมสำเร็จ 🗑️', 'success');
    loadTeams();
  } catch (err) {
    showToast(`ลบทีมผิดพลาด: ${err.message}`, 'error');
  }
}

// ─── SCORE ENTRY ──────────────────────────────────────────────

// auto-refresh timer สำหรับหน้าบันทึกคะแนน (รีเฟรช "คะแนนล่าสุด" ทุก 30 วินาที ขณะอยู่ในแท็บ)
let scoreRefreshTimer = null;
const SCORE_REFRESH_INTERVAL_MS = 30_000;

async function loadScoreForm() {
  await populateCompSelects();
  // Reset edit mode (ไม่ล้าง comp/team ที่ผู้ใช้เลือกไว้ — แค่ยกเลิกโหมดแก้ไข)
  const editInput = document.getElementById('editingScoreId');
  if (editInput) editInput.value = '';
  const banner = document.getElementById('scoreEditBanner');
  if (banner) banner.style.display = 'none';
  const title = document.getElementById('scoreFormTitle');
  if (title) title.textContent = 'บันทึกคะแนน';
  const submitBtn = document.getElementById('submitScoreBtn');
  if (submitBtn) submitBtn.textContent = '💾 บันทึกคะแนน';

  // ── Auto-refresh เมื่อสลับกลับมาแท็บบันทึกคะแนน ──
  // ถ้าผู้ใช้เลือก competition ไว้แล้ว ให้ rebuild criteria + team list + recent scores
  // เพื่อให้ข้อมูลไม่ค้างเก่า (stale)
  const compSel = document.getElementById('scoreCompetition');
  const teamSel = document.getElementById('scoreTeam');
  const compId  = compSel?.value || '';
  const prevTeam = teamSel?.value || '';

  if (compId) {
    await onCompetitionChange();  // rebuild team dropdown + criteria + preview
    if (prevTeam && teamSel) {
      // คืนค่าทีมที่เลือกไว้ (ถ้ายังอยู่ใน list)
      teamSel.value = prevTeam;
      if (teamSel.value === prevTeam) {
        await loadRecentScores(compId, prevTeam);
      }
    }
  } else {
    const fieldsDiv = document.getElementById('scoreCriteriaFields');
    if (fieldsDiv) fieldsDiv.innerHTML = '';
    const preview = document.getElementById('scorePreview');
    if (preview) preview.style.display = 'none';
    const recent = document.getElementById('recentScores');
    if (recent) recent.innerHTML = '<p class="text-muted">เลือกประเภทและทีมเพื่อดูคะแนน</p>';
  }

  startScoreAutoRefresh();
}

// เริ่ม interval auto-refresh (เรียกใช้ loadRecentScores ทุก 30 วิ)
function startScoreAutoRefresh() {
  stopScoreAutoRefresh();
  const autoBox = document.getElementById('scoreAutoRefresh');
  if (!autoBox || !autoBox.checked) {
    updateAutoRefreshStatus('ปิด');
    return;
  }
  updateAutoRefreshStatus(`ทุก ${SCORE_REFRESH_INTERVAL_MS / 1000} วิ`);
  scoreRefreshTimer = setInterval(() => {
    const compId = document.getElementById('scoreCompetition')?.value;
    const teamId = document.getElementById('scoreTeam')?.value;
    if (compId && teamId) loadRecentScores(compId, teamId);
  }, SCORE_REFRESH_INTERVAL_MS);
}

function stopScoreAutoRefresh() {
  if (scoreRefreshTimer) {
    clearInterval(scoreRefreshTimer);
    scoreRefreshTimer = null;
  }
}

function updateAutoRefreshStatus(text) {
  const el = document.getElementById('scoreAutoRefreshStatus');
  if (el) el.textContent = text ? `(${text})` : '';
}

// กด checkbox "Auto" — toggle interval
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'scoreAutoRefresh') {
    startScoreAutoRefresh();
  }
});

// รีเฟรชคะแนนล่าสุดด้วยมือ (ปุ่มในกล่อง "คะแนนล่าสุด")
async function refreshScoreForm() {
  const compId = document.getElementById('scoreCompetition')?.value;
  const teamId = document.getElementById('scoreTeam')?.value;
  if (!compId) {
    showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'info');
    return;
  }
  // rebuild form สำหรับ comp ปัจจุบัน (อาจมีการเปลี่ยน criteria/totalRounds)
  allCompetitions = []; // บังคับดึง competitions ใหม่
  await populateCompSelects();
  document.getElementById('scoreCompetition').value = compId;
  await onCompetitionChange();
  if (teamId) {
    document.getElementById('scoreTeam').value = teamId;
    await loadRecentScores(compId, teamId);
  }
  showToast('รีเฟรชข้อมูลสำเร็จ ✅', 'success');
}

// ล้างฟอร์ม (ปุ่มในกล่อง "บันทึกคะแนน")
function resetScoreForm() {
  if (document.getElementById('editingScoreId')?.value) {
    if (!confirm('กำลังแก้ไขคะแนนอยู่ ยืนยันล้างฟอร์ม?')) return;
    cancelEditScore();
  }
  // ล้างค่าทั้งหมด
  const compSel = document.getElementById('scoreCompetition');
  const teamSel = document.getElementById('scoreTeam');
  if (compSel) compSel.value = '';
  if (teamSel) teamSel.innerHTML = '<option value="">เลือกทีม...</option>';

  document.getElementById('scoreCriteriaFields').innerHTML = '';
  document.getElementById('scorePreview').style.display = 'none';
  if (document.getElementById('scoreTime'))       document.getElementById('scoreTime').value = '';
  if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = false;
  if (document.getElementById('scoreDistance'))  document.getElementById('scoreDistance').value = '';
  if (document.getElementById('scoreBonusScore')) document.getElementById('scoreBonusScore').value = 0;
  if (document.getElementById('scoreRetries'))   document.getElementById('scoreRetries').value = 0;
  if (document.getElementById('scoreNotes'))     document.getElementById('scoreNotes').value = '';
  const msg = document.getElementById('scoreMsg');
  if (msg) msg.style.display = 'none';

  const tourSect = document.getElementById('tourScoreSection');
  if (tourSect) tourSect.style.display = 'none';
  document.getElementById('normalScoreFields').style.display = '';

  const recent = document.getElementById('recentScores');
  if (recent) recent.innerHTML = '<p class="text-muted">เลือกประเภทและทีมเพื่อดูคะแนน</p>';
  recentScoresCache = [];
  showToast('ล้างฟอร์มแล้ว', 'info');
}

async function submitScore() {
  const compId  = document.getElementById('scoreCompetition')?.value || '';
  const teamId  = document.getElementById('scoreTeam')?.value || '';
  const round   = parseInt(document.getElementById('scoreRound')?.value) || 1;
  const editId  = document.getElementById('editingScoreId')?.value || '';

  if (!compId) { showAlert('scoreMsg', 'กรุณาเลือกประเภทการแข่งขัน', 'error'); return; }
  if (!teamId) { showAlert('scoreMsg', 'กรุณาเลือกทีม', 'error'); return; }

  const comp = allCompetitions.find(c => c._id === compId);

  // Collect criteria details
  const details = {};
  comp?.scoringCriteria?.forEach(cr => {
    const el = document.getElementById(`crit_${cr.key}`);
    if (!el) return;
    details[cr.key] = cr.type === 'boolean' ? el.checked : (parseFloat(el.value) || 0);
  });

  const payload = {
    team:            teamId,
    competition:     compId,
    round,
    details,
    timeUsedSeconds: parseFloat(document.getElementById('scoreTime')?.value)    || 0,
    taskCompleted:   !!document.getElementById('scoreCompleted')?.checked,
    distanceCm:      parseFloat(document.getElementById('scoreDistance')?.value) || 0,
    bonusScore:      parseFloat(document.getElementById('scoreBonusScore')?.value) || 0,
    retries:         parseInt(document.getElementById('scoreRetries')?.value)  || 0,
    notes:           document.getElementById('scoreNotes')?.value?.trim() || ''
  };

  const btn = document.getElementById('submitScoreBtn');
  if (btn) btn.disabled = true;

  try {
    const url    = editId ? `/scores/${editId}` : '/scores';
    const method = editId ? 'PUT' : 'POST';
    await apiFetch(url, { method, body: JSON.stringify(payload) });

    showToast(editId ? 'แก้ไขคะแนนเรียบร้อย ✅' : 'บันทึกคะแนนเรียบร้อย ✅', 'success');

    if (editId) {
      cancelEditScore();
    } else {
      // Reset criteria fields only (keep competition/team/round for next entry)
      comp?.scoringCriteria?.forEach(cr => {
        const el = document.getElementById(`crit_${cr.key}`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = false; else el.value = 0;
      });
      if (document.getElementById('scoreTime'))       document.getElementById('scoreTime').value = '';
      if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = false;
      if (document.getElementById('scoreDistance'))  document.getElementById('scoreDistance').value = '';
      if (document.getElementById('scoreBonusScore')) document.getElementById('scoreBonusScore').value = 0;
      if (document.getElementById('scoreRetries'))   document.getElementById('scoreRetries').value = 0;
      if (document.getElementById('scoreNotes'))     document.getElementById('scoreNotes').value = '';
      calcPreviewScore(compId);
    }

    loadRecentScores(compId, teamId);
    const msg = document.getElementById('scoreMsg');
    if (msg) msg.style.display = 'none';
  } catch (err) {
    showAlert('scoreMsg', err.message || 'บันทึกไม่สำเร็จ', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onCompetitionChange() {
  const compId = document.getElementById('scoreCompetition').value;
  const teamSelect = document.getElementById('scoreTeam');
  const fieldsDiv = document.getElementById('scoreCriteriaFields');
  const roundSelect = document.getElementById('scoreRound');
  const timeField = document.getElementById('timeField');
  const completedField = document.getElementById('completedField');
  const distanceField = document.getElementById('distanceField');

  teamSelect.innerHTML = '<option value="">เลือกทีม...</option>';
  fieldsDiv.innerHTML = '';

  const tourSect = document.getElementById('tourScoreSection');
  if (!compId) {
    if (tourSect) tourSect.style.display = 'none';
    document.getElementById('normalScoreFields').style.display = '';
    return;
  }

  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;

  // Tour competitions: show phase switcher above normal score form
  if (isTourComp(comp)) {
    if (tourSect) { tourSect.style.display = ''; renderTourScoreSection(compId, comp); }
  } else {
    if (tourSect) tourSect.style.display = 'none';
    document.getElementById('normalScoreFields').style.display = '';
  }

  // Show/hide fields by scoringType
  //   - เวลาที่ใช้ (วินาที): แสดงทุกประเภท (ใช้เป็น tiebreaker / ข้อมูลอ้างอิง)
  //   - ทำสำเร็จ + ระยะทาง: เฉพาะ TIME scoring
  const isTime = comp.scoringType === 'TIME';
  if (timeField) timeField.style.display = '';
  if (completedField) completedField.style.display = isTime ? '' : 'none';
  if (distanceField) distanceField.style.display = 'none';
  const retriesField = document.getElementById('retriesField');
  if (retriesField) retriesField.style.display = comp.code?.startsWith('RESCUE_M') ? '' : 'none';

  // Set rounds
  roundSelect.innerHTML = Array.from({length: comp.totalRounds}, (_, i) =>
    `<option value="${i+1}">รอบที่ ${i+1}</option>`).join('');

  // Load teams for this competition
  try {
    const res = await apiFetch(`/teams?competition=${compId}`);
    teamSelect.innerHTML = '<option value="">เลือกทีม...</option>' +
      res.data.map(t => `<option value="${t._id}">${t.teamNumber} - ${t.teamName} (${t.schoolName})</option>`).join('');
    teamSelect.onchange = () => loadRecentScores(compId, teamSelect.value);
  } catch {}

  // Render criteria fields
  if (comp.scoringType !== 'TIME' && comp.scoringCriteria?.length) {
    fieldsDiv.innerHTML = `
      <div style="margin-bottom:0.5rem;font-size:0.8rem;color:var(--text-muted);font-weight:600">รายละเอียดคะแนน</div>
      ${comp.scoringCriteria.map(cr => `
        <div class="criteria-field">
          <div class="criteria-label">${cr.label} ${cr.isPenalty ? '(หักคะแนน)' : ''}</div>
          ${cr.type === 'boolean'
            ? `<label><input type="checkbox" class="criteria-input" id="crit_${cr.key}" onchange="calcPreviewScore('${compId}')" style="width:auto"> ทำสำเร็จ</label>`
            : `<input type="number" class="form-input criteria-input" id="crit_${cr.key}" min="0" max="${cr.maxValue || 99}" value="0" onchange="calcPreviewScore('${compId}')" oninput="calcPreviewScore('${compId}')">
               ${(comp.code?.startsWith('RESCUE_') || comp.code?.startsWith('DURIAN_') || comp.code?.startsWith('SORT_')) && cr.pointsPerUnit ? `<div style="font-size:0.72rem;color:var(--primary-light);margin-top:2px">💡 ${cr.pointsPerUnit} คะแนน / หน่วย</div>` : ''}
               ${cr.remark ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px">📌 ${cr.remark}</div>` : ''}`
          }
        </div>`).join('')}`;
    document.getElementById('scorePreview').style.display = '';
    calcPreviewScore(compId);
  }
  // For TIME-based competitions, still show preview when bonus score is entered
  if (comp.scoringType === 'TIME') {
    document.getElementById('scorePreview').style.display = '';
    document.getElementById('scorePreviewValue').textContent = '0';
  }
}

function calcPreviewScore(compId) {
  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;
  // For TIME competitions, only show bonus score in preview
  if (comp.scoringType === 'TIME') {
    const bonus = parseFloat(document.getElementById('scoreBonusScore')?.value) || 0;
    document.getElementById('scorePreviewValue').textContent = bonus;
    return;
  }
  let total = 0;
  comp.scoringCriteria?.forEach(cr => {
    const el = document.getElementById(`crit_${cr.key}`);
    if (!el) return;
    if (cr.type === 'boolean') {
      if (el.checked) total += cr.isPenalty ? -cr.points : cr.points;
    } else {
      if (cr.isInfo) return;
      const val = parseFloat(el.value) || 0;
      total += cr.isPenalty ? -val : val;
    }
  });
  const bonus = parseFloat(document.getElementById('scoreBonusScore')?.value) || 0;
  total += bonus;
  document.getElementById('scorePreviewValue').textContent = total;
}

// cache ของรายการคะแนนล่าสุด ใช้ให้ editScore หยิบข้อมูลได้โดยไม่ต้องยิง API เพิ่ม
let recentScoresCache = [];

async function loadRecentScores(compId, teamId) {
  const div = document.getElementById('recentScores');
  if (!teamId) {
    recentScoresCache = [];
    div.innerHTML = '<p class="text-muted">เลือกทีมเพื่อดูคะแนน</p>';
    return;
  }
  try {
    const res = await apiFetch(`/scores?competition=${compId}&team=${teamId}`);
    recentScoresCache = res.data || [];
    if (!recentScoresCache.length) { div.innerHTML = '<p class="text-muted">ยังไม่มีคะแนน</p>'; return; }

    const admin = isAdmin();
    const comp  = allCompetitions.find(c => c._id === compId) || recentScoresCache[0].competition;
    const isTime = comp?.scoringType === 'TIME';

    const sorted = [...recentScoresCache].sort((a, b) => (a.round || 0) - (b.round || 0));

    div.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:60px">รอบ</th>
              <th style="width:110px">⏱ เวลา (วิ)</th>
              ${isTime ? '<th style="width:80px">สำเร็จ</th><th style="width:90px">ระยะ (ซม.)</th>' : ''}
              <th style="width:90px">⭐ โบนัส</th>
              ${isTime ? '' : '<th style="width:80px">รวม</th>'}
              <th>หมายเหตุ</th>
              ${admin ? '<th style="width:160px">ผู้บันทึก / แก้ไขล่าสุด</th>' : ''}
              ${admin ? '<th style="width:90px">จัดการ</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${sorted.map(s => {
              const creator = s.createdBy?.name || s.enteredBy?.name || '-';
              const editor  = s.lastEditedBy?.name || s.enteredBy?.name || '-';
              const updated = s.updatedAt
                ? new Date(s.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                : '';
              const audit = admin ? `
                <td style="font-size:0.76rem;line-height:1.5">
                  <div>📝 <strong>${creator}</strong></div>
                  ${editor !== creator ? `<div style="color:var(--text-dim)">✏️ ${editor}</div>` : ''}
                  ${updated ? `<div style="color:var(--text-dim);font-size:0.7rem">${updated}</div>` : ''}
                </td>` : '';
              const actions = admin ? `
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-outline btn-icon" onclick="editScore('${s._id}')" title="แก้ไข">✏️</button>
                    <button class="btn btn-sm btn-outline btn-icon" onclick="deleteScore('${s._id}')" title="ลบ" style="color:var(--danger)">🗑️</button>
                  </div>
                </td>` : '';
              return `
              <tr>
                <td style="text-align:center;font-weight:600">${s.round}</td>
                <td style="text-align:center">${s.timeUsedSeconds > 0 ? Number(s.timeUsedSeconds).toFixed(2) : '-'}</td>
                ${isTime ? `
                  <td style="text-align:center">${s.taskCompleted ? '✅' : '—'}</td>
                  <td style="text-align:center">${s.distanceCm > 0 ? s.distanceCm : '-'}</td>
                ` : ''}
                <td style="text-align:center">${s.bonusScore ? `+${s.bonusScore}⭐` : '-'}</td>
                ${isTime ? '' : `<td style="font-weight:700;color:var(--accent);text-align:center">${s.totalScore ?? 0}</td>`}
                <td style="font-size:0.82rem">${s.notes || '-'}</td>
                ${audit}
                ${actions}
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch { div.innerHTML = '<p class="text-muted">โหลดไม่สำเร็จ</p>'; }
}

// ─── EDIT / DELETE SCORE (admin only) ────────────────────────────────────

async function editScore(scoreId) {
  if (!isAdmin()) { showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error'); return; }

  // หยิบจาก cache ก่อน ไม่งั้นยิง API
  let score = recentScoresCache.find(s => String(s._id) === String(scoreId));
  if (!score) {
    try { const res = await apiFetch(`/scores/${scoreId}`); score = res.data; }
    catch (err) { showToast(err.message, 'error'); return; }
  }
  if (!score) return;

  const compId = score.competition?._id || score.competition;
  const teamId = score.team?._id || score.team;

  // Set competition + rebuild form fields for this competition
  document.getElementById('scoreCompetition').value = compId;
  await onCompetitionChange();

  // Now set team + round
  document.getElementById('scoreTeam').value = teamId;
  document.getElementById('scoreRound').value = score.round;

  // Fill criteria details
  const comp = allCompetitions.find(c => c._id === compId);
  if (comp?.scoringCriteria?.length && score.details) {
    comp.scoringCriteria.forEach(cr => {
      const el = document.getElementById(`crit_${cr.key}`);
      if (!el) return;
      const val = score.details[cr.key];
      if (cr.type === 'boolean') el.checked = !!val;
      else el.value = val ?? 0;
    });
  }

  // Common fields
  if (document.getElementById('scoreTime'))       document.getElementById('scoreTime').value       = score.timeUsedSeconds || '';
  if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = !!score.taskCompleted;
  if (document.getElementById('scoreDistance'))  document.getElementById('scoreDistance').value   = score.distanceCm || '';
  if (document.getElementById('scoreBonusScore')) document.getElementById('scoreBonusScore').value = score.bonusScore || 0;
  if (document.getElementById('scoreRetries'))   document.getElementById('scoreRetries').value   = score.retries || 0;
  if (document.getElementById('scoreNotes'))     document.getElementById('scoreNotes').value      = score.notes || '';

  // Switch form to edit mode
  document.getElementById('editingScoreId').value = scoreId;
  document.getElementById('scoreFormTitle').textContent = 'แก้ไขคะแนน';
  document.getElementById('scoreEditRound').textContent = score.round;
  document.getElementById('scoreEditBanner').style.display = 'flex';
  document.getElementById('submitScoreBtn').textContent = '💾 บันทึกการแก้ไข';

  calcPreviewScore(compId);
  loadRecentScores(compId, teamId);
  // เลื่อนขึ้นบนฟอร์มเพื่อให้เห็น edit banner
  document.getElementById('scoreFormTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditScore() {
  document.getElementById('editingScoreId').value = '';
  document.getElementById('scoreFormTitle').textContent = 'บันทึกคะแนน';
  document.getElementById('scoreEditBanner').style.display = 'none';
  document.getElementById('submitScoreBtn').textContent = '💾 บันทึกคะแนน';

  // reset criteria + common fields
  const compId = document.getElementById('scoreCompetition').value;
  const comp = allCompetitions.find(c => c._id === compId);
  comp?.scoringCriteria?.forEach(cr => {
    const el = document.getElementById(`crit_${cr.key}`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = false; else el.value = 0;
  });
  if (document.getElementById('scoreTime'))       document.getElementById('scoreTime').value = '';
  if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = false;
  if (document.getElementById('scoreDistance'))  document.getElementById('scoreDistance').value = '';
  if (document.getElementById('scoreBonusScore')) document.getElementById('scoreBonusScore').value = 0;
  if (document.getElementById('scoreNotes'))     document.getElementById('scoreNotes').value = '';
  if (compId) calcPreviewScore(compId);
}

async function deleteScore(scoreId) {
  if (!isAdmin()) { showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error'); return; }
  const s = recentScoresCache.find(x => String(x._id) === String(scoreId));
  const label = s ? `รอบที่ ${s.round}` : 'คะแนนนี้';
  if (!confirm(`ต้องการลบ ${label} หรือไม่?\n\nการลบไม่สามารถกู้คืนได้`)) return;
  try {
    await apiFetch(`/scores/${scoreId}`, { method: 'DELETE' });
    showToast('ลบคะแนนเรียบร้อย ✅', 'success');
    // หากกำลังแก้ไขคะแนนนี้อยู่ ให้ยกเลิกโหมดแก้ไข
    if (document.getElementById('editingScoreId').value === String(scoreId)) {
      cancelEditScore();
    }
    const compId = document.getElementById('scoreCompetition').value;
    const teamId = document.getElementById('scoreTeam').value;
    loadRecentScores(compId, teamId);
  } catch (err) { showToast(err.message, 'error'); }
}

// ─── EDITABLE SCORES TABLE (admin only) ──────────────────────────────────

// cache ของคะแนนทั้งหมดที่แสดงในตาราง ใช้ตรวจค่าเดิมตอนเซฟ
let scoreTableCache = [];

// เรียกครั้งแรกเมื่อเข้า tab เพื่อ populate ตัวกรอง (ประเภท/ทีม)
async function loadScoresTableInit() {
  if (!isAdmin()) return;
  await populateCompSelects();
  // เติม option ให้ dropdown ประเภท (ใช้ค่าของ scoreCompetition เป็นต้นแบบ)
  const compSel = document.getElementById('scoreTableCompFilter');
  if (compSel) {
    const current = compSel.value;
    compSel.innerHTML = '<option value="">-- เลือกประเภทการแข่งขัน --</option>' +
      allCompetitions.map(c =>
        `<option value="${c._id}" ${c._id === current ? 'selected' : ''}>${c.name.substring(0, 60)}</option>`
      ).join('');
  }
  // เติม dropdown ทีม (ถ้ามีการเลือกประเภทไว้ก่อน)
  await refreshScoreTableTeamFilter();
  loadScoresTable();
}

async function refreshScoreTableTeamFilter() {
  const compId = document.getElementById('scoreTableCompFilter')?.value || '';
  const teamSel = document.getElementById('scoreTableTeamFilter');
  if (!teamSel) return;
  const current = teamSel.value;
  if (!compId) {
    teamSel.innerHTML = '<option value="">ทุกทีม</option>';
    return;
  }
  try {
    const res = await apiFetch(`/teams?competition=${compId}`);
    teamSel.innerHTML = '<option value="">ทุกทีม</option>' +
      (res.data || []).map(t =>
        `<option value="${t._id}" ${t._id === current ? 'selected' : ''}>${t.teamNumber} · ${t.teamName}</option>`
      ).join('');
  } catch { /* ignore */ }
}

async function loadScoresTable() {
  if (!isAdmin()) return;
  const container = document.getElementById('scoreTableContainer');
  if (!container) return;

  const compId  = document.getElementById('scoreTableCompFilter')?.value || '';
  const teamId  = document.getElementById('scoreTableTeamFilter')?.value || '';
  const round   = document.getElementById('scoreTableRoundFilter')?.value || '';

  // เมื่อเปลี่ยนประเภท ให้รีเฟรช dropdown ทีมใหม่ด้วย
  await refreshScoreTableTeamFilter();

  if (!compId) {
    container.innerHTML = '<p class="text-muted text-center p-4">เลือกประเภทการแข่งขันเพื่อดูและแก้ไขคะแนน</p>';
    scoreTableCache = [];
    return;
  }

  // Tour competitions: show dedicated tournament view
  const comp = allCompetitions.find(c => c._id === compId);
  if (isTourComp(comp)) {
    const roundFilter = document.getElementById('scoreTableRoundFilter');
    if (roundFilter) roundFilter.style.display = 'none';
    return loadTourTable(compId);
  }

  const roundFilter = document.getElementById('scoreTableRoundFilter');
  if (roundFilter) roundFilter.style.display = '';

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>กำลังโหลดคะแนน...</p></div>';

  try {
    const qs = new URLSearchParams({ competition: compId });
    if (teamId) qs.set('team', teamId);
    if (round)  qs.set('round', round);
    const res = await apiFetch(`/scores?${qs.toString()}`);
    const scores = res.data || [];
    scoreTableCache = scores;

    if (!scores.length) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem"><div class="empty-state-icon">📭</div><p class="text-muted">ยังไม่มีคะแนนในเงื่อนไขที่เลือก</p></div>';
      return;
    }

    const comp = allCompetitions.find(c => c._id === compId);
    const isTime = comp?.scoringType === 'TIME';

    // เรียงโดย: ทีม → รอบ
    scores.sort((a, b) => {
      const an = a.team?.teamNumber || '';
      const bn = b.team?.teamNumber || '';
      if (an !== bn) return an.localeCompare(bn);
      return (a.round || 0) - (b.round || 0);
    });

    container.innerHTML = `
      <table class="data-table" id="scoresDataTable">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>ทีม</th>
            <th style="width:70px">รอบ</th>
            <th style="width:120px">⏱ เวลา (วิ)</th>
            ${isTime ? '<th style="width:100px">สำเร็จ</th><th style="width:110px">ระยะ (ซม.)</th>' : ''}
            <th style="width:110px">⭐ โบนัส</th>
            ${isTime ? '' : '<th style="width:100px">รวม</th>'}
            <th>หมายเหตุ</th>
            <th style="width:60px">✓</th>
            <th style="width:170px">ผู้บันทึก / แก้ไขล่าสุด</th>
            <th style="width:140px">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${scores.map((s, i) => {
            const creator = s.createdBy?.name || s.enteredBy?.name || '-';
            const editor  = s.lastEditedBy?.name || s.enteredBy?.name || '-';
            const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '';
            return `
            <tr data-score-id="${s._id}">
              <td>${i + 1}</td>
              <td>
                <div style="font-weight:600">${s.team?.teamNumber || '-'}</div>
                <div style="font-size:0.78rem;color:var(--text-dim)">${s.team?.teamName || ''}</div>
              </td>
              <td style="text-align:center">${s.round}</td>
              <td>
                <input type="number" class="form-input form-input-sm" data-field="timeUsedSeconds"
                       value="${s.timeUsedSeconds || 0}" min="0" step="0.01" style="width:100%">
              </td>
              ${isTime ? `
                <td style="text-align:center">
                  <input type="checkbox" data-field="taskCompleted" ${s.taskCompleted ? 'checked' : ''}>
                </td>
                <td>
                  <input type="number" class="form-input form-input-sm" data-field="distanceCm"
                         value="${s.distanceCm || 0}" min="0" step="0.1" style="width:100%">
                </td>
              ` : ''}
              <td>
                <input type="number" class="form-input form-input-sm" data-field="bonusScore"
                       value="${s.bonusScore || 0}" step="1" style="width:100%">
              </td>
              ${isTime ? '' : `<td style="font-weight:700;color:var(--accent);text-align:center">${s.totalScore ?? 0}</td>`}
              <td>
                <input type="text" class="form-input form-input-sm" data-field="notes"
                       value="${(s.notes || '').replace(/"/g, '&quot;')}" placeholder="-" style="width:100%">
              </td>
              <td style="text-align:center">
                <input type="checkbox" data-field="isValid" ${s.isValid !== false ? 'checked' : ''} title="ใช้ได้">
              </td>
              <td style="font-size:0.76rem;line-height:1.5">
                <div>📝 <strong>${creator}</strong></div>
                ${editor !== creator ? `<div style="color:var(--text-dim)">✏️ ${editor}</div>` : ''}
                ${updated ? `<div style="color:var(--text-dim);font-size:0.7rem">${updated}</div>` : ''}
              </td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn btn-sm btn-primary btn-icon" onclick="saveScoreRow('${s._id}')" title="บันทึก">💾</button>
                  <button class="btn btn-sm btn-outline btn-icon" onclick="openScoreInForm('${s._id}')" title="แก้ไขเต็ม">✏️</button>
                  <button class="btn btn-sm btn-outline btn-icon" onclick="deleteScoreFromTable('${s._id}')" title="ลบ" style="color:var(--danger)">🗑️</button>
                </div>
              </td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">โหลดคะแนนไม่สำเร็จ: ${err.message}</div>`;
  }
}

// ─── TOUR COMPETITION ─────────────────────────────────────────

// ตรวจว่าเป็นรายการเที่ยวเมืองศรีสะเกษหรือไม่
function isTourComp(comp) {
  if (!comp) return false;
  if (comp.code?.startsWith('RESCUE_M')) return true;
  return typeof comp.name === 'string' && comp.name.includes('เที่ยวเมืองศรีสะเกษ');
}

// ─ Render phase switcher + KO form inside tourScoreSection ─
async function renderTourScoreSection(compId, comp) {
  const sect = document.getElementById('tourScoreSection');
  if (!sect) return;

  // สร้าง criteria fields สำหรับแต่ละทีม
  const buildTeamCriteria = (prefix) => {
    if (!comp.scoringCriteria?.length) return '';
    return comp.scoringCriteria.map(cr => `
      <div class="criteria-field">
        <div class="criteria-label">${cr.label}${cr.isPenalty ? ' (หักคะแนน)' : ''} ${cr.pointsPerUnit ? `(×${cr.pointsPerUnit} คะแนน)` : `(${cr.points} คะแนน)`}</div>
        ${cr.type === 'boolean'
          ? `<label><input type="checkbox" class="criteria-input" id="${prefix}_crit_${cr.key}" onchange="calcTourGamePreview()" style="width:auto"> ทำสำเร็จ</label>`
          : `<input type="number" class="form-input criteria-input" id="${prefix}_crit_${cr.key}" min="0" max="${cr.maxValue || 99}" value="0" onchange="calcTourGamePreview()" oninput="calcTourGamePreview()">`
        }
      </div>`).join('');
  };

  sect.innerHTML = `
    <div class="bsc-card">
      <div class="bsc-header">⚙️ ระบบการแข่งขัน ${comp.name}</div>
      <div class="admin-toolbar">
        <button id="tourPhaseQual" class="btn btn-primary btn-sm" onclick="switchTourPhase('qualifying','${compId}')">📋 รอบคัดเลือก</button>
        <button id="tourPhaseKO"   class="btn btn-outline btn-sm" onclick="switchTourPhase('knockout','${compId}')">⚔️ น็อคเอาท์</button>
      </div>
      <div id="tourKOSection" style="display:none">
        <div class="form-row" style="margin-bottom:0.75rem">
          <div class="form-group">
            <label class="form-label">รอบ</label>
            <select id="tourStageSelect" class="form-input" onchange="onTourStageChange('${compId}')">
              <option value="">-- เลือกรอบ --</option>
              <option value="quarterfinal">รอบ 8 ทีม</option>
              <option value="semifinal">รอบ 4 ทีม</option>
              <option value="final">รอบชิงชนะเลิศ</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">คู่การแข่งขัน</label>
            <select id="tourMatchSelect" class="form-input" onchange="onTourMatchChange('${compId}')">
              <option value="">-- เลือกคู่ --</option>
            </select>
          </div>
        </div>
        <div id="tourMatchInfo" style="display:none;margin-bottom:0.75rem"></div>
        <div id="tourGameForm" style="display:none">
          <div class="form-section-title">บันทึกผลเกม (Best of 3)</div>
          <div class="bsc-teams">
            <div class="bsc-team-col">
              <div class="bsc-team-name" id="tourT1Label">ทีม 1</div>
              ${buildTeamCriteria('koT1')}
              <div class="form-group" style="margin-top:0.5rem">
                <label class="form-label">⏱ เวลา (วินาที)</label>
                <input type="number" id="tourT1Time" class="form-input" placeholder="เช่น 95.50" min="0" step="0.01" oninput="calcTourGamePreview()">
              </div>
              <div class="score-preview">
                <div class="score-preview-label">คะแนนรวม</div>
                <div class="score-preview-value" id="koT1Preview">0</div>
              </div>
            </div>
            <div class="bsc-vs">VS</div>
            <div class="bsc-team-col">
              <div class="bsc-team-name" id="tourT2Label">ทีม 2</div>
              ${buildTeamCriteria('koT2')}
              <div class="form-group" style="margin-top:0.5rem">
                <label class="form-label">⏱ เวลา (วินาที)</label>
                <input type="number" id="tourT2Time" class="form-input" placeholder="เช่น 95.50" min="0" step="0.01" oninput="calcTourGamePreview()">
              </div>
              <div class="score-preview">
                <div class="score-preview-label">คะแนนรวม</div>
                <div class="score-preview-value" id="koT2Preview">0</div>
              </div>
            </div>
          </div>
          <div id="tourGamePreview" style="min-height:1.5rem;margin:0.75rem 0;font-size:0.85rem;color:var(--accent)"></div>
          <button class="btn btn-primary btn-full" id="tourSubmitBtn" onclick="submitTourGame()">💾 บันทึกเกม</button>
        </div>
      </div>
    </div>
  `;
  // Default: qualifying phase active
  switchTourPhase('qualifying', compId);
}

function switchTourPhase(phase, compId) {
  const koSect  = document.getElementById('tourKOSection');
  const normSct = document.getElementById('normalScoreFields');
  const btnQual = document.getElementById('tourPhaseQual');
  const btnKO   = document.getElementById('tourPhaseKO');

  const titleEl = document.getElementById('recentScoresTitle');
  if (phase === 'qualifying') {
    if (koSect)  koSect.style.display  = 'none';
    if (normSct) normSct.style.display = '';
    if (btnQual) { btnQual.classList.add('btn-primary'); btnQual.classList.remove('btn-outline'); }
    if (btnKO)   { btnKO.classList.add('btn-outline');   btnKO.classList.remove('btn-primary'); }
    if (titleEl) titleEl.textContent = 'คะแนนล่าสุด';
    const recentDiv = document.getElementById('recentScores');
    if (recentDiv) recentDiv.innerHTML = '<p class="text-muted">เลือกทีมเพื่อดูคะแนน</p>';
  } else {
    if (koSect)  koSect.style.display  = '';
    if (normSct) normSct.style.display = 'none';
    if (btnQual) { btnQual.classList.add('btn-outline');  btnQual.classList.remove('btn-primary'); }
    if (btnKO)   { btnKO.classList.add('btn-primary');    btnKO.classList.remove('btn-outline'); }
    if (titleEl) titleEl.textContent = 'ผลเกมคู่นี้';
    const recentDiv = document.getElementById('recentScores');
    if (recentDiv) recentDiv.innerHTML = '<p class="text-muted">เลือกคู่การแข่งขันเพื่อดูผลเกม</p>';
    onTourStageChange(compId);
  }
}

async function onTourStageChange(compId) {
  const stage = document.getElementById('tourStageSelect')?.value || '';
  const matchSel = document.getElementById('tourMatchSelect');
  const matchInfo = document.getElementById('tourMatchInfo');
  const gameForm  = document.getElementById('tourGameForm');
  if (!matchSel) return;
  matchSel.innerHTML = '<option value="">-- เลือกคู่ --</option>';
  if (matchInfo) matchInfo.style.display = 'none';
  if (gameForm)  gameForm.style.display  = 'none';
  if (!stage || !compId) return;

  try {
    const res = await apiFetch(`/tour/${compId}`);
    const groups = res.data || [];
    const group  = groups.find(g => g.stage === stage);
    if (!group || !group.matches.length) {
      matchSel.innerHTML = '<option value="">ยังไม่มีคู่ในรอบนี้</option>';
      return;
    }
    group.matches.forEach(m => {
      const t1 = m.team1 ? `#${m.team1.teamNumber} ${m.team1.teamName}` : 'BYE';
      const t2 = m.team2 ? `#${m.team2.teamNumber} ${m.team2.teamName}` : 'BYE';
      const done = m.status === 'completed' ? ' ✅' : '';
      const opt  = document.createElement('option');
      opt.value  = m._id;
      opt.textContent = `คู่ที่ ${m.matchNumber}: ${t1} vs ${t2}${done}`;
      matchSel.appendChild(opt);
    });
  } catch (err) {
    matchSel.innerHTML = `<option value="">โหลดไม่สำเร็จ: ${err.message}</option>`;
  }
}

// Store current match data for form use
let _tourCurrentMatch = null;

async function onTourMatchChange(compId) {
  const matchId   = document.getElementById('tourMatchSelect')?.value || '';
  const matchInfo = document.getElementById('tourMatchInfo');
  const gameForm  = document.getElementById('tourGameForm');
  if (!matchId) {
    if (matchInfo) matchInfo.style.display = 'none';
    if (gameForm)  gameForm.style.display  = 'none';
    _tourCurrentMatch = null;
    return;
  }

  try {
    const stage = document.getElementById('tourStageSelect')?.value || '';
    const res   = await apiFetch(`/tour/${compId}`);
    const groups = res.data || [];
    const group  = groups.find(g => g.stage === stage);
    const match  = group?.matches.find(m => m._id === matchId);
    if (!match) return;

    _tourCurrentMatch = match;

    const t1 = match.team1 ? `#${match.team1.teamNumber} ${match.team1.teamName}` : 'BYE';
    const t2 = match.team2 ? `#${match.team2.teamNumber} ${match.team2.teamName}` : 'BYE';
    const t1Name = match.team1?.teamName || 'ทีม 1';
    const t2Name = match.team2?.teamName || 'ทีม 2';

    const statusBadge = match.status === 'completed'
      ? `<span class="badge-status badge-done">✅ จบแล้ว</span>`
      : `<span class="badge-status badge-progress">⏳ กำลังแข่ง</span>`;

    matchInfo.innerHTML = `
      <div class="bsc-card" style="margin-bottom:0;font-size:0.85rem">
        <div class="bsc-header">${t1} vs ${t2} ${statusBadge}</div>
        <div>ชนะ: ${match.team1Wins || 0} – ${match.team2Wins || 0} (เกม ${(match.games || []).length}/3)</div>
        ${match.winner ? `<div style="color:var(--success);font-weight:700;margin-top:0.3rem">🏆 ผู้ชนะ: ${match.winner.teamName}</div>` : ''}
      </div>
    `;
    matchInfo.style.display = '';

    // แสดงตารางผลเกมในแผง "คะแนนล่าสุด" ด้านขวา (แบบเดียวกับรอบคัดเลือก)
    const recentDiv = document.getElementById('recentScores');
    if (recentDiv) {
      const games = match.games || [];
      if (!games.length) {
        recentDiv.innerHTML = '<p class="text-muted">ยังไม่มีผลเกม</p>';
      } else {
        recentDiv.innerHTML = `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:60px">เกม</th>
                  <th style="width:90px">${t1Name} คะแนน</th>
                  <th style="width:100px">⏱ เวลา (วิ)</th>
                  <th style="width:90px">${t2Name} คะแนน</th>
                  <th style="width:100px">⏱ เวลา (วิ)</th>
                  <th>ผู้ชนะ</th>
                </tr>
              </thead>
              <tbody>
                ${games.map(g => {
                  const isT1Win = String(g.winnerId) === String(match.team1?._id);
                  const winnerName = g.winnerId ? (isT1Win ? t1Name : t2Name) : '?';
                  return `
                  <tr>
                    <td style="text-align:center;font-weight:600">${g.gameNumber}</td>
                    <td style="text-align:center;font-weight:700;color:${isT1Win ? 'var(--success)' : 'var(--accent)'}">${g.team1Score}</td>
                    <td style="text-align:center">${g.team1Time > 0 ? Number(g.team1Time).toFixed(2) : '-'}</td>
                    <td style="text-align:center;font-weight:700;color:${!isT1Win ? 'var(--success)' : 'var(--accent)'}">${g.team2Score}</td>
                    <td style="text-align:center">${g.team2Time > 0 ? Number(g.team2Time).toFixed(2) : '-'}</td>
                    <td style="font-weight:700;color:var(--success)">🏆 ${winnerName}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    if (match.status === 'completed') {
      if (gameForm) gameForm.style.display = 'none';
    } else {
      const t1label = document.getElementById('tourT1Label');
      const t2label = document.getElementById('tourT2Label');
      if (t1label) t1label.textContent = t1;
      if (t2label) t2label.textContent = t2;
      // clear inputs
      const _comp = allCompetitions.find(c => c._id === compId);
      _comp?.scoringCriteria?.forEach(cr => {
        ['koT1', 'koT2'].forEach(prefix => {
          const el = document.getElementById(`${prefix}_crit_${cr.key}`);
          if (!el) return;
          if (el.type === 'checkbox') el.checked = false; else el.value = 0;
        });
      });
      ['tourT1Time', 'tourT2Time'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const p1 = document.getElementById('koT1Preview'); if (p1) p1.textContent = '0';
      const p2 = document.getElementById('koT2Preview'); if (p2) p2.textContent = '0';
      document.getElementById('tourGamePreview').textContent = '';
      const submitBtn = document.getElementById('tourSubmitBtn');
      if (submitBtn) submitBtn.dataset.matchId = matchId;
      if (gameForm) gameForm.style.display = '';
    }
  } catch (err) {
    if (matchInfo) { matchInfo.innerHTML = `<div class="alert alert-error">${err.message}</div>`; matchInfo.style.display = ''; }
  }
}

function calcTourGamePreview() {
  const compId = document.getElementById('scoreCompetition')?.value;
  const comp   = allCompetitions.find(c => c._id === compId);
  const preview = document.getElementById('tourGamePreview');

  // คำนวณคะแนนจาก criteria แบบเดียวกับรอบคัดเลือก
  const calcScore = (prefix) => {
    if (!comp?.scoringCriteria?.length) return 0;
    let total = 0;
    comp.scoringCriteria.forEach(cr => {
      const el = document.getElementById(`${prefix}_crit_${cr.key}`);
      if (!el) return;
      if (cr.type === 'boolean') {
        if (el.checked) total += cr.isPenalty ? -cr.points : cr.points;
      } else {
        const val = parseFloat(el.value) || 0;
        const pts = val * (cr.pointsPerUnit || cr.points);
        total += cr.isPenalty ? -pts : pts;
      }
    });
    return total;
  };

  const s1 = calcScore('koT1');
  const s2 = calcScore('koT2');
  const t1 = parseFloat(document.getElementById('tourT1Time')?.value) || 0;
  const t2 = parseFloat(document.getElementById('tourT2Time')?.value) || 0;

  const p1 = document.getElementById('koT1Preview'); if (p1) p1.textContent = s1;
  const p2 = document.getElementById('koT2Preview'); if (p2) p2.textContent = s2;

  if (!preview) return;
  if (!s1 && !s2) { preview.textContent = ''; return; }

  const t1Name = document.getElementById('tourT1Label')?.textContent || 'ทีม 1';
  const t2Name = document.getElementById('tourT2Label')?.textContent || 'ทีม 2';
  let result = '';
  if (s1 > s2)       result = `🏆 ${t1Name} ชนะ (คะแนนมากกว่า)`;
  else if (s2 > s1)  result = `🏆 ${t2Name} ชนะ (คะแนนมากกว่า)`;
  else if (s1 === s2 && s1 > 0) {
    if (t1 > 0 && t2 > 0) {
      if (t1 < t2)      result = `🏆 ${t1Name} ชนะ (เวลาน้อยกว่า)`;
      else if (t2 < t1) result = `🏆 ${t2Name} ชนะ (เวลาน้อยกว่า)`;
      else               result = '⚠️ คะแนนและเวลาเท่ากัน ไม่สามารถตัดสินได้';
    } else if (t1 > 0) result = `🏆 ${t1Name} ชนะ (มีเวลา)`;
    else if (t2 > 0)   result = `🏆 ${t2Name} ชนะ (มีเวลา)`;
    else               result = '⚠️ คะแนนเท่ากัน กรุณากรอกเวลา';
  }
  preview.textContent = result;
}

async function submitTourGame() {
  const matchId = document.getElementById('tourSubmitBtn')?.dataset.matchId;
  const compId  = document.getElementById('scoreCompetition')?.value || '';
  if (!matchId || !compId) return showToast('ไม่พบข้อมูลคู่การแข่งขัน', 'error');

  const comp = allCompetitions.find(c => c._id === compId);

  // คำนวณคะแนนจาก criteria แบบเดียวกับรอบคัดเลือก
  const calcScore = (prefix) => {
    if (!comp?.scoringCriteria?.length) return 0;
    let total = 0;
    comp.scoringCriteria.forEach(cr => {
      const el = document.getElementById(`${prefix}_crit_${cr.key}`);
      if (!el) return;
      if (cr.type === 'boolean') {
        if (el.checked) total += cr.isPenalty ? -cr.points : cr.points;
      } else {
        const val = parseFloat(el.value) || 0;
        total += cr.isPenalty ? -(val * (cr.pointsPerUnit || cr.points)) : val * (cr.pointsPerUnit || cr.points);
      }
    });
    return total;
  };

  const team1Score = calcScore('koT1');
  const team1Time  = parseFloat(document.getElementById('tourT1Time')?.value)  || 0;
  const team2Score = calcScore('koT2');
  const team2Time  = parseFloat(document.getElementById('tourT2Time')?.value)  || 0;

  try {
    const res = await apiFetch(`/tour/${compId}/matches/${matchId}/game`, {
      method: 'POST',
      body: JSON.stringify({ team1Score, team1Time, team2Score, team2Time })
    });
    showToast(res.message || 'บันทึกเกมสำเร็จ', 'success');
    if (res.autoGenerated) {
      showToast(`✅ จับคู่ ${res.autoGenerated.label} อัตโนมัติแล้ว`, 'success');
    }
    // Refresh match display
    await onTourMatchChange(compId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─ Tour table (scoreTable tab) ─
async function loadTourTable(compId) {
  const container = document.getElementById('scoreTableContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>กำลังโหลดข้อมูลทัวร์นาเมนต์...</p></div>';

  try {
    const [standRes, matchRes] = await Promise.all([
      apiFetch(`/tour/${compId}/standings?limit=20`),
      apiFetch(`/tour/${compId}`)
    ]);

    const standings = standRes.data || [];
    const groups    = matchRes.data || [];

    const stageLabels = { quarterfinal: 'รอบ 8 ทีม', semifinal: 'รอบ 4 ทีม', final: 'รอบชิงชนะเลิศ', third_place: 'ชิงอันดับ 3' };

    // รวบรวม ID ทีมที่อยู่ในรอบน็อคเอาท์แล้ว
    const koStarted = groups.length > 0;
    const koTeamIds = new Set();
    groups.forEach(g => g.matches.forEach(m => {
      if (m.team1?._id) koTeamIds.add(String(m.team1._id));
      if (m.team2?._id) koTeamIds.add(String(m.team2._id));
    }));

    const medals = ['🥇','🥈','🥉'];
    const standHtml = `
      <h4 style="margin-bottom:0.75rem">📊 รอบคัดเลือก — เรียงลำดับตามคะแนน / เวลา</h4>
      <div class="table-container" style="margin-bottom:1.5rem">
        <table class="data-table">
          <thead><tr>
            <th style="width:60px;text-align:center">อันดับ</th>
            <th>ทีม</th>
            <th>โรงเรียน</th>
            <th style="width:110px;text-align:center">คะแนนรวม</th>
            <th style="width:130px;text-align:center">เวลาดีที่สุด (วิ)</th>
            <th style="width:80px;text-align:center">รอบ</th>
            <th style="width:160px;text-align:center">สถานะ</th>
          </tr></thead>
          <tbody>
            ${standings.map(s => {
              const top8   = s.rank <= 8;
              const rankCls = s.rank <= 3 ? s.rank : 'n';
              const inKO   = koTeamIds.has(String(s.team?._id));
              let statusBadge;
              if (!koStarted) {
                statusBadge = top8
                  ? '<span class="badge-status badge-done">TOP 8</span>'
                  : '<span class="badge-status badge-elim">สิ้นสุดการแข่งขัน</span>';
              } else if (inKO) {
                statusBadge = '<span class="badge-status badge-progress">⚔️ น็อคเอาท์</span>';
              } else {
                statusBadge = '<span class="badge-status badge-elim">สิ้นสุดการแข่งขัน</span>';
              }
              return `
              <tr ${top8 && !koStarted ? 'style="background:rgba(46,204,113,0.05)"' : inKO ? 'style="background:rgba(243,156,18,0.05)"' : ''}>
                <td style="text-align:center">
                  <span class="rank-badge rank-${rankCls}">${s.rank <= 3 ? medals[s.rank-1] : s.rank}</span>
                </td>
                <td>
                  <strong>${s.team?.teamName || '-'}</strong>
                  <div style="font-size:0.72rem;color:var(--text-dim)">#${s.team?.teamNumber || ''}</div>
                </td>
                <td style="font-size:0.82rem">${s.team?.schoolName || '-'}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent);font-size:1.05rem">${s.totalScore}</td>
                <td style="text-align:center;color:var(--text-muted)">${s.bestTime ? s.bestTime.toFixed(2) : '–'}</td>
                <td style="text-align:center;color:var(--text-muted)">${s.roundsPlayed}</td>
                <td style="text-align:center">${statusBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const koHtml = groups.length === 0 ? '' : groups.map(g => `
      <h4 style="margin-bottom:0.5rem">${stageLabels[g.stage] || g.stage}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:0.75rem;margin-bottom:1.5rem">
        ${g.matches.map(m => renderTourMatchCard(m)).join('')}
      </div>
    `).join('');

    const isAdmin_ = isAdmin();
    const genBtn = isAdmin_ ? `
      <div style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="generateTourRound('${compId}')">⚙️ สร้างรอบถัดไป</button>
        ${groups.length > 0 ? `<button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="deleteTourRound('${compId}','${groups[groups.length-1].stage}')">🗑️ ลบรอบล่าสุด</button>` : ''}
      </div>
    ` : '';

    container.innerHTML = genBtn + standHtml + koHtml;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
  }
}

function renderTourMatchCard(m) {
  const t1 = m.team1 ? `#${m.team1.teamNumber} ${m.team1.teamName}` : 'BYE';
  const t2 = m.team2 ? `#${m.team2.teamNumber} ${m.team2.teamName}` : 'BYE';
  const statusColor = m.status === 'completed' ? 'var(--success)' : m.status === 'in_progress' ? 'var(--warning)' : 'var(--text-dim)';
  const statusText  = m.status === 'completed' ? '✅ จบ' : m.status === 'in_progress' ? '⏳ กำลังแข่ง' : '📅 รอแข่ง';

  const gamesHtml = (m.games || []).map(g => {
    const w1 = g.winnerId && g.winnerId === m.team1?._id;
    const w2 = g.winnerId && g.winnerId === m.team2?._id;
    return `<div style="font-size:0.78rem;padding:0.2rem 0;border-bottom:1px solid var(--border)">
      เกม ${g.gameNumber}:
      <span style="${w1 ? 'color:var(--success);font-weight:700' : ''}">${g.team1Score}คะแนน ${g.team1Time ? g.team1Time+'วิ' : ''}</span>
      vs
      <span style="${w2 ? 'color:var(--success);font-weight:700' : ''}">${g.team2Score}คะแนน ${g.team2Time ? g.team2Time+'วิ' : ''}</span>
    </div>`;
  }).join('');

  const winnerHtml = m.winner
    ? `<div style="color:var(--success);font-weight:700;margin-top:0.4rem">🏆 ${m.winner.teamName}</div>`
    : '';

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:0.85rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <span style="font-weight:700">คู่ที่ ${m.matchNumber}</span>
        <span style="color:${statusColor};font-size:0.78rem">${statusText}</span>
      </div>
      <div style="margin-bottom:0.4rem">
        <span style="${m.winner && m.winner._id === m.team1?._id ? 'color:var(--success);font-weight:700' : ''}">${t1}</span>
        <span style="color:var(--text-dim);margin:0 0.4rem">vs</span>
        <span style="${m.winner && m.winner._id === m.team2?._id ? 'color:var(--success);font-weight:700' : ''}">${t2}</span>
      </div>
      <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.3rem">ชนะ: ${m.team1Wins || 0} – ${m.team2Wins || 0}</div>
      ${gamesHtml}
      ${winnerHtml}
    </div>
  `;
}

async function generateTourRound(compId) {
  if (!confirm('ยืนยันการสร้างรอบถัดไป?')) return;
  try {
    const res = await apiFetch(`/tour/${compId}/generate`, { method: 'POST' });
    showToast(`สร้าง${res.label}สำเร็จ (${res.data?.length || 0} คู่)`, 'success');
    loadScoresTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTourRound(compId, stage) {
  const labels = { quarterfinal: 'รอบ 8 ทีม', semifinal: 'รอบ 4 ทีม', final: 'รอบชิงชนะเลิศ' };
  if (!confirm(`ยืนยันการลบ ${labels[stage] || stage}?`)) return;
  try {
    const res = await apiFetch(`/tour/${compId}/round/${stage}`, { method: 'DELETE' });
    showToast(res.message, 'success');
    loadScoresTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── USERS ADMIN ──────────────────────────────────────────────

async function loadUsers() {
  const container = document.getElementById('usersList');
  try {
    const res = await apiFetch('/auth/users');
    if (!res.data.length) {
      container.innerHTML = '<p class="text-muted text-center p-4">ยังไม่มีผู้ใช้งาน</p>';
      return;
    }
    const roleLabel = r => r === 'admin' ? '🛡️ แอดมิน' : r === 'judge' ? '⚖️ กรรมการ' : '👁️ ผู้ชม';
    container.innerHTML = `
      <table class="table">
        <thead><tr><th>#</th><th>Username</th><th>ชื่อ</th><th>Role</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody>
          ${res.data.map((u, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${u.username}</strong></td>
              <td>${u.name}</td>
              <td>${roleLabel(u.role)}</td>
              <td><span class="tag ${u.isActive ? 'tag-auto' : 'tag-age'}" style="font-size:0.7rem">${u.isActive ? '✅ ใช้งาน' : '🚫 ระงับ'}</span></td>
              <td>
                <button class="btn btn-sm btn-outline btn-icon" onclick="editUser('${u._id}')" title="แก้ไข">✏️</button>
                <button class="btn btn-sm btn-outline btn-icon" onclick="deleteUser('${u._id}','${u.username}')" title="ลบ" style="color:var(--danger)">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
  }
}

function showUserModal(user = null) {
  document.getElementById('userModalTitle').textContent = user ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
  document.getElementById('userId').value = user?._id || '';
  document.getElementById('userUsername').value = user?.username || '';
  document.getElementById('userName').value = user?.name || '';
  document.getElementById('userRole').value = user?.role || 'judge';
  document.getElementById('userPassword').value = '';
  document.getElementById('userPassword').placeholder = user ? 'เว้นว่างถ้าไม่เปลี่ยน' : 'รหัสผ่าน *';
  document.getElementById('userIsActive').checked = user ? user.isActive : true;
  showModal('userModal');
}

async function editUser(id) {
  try {
    const res = await apiFetch(`/auth/users/${id}`);
    showUserModal(res.data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveUser() {
  const id = document.getElementById('userId').value;
  const body = {
    username: document.getElementById('userUsername').value.trim(),
    name: document.getElementById('userName').value.trim(),
    role: document.getElementById('userRole').value,
    isActive: document.getElementById('userIsActive').checked,
  };
  const pw = document.getElementById('userPassword').value;
  if (pw) body.password = pw;

  try {
    if (id) {
      await apiFetch(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('อัปเดตผู้ใช้งานสำเร็จ', 'success');
    } else {
      if (!pw) { showToast('กรุณากรอกรหัสผ่าน', 'error'); return; }
      await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      showToast('เพิ่มผู้ใช้งานสำเร็จ', 'success');
    }
    closeModal();
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(id, username) {
  if (!confirm(`ยืนยันการลบผู้ใช้งาน "${username}"?`)) return;
  try {
    await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
    showToast('ลบผู้ใช้งานสำเร็จ', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── SCORESHEET (แบบบันทึกคะแนน) ─────────────────────────────

async function loadScoresheetTab() {
  const sel = document.getElementById('scoresheetCompSelect');
  if (!sel) return;
  if (sel.options.length <= 1) {
    try {
      const res = await apiFetch('/competitions');
      (res.data || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c._id;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    } catch (e) { showToast('โหลดรายการไม่สำเร็จ', 'error'); }
  }
  loadScoresheetPreview();
}

async function loadScoresheetPreview() {
  const compId = document.getElementById('scoresheetCompSelect')?.value;
  const info   = document.getElementById('scoresheetInfo');
  const btn    = document.getElementById('scoresheetPrintBtn');
  if (!compId) {
    if (info) info.textContent = 'กรุณาเลือกรายการแข่งขัน';
    if (btn)  btn.disabled = true;
    return;
  }
  try {
    const [compRes, teamsRes] = await Promise.all([
      apiFetch(`/competitions/${compId}`),
      apiFetch(`/teams?competition=${compId}&limit=200`)
    ]);
    const comp  = compRes.data;
    const teams = teamsRes.data || [];
    if (info) info.innerHTML = `<span style="color:var(--accent);font-weight:600">${comp.name}</span> — พบ <strong>${teams.length}</strong> ทีม (${teams.length} หน้า)`;
    if (btn)  { btn.disabled = teams.length === 0; btn.dataset.compId = compId; }
  } catch (e) {
    if (info) info.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message;
    if (btn)  btn.disabled = true;
  }
}

async function printScoresheet() {
  const compId = document.getElementById('scoresheetPrintBtn')?.dataset.compId;
  if (!compId) return;
  try {
    const [compRes, teamsRes] = await Promise.all([
      apiFetch(`/competitions/${compId}`),
      apiFetch(`/teams?competition=${compId}&limit=200`)
    ]);
    const comp  = compRes.data;
    const teams = (teamsRes.data || []).sort((a, b) => (a.teamNumber || '').localeCompare(b.teamNumber || ''));

    const criteriaRows = comp.scoringCriteria?.map(cr => {
      const hint = cr.remark
        ? `<span style="font-size:9pt;color:#666"> (${cr.remark})</span>`
        : cr.pointsPerUnit
          ? `<span style="font-size:9pt;color:#666"> (${cr.pointsPerUnit} คะแนน/หน่วย)</span>`
          : '';
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt">${cr.label}${hint}${cr.isPenalty ? ' <b style="color:#c00">[หัก]</b>' : ''}</td>
        <td style="border:1px solid #ccc;width:60px"></td>
        <td style="border:1px solid #ccc;width:60px"></td>
        <td style="border:1px solid #ccc;width:60px"></td>
      </tr>`;
    }).join('') || '';

    const roundHeaders = Array.from({ length: comp.totalRounds || 3 }, (_, i) =>
      `<th style="border:1px solid #ccc;padding:5px;text-align:center;width:60px;background:#f5f5f5">รอบ ${i + 1}</th>`
    ).join('');

    const pages = teams.map(team => `
      <div class="page">
        <div style="border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:10px">
          <div style="font-size:9pt;color:#555;margin-bottom:2px">แบบบันทึกคะแนน — Sisaket Robotics 2026</div>
          <div style="font-size:13pt;font-weight:700">${comp.name}</div>
          <div style="font-size:9pt;color:#555;margin-top:2px">กลุ่มอายุ: ${comp.ageGroup || '-'} &nbsp;|&nbsp; จำนวนรอบ: ${comp.totalRounds} รอบ &nbsp;|&nbsp; เวลาต่อรอบ: ${comp.timePerRoundSeconds || 0} วินาที</div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt;width:25%"><b>หมายเลขทีม</b></td>
            <td style="padding:4px 8px;border:1px solid #ccc;font-size:11pt;font-weight:700">${team.teamNumber || '-'}</td>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt;width:25%"><b>ชื่อทีม</b></td>
            <td style="padding:4px 8px;border:1px solid #ccc;font-size:11pt;font-weight:700">${team.teamName || '-'}</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt"><b>โรงเรียน</b></td>
            <td colspan="3" style="padding:4px 8px;border:1px solid #ccc;font-size:10pt">${team.schoolName || '-'}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <thead>
            <tr>
              <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;background:#f5f5f5;font-size:10pt">เกณฑ์การให้คะแนน</th>
              ${roundHeaders}
            </tr>
          </thead>
          <tbody>
            ${criteriaRows}
            <tr style="background:#fffde7">
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt;font-weight:700">คะแนนรวม</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt">เวลาที่ใช้ (วินาที)</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt">คะแนนโบนัส</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;width:50%;text-align:center">
              <div style="font-size:9pt;color:#555;margin-bottom:28px">ลายมือชื่อกรรมการ</div>
              <div style="border-top:1px solid #333;padding-top:4px;font-size:9pt">( .................................................. )</div>
            </td>
            <td style="padding:4px 8px;border:1px solid #ccc;width:50%;text-align:center">
              <div style="font-size:9pt;color:#555;margin-bottom:28px">ลายมือชื่อตัวแทนทีม</div>
              <div style="border-top:1px solid #333;padding-top:4px;font-size:9pt">( .................................................. )</div>
            </td>
          </tr>
        </table>
      </div>`).join('');

    // หน้าสำรอง: ไม่ระบุชื่อทีม สำหรับทีมที่มาเพิ่ม
    const blankPage = `
      <div class="page">
        <div style="border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:10px">
          <div style="font-size:9pt;color:#555;margin-bottom:2px">แบบบันทึกคะแนน — Sisaket Robotics 2026</div>
          <div style="font-size:13pt;font-weight:700">${comp.name}</div>
          <div style="font-size:9pt;color:#555;margin-top:2px">กลุ่มอายุ: ${comp.ageGroup || '-'} &nbsp;|&nbsp; จำนวนรอบ: ${comp.totalRounds} รอบ &nbsp;|&nbsp; เวลาต่อรอบ: ${comp.timePerRoundSeconds || 0} วินาที</div>
        </div>
        <div style="text-align:center;font-size:9pt;color:#888;margin-bottom:8px;border:1px dashed #bbb;padding:4px;border-radius:4px">⚠️ หน้าสำรอง — สำหรับทีมที่ลงทะเบียนเพิ่มเติม</div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt;width:25%"><b>หมายเลขทีม</b></td>
            <td style="padding:4px 8px;border:1px solid #ccc;font-size:11pt"></td>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt;width:25%"><b>ชื่อทีม</b></td>
            <td style="padding:4px 8px;border:1px solid #ccc;font-size:11pt"></td>
          </tr>
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;background:#f5f5f5;font-size:9pt"><b>โรงเรียน</b></td>
            <td colspan="3" style="padding:4px 8px;border:1px solid #ccc;font-size:10pt"></td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <thead>
            <tr>
              <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;background:#f5f5f5;font-size:10pt">เกณฑ์การให้คะแนน</th>
              ${roundHeaders}
            </tr>
          </thead>
          <tbody>
            ${criteriaRows}
            <tr style="background:#fffde7">
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt;font-weight:700">คะแนนรวม</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt">เวลาที่ใช้ (วินาที)</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:6px 8px;border:1px solid #ccc;font-size:10pt">คะแนนโบนัส</td>
              ${Array.from({ length: comp.totalRounds || 3 }, () => `<td style="border:1px solid #ccc"></td>`).join('')}
            </tr>
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px;border:1px solid #ccc;width:50%;text-align:center">
              <div style="font-size:9pt;color:#555;margin-bottom:28px">ลายมือชื่อกรรมการ</div>
              <div style="border-top:1px solid #333;padding-top:4px;font-size:9pt">( .................................................. )</div>
            </td>
            <td style="padding:4px 8px;border:1px solid #ccc;width:50%;text-align:center">
              <div style="font-size:9pt;color:#555;margin-bottom:28px">ลายมือชื่อตัวแทนทีม</div>
              <div style="border-top:1px solid #333;padding-top:4px;font-size:9pt">( .................................................. )</div>
            </td>
          </tr>
        </table>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>แบบบันทึกคะแนน — ${comp.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; background: #fff; color: #111; }
  .page { width: 210mm; min-height: 270mm; padding: 12mm 14mm; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  @media print {
    body { margin: 0; }
    .page { margin: 0; padding: 10mm 12mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>${pages}${blankPage}</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  } catch (e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
  }
}

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  navigate('home');
});
