# Google Cloud Run 배포용 — `gcloud run deploy --source .` 가 이 파일로 이미지를 만든다.
# 1단계: 앱 빌드(vite) → 2단계: 빌드 결과(dist)와 정적 서버(server.js)만 담아 가볍게 실행
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY server.js package.json ./
# Cloud Run 이 PORT(기본 8080)를 넘겨 준다
EXPOSE 8080
CMD ["node", "server.js"]
