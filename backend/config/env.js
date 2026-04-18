/**
 * ═══════════════════════════════════════════════════════════════
 *  Environment Loader
 *  ───────────────────────────────────────────────────────────────
 *  โหลดไฟล์ .env ตามลำดับความสำคัญ (ลำดับหลังทับลำดับก่อน):
 *    1. .env.<NODE_ENV>       — ค่าเริ่มต้นของ environment นั้น ๆ   (committed)
 *    2. .env.<NODE_ENV>.local — ค่าเฉพาะเครื่อง/personal override   (gitignored)
 *    3. .env                  — fallback สำหรับ legacy setup        (gitignored)
 *    4. .env.local            — personal override สำหรับทุก env     (gitignored)
 *
 *  หมายเหตุ: ค่า env ที่มาจากระบบ (เช่น DigitalOcean App Platform)
 *  จะถูกใช้ก่อนเสมอ — dotenv จะไม่ override process.env ที่มีค่าอยู่แล้ว
 *  (ยกเว้นใช้ override: true ซึ่งเราไม่ได้ตั้งไว้)
 * ═══════════════════════════════════════════════════════════════
 */

const path = require('path');
const fs   = require('fs');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'development';
// root ของโปรเจกต์ = parent ของ backend/
const ROOT = path.resolve(__dirname, '..', '..');

// ลำดับโหลด (index 0 = มาก่อน → ค่ายังถูก override โดย index ต่อ ๆ ไปไม่ได้ เพราะ dotenv ไม่ override)
// ดังนั้นเรียงจาก "specific ที่สุด" ไปหา "ทั่วไป" เพื่อให้ค่า specific ถูกใช้
const loadOrder = [
  `.env.${NODE_ENV}.local`,
  `.env.local`,
  `.env.${NODE_ENV}`,
  `.env`,
];

const loaded = [];
for (const file of loadOrder) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    loaded.push(file);
  }
}

if (process.env.NODE_ENV !== 'test') {
  console.log(`🔧 [env] NODE_ENV=${NODE_ENV} — โหลดไฟล์: ${loaded.length ? loaded.join(', ') : '(none, ใช้ process.env เท่านั้น)'}`);
}

// ตรวจสอบค่าที่ต้องมีเสมอ — fail fast ถ้าขาด
const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length && NODE_ENV !== 'test') {
  console.error(`❌ [env] ขาด environment variables ที่จำเป็น: ${missing.join(', ')}`);
  console.error(`   ดู .env.example เป็นตัวอย่าง หรือตั้งใน DigitalOcean App Platform dashboard`);
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
}

// เตือนถ้าใช้ default JWT_SECRET (unsafe)
if (NODE_ENV === 'production' && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn(`⚠️  [env] JWT_SECRET สั้นเกินไป (${process.env.JWT_SECRET.length} ตัว) — ควรใช้ ≥ 32 ตัว`);
}

module.exports = {
  NODE_ENV,
  isDev:  NODE_ENV === 'development',
  isProd: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT:   parseInt(process.env.PORT, 10) || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET:  process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  FRONTEND_URL: process.env.FRONTEND_URL || '*',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
