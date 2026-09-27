# Optional deployment template. Not built or deployed in this session.
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY --chown=node:node core ./core
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN npm run build:sw && mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/vocalearn.sqlite MEDIA_PATH=/app/data/media
EXPOSE 3000
CMD ["node", "server/main.js"]
