# Optional deployment template. Production still requires HTTPS reverse proxy and validated env.
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY --chown=node:node core ./core
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN npm run build:sw && mkdir -p /app/data /app/lexicon && chown -R node:node /app/data /app/lexicon
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/vocalearn.sqlite MEDIA_PATH=/app/data/media
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]
