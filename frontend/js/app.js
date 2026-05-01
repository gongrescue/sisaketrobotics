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
    const teamsTabBtn      = document.getElementById('tabBtn-teams');
    const scoreTableTabBtn = document.getElementById('tabBtn-scoreTable');
    const matchesTabBtn    = document.getElementById('tabBtn-matches');
    const usersTabBtn      = document.getElementById('tabBtn-users');
    if (teamsTabBtn)      teamsTabBtn.style.display      = admin ? '' : 'none';
    if (scoreTableTabBtn) scoreTableTabBtn.style.display = admin ? '' : 'none';
    if (matchesTabBtn)    matchesTabBtn.style.display    = admin ? '' : 'none';
    if (usersTabBtn)      usersTabBtn.style.display      = admin ? '' : 'none';
    const bracketTabBtn = document.getElementById('tabBtn-bracket');
    if (bracketTabBtn) bracketTabBtn.style.display = (admin || isJudge()) ? '' : 'none';

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
  return `
    <table class="data-table">
      <thead><tr><th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th><th>คะแนนรวม</th><th>รอบที่แข่ง</th></tr></thead>
      <tbody>
        ${rankData.data.map(r => `
          <tr>
            <td><span class="rank-badge rank-${r.rank <= 3 ? r.rank : 'n'}">${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</span></td>
            <td><strong>${r.team?.teamName || '-'}</strong><br><small style="color:var(--text-dim)">${r.team?.teamNumber}</small></td>
            <td style="font-size:0.8rem">${r.team?.schoolName || '-'}</td>
            <td style="color:var(--accent);font-weight:700;font-size:1.1rem">${r.finalScore ?? 0}</td>
            <td style="color:var(--text-muted)">${r.roundsCompleted}/${comp.totalRounds}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── LEADERBOARD ──────────────────────────────────────────────

async function loadLeaderboard() {
  try {
    if (allCompetitions.length === 0) {
      const res = await apiFetch('/competitions');
      allCompetitions = res.data;
    }
    renderLbTabs(allCompetitions);
    if (!currentLbCompId && allCompetitions.length) {
      currentLbCompId = allCompetitions[0]._id;
    }
    if (currentLbCompId) await loadLbForComp(currentLbCompId);
  } catch (err) {
    document.getElementById('lbContent').innerHTML = `<p class="text-muted">ข้อผิดพลาด: ${err.message}</p>`;
  }
}

function renderLbTabs(comps) {
  const tabs = document.getElementById('lbTabs');
  const options = comps.map(c => `
    <option value="${c._id}" ${c._id === currentLbCompId ? 'selected' : ''}>
      ${c.name}
    </option>`).join('');
  tabs.innerHTML = `
    <select class="form-input" style="width: 100%; max-width: 500px; margin-bottom: 1rem; font-size: 1rem;" onchange="switchLbTab(this.value)">
      ${options}
    </select>`;
}

async function switchLbTab(compId) {
  currentLbCompId = compId;
  await loadLbForComp(compId);
}

async function loadLbForComp(compId) {
  const content = document.getElementById('lbContent');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const compRes = await apiFetch(`/competitions/${compId}`);
    const comp = compRes.data;
    const rankRes = isTourComp(comp)
      ? await apiFetch(`/brackets/${compId}/rankings`)
      : await apiFetch(`/rankings/${compId}`);
    const rankData = rankRes;

    const icon = getCategoryIcon(comp.category);
    content.innerHTML = `
      <div class="leaderboard-table-wrapper">
        <div class="lb-comp-header">
          <span style="font-size:1.5rem">${icon}</span>
          <div>
            <div class="lb-comp-name">${comp.name}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${comp.description || ''}</div>
          </div>
          <div class="lb-comp-round">รอบที่ ${comp.currentRound || '-'} / ${comp.totalRounds}</div>
        </div>
        ${renderLbTable(rankData, comp)}
      </div>`;
  } catch (err) {
    content.innerHTML = `<p class="text-muted p-4">เกิดข้อผิดพลาด: ${err.message}</p>`;
  }
}

function renderLbTable(rankData, comp) {
  if (!rankData?.data?.length) {
    return '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>ยังไม่มีข้อมูลคะแนน</p><p style="font-size:0.8rem;color:var(--text-dim)">กรรมการสามารถเริ่มบันทึกคะแนนได้ในแผงจัดการ</p></div>';
  }
  if (rankData.type === 'BRACKET') {
    const stageLabel = s => STAGE_LABELS[s] || s || '–';
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th>
            <th>รอบล่าสุด</th><th>คะแนน</th><th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rankData.data.map((r, i) => {
            const rank = !r.hasPlayed ? '–' : i < 3 ? ['🥇','🥈','🥉'][i] : i + 1;
            const rankClass = r.hasPlayed && i < 3 ? `rank-${i+1}` : 'rank-n';
            let statusHtml;
            if (!r.hasPlayed) {
              statusHtml = '<span style="color:var(--text-muted)">รอแข่งขัน</span>';
            } else if (r.qualified) {
              statusHtml = '<span style="color:var(--success);font-weight:700">✅ ผ่านเข้ารอบ</span>';
            } else {
              statusHtml = '<span style="color:var(--danger)">❌ ตกรอบ</span>';
            }
            return `
              <tr>
                <td><span class="rank-badge ${rankClass}">${rank}</span></td>
                <td><strong>${r.team?.teamName || '-'}</strong>
                  <div style="font-size:0.75rem;color:var(--text-dim)">${r.team?.teamNumber || ''}</div></td>
                <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-muted)">${r.hasPlayed ? stageLabel(r.latestStage) : '–'}</td>
                <td style="font-weight:700;font-size:1.1rem;color:var(--accent)">${r.hasPlayed ? r.latestScore : '–'}</td>
                <td>${statusHtml}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
  if (rankData.type === 'BATTLE') {
    const stages = {};
    rankData.data.forEach(m => { if (!stages[m.stage]) stages[m.stage] = []; stages[m.stage].push(m); });
    return Object.entries(stages).map(([stage, matches]) => `
      <div class="bracket-stage">
        <div class="bracket-stage-title">${{'preliminary':'รอบแรก','quarterfinal':'รอบก่อนรองชนะเลิศ','semifinal':'รอบรองชนะเลิศ','final':'รอบชิงชนะเลิศ','third_place':'ชิงอันดับ 3'}[stage] || stage}</div>
        ${matches.map(m => `
          <div class="match-card">
            <div class="match-team ${m.winner?._id === m.team1?._id ? 'match-winner' : ''}">
              <div class="match-team-name">${m.team1?.teamName || 'TBD'}</div>
              <div class="match-team-school">${m.team1?.schoolName || ''}</div>
            </div>
            <div style="text-align:center">
              <div class="match-score">${m.team1Score} <span class="match-vs">VS</span> ${m.team2Score}</div>
              <div style="font-size:0.7rem;color:var(--text-dim)">คู่ที่ ${m.matchNumber}</div>
            </div>
            <div class="match-team ${m.winner?._id === m.team2?._id ? 'match-winner' : ''}" style="text-align:right">
              <div class="match-team-name">${m.team2?.teamName || 'TBD'}</div>
              <div class="match-team-school">${m.team2?.schoolName || ''}</div>
            </div>
          </div>`).join('')}
      </div>`).join('');
  }
  if (rankData.type === 'TIME') {
    return `
      <table class="data-table">
        <thead><tr><th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th><th>เวลาดีสุด</th><th>สำเร็จ</th><th>รอบ</th></tr></thead>
        <tbody>
          ${rankData.data.map((r, i) => `
            <tr>
              <td><span class="rank-badge rank-${i < 3 ? i+1 : 'n'}">${i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</span></td>
              <td><strong>${r.team?.teamName || '-'}</strong><div style="font-size:0.75rem;color:var(--text-dim)">${r.team?.teamNumber || ''}</div></td>
              <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
              <td style="font-weight:700;color:var(--accent)">${r.taskCompleted ? formatSeconds(r.bestScore) : '–'}</td>
              <td>${r.taskCompleted ? '✅' : `❌ ${r.distanceCm || 0}cm`}</td>
              <td style="color:var(--text-muted)">${r.roundsCompleted}/${comp.totalRounds}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th>
          <th>คะแนนรวม</th>
          ${comp.totalRounds > 1 ? '<th>รอบ1</th><th>รอบ2</th><th>รอบ3</th>' : ''}
          <th>เวลาดีสุด</th>
        </tr>
      </thead>
      <tbody>
        ${rankData.data.map((r, i) => {
          const rScores = r.scores?.sort((a,b) => a.round - b.round) || [];
          const s = [1,2,3].map(n => rScores.find(s => s.round === n)?.totalScore ?? '–');
          return `
            <tr>
              <td><span class="rank-badge rank-${i < 3 ? i+1 : 'n'}">${i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</span></td>
              <td><strong>${r.team?.teamName || '-'}</strong><div style="font-size:0.75rem;color:var(--text-dim)">${r.team?.teamNumber || ''}</div></td>
              <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
              <td style="font-weight:700;font-size:1.2rem;color:var(--accent)">${r.finalScore ?? 0}</td>
              ${comp.totalRounds > 1 ? `<td>${s[0]}</td><td>${s[1]}</td><td>${s[2]}</td>` : ''}
              <td style="color:var(--text-muted);font-size:0.8rem">${formatSeconds(r.bestTime)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

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
const ADMIN_ONLY_TABS = ['teams', 'matches', 'users', 'scoreTable'];

const JUDGE_ALLOWED_TABS = ['scores', 'bracket'];

function switchAdminTabDirect(tab) {
  // Non-admin users: only scores + bracket allowed
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
  else if (tab === 'bracket') loadBracketTab();
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
  if (document.getElementById('scoreNotes'))     document.getElementById('scoreNotes').value = '';
  const msg = document.getElementById('scoreMsg');
  if (msg) msg.style.display = 'none';

  const recent = document.getElementById('recentScores');
  if (recent) recent.innerHTML = '<p class="text-muted">เลือกประเภทและทีมเพื่อดูคะแนน</p>';
  recentScoresCache = [];
  showToast('ล้างฟอร์มแล้ว', 'info');
}

function isTourComp(comp) {
  return comp?.name?.includes('เที่ยวเมืองศรีสะเกษ');
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
  if (!compId) {
    document.getElementById('normalScoreFields').style.display = '';
    document.getElementById('bracketScoreSection').style.display = 'none';
    return;
  }

  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;

  // Tour competitions use bracket score entry
  if (isTourComp(comp)) {
    document.getElementById('normalScoreFields').style.display = 'none';
    document.getElementById('bracketScoreSection').style.display = '';
    renderBracketScoreSection(compId, comp);
    return;
  }
  document.getElementById('normalScoreFields').style.display = '';
  document.getElementById('bracketScoreSection').style.display = 'none';

  // Show/hide fields by scoringType
  //   - เวลาที่ใช้ (วินาที): แสดงทุกประเภท (ใช้เป็น tiebreaker / ข้อมูลอ้างอิง)
  //   - ทำสำเร็จ + ระยะทาง: เฉพาะ TIME scoring
  const isTime = comp.scoringType === 'TIME';
  if (timeField) timeField.style.display = '';
  if (completedField) completedField.style.display = isTime ? '' : 'none';
  if (distanceField) distanceField.style.display = 'none';

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
          <div class="criteria-label">${cr.label} ${cr.isPenalty ? '(หักคะแนน)' : ''} ${cr.pointsPerUnit ? `(×${cr.pointsPerUnit} คะแนน)` : `(${cr.points} คะแนน)`}</div>
          ${cr.type === 'boolean'
            ? `<label><input type="checkbox" class="criteria-input" id="crit_${cr.key}" onchange="calcPreviewScore('${compId}')" style="width:auto"> ทำสำเร็จ</label>`
            : `<input type="number" class="form-input criteria-input" id="crit_${cr.key}" min="0" max="${cr.maxValue || 99}" value="0" onchange="calcPreviewScore('${compId}')" oninput="calcPreviewScore('${compId}')">`
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
      const val = parseFloat(el.value) || 0;
      const pts = val * (cr.pointsPerUnit || cr.points);
      total += cr.isPenalty ? -pts : pts;
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

  // ── ตรวจว่าเป็น tour comp หรือไม่ ──
  const comp = allCompetitions.find(c => c._id === compId);
  const roundFilter = document.getElementById('scoreTableRoundFilter');
  if (isTourComp(comp)) {
    if (roundFilter) roundFilter.style.display = 'none';
    await loadBracketMatchTable(compId, comp);
    return;
  }
  // comp ปกติ → แสดง round filter
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

// ─── BRACKET MATCH TABLE (สำหรับ tour comp ใน หน้าจัดการคะแนน) ───────────────

let _bmtCache = [];  // cache ของ match data สำหรับ openBracketMatchEdit

async function loadBracketMatchTable(compId, comp) {
  const container = document.getElementById('scoreTableContainer');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>กำลังโหลด...</p></div>';

  // ซ่อน round filter ที่ไม่เกี่ยว (ใช้แค่ team filter)
  const roundFilter = document.getElementById('scoreTableRoundFilter');
  if (roundFilter) roundFilter.style.display = 'none';

  try {
    const res = await apiFetch(`/brackets/${compId}`);
    const groups = res.data || [];
    _bmtCache = groups.flatMap(g => g.matches);

    if (!groups.length || !_bmtCache.length) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem"><div class="empty-state-icon">📭</div><p class="text-muted">ยังไม่มีสายการแข่งขัน</p></div>';
      return;
    }

    // กรอง by team ถ้ามีการเลือก
    const teamId = document.getElementById('scoreTableTeamFilter')?.value || '';

    const rows = groups.map(group => {
      const stageBase = STAGE_LABELS[group.stage] || group.stage;
      const roundLabel = (group.stage === 'preliminary' && group.bracketRound > 1)
        ? `${stageBase} (รอบที่ ${group.bracketRound})` : stageBase;

      const matchRows = group.matches
        .filter(m => !teamId || (m.team1?._id === teamId || m.team2?._id === teamId))
        .map(m => {
          const isBye = m.notes === 'BYE' || !m.team2;
          const t1name = m.team1 ? `${m.team1.teamNumber} ${m.team1.teamName}` : '-';
          const t2name = isBye ? 'BYE' : (m.team2 ? `${m.team2.teamNumber} ${m.team2.teamName}` : '-');
          const t1school = m.team1?.schoolName || '';
          const t2school = !isBye ? (m.team2?.schoolName || '') : '';

          let scoreHtml = '';
          if (isBye) {
            scoreHtml = '<span style="color:#16a34a;font-size:0.8rem">ผ่านอัตโนมัติ</span>';
          } else if (m.status === 'completed') {
            const s1 = m.isBestOf3 ? m.team1Wins : m.team1Score;
            const s2 = m.isBestOf3 ? m.team2Wins : m.team2Score;
            const wid = m.winner?._id || m.winner?.toString();
            const t1id = m.team1?._id || m.team1?.toString();
            const winnerName = wid === t1id ? t1name : t2name;
            scoreHtml = `
              <div style="font-weight:700;font-size:1rem">${s1} : ${s2}</div>
              <div style="font-size:0.72rem;color:var(--text-dim)">🏆 ${winnerName}</div>
              ${m.isBestOf3 && m.games?.length ? `<div style="font-size:0.7rem;color:var(--text-muted)">
                ${m.games.map(g => `G${g.gameNumber}: ${g.team1Score}–${g.team2Score}`).join(' | ')}
              </div>` : ''}`;
          } else if (m.status === 'in_progress') {
            scoreHtml = `<span style="color:var(--accent)">${m.team1Wins??0} : ${m.team2Wins??0} (กำลังแข่ง)</span>`;
          } else {
            scoreHtml = '<span class="text-muted">รอแข่ง</span>';
          }

          const canEdit = !isBye;
          const editBtn = canEdit
            ? `<button class="btn btn-sm btn-outline btn-icon" onclick="openBracketMatchEdit('${m._id}','${compId}')" title="แก้ไข">✏️</button>`
            : '';

          return `
            <tr>
              <td>
                <div style="font-weight:600;font-size:0.85rem">${t1name}</div>
                <div style="font-size:0.72rem;color:var(--text-dim)">${t1school}</div>
              </td>
              <td style="text-align:center;padding:0.25rem">
                ${scoreHtml}
              </td>
              <td>
                <div style="font-weight:600;font-size:0.85rem">${t2name}</div>
                <div style="font-size:0.72rem;color:var(--text-dim)">${t2school}</div>
              </td>
              <td style="text-align:center">
                <span class="badge-status badge-${m.status === 'completed' ? 'done' : m.status === 'in_progress' ? 'progress' : 'pending'}">
                  ${m.status === 'completed' ? '✅ จบ' : m.status === 'in_progress' ? '🔄 กำลังแข่ง' : '⏳ รอ'}
                </span>
              </td>
              <td style="text-align:center">${editBtn}</td>
            </tr>`;
        }).join('');

      if (!matchRows.trim()) return '';
      return `
        <div style="margin-bottom:1.5rem">
          <div class="score-section-title">${roundLabel}${group.matches[0]?.isBestOf3 ? ' <span class="badge-bo3" style="font-size:0.7rem">Best of 3</span>' : ''}</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>ทีม 1</th>
                <th style="width:160px;text-align:center">คะแนน</th>
                <th>ทีม 2</th>
                <th style="width:90px;text-align:center">สถานะ</th>
                <th style="width:50px"></th>
              </tr>
            </thead>
            <tbody>${matchRows}</tbody>
          </table>
        </div>`;
    }).join('');

    container.innerHTML = rows || '<div class="empty-state" style="padding:2rem"><p class="text-muted">ไม่พบคู่การแข่งขันในเงื่อนไขที่เลือก</p></div>';
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
  }
}

async function openBracketMatchEdit(matchId, compId) {
  const match = _bmtCache.find(m => m._id === matchId);
  if (!match) return showToast('ไม่พบข้อมูล match', 'error');
  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;

  // สร้าง prefill จาก team1Details / team2Details ที่บันทึกไว้
  const prefill = {
    t1: match.team1Details && Object.keys(match.team1Details).length ? match.team1Details : null,
    t2: match.team2Details && Object.keys(match.team2Details).length ? match.team2Details : null
  };

  const modalBody = document.getElementById('bmEditModalBody');
  modalBody.innerHTML = renderBracketScoreMatchCard(match, comp, compId, prefill, true);

  // แสดง modal
  document.getElementById('bmEditModal').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active');

  // คำนวณ preview หลัง DOM พร้อม
  setTimeout(() => calcBracketPreview(matchId, compId), 50);

  // เมื่อ submit เสร็จ ให้ปิด modal และ reload ตาราง
  const originalSubmit = window._bmEditCompId;
  window._bmEditCompId = compId;
}

// ─── เก็บค่าที่แก้ในแถว แล้ว PUT ไปที่ backend
async function saveScoreRow(scoreId) {
  if (!isAdmin()) { showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error'); return; }
  const row = document.querySelector(`tr[data-score-id="${scoreId}"]`);
  if (!row) return;

  const payload = {};
  row.querySelectorAll('[data-field]').forEach(el => {
    const field = el.getAttribute('data-field');
    if (el.type === 'checkbox') payload[field] = el.checked;
    else if (el.type === 'number') payload[field] = parseFloat(el.value) || 0;
    else payload[field] = el.value;
  });

  try {
    await apiFetch(`/scores/${scoreId}`, { method: 'PUT', body: JSON.stringify(payload) });
    showToast('บันทึกสำเร็จ ✅', 'success');
    // รีเฟรชตารางเพื่อให้คอลัมน์ "รวม" คำนวนใหม่
    loadScoresTable();
  } catch (err) {
    showToast(`บันทึกไม่สำเร็จ: ${err.message}`, 'error');
  }
}

// เปิดฟอร์มบันทึกคะแนนแบบเต็ม (สำหรับแก้ criteria detail ที่ inline table ไม่มี)
async function openScoreInForm(scoreId) {
  switchAdminTabDirect('scores');
  // รอ tab render เสร็จก่อน
  setTimeout(() => editScore(scoreId), 100);
}

async function deleteScoreFromTable(scoreId) {
  if (!isAdmin()) { showToast('เฉพาะผู้ดูแลระบบเท่านั้น', 'error'); return; }
  const s = scoreTableCache.find(x => String(x._id) === String(scoreId));
  const label = s ? `${s.team?.teamNumber || ''} รอบที่ ${s.round}` : 'คะแนนนี้';
  if (!confirm(`ต้องการลบ ${label} หรือไม่?\n\nการลบไม่สามารถกู้คืนได้`)) return;
  try {
    await apiFetch(`/scores/${scoreId}`, { method: 'DELETE' });
    showToast('ลบคะแนนเรียบร้อย ✅', 'success');
    loadScoresTable();
  } catch (err) { showToast(err.message, 'error'); }
}

async function submitScore() {
  const compId = document.getElementById('scoreCompetition').value;
  const teamId = document.getElementById('scoreTeam').value;
  const round = parseInt(document.getElementById('scoreRound').value);
  const notes = document.getElementById('scoreNotes').value;
  const editingId = document.getElementById('editingScoreId')?.value || '';

  if (!compId || !teamId) { showAlert('scoreMsg', 'กรุณาเลือกประเภทและทีม', 'error'); return; }

  const comp = allCompetitions.find(c => c._id === compId);
  const details = {};

  if (comp?.scoringType !== 'TIME') {
    comp?.scoringCriteria?.forEach(cr => {
      const el = document.getElementById(`crit_${cr.key}`);
      if (!el) return;
      details[cr.key] = cr.type === 'boolean' ? el.checked : (parseFloat(el.value) || 0);
    });
  }

  const commonPayload = {
    details, notes,
    timeUsedSeconds: parseFloat(document.getElementById('scoreTime')?.value) || 0,
    taskCompleted: document.getElementById('scoreCompleted')?.checked || false,
    distanceCm: parseFloat(document.getElementById('scoreDistance')?.value) || 0,
    bonusScore: parseFloat(document.getElementById('scoreBonusScore')?.value) || 0
  };

  try {
    if (editingId) {
      // Edit mode: PUT existing score
      await apiFetch(`/scores/${editingId}`, { method: 'PUT', body: JSON.stringify(commonPayload) });
      showToast('แก้ไขคะแนนสำเร็จ ✅', 'success');
      showAlert('scoreMsg', 'บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');
      cancelEditScore();
    } else {
      // Create/upsert mode: POST
      const payload = { team: teamId, competition: compId, round, ...commonPayload };
      await apiFetch('/scores', { method: 'POST', body: JSON.stringify(payload) });
      showToast('บันทึกคะแนนสำเร็จ ✅', 'success');
      showAlert('scoreMsg', 'บันทึกคะแนนเรียบร้อยแล้ว', 'success');
      // Reset fields only in create mode
      comp?.scoringCriteria?.forEach(cr => {
        const el = document.getElementById(`crit_${cr.key}`);
        if (el) { el.type === 'checkbox' ? el.checked = false : el.value = 0; }
      });
      if (document.getElementById('scoreTime')) document.getElementById('scoreTime').value = '';
      if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = false;
      if (document.getElementById('scoreBonusScore')) document.getElementById('scoreBonusScore').value = 0;
      calcPreviewScore(compId);
    }
    loadRecentScores(compId, teamId);
  } catch (err) { showAlert('scoreMsg', err.message, 'error'); }
}

// ─── MATCHES ──────────────────────────────────────────────────

async function loadMatchFilters() {
  await populateCompSelects();
  const sel = document.getElementById('matchCompFilter');
  const battleComps = allCompetitions.filter(c => c.scoringType === 'BATTLE');
  sel.innerHTML = '<option value="">ประเภท Battle...</option>' +
    battleComps.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
}

async function loadMatches() {
  const compId = document.getElementById('matchCompFilter').value;
  const div = document.getElementById('matchesList');
  if (!compId) { div.innerHTML = '<p class="text-muted text-center p-4">เลือกประเภทการแข่งขัน</p>'; return; }
  try {
    const res = await apiFetch(`/matches?competition=${compId}`);
    if (!res.data.length) {
      div.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚔️</div><p>ยังไม่มีคู่แข่งขัน</p></div>';
      return;
    }
    const stages = {};
    res.data.forEach(m => { if (!stages[m.stage]) stages[m.stage] = []; stages[m.stage].push(m); });
    div.innerHTML = Object.entries(stages).map(([stage, matches]) => `
      <div class="bracket-stage">
        <div class="bracket-stage-title">${{'preliminary':'รอบแรก','quarterfinal':'รอบก่อนรองฯ','semifinal':'รอบรองชนะเลิศ','final':'รอบชิงชนะเลิศ'}[stage]||stage}</div>
        ${matches.map(m => `
          <div class="match-card">
            <div class="match-team">
              <div class="match-team-name">${m.team1?.teamName||'TBD'}</div>
              <div class="match-team-school">${m.team1?.schoolName||''}</div>
            </div>
            <div style="text-align:center">
              <div class="match-score" style="font-size:1.2rem">${m.team1Score} - ${m.team2Score}</div>
              <button class="btn btn-sm btn-outline" onclick="showMatchResult('${m._id}')">📝 บันทึก</button>
            </div>
            <div class="match-team" style="text-align:right">
              <div class="match-team-name">${m.team2?.teamName||'TBD'}</div>
              <div class="match-team-school">${m.team2?.schoolName||''}</div>
            </div>
          </div>`).join('')}
      </div>`).join('');
  } catch (err) { div.innerHTML = `<p class="text-muted">${err.message}</p>`; }
}

async function showMatchModal() {
  const compId = document.getElementById('matchCompFilter').value;
  if (!compId) { showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'error'); return; }
  const teamsRes = await apiFetch(`/teams?competition=${compId}`);
  const comp = allCompetitions.find(c => c._id === compId);
  document.getElementById('matchFormContent').innerHTML = `
    <input type="hidden" id="matchCompId" value="${compId}">
    <div class="form-group">
      <label class="form-label">รอบ</label>
      <select class="form-input" id="matchStage">
        <option value="preliminary">รอบแรก</option>
        <option value="quarterfinal">รอบก่อนรองชนะเลิศ</option>
        <option value="semifinal">รอบรองชนะเลิศ</option>
        <option value="final">รอบชิงชนะเลิศ</option>
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">ทีม 1</label>
        <select class="form-input" id="matchTeam1">
          ${teamsRes.data.map(t => `<option value="${t._id}">${t.teamNumber} - ${t.teamName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">ทีม 2</label>
        <select class="form-input" id="matchTeam2">
          ${teamsRes.data.map(t => `<option value="${t._id}">${t.teamNumber} - ${t.teamName}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">หมายเลขคู่</label>
      <input type="number" class="form-input" id="matchNumber" value="1" min="1">
    </div>`;
  document.getElementById('matchId').value = '';
  showModal('matchModal');
}

async function saveMatch() {
  const id = document.getElementById('matchId').value;
  const compId = document.getElementById('matchCompId').value;
  if (id) {
    // Save result
    const payload = {
      team1Score: parseFloat(document.getElementById('matchT1Score')?.value) || 0,
      team2Score: parseFloat(document.getElementById('matchT2Score')?.value) || 0
    };
    try {
      await apiFetch(`/matches/${id}/result`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('บันทึกผลเรียบร้อย ✅', 'success'); closeModal(); loadMatches();
    } catch (err) { showAlert('matchModalMsg', err.message, 'error'); }
  } else {
    const payload = {
      competition: compId,
      stage: document.getElementById('matchStage').value,
      team1: document.getElementById('matchTeam1').value,
      team2: document.getElementById('matchTeam2').value,
      matchNumber: parseInt(document.getElementById('matchNumber').value) || 1
    };
    try {
      await apiFetch('/matches', { method: 'POST', body: JSON.stringify(payload) });
      showToast('สร้างคู่แข่งขันเรียบร้อย ✅', 'success'); closeModal(); loadMatches();
    } catch (err) { showAlert('matchModalMsg', err.message, 'error'); }
  }
}

async function showMatchResult(matchId) {
  const res = await apiFetch(`/matches?competition=${document.getElementById('matchCompFilter').value}`);
  const match = res.data.find(m => m._id === matchId);
  if (!match) return;
  document.getElementById('matchId').value = matchId;
  document.getElementById('matchFormContent').innerHTML = `
    <div style="margin-bottom:1rem;color:var(--text-muted);font-size:0.85rem">บันทึกผลคะแนน</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${match.team1?.teamName}</label>
        <input type="number" class="form-input" id="matchT1Score" value="${match.team1Score||0}" min="0" step="5">
      </div>
      <div class="form-group">
        <label class="form-label">${match.team2?.teamName}</label>
        <input type="number" class="form-input" id="matchT2Score" value="${match.team2Score||0}" min="0" step="5">
      </div>
    </div>`;
  document.getElementById('matchCompId').value = match.competition?._id || match.competition;
  showModal('matchModal');
}

// ─── USERS ────────────────────────────────────────────────────

// Cache the latest users list so edit can fill the modal without an extra request
let usersCache = [];

function getCurrentUserId() {
  return currentUser && (currentUser.id || currentUser._id);
}

async function loadUsers() {
  try {
    const res = await apiFetch('/auth/users');
    usersCache = res.data || [];
    const myId = String(getCurrentUserId() || '');
    document.getElementById('usersList').innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>#</th><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>บทบาท</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
          <tbody>
            ${usersCache.map((u, i) => {
              const isSelf = String(u._id) === myId;
              return `
              <tr>
                <td>${i+1}</td>
                <td><strong>${u.username}</strong>${isSelf ? ' <span class="tag tag-auto" style="font-size:0.65rem">คุณ</span>' : ''}</td>
                <td>${u.name}</td>
                <td><span class="tag ${u.role==='admin'?'tag-battle':u.role==='judge'?'tag-auto':'tag-age'}">${getRoleLabel(u.role)}</span></td>
                <td>${u.isActive ? '✅ ใช้งาน' : '❌ ระงับ'}</td>
                <td>
                  <button class="btn btn-sm btn-outline btn-icon" onclick="editUser('${u._id}')" title="แก้ไข">✏️</button>
                  ${isSelf ? '' : `
                    <button class="btn btn-sm btn-outline btn-icon" onclick="toggleUserActive('${u._id}', ${!u.isActive})" title="${u.isActive ? 'ระงับ' : 'เปิดใช้งาน'}">${u.isActive ? '🚫' : '✅'}</button>
                    <button class="btn btn-sm btn-outline btn-icon" onclick="deleteUser('${u._id}')" title="ลบ" style="color:var(--danger)">🗑️</button>
                  `}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) { document.getElementById('usersList').innerHTML = `<p>${err.message}</p>`; }
}

function showUserModal(user = null) {
  const editing = !!user;
  document.getElementById('userModalTitle').textContent = editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
  document.getElementById('userId').value = editing ? user._id : '';
  document.getElementById('newUsername').value = editing ? user.username : '';
  document.getElementById('newUsername').disabled = editing;
  document.getElementById('usernameHint').style.display = editing ? '' : 'none';
  document.getElementById('newPassword').value = '';
  document.getElementById('passwordLabel').textContent = editing ? 'รหัสผ่านใหม่' : 'รหัสผ่าน';
  document.getElementById('passwordHint').style.display = editing ? '' : 'none';
  document.getElementById('newName').value = editing ? user.name : '';
  document.getElementById('newRole').value = editing ? user.role : 'judge';
  // Active toggle: only show when editing and not editing yourself
  const showActiveField = editing && String(user._id) !== String(getCurrentUserId() || '');
  document.getElementById('userActiveField').style.display = showActiveField ? '' : 'none';
  document.getElementById('newIsActive').checked = editing ? user.isActive !== false : true;
  // Disable role change when editing yourself (last-admin safeguard)
  document.getElementById('newRole').disabled = editing && String(user._id) === String(getCurrentUserId() || '');
  document.getElementById('userModalMsg').style.display = 'none';
  showModal('userModal');
}

async function editUser(id) {
  // Try cache first; fall back to API
  let user = usersCache.find(u => String(u._id) === String(id));
  if (!user) {
    try {
      const res = await apiFetch(`/auth/users/${id}`);
      user = res.data;
    } catch (err) { showToast(err.message, 'error'); return; }
  }
  showUserModal(user);
}

async function deleteUser(id) {
  const user = usersCache.find(u => String(u._id) === String(id));
  const label = user ? `${user.username} (${user.name})` : 'ผู้ใช้งานนี้';
  if (!confirm(`ต้องการลบ ${label} หรือไม่?\n\nการลบไม่สามารถกู้คืนได้`)) return;
  try {
    await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
    showToast('ลบผู้ใช้งานเรียบร้อย ✅', 'success');
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleUserActive(id, makeActive) {
  try {
    await apiFetch(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: makeActive })
    });
    showToast(makeActive ? 'เปิดใช้งานบัญชีแล้ว ✅' : 'ระงับบัญชีแล้ว 🚫', 'success');
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveUser() {
  const id = document.getElementById('userId').value;
  const editing = !!id;
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const name = document.getElementById('newName').value.trim();
  const role = document.getElementById('newRole').value;

  if (editing) {
    if (!name) { showAlert('userModalMsg', 'กรุณากรอกชื่อ-นามสกุล', 'error'); return; }
    const payload = { name, role };
    if (password) {
      if (password.length < 6) {
        showAlert('userModalMsg', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return;
      }
      payload.password = password;
    }
    if (document.getElementById('userActiveField').style.display !== 'none') {
      payload.isActive = document.getElementById('newIsActive').checked;
    }
    try {
      await apiFetch(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('บันทึกการแก้ไขเรียบร้อย ✅', 'success'); closeModal(); loadUsers();
    } catch (err) { showAlert('userModalMsg', err.message, 'error'); }
  } else {
    if (!username || !password || !name) {
      showAlert('userModalMsg', 'กรุณากรอกข้อมูลให้ครบ', 'error'); return;
    }
    if (password.length < 6) {
      showAlert('userModalMsg', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return;
    }
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, name, role })
      });
      showToast('เพิ่มผู้ใช้งานสำเร็จ ✅', 'success'); closeModal(); loadUsers();
    } catch (err) { showAlert('userModalMsg', err.message, 'error'); }
  }
}

// ─── MODALS ───────────────────────────────────────────────────

function showModal(id) {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ─── BRACKET ──────────────────────────────────────────────────

const STAGE_LABELS = {
  preliminary:   'รอบคัดเลือก',
  round16:       'รอบ 16 ทีม',
  quarterfinal:  'รอบ 8 ทีม',
  semifinal:     'รอบรองชนะเลิศ',
  final:         'รอบชิงชนะเลิศ',
  third_place:   'ชิงอันดับ 3'
};

let bracketCurrentCompId = null;
let bracketCurrentRound = 1;
let bracketAvailableTeams = [];
let _bracketRoundsData = [];

async function loadBracketTab() {
  const sel = document.getElementById('bracketCompFilter');
  try {
    const res = await apiFetch('/competitions');
    const tourComps = res.data.filter(c => c.name.includes('เที่ยวเมืองศรีสะเกษ'));
    sel.innerHTML = '<option value="">-- เลือกประเภทการแข่งขัน --</option>';
    tourComps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  } catch (err) {
    showToast('โหลดรายการแข่งขันไม่ได้: ' + err.message, 'error');
  }
}

async function loadBracket() {
  const compId = document.getElementById('bracketCompFilter').value;
  if (!compId) {
    document.getElementById('bracketContent').innerHTML = '<p class="text-muted text-center p-4">เลือกประเภทการแข่งขันเพื่อดูสายการแข่งขัน</p>';
    document.getElementById('bracketActions').style.display = 'none';
    return;
  }
  bracketCurrentCompId = compId;
  document.getElementById('bracketActions').style.display = isAdmin() || isJudge() ? 'flex' : 'none';

  const content = document.getElementById('bracketContent');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res = await apiFetch(`/brackets/${compId}`);
    renderBracket(res.data);
  } catch (err) {
    content.innerHTML = `<p class="text-muted text-center p-4">เกิดข้อผิดพลาด: ${err.message}</p>`;
  }
}

function renderBracket(rounds) {
  _bracketRoundsData = rounds;
  const content = document.getElementById('bracketContent');
  if (!rounds.length) {
    content.innerHTML = '<p class="text-muted text-center p-4">ยังไม่มีสายการแข่งขัน กด "สุ่มจับสาย" หรือ "จับสายด้วยตนเอง" เพื่อเริ่มต้น</p>';
    return;
  }

  // หาสูงสุดของ bracketRound ที่มีอยู่
  bracketCurrentRound = Math.max(...rounds.map(r => r.bracketRound));

  content.innerHTML = rounds.map(group => {
    // แสดง "(รอบที่ N)" เฉพาะรอบคัดเลือกที่มีหลายรอบเท่านั้น
    const stageBase = STAGE_LABELS[group.stage] || group.stage;
    const label = (group.stage === 'preliminary' && group.bracketRound > 1)
      ? `${stageBase} (รอบที่ ${group.bracketRound})`
      : stageBase;
    const isBo3 = group.matches[0]?.isBestOf3;
    return `
      <div class="bracket-round">
        <div class="bracket-round-title">
          ${label}
          ${isBo3 ? '<span class="badge-bo3">Best of 3</span>' : ''}
        </div>
        <div class="bracket-matches">
          ${group.matches.map(m => renderBracketMatchCard(m)).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderBracketMatchCard(m) {
  const isBye = m.notes === 'BYE' || !m.team2;
  const t1 = m.team1 ? `${m.team1.teamNumber} ${m.team1.teamName}` : 'รอการจับสาย';
  const t2 = isBye ? '<span class="bye-badge">BYE</span>' : (m.team2 ? `${m.team2.teamNumber} ${m.team2.teamName}` : 'รอการจับสาย');
  const w1 = m.winner && m.team1 && (m.winner._id === m.team1._id || m.winner.toString() === m.team1._id?.toString());
  const w2 = !isBye && m.winner && m.team2 && (m.winner._id === m.team2._id || m.winner.toString() === m.team2._id?.toString());
  let gamesHtml = '';
  if (m.isBestOf3 && m.games && m.games.length) {
    gamesHtml = `<div class="bracket-games">${m.games.map(g =>
      `<span class="bracket-game">G${g.gameNumber}: ${g.team1Score ?? '-'} – ${g.team2Score ?? '-'}</span>`
    ).join('')}</div>`;
  }

  const scoreDisplay = isBye
    ? '<span style="color:#16a34a;font-weight:600">ผ่านอัตโนมัติ</span>'
    : m.status === 'completed'
      ? (m.isBestOf3 ? `${m.team1Wins} – ${m.team2Wins} ชนะ` : `${m.team1Score} – ${m.team2Score}`)
      : m.status === 'in_progress' ? `${m.team1Wins ?? 0} – ${m.team2Wins ?? 0} (กำลังแข่ง)` : 'รอแข่ง';

  return `
    <div class="bracket-match-card ${m.status === 'completed' ? 'match-done' : ''} ${isBye ? 'bracket-bye' : ''}">
      <div class="bracket-team ${w1 ? 'match-winner' : ''}">${t1}</div>
      <div class="bracket-score">${scoreDisplay}</div>
      <div class="bracket-team bye-team">${t2}</div>
      ${gamesHtml}
    </div>`;
}

async function generateBracket(mode) {
  if (!bracketCurrentCompId) return showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'error');
  if (!confirm(`ยืนยันการ${mode === 'random' ? 'สุ่ม' : ''}จับสาย? match ที่มีอยู่ในรอบปัจจุบันจะถูกลบและสร้างใหม่`)) return;
  try {
    await apiFetch(`/brackets/${bracketCurrentCompId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ mode, bracketRound: 1 })
    });
    showToast('จับสายเรียบร้อย', 'success');
    loadBracket();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
}

function advanceBracket() {
  if (!bracketCurrentCompId) return showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'error');
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('advanceChoiceModal').classList.add('active');
}

function showCancelRoundModal() {
  if (!bracketCurrentCompId) return showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'error');
  if (!_bracketRoundsData || !_bracketRoundsData.length) {
    return showToast('ยังไม่มีการจับสายในรายการนี้', 'error');
  }

  // สร้าง options จากรอบที่มีอยู่
  const sel = document.getElementById('cancelRoundSelect');
  sel.innerHTML = _bracketRoundsData.map(group => {
    const stageBase = STAGE_LABELS[group.stage] || group.stage;
    const label = (group.stage === 'preliminary' && group.bracketRound > 1)
      ? `${stageBase} (รอบที่ ${group.bracketRound})`
      : stageBase;
    const completedCount = group.matches.filter(m => m.status === 'completed').length;
    const total = group.matches.length;
    return `<option value="${group.bracketRound}">${label} — ${total} คู่ (บันทึกแล้ว ${completedCount})</option>`;
  }).join('');

  document.getElementById('cancelRoundMsg').style.display = 'none';
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('cancelRoundModal').classList.add('active');
}

async function doDeleteBracketRound() {
  const roundVal = document.getElementById('cancelRoundSelect').value;
  if (!roundVal) return;

  // หาชื่อรอบเพื่อแสดงใน confirm
  const group = _bracketRoundsData.find(g => g.bracketRound == roundVal);
  const stageBase = STAGE_LABELS[group?.stage] || group?.stage || `รอบที่ ${roundVal}`;
  const label = (group?.stage === 'preliminary' && group?.bracketRound > 1)
    ? `${stageBase} (รอบที่ ${roundVal})` : stageBase;

  if (!confirm(`ยืนยันลบการจับคู่ทั้งหมดของ "${label}"?\nข้อมูลคะแนนที่บันทึกไว้จะหายทั้งหมด`)) return;

  try {
    const res = await apiFetch(`/brackets/${bracketCurrentCompId}/round/${roundVal}`, {
      method: 'DELETE'
    });
    showToast(res.message || 'ยกเลิกจับคู่เรียบร้อย', 'success');
    closeModal();
    loadBracket();
  } catch (err) {
    const msg = document.getElementById('cancelRoundMsg');
    msg.textContent = err.message;
    msg.style.display = 'block';
  }
}

async function doAdvanceBracketRandom() {
  closeModal();
  try {
    const res = await apiFetch(`/brackets/${bracketCurrentCompId}/advance`, {
      method: 'POST',
      body: JSON.stringify({ bracketRound: bracketCurrentRound })
    });
    showToast(res.message || 'สร้างรอบถัดไปเรียบร้อย', 'success');
    loadBracket();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
}

function doAdvanceBracketManual() {
  closeModal();
  // ดึงผู้ชนะจากรอบปัจจุบัน
  const currentGroups = _bracketRoundsData.filter(g => g.bracketRound === bracketCurrentRound);
  const winners = [];
  currentGroups.forEach(g => {
    g.matches.forEach(m => {
      if (m.status !== 'completed' || !m.winner) return;
      const winnerId = m.winner._id || m.winner;
      const winnerTeam =
        (m.team1?._id?.toString() || m.team1?.toString()) === winnerId?.toString()
          ? m.team1 : m.team2;
      if (winnerTeam) winners.push(winnerTeam);
    });
  });
  if (winners.length < 2) return showToast('ต้องมีผู้ชนะอย่างน้อย 2 ทีม กรุณาบันทึกผลให้ครบก่อน', 'error');
  showManualPairModal(winners, bracketCurrentRound + 1);
}

function showBracketMatchModal(matchId, isBestOf3) {
  document.getElementById('bracketMatchId').value = matchId;
  document.getElementById('bracketMatchIsBo3').value = isBestOf3 ? '1' : '0';
  const title = isBestOf3 ? 'บันทึกผลเกม (Best of 3)' : 'บันทึกผลการแข่งขัน';
  document.getElementById('bracketMatchModalTitle').textContent = title;

  const form = document.getElementById('bracketMatchForm');
  if (isBestOf3) {
    form.innerHTML = `
      <p class="text-muted" style="margin-bottom:1rem">บันทึกทีละเกม (ชนะ 2 เกมก่อนชนะ match)</p>
      <div class="form-group">
        <label class="form-label">เกมที่</label>
        <select class="form-input" id="boGameNumber">
          <option value="1">เกม 1</option>
          <option value="2">เกม 2</option>
          <option value="3">เกม 3</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group">
          <label class="form-label">คะแนน ทีม 1</label>
          <input type="number" class="form-input" id="boTeam1Score" min="0" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">คะแนน ทีม 2</label>
          <input type="number" class="form-input" id="boTeam2Score" min="0" value="0">
        </div>
      </div>`;
  } else {
    form.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group">
          <label class="form-label">คะแนน ทีม 1</label>
          <input type="number" class="form-input" id="prelTeam1Score" min="0" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">คะแนน ทีม 2</label>
          <input type="number" class="form-input" id="prelTeam2Score" min="0" value="0">
        </div>
      </div>`;
  }

  document.getElementById('bracketMatchMsg').style.display = 'none';
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('bracketMatchModal').classList.add('active');
}

async function saveBracketResult() {
  const matchId = document.getElementById('bracketMatchId').value;
  const isBo3 = document.getElementById('bracketMatchIsBo3').value === '1';
  const btn = document.getElementById('bracketMatchSaveBtn');
  btn.disabled = true;
  try {
    if (isBo3) {
      const gameNumber = parseInt(document.getElementById('boGameNumber').value);
      const team1Score = parseFloat(document.getElementById('boTeam1Score').value) || 0;
      const team2Score = parseFloat(document.getElementById('boTeam2Score').value) || 0;
      await apiFetch(`/brackets/${bracketCurrentCompId}/matches/${matchId}/game`, {
        method: 'POST',
        body: JSON.stringify({ gameNumber, team1Score, team2Score })
      });
    } else {
      const team1Score = parseFloat(document.getElementById('prelTeam1Score').value) || 0;
      const team2Score = parseFloat(document.getElementById('prelTeam2Score').value) || 0;
      await apiFetch(`/brackets/${bracketCurrentCompId}/matches/${matchId}/result`, {
        method: 'POST',
        body: JSON.stringify({ team1Score, team2Score })
      });
    }
    showToast('บันทึกผลเรียบร้อย', 'success');
    closeModal();
    loadBracket();
  } catch (err) {
    const msg = document.getElementById('bracketMatchMsg');
    msg.textContent = err.message;
    msg.className = 'alert alert-error';
    msg.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

let _manualPairBracketRound = 1;

async function showManualPairModal(teamsOverride = null, bracketRound = 1) {
  if (!bracketCurrentCompId) return showToast('กรุณาเลือกประเภทการแข่งขันก่อน', 'error');
  _manualPairBracketRound = bracketRound;
  try {
    if (teamsOverride) {
      bracketAvailableTeams = teamsOverride;
    } else {
      const res = await apiFetch(`/teams?competition=${bracketCurrentCompId}`);
      bracketAvailableTeams = res.data || [];
    }
    if (bracketAvailableTeams.length < 2) return showToast('ทีมไม่เพียงพอสำหรับการจับสาย', 'error');

    const isOdd = bracketAvailableTeams.length % 2 !== 0;
    const pairCount = Math.floor(bracketAvailableTeams.length / 2);
    const opts = bracketAvailableTeams.map(t =>
      `<option value="${t._id}">${t.teamNumber} – ${t.teamName}</option>`
    ).join('');

    let rows = '';
    for (let i = 0; i < pairCount; i++) {
      rows += `
        <div class="manual-pair-row">
          <span class="pair-label">คู่ที่ ${i + 1}</span>
          <select class="form-input" id="manualTeam1_${i}">${opts}</select>
          <span>VS</span>
          <select class="form-input" id="manualTeam2_${i}">${opts}</select>
        </div>`;
    }

    // ถ้าทีมเป็นจำนวนคี่ แสดง BYE selector
    let byeRow = '';
    if (isOdd) {
      byeRow = `
        <div class="manual-pair-row bye-selector-row">
          <span class="pair-label bye-label">🎯 BYE</span>
          <span class="bye-hint">ทีมที่ผ่านเข้ารอบอัตโนมัติ (ไม่ต้องแข่ง)</span>
          <select class="form-input" id="manualByeTeam">${opts}</select>
        </div>`;
    }

    document.getElementById('manualPairForm').innerHTML = rows + byeRow;
    document.getElementById('manualPairMsg').style.display = 'none';
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('manualPairModal').classList.add('active');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
}

async function saveManualPairs() {
  const isOdd = bracketAvailableTeams.length % 2 !== 0;
  const pairCount = Math.floor(bracketAvailableTeams.length / 2);
  const pairs = [];
  for (let i = 0; i < pairCount; i++) {
    const t1 = document.getElementById(`manualTeam1_${i}`)?.value;
    const t2 = document.getElementById(`manualTeam2_${i}`)?.value;
    if (!t1 || !t2 || t1 === t2) {
      const msg = document.getElementById('manualPairMsg');
      msg.textContent = `คู่ที่ ${i + 1}: กรุณาเลือกทีมที่แตกต่างกัน`;
      msg.className = 'alert alert-error';
      msg.style.display = 'block';
      return;
    }
    pairs.push({ team1Id: t1, team2Id: t2 });
  }
  let byeTeamId = null;
  if (isOdd) {
    byeTeamId = document.getElementById('manualByeTeam')?.value;
    if (!byeTeamId) {
      const msg = document.getElementById('manualPairMsg');
      msg.textContent = 'กรุณาเลือกทีมที่จะได้ BYE';
      msg.className = 'alert alert-error';
      msg.style.display = 'block';
      return;
    }
  }
  try {
    const body = { mode: 'manual', bracketRound: _manualPairBracketRound, pairs };
    if (byeTeamId) body.byeTeamId = byeTeamId;
    await apiFetch(`/brackets/${bracketCurrentCompId}/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    showToast('จับสายด้วยตนเองเรียบร้อย', 'success');
    closeModal();
    loadBracket();
  } catch (err) {
    const msg = document.getElementById('manualPairMsg');
    msg.textContent = err.message;
    msg.className = 'alert alert-error';
    msg.style.display = 'block';
  }
}

// ─── BRACKET SCORE ENTRY ──────────────────────────────────────

let _bsData = [];   // { roundKey, label, matches[] }
let _bsComp = null;
let _bsCompId = null;

async function renderBracketScoreSection(compId, comp) {
  _bsCompId = compId;
  _bsComp = comp;
  const section = document.getElementById('bracketScoreSection');
  section.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res = await apiFetch(`/brackets/${compId}`);

    // Build round options (all rounds, pending matches only in each)
    _bsData = res.data.map(group => {
      const stageBase = STAGE_LABELS[group.stage] || group.stage;
      const roundLabel = (group.stage === 'preliminary' && group.bracketRound > 1)
        ? `${stageBase} (รอบที่ ${group.bracketRound})`
        : stageBase;
      return {
        roundKey: `${group.bracketRound}_${group.stage}`,
        label: roundLabel,
        isBo3: group.matches[0]?.isBestOf3 || false,
        matches: group.matches
      };
    });

    if (!_bsData.length) {
      section.innerHTML = `
        <div class="empty-state" style="padding:2rem">
          <div class="empty-state-icon">🏅</div>
          <p>ยังไม่มีสายการแข่งขัน</p>
          <small class="text-muted">กรุณาจับสายที่แท็บ "จับสาย" ก่อน</small>
        </div>`;
      return;
    }

    const roundOpts = _bsData.map(g =>
      `<option value="${g.roundKey}">${g.label}${g.isBo3 ? ' (Best of 3)' : ''}</option>`
    ).join('');

    section.innerHTML = `
      <div class="form-group">
        <label class="form-label">รอบการแข่งขัน</label>
        <select class="form-input" id="bsRoundSelect" onchange="onBracketRoundSelect()">
          <option value="">-- เลือกรอบ --</option>
          ${roundOpts}
        </select>
      </div>
      <div class="form-group" id="bsMatchGroup" style="display:none">
        <label class="form-label">คู่การแข่งขัน</label>
        <select class="form-input" id="bsMatchSelect" onchange="onBracketMatchSelect()">
          <option value="">-- เลือกคู่ --</option>
        </select>
      </div>
      <div id="bsScoreForm"></div>`;
  } catch (err) {
    section.innerHTML = `<p class="text-muted text-center">เกิดข้อผิดพลาด: ${err.message}</p>`;
  }
}

function onBracketRoundSelect() {
  const roundKey = document.getElementById('bsRoundSelect').value;
  const matchGroup = document.getElementById('bsMatchGroup');
  const scoreForm = document.getElementById('bsScoreForm');
  scoreForm.innerHTML = '';

  if (!roundKey) { matchGroup.style.display = 'none'; return; }

  const group = _bsData.find(g => g.roundKey === roundKey);
  if (!group) return;

  const matchSel = document.getElementById('bsMatchSelect');
  // กรอง BYE matches ออก — ไม่ต้องบันทึกคะแนน
  const scorableMatches = group.matches.filter(m => m.notes !== 'BYE' && m.team2);
  matchSel.innerHTML = '<option value="">-- เลือกคู่ --</option>' +
    scorableMatches.map(m => {
      const t1 = m.team1 ? `${m.team1.teamNumber} ${m.team1.teamName}` : 'TBD';
      const t2 = m.team2 ? `${m.team2.teamNumber} ${m.team2.teamName}` : 'TBD';
      const done = m.status === 'completed' ? ' ✅' : m.status === 'in_progress' ? ' 🔄' : '';
      return `<option value="${m._id}">${t1} vs ${t2}${done}</option>`;
    }).join('');

  matchGroup.style.display = '';
}

function onBracketMatchSelect() {
  const roundKey = document.getElementById('bsRoundSelect').value;
  const matchId = document.getElementById('bsMatchSelect').value;
  const scoreForm = document.getElementById('bsScoreForm');
  scoreForm.innerHTML = '';
  if (!matchId || !roundKey) return;

  const group = _bsData.find(g => g.roundKey === roundKey);
  const match = group?.matches.find(m => m._id === matchId);
  if (!match || !_bsComp) return;

  if (match.status === 'completed') {
    const t1name = match.team1 ? `${match.team1.teamNumber} ${match.team1.teamName}` : 'TBD';
    const t2name = match.team2 ? `${match.team2.teamNumber} ${match.team2.teamName}` : 'TBD';
    const s1 = match.isBestOf3 ? match.team1Wins : match.team1Score;
    const s2 = match.isBestOf3 ? match.team2Wins : match.team2Score;
    const wid = match.winner?._id || match.winner;
    const winnerName = wid
      ? (wid === match.team1?._id || wid === match.team1?._id?.toString() ? t1name : t2name)
      : '(เสมอ)';
    scoreForm.innerHTML = `
      <div class="alert alert-success" style="margin-top:1rem">
        <strong>✅ บันทึกผลแล้ว</strong><br>
        ${t1name} <strong>${s1}</strong> : <strong>${s2}</strong> ${t2name}<br>
        <small>ผู้ชนะ: <strong>${winnerName}</strong></small>
      </div>`;
    return;
  }

  scoreForm.innerHTML = renderBracketScoreMatchCard(match, _bsComp, _bsCompId);
}

// prefill: { t1: {criteria details + _bonus + _time}, t2: {...} }
// isEdit: true = "อัพเดทผล", false = "บันทึกผลคู่นี้"
function renderBracketScoreMatchCard(match, comp, compId, prefill = null, isEdit = false) {
  const mid = match._id;
  const isBo3 = match.isBestOf3;
  const stageLabel = STAGE_LABELS[match.stage] || match.stage;
  const nextGame = isBo3 ? Math.min((match.games?.length || 0) + 1, 3) : 1;

  // helper: ดึง pre-fill value
  const pv = (side, key, fallback = 0) => prefill?.[side]?.[key] ?? fallback;
  const pvChecked = (side, key) => prefill?.[side]?.[key] === true;

  const criteriaFields = (prefix, side) => (comp.scoringCriteria || []).map(cr => `
    <div class="criteria-field">
      <div class="criteria-label" style="font-size:0.75rem">${cr.label}
        <span style="color:var(--text-muted)">${cr.pointsPerUnit ? `×${cr.pointsPerUnit}` : `${cr.points}pt`}</span>
      </div>
      ${cr.type === 'boolean'
        ? `<label><input type="checkbox" id="${prefix}_${cr.key}" ${pvChecked(side, cr.key) ? 'checked' : ''} onchange="calcBracketPreview('${mid}','${compId}')"> ทำสำเร็จ</label>`
        : `<input type="number" class="form-input" id="${prefix}_${cr.key}" min="0" max="${cr.maxValue||99}" value="${pv(side, cr.key)}" oninput="calcBracketPreview('${mid}','${compId}')">`
      }
    </div>`).join('');

  const teamCol = (prefix, side, team) => `
    <div class="bsc-team-col">
      <div class="bsc-team-name">${team?.teamNumber || ''} ${team?.teamName || 'TBD'}</div>
      <div class="text-muted" style="font-size:0.73rem;margin-bottom:0.75rem">${team?.schoolName || ''}</div>
      ${criteriaFields(prefix, side)}
      <div class="form-group" style="margin-top:0.5rem">
        <label class="form-label" style="font-size:0.75rem">⏱ เวลา (วิ)</label>
        <input type="number" class="form-input" id="${prefix}_time" min="0" step="0.01" value="${pv(side, '_time')}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size:0.75rem">⭐ โบนัส</label>
        <input type="number" class="form-input" id="${prefix}_bonus" min="0" value="${pv(side, '_bonus')}" oninput="calcBracketPreview('${mid}','${compId}')">
      </div>
      <div class="score-preview" style="margin-top:0.5rem">
        <div class="score-preview-label">คะแนนรวม</div>
        <div class="score-preview-value" id="${prefix}_preview">0</div>
      </div>
    </div>`;

  const gameSelector = isBo3 ? `
    <div class="form-group" style="margin-bottom:1rem">
      <label class="form-label">บันทึกเกมที่</label>
      <select class="form-input" id="bm${mid}_game" style="max-width:160px">
        <option value="1" ${nextGame===1?'selected':''}>เกม 1</option>
        <option value="2" ${nextGame===2?'selected':''}>เกม 2</option>
        <option value="3" ${nextGame===3?'selected':''}>เกม 3</option>
      </select>
      <small class="text-muted" style="margin-left:0.5rem">
        สถานะ: ทีม1 ชนะ ${match.team1Wins??0} / ทีม2 ชนะ ${match.team2Wins??0} เกม
      </small>
    </div>` : '';

  // แสดงคะแนนปัจจุบันกรณีแก้ไข
  const currentScoreBanner = isEdit && match.status === 'completed' ? `
    <div class="alert" style="background:var(--bg2);border:1px solid var(--border);margin-bottom:1rem;font-size:0.85rem">
      📊 คะแนนปัจจุบัน: <strong>${match.team1?.teamName || 'ทีม 1'}</strong>
      <span style="font-size:1.1rem;font-weight:700;margin:0 0.5rem">${isBo3 ? match.team1Wins : match.team1Score} : ${isBo3 ? match.team2Wins : match.team2Score}</span>
      <strong>${match.team2?.teamName || 'ทีม 2'}</strong>
    </div>` : '';

  return `
    <div class="bsc-card" id="bsc_${mid}">
      <div class="bsc-header">
        <span>${stageLabel}</span>
        ${isBo3 ? '<span class="badge-bo3">Best of 3</span>' : ''}
        ${isEdit ? '<span class="badge" style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.72rem">✏️ แก้ไข</span>' : ''}
      </div>
      ${currentScoreBanner}
      ${gameSelector}
      <div class="bsc-teams">
        ${teamCol(`bm${mid}_t1`, 't1', match.team1)}
        <div class="bsc-vs">VS</div>
        ${teamCol(`bm${mid}_t2`, 't2', match.team2)}
      </div>
      <div id="bsc_msg_${mid}" class="alert" style="display:none;margin-top:0.75rem"></div>
      <button class="btn btn-primary btn-full" style="margin-top:1rem"
        onclick="submitBracketMatchScore('${mid}','${compId}',${isBo3})">
        ${isEdit ? '💾 อัพเดทผล' : '💾 บันทึกผลคู่นี้'}
      </button>
    </div>`;
}

function calcBracketPreview(matchId, compId) {
  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;
  ['t1', 't2'].forEach(side => {
    const prefix = `bm${matchId}_${side}`;
    let total = 0;
    (comp.scoringCriteria || []).forEach(cr => {
      const el = document.getElementById(`${prefix}_${cr.key}`);
      if (!el) return;
      if (cr.type === 'boolean') {
        if (el.checked) total += cr.isPenalty ? -cr.points : cr.points;
      } else {
        const val = parseFloat(el.value) || 0;
        total += (cr.isPenalty ? -1 : 1) * val * (cr.pointsPerUnit || cr.points || 0);
      }
    });
    total += parseFloat(document.getElementById(`${prefix}_bonus`)?.value) || 0;
    const preview = document.getElementById(`${prefix}_preview`);
    if (preview) preview.textContent = total;
  });
}

async function submitBracketMatchScore(matchId, compId, isBo3) {
  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;

  const calcScore = (prefix) => {
    let total = 0;
    (comp.scoringCriteria || []).forEach(cr => {
      const el = document.getElementById(`${prefix}_${cr.key}`);
      if (!el) return;
      if (cr.type === 'boolean') {
        if (el.checked) total += cr.isPenalty ? -cr.points : cr.points;
      } else {
        const val = parseFloat(el.value) || 0;
        total += (cr.isPenalty ? -1 : 1) * val * (cr.pointsPerUnit || cr.points || 0);
      }
    });
    total += parseFloat(document.getElementById(`${prefix}_bonus`)?.value) || 0;
    return total;
  };

  // เก็บ criteria details เพื่อ pre-fill ตอนแก้ไขในภายหลัง
  const collectDetails = (prefix) => {
    const details = {};
    (comp.scoringCriteria || []).forEach(cr => {
      const el = document.getElementById(`${prefix}_${cr.key}`);
      if (!el) return;
      details[cr.key] = cr.type === 'boolean' ? el.checked : (parseFloat(el.value) || 0);
    });
    details._bonus = parseFloat(document.getElementById(`${prefix}_bonus`)?.value) || 0;
    details._time  = parseFloat(document.getElementById(`${prefix}_time`)?.value)  || 0;
    return details;
  };

  const team1Score = calcScore(`bm${matchId}_t1`);
  const team2Score = calcScore(`bm${matchId}_t2`);
  const msgEl = document.getElementById(`bsc_msg_${matchId}`);
  const btn = document.querySelector(`#bsc_${matchId} .btn-primary`);
  if (btn) btn.disabled = true;

  try {
    if (isBo3) {
      const gameNumber = parseInt(document.getElementById(`bm${matchId}_game`)?.value || '1');
      await apiFetch(`/brackets/${compId}/matches/${matchId}/game`, {
        method: 'POST',
        body: JSON.stringify({ gameNumber, team1Score, team2Score })
      });
    } else {
      await apiFetch(`/brackets/${compId}/matches/${matchId}/result`, {
        method: 'POST',
        body: JSON.stringify({
          team1Score, team2Score,
          team1Details: collectDetails(`bm${matchId}_t1`),
          team2Details: collectDetails(`bm${matchId}_t2`)
        })
      });
    }
    showToast('บันทึกผลเรียบร้อย ✅', 'success');

    // ถ้าเปิดจาก edit modal (จัดการคะแนน) → ปิด modal และ reload ตาราง
    const bmEditModal = document.getElementById('bmEditModal');
    if (bmEditModal?.classList.contains('active')) {
      closeModal();
      const editCompId = window._bmEditCompId || compId;
      await loadBracketMatchTable(editCompId, comp);
      return;
    }

    // Normal score entry flow — restore dropdown selections
    const prevRound = document.getElementById('bsRoundSelect')?.value;
    const prevMatch = document.getElementById('bsMatchSelect')?.value;
    await renderBracketScoreSection(compId, comp);
    if (prevRound) {
      const sel = document.getElementById('bsRoundSelect');
      if (sel) { sel.value = prevRound; onBracketRoundSelect(); }
      if (prevMatch) {
        const msel = document.getElementById('bsMatchSelect');
        if (msel) { msel.value = prevMatch; onBracketMatchSelect(); }
      }
    }
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'alert alert-error'; msgEl.style.display = 'block'; }
    if (btn) btn.disabled = false;
  }
}

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  navigate('home');
});
