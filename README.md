# ระบบรายงานผลคะแนน ศรีสะเกษโรโบติกส์ 2026

## 🚀 วิธีติดตั้งและเริ่มใช้งาน

### ความต้องการของระบบ
- Node.js 18+
- MongoDB 6+ (local หรือ MongoDB Atlas)

---

### 1. ติดตั้ง Backend

```bash
cd backend
npm install
```

แก้ไขไฟล์ `.env` ตามต้องการ:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sisaket_robotics
JWT_SECRET=your_secret_key_here
```

### 2. Seed ข้อมูลเริ่มต้น

```bash
cd backend
npm run seed
```

จะสร้าง:
- ประเภทการแข่งขัน 18 ประเภท
- ผู้ใช้งาน admin (admin / admin1234)
- กรรมการ (judge1 / judge1234)

### 3. เริ่มใช้งาน

```bash
cd backend
npm start          # Production
# หรือ
npm run dev        # Development (nodemon)
```

เปิดเบราว์เซอร์: **http://localhost:5000**

---

## 📊 ประเภทการแข่งขัน (18 ประเภท)

| # | รหัส | ชื่อ | ประเภท | อายุ |
|---|------|------|--------|------|
| 1 | GARLIC_M18 | หุ่นยนต์ปลูกหอมกระเทียม (บังคับมือ) | Manual | ≤18 |
| 2 | COW_BATTLE_12 | หุ่นยนต์เลี้ยงวัว Battle | Battle | ≤12 |
| 3 | DURIAN_A18 | หุ่นยนต์ปลูกทุเรียนภูเขาไฟ (อัตโนมัติ) | Auto | ≤18 |
| 4 | RESCUE_NB12 | หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) | Auto | ≤12 |
| 5 | RESCUE_NB15 | หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) | Auto | ≤15 |
| 6 | RESCUE_NB18 | หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) | Auto | ≤18 |
| 7 | RESCUE_LEGO12 | หุ่นยนต์กู้ภัย Lego Edition | Auto | ≤12 |
| 8 | RESCUE_LEGO15 | หุ่นยนต์กู้ภัย Lego Edition | Auto | ≤15 |
| 9 | RESCUE_LEGO18 | หุ่นยนต์กู้ภัย Lego Edition | Auto | ≤18 |
| 10 | SORT_12 | หุ่นยนต์แยกขยะ (อัตโนมัติ) | Auto | ≤12 |
| 11 | SORT_15 | หุ่นยนต์แยกขยะ (อัตโนมัติ) | Auto | ≤15 |
| 12 | SORT_18 | หุ่นยนต์แยกขยะ (อัตโนมัติ) | Auto | ≤18 |
| 13 | TOUR_15 | หุ่นยนต์อัตโนมัติ เที่ยวเมืองศรีสะเกษ | Auto | ≤15 |
| 14 | TOUR_OPEN | หุ่นยนต์อัตโนมัติ เที่ยวเมืองศรีสะเกษ | Auto | Open |
| 15 | RESCUE_M15 | หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ | Manual | ≤15 |
| 16 | RESCUE_MOPEN | หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ | Manual | Open |
| 17 | LINE_15 | หุ่นยนต์ Line Fast เจ้าความเร็ว | Line | ≤15 |
| 18 | LINE_OPEN | หุ่นยนต์ Line Fast เจ้าความเร็ว | Line | Open |

---

## 🔌 API Endpoints

### Public (ไม่ต้อง login)
```
GET  /api/competitions              ดูประเภทการแข่งขันทั้งหมด
GET  /api/competitions/:id          รายละเอียดประเภท
GET  /api/teams?competition=<id>    ดูทีมในประเภทนั้น
GET  /api/rankings/:competitionId   ตารางลำดับ
GET  /api/rankings                  สรุปทุกประเภท
GET  /api/matches?competition=<id>  ผล Battle
```

### Auth Required
```
POST /api/auth/login                เข้าสู่ระบบ
GET  /api/auth/me                   ข้อมูลตัวเอง
POST /api/teams                     เพิ่มทีม (Judge/Admin)
PUT  /api/teams/:id                 แก้ไขทีม
POST /api/scores                    บันทึกคะแนน (Judge/Admin)
PUT  /api/scores/:id                แก้ไขคะแนน
POST /api/matches                   สร้างคู่ Battle
PUT  /api/matches/:id/result        บันทึกผล Battle
POST /api/auth/register             เพิ่มผู้ใช้ (Admin)
```

---

## 🗂️ โครงสร้างโปรเจค

```
SisaketRobotics/
├── backend/
│   ├── server.js           ← เซิร์ฟเวอร์หลัก
│   ├── package.json
│   ├── .env                ← ตั้งค่าระบบ
│   ├── seed.js             ← ข้อมูลเริ่มต้น
│   ├── models/             ← MongoDB Schemas
│   │   ├── User.js
│   │   ├── Competition.js
│   │   ├── Team.js
│   │   ├── Score.js
│   │   └── Match.js
│   ├── routes/             ← API Routes
│   │   ├── auth.js
│   │   ├── competitions.js
│   │   ├── teams.js
│   │   ├── scores.js
│   │   ├── rankings.js
│   │   └── matches.js
│   └── middleware/
│       └── auth.js
├── frontend/
│   ├── index.html          ← Web App หลัก
│   ├── css/style.css       ← Stylesheet
│   └── js/app.js           ← App Logic
└── Document/               ← กติกาการแข่งขัน (PDF)
```

---

## 👥 บัญชีผู้ใช้เริ่มต้น

| บทบาท | Username | Password |
|-------|----------|----------|
| Admin | admin | admin1234 |
| กรรมการ | judge1 | judge1234 |
| กรรมการ | judge2 | judge1234 |

> ⚠️ **เปลี่ยนรหัสผ่านก่อนใช้งานจริง!**
