const express = require('express');
const router = express.Router();
const Score = require('../models/Score');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Competition = require('../models/Competition');

// Compute rankings for a competition
const computeRankings = async (competition, teams) => {
  const allScores = await Score.find({
    competition: competition._id,
    isValid: true,
    disqualified: false
  }).populate('team', 'teamNumber teamName schoolName');

  // Group scores by team
  const teamScoreMap = {};
  for (const team of teams) {
    teamScoreMap[team._id.toString()] = {
      team,
      scores: [],
      totalScore: 0,
      bestScore: 0,
      bestTime: Infinity,
      totalTime: 0,
      roundsCompleted: 0
    };
  }

  for (const score of allScores) {
    const tid = score.team?._id?.toString();
    if (!tid || !teamScoreMap[tid]) continue;
    teamScoreMap[tid].scores.push(score);
  }

  const results = Object.values(teamScoreMap).map(entry => {
    const { team, scores } = entry;
    if (competition.scoringType === 'TIME') {
      // Time-based: best time wins (completed first, then by time)
      const completed = scores.filter(s => s.taskCompleted);
      const notCompleted = scores.filter(s => !s.taskCompleted);
      let bestScore = null;
      if (completed.length > 0) {
        bestScore = completed.reduce((best, s) => s.timeUsedSeconds < best.timeUsedSeconds ? s : best);
        return { team, bestScore: bestScore.timeUsedSeconds, taskCompleted: true, roundsCompleted: scores.length };
      } else if (notCompleted.length > 0) {
        bestScore = notCompleted.reduce((best, s) => s.distanceCm > best.distanceCm ? s : best);
        return { team, bestScore: bestScore.timeUsedSeconds, taskCompleted: false, distanceCm: bestScore.distanceCm, roundsCompleted: scores.length };
      }
      return { team, bestScore: Infinity, taskCompleted: false, distanceCm: 0, roundsCompleted: 0 };
    } else {
      // Point-based
      const roundScores = scores.map(s => s.totalScore);
      const sumScore = roundScores.reduce((a, b) => a + b, 0);
      const bestRound = roundScores.length > 0 ? Math.max(...roundScores) : 0;
      const lastRound = scores.length > 0 ? scores.sort((a, b) => a.round - b.round).slice(-1)[0].totalScore : 0;
      const bestTimes = scores.map(s => s.timeUsedSeconds).filter(t => t > 0);
      const bestTime = bestTimes.length > 0 ? Math.min(...bestTimes) : Infinity;
      const finalScore = competition.rankingMethod === 'BEST' ? bestRound :
                         competition.rankingMethod === 'LAST' ? lastRound : sumScore;
      return { team, finalScore, sumScore, bestRound, lastRound, bestTime, roundsCompleted: scores.length, scores };
    }
  });

  // Sort
  if (competition.scoringType === 'TIME') {
    results.sort((a, b) => {
      if (a.taskCompleted !== b.taskCompleted) return a.taskCompleted ? -1 : 1;
      if (a.taskCompleted && b.taskCompleted) return a.bestScore - b.bestScore;
      return (b.distanceCm || 0) - (a.distanceCm || 0);
    });
  } else {
    results.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (a.bestTime !== b.bestTime) return a.bestTime - b.bestTime;
      return 0;
    });
  }

  return results.map((r, i) => ({ ...r, rank: i + 1 }));
};

// GET /api/rankings/:competitionId
router.get('/:competitionId', async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.competitionId);
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });

    const teams = await Team.find({ competition: competition._id, status: { $ne: 'eliminated' } });

    if (competition.scoringType === 'BATTLE') {
      // Battle: use match results
      const matches = await Match.find({ competition: competition._id, status: 'completed' })
        .populate('team1', 'teamNumber teamName schoolName')
        .populate('team2', 'teamNumber teamName schoolName')
        .populate('winner', 'teamNumber teamName schoolName')
        .sort('matchNumber');
      return res.json({ success: true, competition, data: matches, type: 'BATTLE' });
    }

    const rankings = await computeRankings(competition, teams);
    res.json({ success: true, competition, data: rankings, type: competition.scoringType });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/rankings - all competitions summary
router.get('/', async (req, res) => {
  try {
    const Competition = require('../models/Competition');
    const competitions = await Competition.find({ status: { $in: ['active', 'completed'] } }).sort('sortOrder');
    const summary = [];
    for (const comp of competitions) {
      const teamsCount = await Team.countDocuments({ competition: comp._id });
      const scoresCount = await Score.countDocuments({ competition: comp._id, isValid: true });
      summary.push({
        competition: comp,
        teamsCount,
        scoresCount,
        lastUpdated: (await Score.findOne({ competition: comp._id }).sort('-updatedAt'))?.updatedAt
      });
    }
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
