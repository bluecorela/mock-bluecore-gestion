FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["node", "dist/main"]
