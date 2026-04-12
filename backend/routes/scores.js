const express = require('express');
const router = express.Router();
const Score = require('../models/Score');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const { protect, judgeOrAdmin } = require('../middleware/auth');

// Calculate total score based on competition type & criteria
const calculateScore = (competition, details) => {
  let total = 0;
  if (competition.scoringType === 'TIME') return 0; // time-based, no point calculation

  for (const criterion of competition.scoringCriteria) {
    const val = details[criterion.key];
    if (val === undefined || val === null) continue;

    if (criterion.type === 'boolean') {
      if (val === true) {
        total += criterion.isPenalty ? -criterion.points : criterion.points;
      }
    } else if (criterion.type === 'number') {
      const numVal = Number(val) || 0;
      if (criterion.pointsPerUnit) {
        const pts = numVal * criterion.pointsPerUnit;
        total += criterion.isPenalty ? -pts : pts;
      } else {
        total += criterion.isPenalty ? -(numVal * criterion.points) : (numVal * criterion.points);
      }
    }
  }
  return total;
};

// GET /api/scores - list scores with filters
router.get('/', async (req, res) => {
  try {
    const { team, competition, round, isValid } = req.query;
    const filter = {};
    if (team) filter.team = team;
    if (competition) filter.competition = competition;
    if (round) filter.round = parseInt(round);
    if (isValid !== undefined) filter.isValid = isValid === 'true';

    const scores = await Score.find(filter)
      .populate('team', 'teamNumber teamName schoolName')
      .populate('competition', 'name code scoringType')
      .populate('enteredBy', 'name username')
      .sort('-createdAt');

    res.json({ success: true, count: scores.length, data: scores });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/scores - enter or update score
router.post('/', protect, judgeOrAdmin, async (req, res) => {
  try {
    const { team: teamId, competition: competitionId, round, details, timeUsedSeconds, taskCompleted, distanceCm, retries, notes } = req.body;

    const competition = await Competition.findById(competitionId);
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, message: 'ไม่พบทีม' });

    // Calculate score
    const totalScore = calculateScore(competition, details || {});

    // Upsert (create or update)
    const score = await Score.findOneAndUpdate(
      { team: teamId, competition: competitionId, round },
      {
        team: teamId,
        competition: competitionId,
        round,
        details: details || {},
        totalScore,
        timeUsedSeconds: timeUsedSeconds || 0,
        taskCompleted: taskCompleted || false,
        distanceCm: distanceCm || 0,
        retries: retries || 0,
        notes,
        enteredBy: req.user._id,
        isValid: true
      },
      { new: true, upsert: true, runValidators: true }
    ).populate('team', 'teamNumber teamName schoolName')
     .populate('competition', 'name code scoringType')
     .populate('enteredBy', 'name username');

    res.status(201).json({ success: true, data: score });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/scores/:id - update score
router.put('/:id', protect, judgeOrAdmin, async (req, res) => {
  try {
    const existingScore = await Score.findById(req.params.id).populate('competition');
    if (!existingScore) return res.status(404).json({ success: false, message: 'ไม่พบคะแนน' });

    const { details, timeUsedSeconds, taskCompleted, distanceCm, retries, notes, isValid, disqualified, disqualificationReason } = req.body;

    if (details) {
      existingScore.details = details;
      existingScore.totalScore = calculateScore(existingScore.competition, details);
    }
    if (timeUsedSeconds !== undefined) existingScore.timeUsedSeconds = timeUsedSeconds;
    if (taskCompleted !== undefined) existingScore.taskCompleted = taskCompleted;
    if (distanceCm !== undefined) existingScore.distanceCm = distanceCm;
    if (retries !== undefined) existingScore.retries = retries;
    if (notes !== undefined) existingScore.notes = notes;
    if (isValid !== undefined) existingScore.isValid = isValid;
    if (disqualified !== undefined) existingScore.disqualified = disqualified;
    if (disqualificationReason !== undefined) existingScore.disqualificationReason = disqualificationReason;
    existingScore.enteredBy = req.user._id;

    await existingScore.save();
    res.json({ success: true, data: existingScore });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/scores/:id
router.delete('/:id', protect, judgeOrAdmin, async (req, res) => {
  try {
    await Score.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบคะแนนเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
