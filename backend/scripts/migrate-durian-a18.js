// Run: NODE_ENV=production node scripts/migrate-durian-a18.js
const env = require('../config/env');
const mongoose = require('mongoose');
const Competition = require('../models/Competition');

const NEW_CRITERIA = [
  { key: 'yellow_correct',          label: 'กระป๋องสีเหลือง (หมากอง) วางถูกที่',  type: 'number',  pointsPerUnit: 10 },
  { key: 'red_correct',             label: 'กระป๋องสีแดง (ชะนี) วางถูกที่',       type: 'number',  pointsPerUnit: 10 },
  { key: 'blue_correct',            label: 'กระป๋องสีน้ำเงิน (ก้านยาว) วางถูกที่', type: 'number', pointsPerUnit: 10 },
  { key: 'green_correct',           label: 'กระป๋องสีเขียว (ส่งขาย) วางถูกที่',   type: 'number',  pointsPerUnit: 10 },
  { key: 'checkpoint_penalty',      label: 'ผ่านจุดห้าม (ปรับ)',                   type: 'number',  pointsPerUnit: 10, isPenalty: true },
  { key: 'return_finish_complete',  label: 'กลับจุด Finish สำเร็จ (ภารกิจสมบูรณ์)',   type: 'boolean', points: 20 },
  { key: 'return_finish_incomplete',label: 'กลับจุด Finish สำเร็จ (ภารกิจไม่สมบูรณ์)', type: 'boolean', points: 10 },
];

async function run() {
  await mongoose.connect(env.MONGODB_URI || 'mongodb://localhost:27017/sisaket_robotics');
  const comp = await Competition.findOne({ code: 'DURIAN_A18' });
  if (!comp) { console.error('❌ ไม่พบ DURIAN_A18'); process.exit(1); }

  comp.scoringCriteria = NEW_CRITERIA;
  await comp.save();
  console.log('✅ อัปเดต DURIAN_A18 สำเร็จ');
  comp.scoringCriteria.forEach(c => console.log(`  ${c.key}: ${c.label} (${c.points ?? c.pointsPerUnit + '/unit'})`));
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
