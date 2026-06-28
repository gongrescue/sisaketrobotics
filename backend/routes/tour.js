// routes/tour.js
// ระบบจัดการการแข่งขัน "เที่ยวเมืองศรีสะเกษ" และ "หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ"
// รอบคัดเลือก (ใช้ Score model) → QF 8 ทีม → SF 4 ทีม → Final + ชิงอันดับ 3 (best-of-3)
const router = require('express').Router();
const Match       = require('../models/Match');
const Score       = require('../models/Score');
const Team        = require('../models/Team');
const Competition = require('../models/Competition');
const { protect, judgeOrAdmin, adminOnly } = require('../middleware/auth');

const STAGE_ORDER  = ['quarterfinal', 'semifinal', 'final', 'third_place'];
const STAGE_LABELS = { quarterfinal: 'รอบ 8 ทีม', semifinal: 'รอบ 4 ทีม', final: 'รอบชิงชนะเลิศ', third_place: 'ชิงอันดับ 3' };

// ─── Helper: ตัดสินผู้ชนะ 1 เกม ────────────────────────────────
// return 1 = team1, 2 = team2, 0 = ตัดสินไม่ได้
function resolveWinner(s1, t1, s2, t2) {
  const ns1 = Number(s1) || 0, ns2 = Number(s2) || 0;
  const nt1 = Number(t1) || 0, nt2 = Number(t2) || 0;
  if (ns1 > ns2) return 1;
  if (ns2 > ns1) return 2;
  // เท่ากัน → เวลาน้อยกว่าชนะ
  if (nt1 > 0 && nt2 > 0) {
    if (nt1 < nt2) return 1;
    if (nt2 < nt1) return 2;
  } else if (nt1 > 0) return 1;
  else if (nt2 > 0) return 2;
  return 0;
}

// ─── Helper: standings รอบคัดเลือก ──────────────────────────────
async function getQualStandings(compId, limit = 100) {
  const scores = await Score.find({
    competition: compId,
    isValid: { $ne: false },
    disqualified: { $ne: true }
  }).populate('team', '_id teamNumber teamName schoolName');

  const map = {};
  scores.forEach(s => {
    const tid = s.team?._id?.toString();
    if (!tid) return;
    if (!map[tid]) {
      map[tid] = { team: s.team, totalScore: 0, bestTime: null, roundsPlayed: 0 };
    }
    map[tid].totalScore  += (Number(s.totalScore) || 0) + (Number(s.bonusScore) || 0);
    map[tid].roundsPlayed += 1;
    const t = Number(s.timeUsedSeconds);
    if (t > 0 && (map[tid].bestTime === null || t < map[tid].bestTime)) {
      map[tid].bestTime = t;
    }
  });

  return Object.values(map)
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return (a.bestTime ?? 999999) - (b.bestTime ?? 999999);
    })
    .slice(0, limit)
    .map((t, i) => ({ rank: i + 1, ...t }));
}

// ─── GET /:compId/standings ──────────────────────────────────────
router.get('/:compId/standings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const data  = await getQualStandings(req.params.compId, limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:compId ────────────────────────────────────────────────
// คืน knockout matches จัดกลุ่มตาม stage
router.get('/:compId', async (req, res) => {
  try {
    const matches = await Match.find({ competition: req.params.compId })
      .populate('team1',  'teamNumber teamName schoolName')
      .populate('team2',  'teamNumber teamName schoolName')
      .populate('winner', 'teamNumber teamName schoolName')
      .sort({ matchNumber: 1 });

    const stageMap = {};
    matches.forEach(m => {
      if (!stageMap[m.stage]) stageMap[m.stage] = [];
      stageMap[m.stage].push(m);
    });
    const groups = STAGE_ORDER
      .filter(s => stageMap[s])
      .map(s => ({ stage: s, label: STAGE_LABELS[s], matches: stageMap[s] }));

    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:compId/rankings (leaderboard) ────────────────────────
router.get('/:compId/rankings', async (req, res) => {
  try {
    const compId  = req.params.compId;
    const matches = await Match.find({ competition: compId })
      .populate('team1',  'teamNumber teamName schoolName')
      .populate('team2',  'teamNumber teamName schoolName')
      .populate('winner', 'teamNumber teamName schoolName');

    // ยังไม่มี knockout → qualifying standings
    if (matches.length === 0) {
      const standings = await getQualStandings(compId, 100);
      return res.json({ success: true, type: 'QUALIFYING', data: standings });
    }

    // ดึงคะแนนรอบคัดเลือกทุกทีม
    const qualScores = await Score.find({ competition: compId, isValid: { $ne: false }, disqualified: { $ne: true } })
      .populate('team', '_id teamNumber teamName schoolName');
    const qualMap = {}; // teamId → { totalScore, bestTime, roundsPlayed }
    qualScores.forEach(s => {
      const tid = s.team?._id?.toString();
      if (!tid) return;
      if (!qualMap[tid]) qualMap[tid] = { totalScore: 0, bestTime: null, roundsPlayed: 0 };
      qualMap[tid].totalScore  += (Number(s.totalScore) || 0) + (Number(s.bonusScore) || 0);
      qualMap[tid].roundsPlayed += 1;
      const t = Number(s.timeUsedSeconds);
      if (t > 0 && (qualMap[tid].bestTime === null || t < qualMap[tid].bestTime)) qualMap[tid].bestTime = t;
    });

    // สร้าง ranking จาก match results + เก็บ match info ต่อทีม
    const byStage = {};
    matches.forEach(m => {
      if (!byStage[m.stage]) byStage[m.stage] = [];
      byStage[m.stage].push(m);
    });

    // บันทึก match info ลงแต่ละทีมที่เกี่ยวข้อง
    const teamMatchInfo = {}; // teamId → { [stage]: matchSummary }
    matches.forEach(m => {
      const t1id = m.team1?._id?.toString();
      const t2id = m.team2?._id?.toString();
      const summary = {
        stage: m.stage,
        status: m.status,
        isBestOf3: m.isBestOf3,
        games: m.games || [],
        team1Wins: m.team1Wins || 0,
        team2Wins: m.team2Wins || 0,
        notes: m.notes || null
      };
      if (t1id) {
        if (!teamMatchInfo[t1id]) teamMatchInfo[t1id] = {};
        teamMatchInfo[t1id][m.stage] = { ...summary, side: 1, opponent: m.team2 };
      }
      if (t2id) {
        if (!teamMatchInfo[t2id]) teamMatchInfo[t2id] = {};
        teamMatchInfo[t2id][m.stage] = { ...summary, side: 2, opponent: m.team1 };
      }
    });

    // Helper: คำนวณคะแนนรวมทุกเกมของทีมใน stage นั้น (ใช้จัดอันดับ losers)
    const getStageScore = (tid, stage) => {
      const mInfo = teamMatchInfo[tid]?.[stage];
      if (!mInfo || !mInfo.games?.length) return 0;
      return mInfo.games.reduce((sum, g) => {
        return sum + (mInfo.side === 1 ? (g.team1Score || 0) : (g.team2Score || 0));
      }, 0);
    };

    const placed = new Map(); // teamId → entry
    let nextRank  = 1;

    const addEntry = (team, rank, stage) => {
      const tid = team?._id?.toString();
      if (!tid || placed.has(tid)) return;
      placed.set(tid, { rank, team, stage, matchesByStage: teamMatchInfo[tid] || {}, qual: qualMap[tid] || null });
    };

    const STAGE_IDX = { quarterfinal: 0, semifinal: 1, final: 2, third_place: 2 };

    // ── อันดับ 1–4: final + third_place ที่แข่งเสร็จแล้ว (ลำดับคงที่) ──
    (byStage['final'] || []).filter(m => m.status === 'completed').forEach(m => {
      addEntry(m.winner, 1, 'final');
      const loser = m.winner?._id?.toString() === m.team1?._id?.toString() ? m.team2 : m.team1;
      addEntry(loser, 2, 'final');
    });
    (byStage['third_place'] || []).filter(m => m.status === 'completed').forEach(m => {
      addEntry(m.winner, 3, 'third_place');
      const loser = m.winner?._id?.toString() === m.team1?._id?.toString() ? m.team2 : m.team1;
      addEntry(loser, 4, 'third_place');
    });
    nextRank = placed.size + 1;

    // ── Winners ที่ชนะ match แล้วแต่ยังไม่ถูก place ──────────────
    // เกิดเมื่อทีมน้อย เช่น SF มีแค่ 1 match → ผู้ชนะไม่มี Final รอ
    // ต้องมาก่อน stillPlaying และ losers เสมอ
    const unplacedWinners = [];
    ['final', 'semifinal', 'quarterfinal'].forEach(stage => {
      (byStage[stage] || []).filter(m => m.status === 'completed' && m.winner).forEach(m => {
        const tid = m.winner?._id?.toString();
        if (tid && !placed.has(tid)) {
          unplacedWinners.push({ team: m.winner, stage, qualScore: qualMap[tid]?.totalScore || 0 });
        }
      });
    });
    unplacedWinners.sort((a, b) => {
      const stageDiff = (STAGE_IDX[b.stage] || 0) - (STAGE_IDX[a.stage] || 0);
      return stageDiff !== 0 ? stageDiff : b.qualScore - a.qualScore;
    });
    unplacedWinners.forEach(({ team, stage }) => addEntry(team, nextRank++, stage));

    // ── ทีมที่ยังแข่งอยู่ (รอแข่ง/กำลังแข่ง) → rank ก่อน losers ──
    const stillPlaying = [];
    matches.forEach(m => {
      if (m.status !== 'completed') {
        [m.team1, m.team2].forEach(t => {
          const tid = t?._id?.toString();
          if (tid && !placed.has(tid)) {
            const alreadyIn = stillPlaying.find(x => x.team?._id?.toString() === tid);
            if (!alreadyIn) stillPlaying.push({ team: t, stage: m.stage, qualScore: qualMap[tid]?.totalScore || 0 });
          }
        });
      }
    });
    stillPlaying.sort((a, b) => {
      const stageDiff = (STAGE_IDX[b.stage] || 0) - (STAGE_IDX[a.stage] || 0);
      return stageDiff !== 0 ? stageDiff : b.qualScore - a.qualScore;
    });
    stillPlaying.forEach(({ team, stage }) => addEntry(team, nextRank++, stage));

    // ── Losers แต่ละ stage เรียงด้วย stageScore มากกว่า = rank ดีกว่า ──
    const assignLosers = (stageMatches, stage) => {
      const losers = [];
      stageMatches.filter(m => m.status === 'completed').forEach(m => {
        const win = m.winner?._id?.toString();
        const t1  = m.team1?._id?.toString();
        const loserTeam = win === t1 ? m.team2 : m.team1;
        const loserId   = loserTeam?._id?.toString();
        if (loserId && !placed.has(loserId)) {
          losers.push({ team: loserTeam, score: getStageScore(loserId, stage) });
        }
      });
      losers.sort((a, b) => b.score - a.score);
      losers.forEach(({ team }) => addEntry(team, nextRank++, stage));
    };

    assignLosers(byStage['semifinal']   || [], 'semifinal');
    assignLosers(byStage['quarterfinal'] || [], 'quarterfinal');

    const rankings = [...placed.values()].sort((a, b) => a.rank - b.rank);
    res.json({ success: true, type: 'KNOCKOUT', data: rankings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Helper: สร้างรอบถัดไป (Cross-Seeding) ──────────────────────
// คืน { stage, label, data } หรือ null ถ้าไม่มีรอบถัดไป
// ถ้า reason ไม่ผ่านเงื่อนไข ให้ throw Error
async function generateNextRound(compId, isRescueM) {
  const existing = await Match.find({ competition: compId });
  const byStage  = {};
  existing.forEach(m => { if (!byStage[m.stage]) byStage[m.stage] = []; byStage[m.stage].push(m); });

  const qf = byStage['quarterfinal'] || [];
  const sf = byStage['semifinal']    || [];
  const fn = byStage['final']        || [];
  const tp = byStage['third_place']  || [];
  const maxNum = existing.length > 0 ? Math.max(...existing.map(m => m.matchNumber || 0)) : 0;

  // ─ QF ─
  if (qf.length === 0) {
    const standings = await getQualStandings(compId, 8);
    if (standings.length < 2) throw new Error('ต้องมีทีมที่บันทึกคะแนนแล้วอย่างน้อย 2 ทีม');
    let orderedTeams = standings.map(s => s.team);
    const newMatches = [];

    // ถ้าทีมคี่: อันดับ 1 ได้ BYE ผ่านรอบทันที แล้วจับคู่ที่เหลือ (จำนวนคู่)
    if (isRescueM && orderedTeams.length % 2 === 1) {
      const byeTeam = orderedTeams[0];
      newMatches.push({
        competition: compId, matchNumber: maxNum + 1, stage: 'quarterfinal',
        team1: byeTeam._id, team2: null, winner: byeTeam._id,
        isBestOf3: false, status: 'completed', notes: 'BYE'
      });
      orderedTeams = orderedTeams.slice(1); // เหลือทีมคู่สำหรับจับคู่ปกติ
    }

    const n = orderedTeams.length;
    // Cross-Seeding: 1v(n), 2v(n-1), ... เช่น 1v8, 2v7, 3v6, 4v5
    for (let i = 0; i < Math.floor(n / 2); i++) {
      newMatches.push({
        competition: compId, matchNumber: maxNum + newMatches.length + 1, stage: 'quarterfinal',
        team1: orderedTeams[i]._id, team2: orderedTeams[n - 1 - i]._id,
        isBestOf3: !isRescueM, games: [], team1Wins: 0, team2Wins: 0, status: 'scheduled'
      });
    }
    await Match.insertMany(newMatches);
    const created = await Match.find({ competition: compId, stage: 'quarterfinal' })
      .populate('team1 team2 winner', 'teamNumber teamName schoolName');
    return { stage: 'quarterfinal', label: STAGE_LABELS['quarterfinal'], data: created };
  }

  // ─ SF (auto หลัง QF ครบ) ─
  if (sf.length === 0) {
    const allDone = qf.every(m => m.status === 'completed');
    if (!allDone) return null; // ยังแข่งไม่ครบ → ไม่ generate
    const sorted    = qf.sort((a, b) => a.matchNumber - b.matchNumber);
    const winnerIds = sorted.map(m => m.winner?.toString()).filter(Boolean);
    if (winnerIds.length < 2) return null;
    const teams   = await Team.find({ _id: { $in: winnerIds } }).select('_id teamNumber teamName schoolName');
    const teamMap = Object.fromEntries(teams.map(t => [t._id.toString(), t]));
    const orderedTeams = winnerIds.map(id => teamMap[id]).filter(Boolean);
    const n = orderedTeams.length;
    const newMatches = [];
    // Cross-Seeding SF: W(1v8) vs W(4v5), W(2v7) vs W(3v6)
    for (let i = 0; i < Math.floor(n / 2); i++) {
      newMatches.push({
        competition: compId, matchNumber: maxNum + i + 1, stage: 'semifinal',
        team1: orderedTeams[i]._id, team2: orderedTeams[n - 1 - i]._id,
        isBestOf3: true, games: [], team1Wins: 0, team2Wins: 0, status: 'scheduled'
      });
    }
    await Match.insertMany(newMatches);
    const created = await Match.find({ competition: compId, stage: 'semifinal' })
      .populate('team1 team2 winner', 'teamNumber teamName schoolName');
    return { stage: 'semifinal', label: STAGE_LABELS['semifinal'], data: created };
  }

  // ─ Final + ชิงอันดับ 3 (auto หลัง SF ครบ) ─
  if (fn.length === 0 && tp.length === 0) {
    const allDone = sf.every(m => m.status === 'completed');
    if (!allDone) return null;
    const sorted    = sf.sort((a, b) => a.matchNumber - b.matchNumber);
    const winnerIds = sorted.map(m => m.winner?.toString()).filter(Boolean);
    const loserIds  = sorted.map(m => {
      const wid = m.winner?.toString();
      const t1  = m.team1?._id?.toString() || m.team1?.toString();
      return wid === t1 ? (m.team2?._id?.toString() || m.team2?.toString()) : t1;
    }).filter(Boolean);
    if (winnerIds.length < 2) return null;

    const allIds  = [...new Set([...winnerIds, ...loserIds])];
    const teams   = await Team.find({ _id: { $in: allIds } }).select('_id teamNumber teamName schoolName');
    const teamMap = Object.fromEntries(teams.map(t => [t._id.toString(), t]));

    const finalTeams = winnerIds.map(id => teamMap[id]).filter(Boolean);
    const thirdTeams = loserIds.map(id => teamMap[id]).filter(Boolean);

    const newMatches = [{
      competition: compId, matchNumber: maxNum + 1, stage: 'final',
      team1: finalTeams[0]._id, team2: finalTeams[1]._id,
      isBestOf3: true, games: [], team1Wins: 0, team2Wins: 0, status: 'scheduled'
    }];
    if (isRescueM && thirdTeams.length >= 2) {
      newMatches.push({
        competition: compId, matchNumber: maxNum + 2, stage: 'third_place',
        team1: thirdTeams[0]._id, team2: thirdTeams[1]._id,
        isBestOf3: true, games: [], team1Wins: 0, team2Wins: 0, status: 'scheduled'
      });
    }
    await Match.insertMany(newMatches);
    const created = await Match.find({ competition: compId, stage: { $in: ['final', 'third_place'] } })
      .populate('team1 team2 winner', 'teamNumber teamName schoolName');
    return { stage: 'final', label: 'รอบชิงชนะเลิศ + ชิงอันดับ 3', data: created };
  }

  return null; // ครบทุกรอบแล้ว
}

// ─── POST /:compId/generate ──────────────────────────────────────
// สร้างรอบ knockout ถัดไป (ใช้ manual trigger สำหรับ QF; SF/Final/3rd auto)
router.post('/:compId/generate', protect, adminOnly, async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.compId);
    if (!comp) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });
    const result = await generateNextRound(req.params.compId, false);
    if (!result) return res.status(400).json({ success: false, message: 'การแข่งขันครบทุกรอบแล้ว หรือยังแข่งรอบปัจจุบันไม่ครบ' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ─── POST /:compId/matches/:matchId/game ─────────────────────────
// บันทึกผลเกม (score + time ทั้งสองทีม → ตัดสินผู้ชนะเกมอัตโนมัติ)
router.post('/:compId/matches/:matchId/game', protect, judgeOrAdmin, async (req, res) => {
  try {
    const { matchId, compId } = req.params;
    const { team1Score, team1Time, team2Score, team2Time } = req.body;

    if (team1Score === undefined || team2Score === undefined) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกคะแนนให้ครบทั้งสองทีม' });
    }

    const match = await Match.findOne({ _id: matchId, competition: compId })
      .populate('team1 team2', '_id teamNumber teamName');
    if (!match) return res.status(404).json({ success: false, message: 'ไม่พบคู่การแข่งขัน' });
    if (match.status === 'completed') {
      return res.status(400).json({ success: false, message: 'คู่นี้จบแล้ว' });
    }

    const gameNumber = (match.games?.length || 0) + 1;
    const maxGames = match.isBestOf3 ? 3 : 1;
    if (gameNumber > maxGames) {
      return res.status(400).json({ success: false, message: `แข่งครบ ${maxGames} เกมแล้ว` });
    }

    const winIdx = resolveWinner(team1Score, team1Time, team2Score, team2Time);
    if (winIdx === 0) {
      return res.status(400).json({
        success: false,
        message: 'คะแนนและเวลาของทั้งสองทีมเท่ากัน ไม่สามารถตัดสินได้ กรุณาตรวจสอบข้อมูล'
      });
    }

    const winnerTeam = winIdx === 1 ? match.team1 : match.team2;
    match.games.push({
      gameNumber,
      team1Score: Number(team1Score),
      team1Time:  Number(team1Time)  || 0,
      team2Score: Number(team2Score),
      team2Time:  Number(team2Time)  || 0,
      winnerId: winnerTeam._id
    });

    if (winIdx === 1) match.team1Wins += 1;
    else              match.team2Wins += 1;

    // single-game: จบทันทีหลัง 1 เกม; best-of-3: จบเมื่อทีมใดชนะ 2 เกม
    const matchDone = !match.isBestOf3 || match.team1Wins >= 2 || match.team2Wins >= 2;
    if (matchDone) {
      match.status      = 'completed';
      match.winner      = winIdx === 1 ? match.team1._id : match.team2._id;
      match.completedAt = new Date();
    } else {
      match.status = 'in_progress';
    }
    match.enteredBy = req.user._id;
    await match.save();

    const updated = await Match.findById(matchId)
      .populate('team1 team2 winner', 'teamNumber teamName schoolName');

    // auto Cross-Seeding: generate รอบถัดไปทันทีเมื่อ stage ปัจจุบันครบ
    let autoGenerated = null;
    if (matchDone && ['quarterfinal', 'semifinal'].includes(match.stage)) {
      try {
        const comp = await Competition.findById(compId);
        if (false) {
          autoGenerated = await generateNextRound(compId, true);
        }
      } catch (_) { /* ถ้า generate ไม่ได้ ไม่ต้อง error */ }
    }

    res.json({
      success: true,
      data: updated,
      message: `บันทึกเกมที่ ${gameNumber} สำเร็จ`,
      autoGenerated: autoGenerated ? { stage: autoGenerated.stage, label: autoGenerated.label } : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /:compId/round/:stage ───────────────────────────────
router.delete('/:compId/round/:stage', protect, adminOnly, async (req, res) => {
  try {
    const { compId, stage } = req.params;
    if (!STAGE_ORDER.includes(stage)) {
      return res.status(400).json({ success: false, message: 'stage ไม่ถูกต้อง' });
    }
    // final กับ third_place generate พร้อมกัน → ลบพร้อมกันได้
    const stagesToDelete = stage === 'final' ? ['final', 'third_place'] : [stage];
    // ตรวจว่าไม่มี stage หลังค้างอยู่ (ยกเว้น third_place เมื่อลบ final)
    const stageIdx = STAGE_ORDER.indexOf(stage);
    const ignoredForDelete = new Set(stage === 'final' ? ['final', 'third_place'] : []);
    for (let i = stageIdx + 1; i < STAGE_ORDER.length; i++) {
      if (ignoredForDelete.has(STAGE_ORDER[i])) continue;
      const count = await Match.countDocuments({ competition: compId, stage: STAGE_ORDER[i] });
      if (count > 0) {
        return res.status(400).json({
          success: false,
          message: `กรุณาลบ ${STAGE_LABELS[STAGE_ORDER[i]]} ก่อน`
        });
      }
    }
    const result = await Match.deleteMany({ competition: compId, stage: { $in: stagesToDelete } });
    res.json({ success: true, message: `ลบ ${STAGE_LABELS[stage]} แล้ว`, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
