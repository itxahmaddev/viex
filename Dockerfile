# VIEX Relay + web viewer in one small image.
#   docker build -t viex-relay .
#   docker run -p 8787:8787 -e VIEX_PASSWORD='a-long-password' viex-relay
# Render's Blueprint (render.yaml) uses this file too.

# ---- 1. build the web viewer ------------------------------------------------
FROM node:26-alpine AS viewer
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY viewer/package.json viewer/
COPY relay/package.json relay/
COPY host/package.json host/
RUN npm ci --workspace=viewer --workspace=shared --ignore-scripts
COPY shared shared
COPY viewer viewer
RUN npm run build -w viewer

# ---- 2. the relay -----------------------------------------------------------
FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY relay/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY relay/src ./src
COPY --from=viewer /app/viewer/dist ./public
USER node
EXPOSE 8787
ENV PORT=8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "src/index.js"]
