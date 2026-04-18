// โหลด env config แยกตาม NODE_ENV (รองรับทั้ง .env, .env.development, .env.production)
const env = require('./config/env');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Routes ─────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/competitions', require('./routes/competitions'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/rankings', require('./routes/rankings'));
app.use('/api/matches', require('./routes/matches'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ศรีสะเกษโรโบติกส์ 2026 API กำลังทำงาน',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Serve frontend for any other route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Error Handler ───────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
  });
});

// ─── Database & Server Start ─────────────────────────────────
const PORT = env.PORT;
const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/sisaket_robotics';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log(`✅ เชื่อมต่อ MongoDB สำเร็จ (${env.NODE_ENV})`);
    app.listen(PORT, () => {
      console.log(`🚀 Server กำลังทำงานที่ http://localhost:${PORT}`);
      console.log(`📊 ระบบรายงานผลคะแนน ศรีสะเกษโรโบติกส์ 2026`);
    });
  })
  .catch(err => {
    console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB:', err.message);
    process.exit(1);
  });

module.exports = app;
