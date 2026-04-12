const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const { protect, judgeOrAdmin } = require('../middleware/auth');

// GET /api/matches?competition=
router.get('/', async (req, res) => {
  try {
    const { competition, stage, status } = req.query;
    const filter = {};
    if (competition) filter.competition = competition;
    if (stage) filter.stage = stage;
    if (status) filter.status = status;
    const matches = await Match.find(filter)
      .populate('team1', 'teamNumber teamName schoolName')
      .populate('team2', 'teamNumber teamName schoolName')
      .populate('winner', 'teamNumber teamName schoolName')
      .sort('matchNumber');
    res.json({ success: true, data: matches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/matches - create match
router.post('/', protect, judgeOrAdmin, async (req, res) => {
  try {
    const match = await Match.create({ ...req.body, enteredBy: req.user._id });
    res.status(201).json({ success: true, data: match });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/matches/:id/result - record match result
router.put('/:id/result', protect, judgeOrAdmin, async (req, res) => {
  try {
    const { team1Score, team2Score, team1Details, team2Details, notes } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: 'ไม่พบคู่แข่งขัน' });

    match.team1Score = team1Score || 0;
    match.team2Score = team2Score || 0;
    if (team1Details) match.team1Details = team1Details;
    if (team2Details) match.team2Details = team2Details;
    if (notes) match.notes = notes;

    if (team1Score > team2Score) match.winner = match.team1;
    else if (team2Score > team1Score) match.winner = match.team2;
    else match.isDraw = true;

    match.status = 'completed';
    match.completedAt = new Date();
    match.enteredBy = req.user._id;

    await match.save();
    await match.populate('team1 team2 winner', 'teamNumber teamName schoolName');
    res.json({ success: true, data: match });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/matches/:id
router.delete('/:id', protect, judgeOrAdmin, async (req, res) => {
  try {
    await Match.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบคู่แข่งขันเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
