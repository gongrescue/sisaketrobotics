const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'ผู้ใช้งานไม่พบในระบบ' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
};

// Restrict to admin role
exports.adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
};

// Admin or Judge
exports.judgeOrAdmin = (req, res, next) => {
  if (!['admin', 'judge'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};
