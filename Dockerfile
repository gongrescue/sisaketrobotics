# ══════════════════════════════════════════════════════════════
# Sisaket Robotics 2026 — Production single-service image
# (backend serves both /api/* และ static frontend)
# ใช้สำหรับ DigitalOcean App Platform / deployment แบบ single container
# ══════════════════════════════════════════════════════════════

# ---- Build Stage: ติดตั้ง production dependencies ----
FROM node:18-alpine AS builder

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# ---- Runtime Stage ----
FROM node:18-alpine

WORKDIR /app

# non-root user เพื่อความปลอดภัย
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy backend (รวม node_modules จาก build stage) + frontend static
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend

RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# ตั้ง working dir เป็น backend เพราะ server.js อ้างอิง ../frontend แบบ relative
WORKDIR /app/backend
CMD ["node", "server.js"]
