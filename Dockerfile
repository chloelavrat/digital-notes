# --- Build stage ---
FROM node:24.15-alpine AS build
WORKDIR /app

# Cache dependencies separately from source
COPY package.json package-lock.json ./
RUN npm install --prefer-offline --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# --- Production stage ---
FROM nginx:alpine AS production

# Remove default config, copy custom nginx template and built assets
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Default port — Cloud Run overrides via PORT env var
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost:${PORT}/ || exit 1

EXPOSE ${PORT}
CMD ["nginx", "-g", "daemon off;"]
