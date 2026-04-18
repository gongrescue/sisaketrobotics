# ══════════════════════════════════════════════════════════════
# Sisaket Robotics 2026 — Production single-service image
# (backend serves both /api/* และ static frontend)
# ใช้สำหรับ DigitalOcean App Platform / deployment แบบ single container
# ══════════════════════════════════════════════════════════════

# ---- Build Stage: ติดตั้ง production dependencies ----
FROM node:18-alpine AS builder

WORKDIR /app/backend

# Copy lockfile + manifest ก่อนเพื่อใช้ layer cache
COPY backend/package.json backend/package-lock.json* ./

# ใช้ npm ci ถ้ามี lockfile / fallback เป็น npm install
# ปิด audit/fund เพื่อให้ build ไม่พังเพราะ registry issue
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

# ---- Runtime Stage ----
FROM node:18-alpine

WORKDIR /app

# non-root user เพื่อความปลอดภัย
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy backend source + node_modules จาก build stage + frontend static
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend

# หมายเหตุ: ไม่ต้อง COPY .env.production เข้า image เพราะ DO App Platform
# inject env vars ลงใน process.env โดยตรง (ดู .do/app.yaml)
# env loader จะ fallback มาอ่าน process.env ถ้าไม่พบไฟล์ → พอแล้วสำหรับ prod

RUN chown -R appuser:appgroup /app
USER appuser

# Non-secret defaults ที่เคยอยู่ใน .env.production — set ผ่าน ENV directive
# (จะถูก override โดย DO App Platform ถ้า set ซ้ำใน spec)
ENV NODE_ENV=production \
    PORT=5000 \
    JWT_EXPIRES_IN=24h \
    LOG_LEVEL=info

EXPOSE 5000

# ตั้ง working dir เป็น backend เพราะ server.js อ้างอิง ../frontend แบบ relative
WORKDIR /app/backend
CMD ["node", "server.js"]
