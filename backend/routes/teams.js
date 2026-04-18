const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/teams - list all (with optional filter)
router.get('/', async (req, res) => {
  try {
    const { competition, status, search } = req.query;
    const filter = {};
    if (competition) filter.competition = competition;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { teamName: { $regex: search, $options: 'i' } },
        { schoolName: { $regex: search, $options: 'i' } },
        { teamNumber: { $regex: search, $options: 'i' } }
      ];
    }
    const teams = await Team.find(filter)
      .populate('competition', 'name code ageGroup')
      .sort('teamNumber');
    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/teams/:id
router.get('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('competition');
    if (!team) return res.status(404).json({ success: false, message: 'ไม่พบทีม' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/teams - create team (admin)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    if (!req.body.teamNumber || req.body.teamNumber.trim() === '') {
      const teamsInComp = await Team.find({ competition: req.body.competition }).select('teamNumber').lean();
      let maxNum = 0;
      teamsInComp.forEach(t => {
        if (t.teamNumber) {
          const match = t.teamNumber.match(/\d+$/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });
      req.body.teamNumber = `T${(maxNum + 1).toString().padStart(3, '0')}`;
    }

    const team = await Team.create(req.body);
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'หมายเลขทีมนี้มีอยู่แล้วในประเภทนี้' });
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/teams/:id - update (admin)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('competition', 'name code');
    if (!team) return res.status(404).json({ success: false, message: 'ไม่พบทีม' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/teams/:id/checkin - check in team
router.patch('/:id/checkin', protect, adminOnly, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { checkedIn: true, checkedInAt: new Date(), status: 'competing' },
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'ไม่พบทีม' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/teams/:id (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Team.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบทีมเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/teams/bulk - bulk import (admin)
router.post('/bulk', protect, adminOnly, async (req, res) => {
  try {
    const { teams } = req.body;
    const results = await Team.insertMany(teams, { ordered: false });
    res.status(201).json({ success: true, count: results.length, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
