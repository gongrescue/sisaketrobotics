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
    const [compRes, rankRes] = await Promise.all([
      apiFetch(`/competitions/${compId}`),
      apiFetch(`/rankings/${compId}`)
    ]);
    const comp = compRes.data;
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

function switchAdminTabDirect(tab) {
  // Non-admin users cannot switch away from the scores tab
  if (isNonAdmin() && tab !== 'scores') {
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
}

function switchAdminTab(tab) {
  // Block non-admin from any tab other than scores; block non-admins from admin-only tabs
  if (isNonAdmin() && tab !== 'scores') {
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
  document.getElementById('teamNumber').value = team?.teamNumber || '';
  document.getElementById('teamName').value = team?.teamName || '';
  document.getElementById('teamSchool').value = team?.schoolName || '';
  document.getElementById('teamCoach').value = team?.coachName || '';
  document.getElementById('teamMembers').value = team?.members?.map(m => m.name).join(', ') || '';
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
  const members = document.getElementById('teamMembers').value.split(',').filter(s => s.trim()).map(n => ({ name: n.trim(), role: 'competitor' }));
  const payload = {
    competition: document.getElementById('teamComp').value,
    teamNumber: document.getElementById('teamNumber').value.trim(),
    teamName: document.getElementById('teamName').value.trim(),
    schoolName: document.getElementById('teamSchool').value.trim(),
    coachName: document.getElementById('teamCoach').value.trim(),
    members
  };
  if (!payload.competition || !payload.teamNumber || !payload.teamName || !payload.schoolName) {
    showAlert('teamModalMsg', 'กรุณากรอกข้อมูลที่จำเป็น', 'error'); return;
  }
  try {
    if (id) await apiFetch(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await apiFetch('/teams', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(); showToast('บันทึกทีมเรียบร้อย ✅', 'success'); loadTeams();
  } catch (err) { showAlert('teamModalMsg', err.message, 'error'); }
}

async function checkInTeam(id) {
  try {
    await apiFetch(`/teams/${id}/checkin`, { method: 'PATCH' });
    showToast('เช็คอินสำเร็จ ✅', 'success'); loadTeams();
  } catch (err) { showToast(err.message, 'error'); }
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
  if (!compId) return;

  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp) return;

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

// เก็บค่าที่แก้ในแถว แล้ว PUT ไปที่ backend
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

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  navigate('home');
});
