# skill.md — Tech Stack & Skills

รวม technology และ library ที่ใช้ในโปรเจกต์ Sisaket Robotics 2026

## Backend

| ทักษะ | รายละเอียด |
|---|---|
| **Node.js** | Runtime หลัก (ES2020+) |
| **Express.js** | Web framework, routing, middleware |
| **Mongoose** | ODM สำหรับ MongoDB |
| **MongoDB** | NoSQL database (Atlas / DigitalOcean Managed) |
| **JWT (jsonwebtoken)** | Authentication token |
| **bcryptjs** | Password hashing |
| **dotenv** | Environment variable loading |
| **nodemon** | Auto-restart ใน development |
| **cors** | Cross-Origin Resource Sharing |

## Frontend

| ทักษะ | รายละเอียด |
|---|---|
| **Vanilla JavaScript** | ไม่มี framework หรือ bundler |
| **Fetch API** | HTTP requests ไปยัง `/api/*` |
| **HTML5** | Template ฝังใน `index.html` |
| **CSS3** | Styling ทั้งหมด |

## DevOps & Infrastructure

| ทักษะ | รายละเอียด |
|---|---|
| **Docker** | Containerize ทั้ง backend + static frontend |
| **docker-compose** | Local full-stack development |
| **nginx** | Serve static frontend ใน container |
| **GitHub Actions** | CI/CD — syntax check + build + deploy |
| **DigitalOcean App Platform** | Production hosting |

## Architecture Patterns

| Pattern | การใช้งาน |
|---|---|
| **REST API** | `/api/*` endpoints ทั้งหมด |
| **Role-based Access Control** | admin / judge / viewer |
| **SPA (Single Page Application)** | Frontend render ด้วย JS ล้วน |
| **Idempotent Seed** | `seed.js` รันซ้ำได้ปลอดภัย |
| **Hybrid Scoring Flow** | qualifying rounds → knockout bracket (tour competitions) |

## แนวทางการพัฒนา

### โครงสร้างโค้ด

- **Backend route ใหม่** — สร้างไฟล์ใน `backend/routes/` แล้ว mount ใน `server.js`
- **Model ใหม่** — สร้างใน `backend/models/` ใช้ Mongoose schema
- **Frontend feature ใหม่** — เพิ่มใน `frontend/js/app.js` ตาม pattern เดิม (ไม่มี bundler)
- **ห้ามเพิ่ม framework** — Frontend ใช้ Vanilla JS เท่านั้น ไม่ใช้ React/Vue/Angular

### Auth & Security

- ทุก endpoint ที่ต้องการ auth ให้ใช้ middleware `authenticate` จาก `middleware/auth.js`
- ตรวจสอบ role ด้วย `requireRole('admin')` หรือ `requireRole('judge')`
- ห้าม commit secrets — ใช้ `.env.local` สำหรับ overrides ส่วนตัว
- Production secrets inject ผ่าน DigitalOcean dashboard เท่านั้น

### Database

- ใช้ Mongoose validation ที่ schema level ก่อนเสมอ
- `seed.js` ต้อง idempotent — ใช้ `findOneAndUpdate` + `upsert` ไม่ใช่ `insertMany` ล้วน
- `bonusScore` บวกทับ `totalScore` ใน standings เสมอ — ระวังอย่า double-count

### Scoring Types

| scoringType | วิธีบันทึก | rankingMethod ที่รองรับ |
|---|---|---|
| `POINT` | คะแนนสะสม | `SUM`, `BEST`, `LAST` |
| `TIME` | เวลา (น้อยกว่า = ดีกว่า) | `BEST`, `LAST` |
| `BATTLE` | ผล Match head-to-head | — (ใช้ Match model) |

### CI/CD

- Push ไป `main` → GitHub Actions deploy อัตโนมัติไปยัง DigitalOcean
- ก่อน push ให้ syntax check ด้วย `node --check`
- ไม่มี test suite — ตรวจสอบ logic ด้วย manual testing
