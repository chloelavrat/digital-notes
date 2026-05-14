# --- Build stage ---
FROM node:24.15-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --prefer-offline --no-audit --no-fund

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:24.15-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --omit=dev --prefer-offline --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY server.js ./

ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:${PORT}/api/health || exit 1

EXPOSE ${PORT}
CMD ["node", "server.js"]
