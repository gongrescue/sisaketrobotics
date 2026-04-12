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

function navigate(page, data = null) {
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

function updateNavForAuth(loggedIn) {
  document.getElementById('loginNavLink').style.display = loggedIn ? 'none' : '';
  document.getElementById('logoutNavLink').style.display = loggedIn ? '' : 'none';
  document.getElementById('adminNavLink').style.display = loggedIn ? '' : 'none';
  if (loggedIn && currentUser) {
    const el = document.getElementById('usersTabBtn');
    if (el) el.style.display = currentUser.role === 'admin' ? '' : 'none';
    const badge = document.getElementById('userBadge');
    if (badge) badge.textContent = `👤 ${currentUser.name} (${currentUser.role})`;
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
  token = null; currentUser = null;
  localStorage.removeItem('ssk_token');
  updateNavForAuth(false);
  navigate('home');
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
                    <td style="font-size:0.75rem;color:var(--text-muted)">${cr.description || cr.type}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
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
              <td><strong>${r.taskCompleted ? formatTime(r.bestScore) : '–'}</strong></td>
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
  tabs.innerHTML = comps.map(c => `
    <button class="lb-tab ${c._id === currentLbCompId ? 'active' : ''}"
      onclick="switchLbTab('${c._id}', this)">
      ${getCategoryIcon(c.category)} ${c.code}
    </button>`).join('');
}

async function switchLbTab(compId, btn) {
  currentLbCompId = compId;
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
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
              <td style="font-weight:700;color:var(--accent)">${r.taskCompleted ? formatTime(r.bestScore) : '–'}</td>
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
              <td style="color:var(--text-muted);font-size:0.8rem">${r.bestTime !== Infinity ? formatTime(r.bestTime) : '-'}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ─── ADMIN ────────────────────────────────────────────────────

function loadAdmin() {
  if (!token) { navigate('login'); return; }
  updateNavForAuth(true);
  switchAdminTab('teams');
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`adminTab-${tab}`)?.classList.add('active');
  event.target.classList.add('active');
  if (tab === 'teams') loadTeams();
  else if (tab === 'scores') loadScoreForm();
  else if (tab === 'matches') loadMatchFilters();
  else if (tab === 'users') loadUsers();
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

async function loadScoreForm() {
  await populateCompSelects();
  document.getElementById('scoreCriteriaFields').innerHTML = '';
  document.getElementById('scorePreview').style.display = 'none';
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

  // Show/hide time fields
  const isTime = comp.scoringType === 'TIME';
  if (timeField) timeField.style.display = isTime ? '' : 'none';
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
}

function calcPreviewScore(compId) {
  const comp = allCompetitions.find(c => c._id === compId);
  if (!comp || comp.scoringType === 'TIME') return;
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
  document.getElementById('scorePreviewValue').textContent = total;
}

async function loadRecentScores(compId, teamId) {
  const div = document.getElementById('recentScores');
  if (!teamId) { div.innerHTML = '<p class="text-muted">เลือกทีมเพื่อดูคะแนน</p>'; return; }
  try {
    const res = await apiFetch(`/scores?competition=${compId}&team=${teamId}`);
    if (!res.data.length) { div.innerHTML = '<p class="text-muted">ยังไม่มีคะแนน</p>'; return; }
    div.innerHTML = res.data.sort((a,b) => a.round - b.round).map(s => `
      <div class="score-item">
        <div>
          <div class="score-item-round">รอบที่ ${s.round}</div>
          <div style="font-size:0.75rem;color:var(--text-dim)">${new Date(s.updatedAt).toLocaleString('th-TH')}</div>
        </div>
        <div class="score-item-score">${s.competition?.scoringType === 'TIME' ? formatTime(s.timeUsedSeconds) : s.totalScore}</div>
      </div>`).join('');
  } catch { div.innerHTML = '<p class="text-muted">โหลดไม่สำเร็จ</p>'; }
}

async function submitScore() {
  const compId = document.getElementById('scoreCompetition').value;
  const teamId = document.getElementById('scoreTeam').value;
  const round = parseInt(document.getElementById('scoreRound').value);
  const notes = document.getElementById('scoreNotes').value;

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

  const payload = {
    team: teamId, competition: compId, round, details, notes,
    timeUsedSeconds: parseFloat(document.getElementById('scoreTime')?.value) || 0,
    taskCompleted: document.getElementById('scoreCompleted')?.checked || false,
    distanceCm: parseFloat(document.getElementById('scoreDistance')?.value) || 0
  };

  try {
    await apiFetch('/scores', { method: 'POST', body: JSON.stringify(payload) });
    showToast('บันทึกคะแนนสำเร็จ ✅', 'success');
    showAlert('scoreMsg', 'บันทึกคะแนนเรียบร้อยแล้ว', 'success');
    loadRecentScores(compId, teamId);
    // Reset fields
    comp?.scoringCriteria?.forEach(cr => {
      const el = document.getElementById(`crit_${cr.key}`);
      if (el) { el.type === 'checkbox' ? el.checked = false : el.value = 0; }
    });
    if (document.getElementById('scoreTime')) document.getElementById('scoreTime').value = '';
    if (document.getElementById('scoreCompleted')) document.getElementById('scoreCompleted').checked = false;
    calcPreviewScore(compId);
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

async function loadUsers() {
  try {
    const res = await apiFetch('/auth/users');
    document.getElementById('usersList').innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>#</th><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>บทบาท</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${res.data.map((u, i) => `
              <tr>
                <td>${i+1}</td>
                <td><strong>${u.username}</strong></td>
                <td>${u.name}</td>
                <td><span class="tag ${u.role==='admin'?'tag-battle':'tag-auto'}">${u.role}</span></td>
                <td>${u.isActive ? '✅ ใช้งาน' : '❌ ระงับ'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) { document.getElementById('usersList').innerHTML = `<p>${err.message}</p>`; }
}

function showUserModal() {
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newName').value = '';
  document.getElementById('newRole').value = 'judge';
  document.getElementById('userModalMsg').style.display = 'none';
  showModal('userModal');
}

async function saveUser() {
  const payload = {
    username: document.getElementById('newUsername').value.trim(),
    password: document.getElementById('newPassword').value,
    name: document.getElementById('newName').value.trim(),
    role: document.getElementById('newRole').value
  };
  if (!payload.username || !payload.password || !payload.name) {
    showAlert('userModalMsg', 'กรุณากรอกข้อมูลให้ครบ', 'error'); return;
  }
  try {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    showToast('เพิ่มผู้ใช้งานสำเร็จ ✅', 'success'); closeModal(); loadUsers();
  } catch (err) { showAlert('userModalMsg', err.message, 'error'); }
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
