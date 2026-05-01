const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const { protect, adminOnly } = require('../middleware/auth');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stageForCount(count) {
  if (count <= 2) return 'final';
  if (count <= 4) return 'semifinal';
  if (count <= 8) return 'quarterfinal';
  return 'preliminary'; // > 8 teams
}

// ─── GET /api/brackets/:competitionId/rankings ────────────────────────────────
// Public — จัดอันดับทีมตามคะแนนรอบล่าสุดใน bracket
router.get('/:competitionId/rankings', async (req, res) => {
  try {
    const { competitionId } = req.params;

    const [matches, teams] = await Promise.all([
      Match.find({ competition: competitionId, status: 'completed' })
        .populate('team1', 'teamName teamNumber schoolName')
        .populate('team2', 'teamName teamNumber schoolName')
        .populate('winner', '_id'),
      Team.find({ competition: competitionId }).select('teamName teamNumber schoolName')
    ]);

    // Build per-team stats — keep only the latest bracketRound entry
    const teamMap = {};
    teams.forEach(t => {
      teamMap[t._id.toString()] = {
        team: t, latestRound: 0, latestScore: 0,
        latestStage: null, qualified: false, hasPlayed: false
      };
    });

    matches.forEach(m => {
      const winnerId = m.winner?._id?.toString() || m.winner?.toString();
      const update = (tid, score, isWinner) => {
        if (!tid || !teamMap[tid]) return;
        const e = teamMap[tid];
        if (m.bracketRound > e.latestRound) {
          e.latestRound = m.bracketRound;
          e.latestScore = score;
          e.latestStage = m.stage;
          e.qualified = isWinner;
          e.hasPlayed = true;
        }
      };
      update(m.team1?._id?.toString(), m.isBestOf3 ? m.team1Wins : m.team1Score, winnerId === m.team1?._id?.toString());
      update(m.team2?._id?.toString(), m.isBestOf3 ? m.team2Wins : m.team2Score, winnerId === m.team2?._id?.toString());
    });

    const rankings = Object.values(teamMap).sort((a, b) => {
      if (a.hasPlayed !== b.hasPlayed) return b.hasPlayed - a.hasPlayed;
      if (b.latestRound !== a.latestRound) return b.latestRound - a.latestRound;
      return b.latestScore - a.latestScore;
    });

    res.json({ success: true, type: 'BRACKET', data: rankings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/brackets/:competitionId ─────────────────────────────────────────
// Public — ดึง bracket ทั้งหมดของการแข่งขัน
router.get('/:competitionId', async (req, res) => {
  try {
    const matches = await Match.find({ competition: req.params.competitionId })
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName')
      .populate('winner', 'teamName teamNumber')
      .sort({ bracketRound: 1, matchNumber: 1 });

    // Group by bracketRound + stage
    const grouped = {};
    for (const m of matches) {
      const key = `${m.bracketRound}_${m.stage}`;
      if (!grouped[key]) grouped[key] = { bracketRound: m.bracketRound, stage: m.stage, matches: [] };
      grouped[key].matches.push(m);
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/brackets/:competitionId/generate ───────────────────────────────
// Admin — สร้าง bracket (random หรือ manual)
// body: { mode: 'random'|'manual', bracketRound: 1, pairs: [{team1Id, team2Id}] }
router.post('/:competitionId/generate', protect, adminOnly, async (req, res) => {
  try {
    const { competitionId } = req.params;
    const { mode = 'random', bracketRound = 1, pairs } = req.body;
    let byeTeamId = req.body.byeTeamId || null;

    // ตรวจว่า competition มีอยู่จริง
    const competition = await Competition.findById(competitionId);
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });

    // ลบ match เดิมของ bracketRound นี้ถ้ามี (เพื่อให้ generate ใหม่ได้)
    await Match.deleteMany({ competition: competitionId, bracketRound, stage: { $in: ['preliminary', 'quarterfinal', 'semifinal', 'final', 'third_place'] } });

    let pairedTeams = [];

    if (mode === 'random') {
      const teams = await Team.find({ competition: competitionId, status: { $nin: ['eliminated'] } }).select('_id teamName teamNumber');
      if (teams.length < 2) return res.status(400).json({ success: false, message: 'ทีมไม่เพียงพอสำหรับการจับสาย' });
      const shuffled = shuffle(teams);
      // ถ้าทีมเป็นจำนวนคี่ ทีมสุดท้ายได้ BYE ผ่านรอบอัตโนมัติ
      if (shuffled.length % 2 !== 0) {
        byeTeamId = shuffled.pop()._id;
      }
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        pairedTeams.push({ team1Id: shuffled[i]._id, team2Id: shuffled[i + 1]._id });
      }
    } else if (mode === 'manual') {
      if (!pairs || !pairs.length) return res.status(400).json({ success: false, message: 'กรุณาระบุคู่การแข่งขัน' });
      pairedTeams = pairs.map(p => ({ team1Id: p.team1Id, team2Id: p.team2Id }));
      // byeTeamId อาจถูกส่งมาจาก frontend (กรณีทีมคี่ จับสาย manual)
    } else {
      return res.status(400).json({ success: false, message: 'mode ต้องเป็น random หรือ manual' });
    }

    const totalTeamsThisRound = pairedTeams.length * 2 + (byeTeamId ? 1 : 0);
    const stage = stageForCount(totalTeamsThisRound);
    const isBestOf3 = totalTeamsThisRound <= 8;

    const lastMatch = await Match.findOne({ competition: competitionId }).sort({ matchNumber: -1 });
    let matchCounter = lastMatch ? lastMatch.matchNumber + 1 : 1;

    const docs = pairedTeams.map(p => ({
      competition: competitionId,
      matchNumber: matchCounter++,
      stage,
      bracketRound,
      isBestOf3,
      team1: p.team1Id,
      team2: p.team2Id,
      status: 'scheduled'
    }));

    // สร้าง BYE match สำหรับทีมที่ได้ผ่านรอบอัตโนมัติ
    if (byeTeamId) {
      docs.push({
        competition: competitionId,
        matchNumber: matchCounter++,
        stage,
        bracketRound,
        isBestOf3: false,
        team1: byeTeamId,
        team2: null,
        winner: byeTeamId,
        status: 'completed',
        completedAt: new Date(),
        notes: 'BYE'
      });
    }

    const created = await Match.insertMany(docs);
    const populated = await Match.find({ _id: { $in: created.map(d => d._id) } })
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName');

    res.status(201).json({ success: true, data: populated, message: `สร้างสาย ${populated.length} คู่เรียบร้อย` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/brackets/:competitionId/matches/:matchId/pair ───────────────────
// Admin — แก้ไขคู่ (ก่อน match เริ่ม)
router.put('/:competitionId/matches/:matchId/pair', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.matchId, competition: req.params.competitionId });
    if (!match) return res.status(404).json({ success: false, message: 'ไม่พบ match' });
    if (match.status !== 'scheduled') return res.status(400).json({ success: false, message: 'แก้ไขได้เฉพาะ match ที่ยังไม่เริ่ม' });

    const { team1Id, team2Id } = req.body;
    if (team1Id) match.team1 = team1Id;
    if (team2Id) match.team2 = team2Id;
    await match.save();

    const populated = await Match.findById(match._id)
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/brackets/:competitionId/matches/:matchId/result ────────────────
// Admin — บันทึก/อัพเดทผล preliminary (1 เกม)
router.post('/:competitionId/matches/:matchId/result', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.matchId, competition: req.params.competitionId });
    if (!match) return res.status(404).json({ success: false, message: 'ไม่พบ match' });
    if (match.isBestOf3) return res.status(400).json({ success: false, message: 'match นี้เป็น best-of-3 กรุณาใช้ /game endpoint' });

    const { team1Score, team2Score, team1Details, team2Details } = req.body;
    match.team1Score = team1Score;
    match.team2Score = team2Score;
    if (team1Details) match.team1Details = team1Details;
    if (team2Details) match.team2Details = team2Details;
    match.status = 'completed';
    match.completedAt = match.completedAt || new Date();

    // รีเซ็ตและคำนวณผู้ชนะใหม่
    match.isDraw = false;
    match.winner = undefined;
    if (team1Score > team2Score) match.winner = match.team1;
    else if (team2Score > team1Score) match.winner = match.team2;
    else match.isDraw = true;

    match.enteredBy = req.user._id;
    await match.save();

    const populated = await Match.findById(match._id)
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName')
      .populate('winner', 'teamName teamNumber');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/brackets/:competitionId/matches/:matchId/game ──────────────────
// Admin — บันทึกคะแนนเกมย่อยใน best-of-3
router.post('/:competitionId/matches/:matchId/game', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.matchId, competition: req.params.competitionId });
    if (!match) return res.status(404).json({ success: false, message: 'ไม่พบ match' });
    if (!match.isBestOf3) return res.status(400).json({ success: false, message: 'match นี้ไม่ใช่ best-of-3' });
    // อนุญาตให้อัพเดทเกมที่มีอยู่แล้วได้ (แก้ไข) แต่ไม่ให้เพิ่มเกมใหม่เมื่อจบแล้ว
    const existingGame = match.games.find(g => g.gameNumber === parseInt(req.body.gameNumber));
    if (match.status === 'completed' && !existingGame) {
      return res.status(400).json({ success: false, message: 'match นี้จบแล้ว ไม่สามารถเพิ่มเกมใหม่ได้' });
    }

    const { gameNumber, team1Score, team2Score } = req.body;
    if (!gameNumber || gameNumber < 1 || gameNumber > 3) return res.status(400).json({ success: false, message: 'gameNumber ต้องเป็น 1-3' });

    // อัปเดตหรือเพิ่มเกมนี้
    const existingIdx = match.games.findIndex(g => g.gameNumber === gameNumber);
    const winnerId = team1Score > team2Score ? match.team1 : team2Score > team1Score ? match.team2 : null;
    const gameData = { gameNumber, team1Score, team2Score, winnerId };

    if (existingIdx >= 0) {
      match.games[existingIdx] = gameData;
    } else {
      match.games.push(gameData);
    }

    // คำนวณ wins ใหม่ทั้งหมด
    let t1Wins = 0, t2Wins = 0;
    for (const g of match.games) {
      if (g.winnerId && g.winnerId.toString() === match.team1.toString()) t1Wins++;
      else if (g.winnerId && g.winnerId.toString() === match.team2.toString()) t2Wins++;
    }
    match.team1Wins = t1Wins;
    match.team2Wins = t2Wins;

    // ตรวจว่าชนะ 2 เกมแล้วหรือยัง
    if (t1Wins >= 2) {
      match.winner = match.team1;
      match.team1Score = t1Wins;
      match.team2Score = t2Wins;
      match.status = 'completed';
      match.completedAt = new Date();
    } else if (t2Wins >= 2) {
      match.winner = match.team2;
      match.team1Score = t1Wins;
      match.team2Score = t2Wins;
      match.status = 'completed';
      match.completedAt = new Date();
    } else {
      match.status = 'in_progress';
    }

    match.enteredBy = req.user._id;
    await match.save();

    const populated = await Match.findById(match._id)
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName')
      .populate('winner', 'teamName teamNumber');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/brackets/:competitionId/advance ────────────────────────────────
// Admin — สร้าง match รอบถัดไปจากผู้ชนะรอบปัจจุบัน
router.post('/:competitionId/advance', protect, adminOnly, async (req, res) => {
  try {
    const { competitionId } = req.params;
    const { bracketRound } = req.body;
    if (!bracketRound) return res.status(400).json({ success: false, message: 'กรุณาระบุ bracketRound' });

    const currentMatches = await Match.find({ competition: competitionId, bracketRound });
    if (!currentMatches.length) return res.status(404).json({ success: false, message: 'ไม่พบ match ในรอบนี้' });

    const incomplete = currentMatches.filter(m => m.status !== 'completed');
    if (incomplete.length) return res.status(400).json({ success: false, message: `ยังมี match ที่ยังไม่จบ ${incomplete.length} คู่` });

    // รวม winners (กรณี draw ใช้ team1 ไปก่อน)
    const winners = currentMatches.map(m => m.winner || m.team1);
    // ถ้าจำนวน winner เป็นคี่ ทีมสุดท้ายได้ BYE ผ่านรอบอัตโนมัติ
    let byeWinner = null;
    if (winners.length % 2 !== 0) {
      byeWinner = winners.pop();
    }
    const nextCount = winners.length + (byeWinner ? 1 : 0);

    if (nextCount < 2) return res.status(400).json({ success: false, message: 'ทีมที่เหลือน้อยเกินไป' });

    const nextRound = bracketRound + 1;
    const stage = stageForCount(nextCount);
    const isBestOf3 = nextCount <= 8;

    const lastMatch = await Match.findOne({ competition: competitionId }).sort({ matchNumber: -1 });
    let matchCounter = lastMatch ? lastMatch.matchNumber + 1 : 1;

    const docs = [];
    for (let i = 0; i < winners.length - 1; i += 2) {
      docs.push({
        competition: competitionId,
        matchNumber: matchCounter++,
        stage,
        bracketRound: nextRound,
        isBestOf3,
        team1: winners[i],
        team2: winners[i + 1],
        status: 'scheduled'
      });
    }

    // สร้าง BYE match สำหรับทีมที่ได้ผ่านรอบอัตโนมัติ
    if (byeWinner) {
      docs.push({
        competition: competitionId,
        matchNumber: matchCounter++,
        stage,
        bracketRound: nextRound,
        isBestOf3: false,
        team1: byeWinner,
        team2: null,
        winner: byeWinner,
        status: 'completed',
        completedAt: new Date(),
        notes: 'BYE'
      });
    }

    // สำหรับ semifinal สร้าง third_place match ด้วย
    if (stage === 'final' && winners.length === 2) {
      const semiMatches = await Match.find({ competition: competitionId, stage: 'semifinal' });
      const losers = semiMatches.map(m => {
        const winnerId = m.winner ? m.winner.toString() : null;
        if (!winnerId) return null;
        return m.team1.toString() === winnerId ? m.team2 : m.team1;
      }).filter(Boolean);

      if (losers.length === 2) {
        docs.push({
          competition: competitionId,
          matchNumber: matchCounter++,
          stage: 'third_place',
          bracketRound: nextRound,
          isBestOf3: true,
          team1: losers[0],
          team2: losers[1],
          status: 'scheduled'
        });
      }
    }

    const created = await Match.insertMany(docs);
    const populated = await Match.find({ _id: { $in: created.map(d => d._id) } })
      .populate('team1', 'teamName teamNumber schoolName')
      .populate('team2', 'teamName teamNumber schoolName');

    res.status(201).json({
      success: true,
      data: populated,
      message: `สร้าง ${populated.length} match สำหรับรอบ ${stage} (best-of-3: ${isBestOf3})`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/brackets/:competitionId/round/:bracketRound ─────────────────
// Admin — ยกเลิกการจับคู่ทั้งหมดของรอบที่เลือก
router.delete('/:competitionId/round/:bracketRound', protect, adminOnly, async (req, res) => {
  try {
    const { competitionId, bracketRound } = req.params;
    const round = parseInt(bracketRound, 10);
    if (isNaN(round) || round < 1) {
      return res.status(400).json({ success: false, message: 'bracketRound ไม่ถูกต้อง' });
    }

    const result = await Match.deleteMany({ competition: competitionId, bracketRound: round });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: `ไม่พบคู่การแข่งขันในรอบที่ ${round}` });
    }

    res.json({
      success: true,
      message: `ลบการจับคู่รอบที่ ${round} เรียบร้อย (${result.deletedCount} คู่)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
