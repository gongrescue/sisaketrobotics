const express = require('express');
const router = express.Router();
const Competition = require('../models/Competition');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/competitions - list all
router.get('/', async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    const competitions = await Competition.find(filter).sort('sortOrder');
    res.json({ success: true, count: competitions.length, data: competitions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/competitions/:id - get one
router.get('/:id', async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.id);
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });
    res.json({ success: true, data: competition });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/competitions - create (admin)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const competition = await Competition.create(req.body);
    res.status(201).json({ success: true, data: competition });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'รหัสประเภทนี้มีอยู่แล้ว' });
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/competitions/:id - update (admin)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const competition = await Competition.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });
    res.json({ success: true, data: competition });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/competitions/:id/status - update status only
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, currentRound } = req.body;
    const update = {};
    if (status) update.status = status;
    if (currentRound !== undefined) update.currentRound = currentRound;
    const competition = await Competition.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!competition) return res.status(404).json({ success: false, message: 'ไม่พบประเภทการแข่งขัน' });
    res.json({ success: true, data: competition });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/competitions/:id (admin)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Competition.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบประเภทการแข่งขันเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
