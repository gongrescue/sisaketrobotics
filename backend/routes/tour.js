// routes/tour.js
// ระบบจัดการการแข่งขัน "เที่ยวเมืองศรีสะเกษ"
// รอบคัดเลือก (ใช้ Score model) → QF 8 ทีม → SF 4 ทีม → Final (best-of-3 ทุกรอบ)
const router = require('express').Router();
const Match  = require('../models/Match');
const Score  = require('../models/Score');
const Team   = require('../models/Team');
const { protect, judgeOrAdmin, adminOnly } = require('../middleware/auth');

const STAGE_ORDER  = ['quarterfinal', 'semifinal', 'final'];
const STAGE_LABELS = { quarterfinal: 'รอบ 8 ทีม', semifinal: 'รอบ 4 ทีม', final: 'รอบชิงชนะเลิศ' };

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

    // สร้าง ranking จาก match results
    const placed = new Map();
    const byStage = {};
    matches.forEach(m => {
      if (!byStage[m.stage]) byStage[m.stage] = [];
      byStage[m.stage].push(m);
    });

    const addLoser = (m, rank) => {
      const win = m.winner?._id?.toString();
      const t1  = m.team1?._id?.toString();
      const loserId   = win === t1 ? m.team2?._id?.toString() : t1;
      const loserTeam = win === t1 ? m.team2 : m.team1;
      if (loserId && !placed.has(loserId)) placed.set(loserId, { rank, team: loserTeam, stage: m.stage });
    };

    (byStage['final'] || []).filter(m => m.status === 'completed').forEach(m => {
      const win = m.winner?._id?.toString();
      if (win && !placed.has(win)) placed.set(win, { rank: 1, team: m.winner, stage: 'final' });
      addLoser(m, 2);
    });

    let sfRank = 3;
    (byStage['semifinal'] || []).filter(m => m.status === 'completed').forEach(m => addLoser(m, sfRank++));

    let qfRank = 5;
    (byStage['quarterfinal'] || []).filter(m => m.status === 'completed').forEach(m => addLoser(m, qfRank++));

    const rankings = [...placed.values()].sort((a, b) => a.rank - b.rank);
    res.json({ success: true, type: 'KNOCKOUT', data: rankings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:compId/generate ──────────────────────────────────────
// สร้างรอบ knockout ถัดไป
router.post('/:compId/generate', protect, adminOnly, async (req, res) => {
  try {
    const compId  = req.params.compId;
    const existing = await Match.find({ competition: compId });
    const byStage  = {};
    existing.forEach(m => { if (!byStage[m.stage]) byStage[m.stage] = []; byStage[m.stage].push(m); });

    const qf = byStage['quarterfinal'] || [];
    const sf = byStage['semifinal']    || [];
    const fn = byStage['final']        || [];

    let stage, orderedTeams;

    if (qf.length === 0) {
      // สร้าง QF จาก top standings
      stage = 'quarterfinal';
      const standings = await getQualStandings(compId, 8);
      if (standings.length < 2) {
        return res.status(400).json({ success: false, message: 'ต้องมีทีมที่บันทึกคะแนนแล้วอย่างน้อย 2 ทีม' });
      }
      orderedTeams = standings.map(s => s.team);

    } else if (sf.length === 0) {
      const incomplete = qf.filter(m => m.status !== 'completed' && m.notes !== 'BYE');
      if (incomplete.length > 0) {
        return res.status(400).json({ success: false, message: `รอบ QF ยังแข่งไม่ครบ (เหลือ ${incomplete.length} คู่)` });
      }
      stage = 'semifinal';
      const sorted   = qf.sort((a, b) => a.matchNumber - b.matchNumber);
      const winnerIds = sorted.map(m => m.winner?.toString()).filter(Boolean);
      if (winnerIds.length < 2) {
        return res.status(400).json({ success: false, message: 'ยังไม่มีผู้ชนะ QF ครบ' });
      }
      const teams   = await Team.find({ _id: { $in: winnerIds } }).select('_id teamNumber teamName schoolName');
      const teamMap = Object.fromEntries(teams.map(t => [t._id.toString(), t]));
      orderedTeams  = winnerIds.map(id => teamMap[id]).filter(Boolean);

    } else if (fn.length === 0) {
      const incomplete = sf.filter(m => m.status !== 'completed' && m.notes !== 'BYE');
      if (incomplete.length > 0) {
        return res.status(400).json({ success: false, message: `รอบ SF ยังแข่งไม่ครบ (เหลือ ${incomplete.length} คู่)` });
      }
      stage = 'final';
      const sorted   = sf.sort((a, b) => a.matchNumber - b.matchNumber);
      const winnerIds = sorted.map(m => m.winner?.toString()).filter(Boolean);
      if (winnerIds.length < 2) {
        return res.status(400).json({ success: false, message: 'ยังไม่มีผู้ชนะ SF ครบ' });
      }
      const teams   = await Team.find({ _id: { $in: winnerIds } }).select('_id teamNumber teamName schoolName');
      const teamMap = Object.fromEntries(teams.map(t => [t._id.toString(), t]));
      orderedTeams  = winnerIds.map(id => teamMap[id]).filter(Boolean);

    } else {
      return res.status(400).json({ success: false, message: 'การแข่งขันครบทุกรอบแล้ว' });
    }

    // จับคู่: อันดับ 1 vs อันดับ n, อันดับ 2 vs อันดับ n-1, ...
    const n      = orderedTeams.length;
    const maxNum = existing.length > 0 ? Math.max(...existing.map(m => m.matchNumber || 0)) : 0;
    const newMatches = [];

    for (let i = 0; i < Math.floor(n / 2); i++) {
      newMatches.push({
        competition: compId,
        matchNumber: maxNum + i + 1,
        stage,
        team1: orderedTeams[i]._id,
        team2: orderedTeams[n - 1 - i]._id,
        isBestOf3: true,
        games: [],
        team1Wins: 0,
        team2Wins: 0,
        status: 'scheduled'
      });
    }
    // ถ้าจำนวนคี่ → ทีมกลางได้ BYE
    if (n % 2 === 1) {
      const byeTeam = orderedTeams[Math.floor(n / 2)];
      newMatches.push({
        competition: compId,
        matchNumber: maxNum + Math.floor(n / 2) + 1,
        stage,
        team1: byeTeam._id,
        team2: null,
        winner: byeTeam._id,
        isBestOf3: false,
        status: 'completed',
        notes: 'BYE'
      });
    }

    await Match.insertMany(newMatches);
    const created = await Match.find({ competition: compId, stage })
      .populate('team1 team2 winner', 'teamNumber teamName schoolName');

    res.json({ success: true, stage, label: STAGE_LABELS[stage], data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    if (gameNumber > 3) {
      return res.status(400).json({ success: false, message: 'แข่งครบ 3 เกมแล้ว' });
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

    // จบ match เมื่อทีมใดทำ 2 wins ก่อน
    if (match.team1Wins >= 2 || match.team2Wins >= 2) {
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
    res.json({ success: true, data: updated, message: `บันทึกเกมที่ ${gameNumber} สำเร็จ` });
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
    // ตรวจว่าไม่มี stage หลังค้างอยู่
    const stageIdx = STAGE_ORDER.indexOf(stage);
    for (let i = stageIdx + 1; i < STAGE_ORDER.length; i++) {
      const count = await Match.countDocuments({ competition: compId, stage: STAGE_ORDER[i] });
      if (count > 0) {
        return res.status(400).json({
          success: false,
          message: `กรุณาลบ ${STAGE_LABELS[STAGE_ORDER[i]]} ก่อน`
        });
      }
    }
    const result = await Match.deleteMany({ competition: compId, stage });
    res.json({ success: true, message: `ลบ ${STAGE_LABELS[stage]} แล้ว`, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
