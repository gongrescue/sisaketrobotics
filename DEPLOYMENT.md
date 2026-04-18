# 🚀 CI/CD Deployment Guide
## ศรีสะเกษโรโบติกส์ 2026 — DigitalOcean App Platform

คู่มือนี้อธิบายการ deploy ระบบขึ้น DigitalOcean App Platform โดยเชื่อมกับ GitHub repo เพื่อให้ auto-deploy เมื่อมีการ push code

---

## สถาปัตยกรรม

```
GitHub (main)
    │
    │ push
    ▼
GitHub Actions  ─────── CI: lint + syntax + docker build
    │
    │ (success)
    ▼
DO App Platform  ──── auto-deploy จาก Dockerfile ที่ root
    │
    │ serves / + /api/*
    ▼
Public URL (https://sisaket-robotics-xxxx.ondigitalocean.app)
    │
    │ connects via MONGODB_URI
    ▼
MongoDB Atlas (external) หรือ DO Managed MongoDB
```

ระบบใช้ **single-service deployment**: backend Node.js serve ทั้ง API (`/api/*`) และ frontend static (SPA) จาก container เดียว ช่วยลดค่าใช้จ่าย (เสีย instance เดียว ~$5/เดือน)

---

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `Dockerfile` | Production image — builds backend + copies frontend |
| `.dockerignore` | ตัดไฟล์ที่ไม่จำเป็นออกจาก Docker build context |
| `.do/app.yaml` | DO App Platform spec (region, instance size, env vars, health check) |
| `.github/workflows/ci.yml` | รัน syntax check + Docker build ทุก PR และ push |
| `.github/workflows/deploy.yml` | Sync spec + force rebuild app เมื่อ push main |
| `.env.example` | Template ของ environment variables (ทุก key ที่ใช้) |
| `.env.development` | Default สำหรับ dev (committed, no secrets) |
| `.env.production` | Default สำหรับ prod (committed, non-secret เท่านั้น) |
| `backend/config/env.js` | Smart loader — เลือกไฟล์ตาม `NODE_ENV` |

---

## Environment Config

ระบบโหลด env จากหลายไฟล์ ตามลำดับความสำคัญ (ล่างชนะบน):

```
1. .env.<NODE_ENV>        ← committed (dev/prod defaults)
2. .env.<NODE_ENV>.local  ← gitignored (เฉพาะเครื่องคุณ / secret)
3. .env                   ← gitignored (legacy fallback)
4. .env.local             ← gitignored (personal override)
```

**ค่า `process.env` จาก platform (DO, Docker) จะชนะเสมอ** — dotenv ไม่ override ค่าที่มีอยู่

**การใช้งานทั่วไป:**
- **Local dev:** `NODE_ENV=development npm run dev` → โหลด `.env.development` อัตโนมัติ
- **Local prod test:** สร้าง `.env.production.local` ใส่ secret → `NODE_ENV=production npm start`
- **DO App Platform:** ใส่ SECRET ใน Dashboard, `.env.production` ติดไปใน image สำหรับ non-secret defaults

---

## ขั้นตอนตั้งค่าครั้งแรก

### 1) เตรียม MongoDB

**ตัวเลือก A — MongoDB Atlas (ฟรี):**
1. สมัคร https://www.mongodb.com/cloud/atlas
2. สร้าง M0 Free Cluster (เลือก region Singapore / AWS)
3. Database Access → สร้าง user/password
4. Network Access → Allow from Anywhere (`0.0.0.0/0`) ชั่วคราวไปก่อน (หลัง deploy สามารถจำกัด IP ของ DO app ได้)
5. คัดลอก connection string:
   ```
   mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/sisaket_robotics?retryWrites=true&w=majority
   ```

**ตัวเลือก B — DO Managed MongoDB:**
- สร้าง MongoDB cluster ใน DO Dashboard (ราคาเริ่ม $15/เดือน)
- ใช้ connection string ที่ DO สร้างให้

### 2) สร้าง App บน DigitalOcean

1. เข้า https://cloud.digitalocean.com/apps
2. **Create App** → **GitHub** → ให้สิทธิ์ DO เข้าถึง repo `gongrescue/sisaketrobotics`
3. เลือก branch `main`
4. DO จะตรวจเจอไฟล์ `.do/app.yaml` อัตโนมัติและใช้เป็น spec
5. ในขั้น **Environment Variables**:
   - `MONGODB_URI` → ใส่ connection string จากข้อ 1 (เลือก **Encrypt**)
   - `JWT_SECRET` → สร้างด้วยคำสั่ง:
     ```bash
     openssl rand -hex 32
     ```
     แล้วใส่เป็นค่า (เลือก **Encrypt**)
6. Review → **Create Resources**
7. รอประมาณ 3-5 นาทีให้ build + deploy เสร็จ

### 3) Seed ข้อมูลเริ่มต้น (รันครั้งเดียว)

หลัง deploy ครั้งแรก ต้อง seed ข้อมูล admin/competitions:

```bash
# SSH เข้า DO app console หรือใช้ doctl
doctl apps console <APP_ID> --component api
# ในคอนโซล:
cd /app/backend && node seed.js
```

หรือใช้ DO Dashboard → **Apps** → เลือก app → **Console** → run command

### 4) ตั้งค่า GitHub Actions Secrets (เฉพาะถ้าใช้ deploy.yml)

1. ไปที่ DO Dashboard → **API** → [Generate Personal Access Token](https://cloud.digitalocean.com/account/api/tokens)
2. ใน GitHub repo → **Settings** → **Secrets and variables** → **Actions** → เพิ่ม:

| Secret | ค่า |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | personal access token จาก DO |
| `DO_APP_ID` | App ID (หาได้จาก `doctl apps list` หรือ URL `/apps/<UUID>`) |

> **หมายเหตุ:** DO App Platform มี auto-deploy on push อยู่แล้ว ไม่จำเป็นต้องตั้ง secrets ถ้าไม่ต้องการ sync spec อัตโนมัติ

---

## การใช้งานประจำวัน

### Deploy อัตโนมัติ
```bash
git push origin main
```
→ GitHub Actions รัน CI → DO App Platform auto-build & deploy

### Force rebuild ด้วยมือ
GitHub repo → **Actions** → **Deploy to DigitalOcean** → **Run workflow**

หรือผ่าน CLI:
```bash
doctl apps create-deployment <APP_ID> --force-rebuild
```

### ดู logs
```bash
doctl apps logs <APP_ID> --type run --follow
```

### Rollback
```bash
doctl apps list-deployments <APP_ID>           # ดู list
doctl apps create-deployment <APP_ID> --build-id <OLD_BUILD_ID>
```

---

## ขนาด Instance / ราคา

| Component | Slug | ราคา | เหมาะกับ |
|---|---|---|---|
| **api** (current) | `basic-xxs` | ~$5/เดือน | งานแข่ง 2-3 วัน, ≤ 50 concurrent users |
| upgrade | `basic-xs` | ~$12/เดือน | ถ้ามีผู้ชม live เยอะ |
| **MongoDB Atlas** | M0 Free | $0 | Dev + งานเล็ก |
| **MongoDB Atlas** | M10 | ~$57/เดือน | Production |

แก้ใน `.do/app.yaml` ฟิลด์ `instance_size_slug` แล้ว push

---

## Troubleshooting

**Build failed — "Cannot find module"**
- ตรวจว่า `.dockerignore` ไม่ตัด `package.json` ออก
- รัน `docker build -f Dockerfile .` ที่เครื่องก่อน push

**App deployed แต่ 502/503**
- เช็ค logs: `doctl apps logs <APP_ID> --type run`
- ส่วนใหญ่คือ `MONGODB_URI` ผิด → Atlas ยังไม่เปิด Network Access
- เช็ค `/api/health` ในเบราว์เซอร์

**Health check failing**
- `server.js` ต้อง listen ที่ `0.0.0.0` ไม่ใช่ `127.0.0.1` (ปัจจุบัน Express default ถูกต้อง)
- `PORT=5000` ตรงกับ `http_port` ใน app.yaml

**Frontend โหลดแต่ /api/* 404**
- ตรวจว่า `Dockerfile` มี `COPY frontend ./frontend` และ `WORKDIR /app/backend`
- ตรวจว่า `server.js` ทำ `app.use(express.static(path.join(__dirname, '../frontend')))`

---

## เช็คลิสต์หลัง deploy ครั้งแรก

- [ ] เปิด URL → หน้าแรกแสดงผล
- [ ] `/api/health` ตอบ JSON `{ success: true, dbStatus: "connected" }`
- [ ] Login ด้วย admin account (seed แล้ว)
- [ ] จำกัด MongoDB Network Access เฉพาะ IP ของ DO app
- [ ] เปลี่ยน `JWT_SECRET` เป็นค่าใหม่ (ถ้ายังใช้ค่า default)
- [ ] เปิด alerts ใน DO dashboard (`DEPLOYMENT_FAILED`, `DOMAIN_FAILED` ตั้งไว้ใน spec แล้ว)
- [ ] ตั้ง custom domain (optional) ใน **Settings** → **Domains**
