// ─── LEADERBOARD ──────────────────────────────────────────────
// พึ่งพา globals จาก app.js: allCompetitions, currentLbCompId,
//   apiFetch, getCategoryIcon, isTourComp, formatSeconds

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
      ? await apiFetch(`/tour/${compId}/rankings`)
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

  // ─ Tour: รอบคัดเลือก ─
  if (rankData.type === 'QUALIFYING') {
    return `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;text-align:center">
        📋 รอบคัดเลือก — 8 อันดับแรกผ่านสู่รอบน็อคเอาท์
      </div>
      <div class="table-container">
      <table class="data-table">
        <thead><tr>
          <th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th>
          <th style="text-align:center">คะแนนรวม</th>
          <th style="text-align:center">เวลาดีสุด (วิ)</th>
          <th style="text-align:center">รอบ</th>
          <th style="text-align:center">สถานะ</th>
        </tr></thead>
        <tbody>
          ${rankData.data.map(r => {
            const top8 = r.rank <= 8;
            const rankCls = r.rank <= 3 ? r.rank : 'n';
            const medals  = ['🥇','🥈','🥉'];
            const statusBadge = top8
              ? '<span class="badge-status badge-done">TOP 8</span>'
              : '<span class="badge-status badge-elim">สิ้นสุดการแข่งขัน</span>';
            return `
            <tr ${top8 ? 'style="background:rgba(46,204,113,0.05)"' : ''}>
              <td style="text-align:center">
                <span class="rank-badge rank-${rankCls}">${r.rank <= 3 ? medals[r.rank-1] : r.rank}</span>
              </td>
              <td>
                <strong>${r.team?.teamName || '-'}</strong>
                <div style="font-size:0.72rem;color:var(--text-dim)">#${r.team?.teamNumber || ''}</div>
              </td>
              <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
              <td style="text-align:center;font-weight:700;color:var(--accent);font-size:1.1rem">${r.totalScore}</td>
              <td style="text-align:center;color:var(--text-muted)">${r.bestTime ? r.bestTime.toFixed(2) : '–'}</td>
              <td style="text-align:center;color:var(--text-muted)">${r.roundsPlayed}</td>
              <td style="text-align:center">${statusBadge}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;
  }

  // ─ Tour: รอบน็อคเอาท์ ─
  if (rankData.type === 'KNOCKOUT') {
    const stageLabel = { quarterfinal: 'รอบ 8 ทีม', semifinal: 'รอบ 4 ทีม', final: 'รอบชิงชนะเลิศ', third_place: 'ชิงอันดับ 3' };
    const medals = ['🥇','🥈','🥉'];
    const KO_STAGES = ['quarterfinal', 'semifinal', 'final', 'third_place'];
    // หา stages ที่มีข้อมูลจริง
    const activeStages = KO_STAGES.filter(s => rankData.data.some(r => r.matchesByStage?.[s]));

    // render ผลแต่ละเกมของ match
    const renderGames = (mInfo) => {
      if (!mInfo) return '<span style="color:var(--text-dim)">–</span>';
      if (mInfo.notes === 'BYE') return '<span style="color:var(--success);font-size:0.78rem">BYE ✅</span>';
      if (mInfo.status === 'scheduled') return '<span style="color:var(--text-dim);font-size:0.78rem">รอแข่ง</span>';

      const { games, side, team1Wins, team2Wins, isBestOf3 } = mInfo;
      const myWins  = side === 1 ? team1Wins : team2Wins;
      const oppWins = side === 1 ? team2Wins : team1Wins;
      const winStr  = isBestOf3 ? `<div style="font-size:0.72rem;font-weight:700;color:${myWins > oppWins ? 'var(--success)' : 'var(--danger)'}">${myWins > oppWins ? 'ชนะ' : 'แพ้'} ${myWins}–${oppWins}</div>` : '';
      const gamesHtml = games.map(g => {
        const myScore  = side === 1 ? g.team1Score : g.team2Score;
        const oppScore = side === 1 ? g.team2Score : g.team1Score;
        const won = myScore > oppScore || (myScore === oppScore && (side === 1 ? g.team1Time < g.team2Time : g.team2Time < g.team1Time));
        return `<div style="font-size:0.75rem;white-space:nowrap">
          เกม ${g.gameNumber}: <span style="font-weight:600;color:${won ? 'var(--success)' : 'var(--danger)'}">${myScore}</span><span style="color:var(--text-dim)"> vs ${oppScore}</span>
        </div>`;
      }).join('');
      return winStr + gamesHtml;
    };

    return `
      <div class="table-container">
      <table class="data-table">
        <thead><tr>
          <th>อันดับ</th>
          <th>ทีม</th>
          <th>โรงเรียน</th>
          <th style="text-align:center">คัดเลือก<br><span style="font-size:0.7rem;font-weight:400">คะแนนรวม</span></th>
          ${activeStages.map(s => `<th style="text-align:center">${stageLabel[s]}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rankData.data.map(r => {
            const rankNum = r.rank <= 99 ? r.rank : '–';
            const rankCls = r.rank <= 3 ? r.rank : 'n';
            const medal   = r.rank <= 3 ? medals[r.rank - 1] : rankNum;
            const qual    = r.qual;
            return `
            <tr>
              <td style="text-align:center">
                <span class="rank-badge rank-${rankCls}">${medal}</span>
              </td>
              <td>
                <strong>${r.team?.teamName || '-'}</strong>
                <div style="font-size:0.72rem;color:var(--text-dim)">#${r.team?.teamNumber || ''}</div>
              </td>
              <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
              <td style="text-align:center">
                ${qual
                  ? `<div style="font-weight:700;color:var(--accent)">${qual.totalScore}</div>
                     <div style="font-size:0.72rem;color:var(--text-muted)">${qual.roundsPlayed} รอบ</div>`
                  : '<span style="color:var(--text-dim)">–</span>'}
              </td>
              ${activeStages.map(s => `<td style="vertical-align:top;padding:0.4rem 0.5rem">${renderGames(r.matchesByStage?.[s])}</td>`).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;
  }

  // ─ Battle ─
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

  // ─ Time ─
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

  // ─ Point (SUM / BEST / LAST) ─
  const isSumLb = comp.rankingMethod === 'SUM';
  const rounds = Array.from({ length: comp.totalRounds }, (_, i) => i + 1);
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>อันดับ</th><th>ทีม</th><th>โรงเรียน</th>
          <th>คะแนนรวม</th>
          ${rounds.map(n => `<th style="text-align:center">รอบ ${n}<br><span style="font-size:0.7rem;font-weight:400;color:var(--text-muted)">คะแนน / เวลา (วิ)</span></th>`).join('')}
          <th>${isSumLb ? 'เวลารวม (วิ)' : 'เวลาดีสุด'}</th>
        </tr>
      </thead>
      <tbody>
        ${rankData.data.map((r, i) => {
          const rScores = r.scores?.sort((a,b) => a.round - b.round) || [];
          const timeVal = isSumLb
            ? (r.totalTime ? r.totalTime.toFixed(2) : '–')
            : formatSeconds(r.bestTime);
          return `
            <tr>
              <td><span class="rank-badge rank-${i < 3 ? i+1 : 'n'}">${i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</span></td>
              <td><strong>${r.team?.teamName || '-'}</strong><div style="font-size:0.75rem;color:var(--text-dim)">${r.team?.teamNumber || ''}</div></td>
              <td style="font-size:0.82rem">${r.team?.schoolName || '-'}</td>
              <td style="font-weight:700;font-size:1.2rem;color:var(--accent)">${r.finalScore ?? 0}</td>
              ${rounds.map(n => {
                const sc = rScores.find(s => s.round === n);
                const score = sc ? sc.totalScore : '–';
                const time  = sc?.timeUsedSeconds ? sc.timeUsedSeconds.toFixed(2) : '–';
                return `<td style="text-align:center;font-size:0.82rem">${score}<br><span style="color:var(--text-muted)">${time}</span></td>`;
              }).join('')}
              <td style="color:var(--text-muted);font-size:0.8rem">${timeVal}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}
