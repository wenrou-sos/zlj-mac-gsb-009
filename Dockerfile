# ---- 阶段 1：构建 React 前端 ----
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- 阶段 2：后端运行时（sql.js 为 WASM，无需原生编译工具链）----
FROM node:20-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV DB_PATH=/app/server/data/crane.db

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

RUN mkdir -p /app/server/data
EXPOSE 3001

CMD ["node", "src/index.js"]
