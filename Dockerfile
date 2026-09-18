# syntax=docker/dockerfile:1

# ---- 构建阶段：安装依赖并编译前端 ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 需要少量编译工具（无预编译包时兜底）
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY shared ./shared
COPY server ./server
COPY src ./src
COPY index.html vite.config.js ./
RUN npm run build

# 只保留生产依赖（触发 better-sqlite3 针对运行时镜像重装/重编）
RUN npm prune --omit=dev

# ---- 运行阶段 ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/data/app.db

# 非 root 用户运行，数据目录可写
RUN mkdir -p /app/data && chown -R node:node /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node shared ./shared
COPY --chown=node:node server ./server
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
