# 뿌요뿌요 앱 서버(중앙 서버) 이미지: 로그인 필수 · 앱에서만 접속 · 게임 화면(웹)은 제공하지 않음
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    REQUIRE_AUTH=1 \
    SERVE_WEB=0 \
    TRUST_PROXY=1 \
    AUTH_DIR=/data \
    RANK_FILE=/data/ranks.json
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# 서버 코드만(앱 화면·Electron·테스트는 넣지 않음). sim.js·verify.js는 랭크전 서버 검증이 게임 규칙 코드(public/js)를 그대로 불러 쓰므로 필요
COPY server.js auth.js authApi.js rank.js social.js backup.js sim.js verify.js ./
COPY public/js ./public/js
# 기록·계정은 /data 볼륨에 저장(컨테이너를 지워도 남게). 실행은 일반 사용자로
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
