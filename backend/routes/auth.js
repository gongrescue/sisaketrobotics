const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
    }
    const user = await User.findOne({ username }).select('+password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const token = signToken(user._id);
    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, name: user.name, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/register (admin only)
router.post('/register', protect, adminOnly, async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    const user = await User.create({ username, password, name, role: role || 'judge' });
    res.status(201).json({
      success: true,
      user: { id: user._id, username: user.username, name: user.name, role: user.role }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      _id: req.user._id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  });
});

// GET /api/auth/users (admin only)
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort('-createdAt');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/users/:id (admin only)
router.get('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/users/:id (admin only)
router.put('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, role, isActive, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

    // Prevent admin from demoting themselves (last-admin safeguard)
    if (String(user._id) === String(req.user._id) && role && role !== 'admin') {
      return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยน role ของตัวเองได้' });
    }
    // Prevent admin from deactivating themselves
    if (String(user._id) === String(req.user._id) && isActive === false) {
      return res.status(400).json({ success: false, message: 'ไม่สามารถระงับบัญชีของตัวเองได้' });
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = password;
    await user.save();
    res.json({ success: true, user: { id: user._id, username: user.username, name: user.name, role: user.role, isActive: user.isActive } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/auth/users/:id (admin only)
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

    // Don't allow deleting the last active admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'ต้องมี admin อย่างน้อย 1 คนในระบบ' });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบผู้ใช้งานเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
