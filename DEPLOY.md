# 배포 가이드

## 추천 구성 (무료~$7/월)

| 서비스 | 플랫폼 | 비용 | 비고 |
|--------|--------|------|------|
| 프론트엔드 | Cloudflare Pages | **무료** | 무제한 대역폭, 글로벌 CDN |
| 백엔드 | Render.com | **무료** 또는 $7/월 | WebSocket 지원 |
| TURN 서버 | Metered.ca | **무료** (500MB/월) | WebRTC NAT 통과 |

> **무료 티어 주의**: Render 무료는 15분 비활동 시 슬립됩니다 (첫 요청 시 30초 대기). 항상 켜져있으려면 $7/월 Starter 플랜 사용.

---

## Step 1: GitHub 저장소 준비

코드를 GitHub에 push 합니다 (이미 완료된 상태).

---

## Step 2: 백엔드 배포 (Render.com)

### 2-1. Render 가입
1. https://render.com 접속 → GitHub 계정으로 가입

### 2-2. Web Service 생성
1. Dashboard → **New** → **Web Service**
2. GitHub 저장소 연결: `Han-D-Peter/qwas-laugh`
3. 설정:
   - **Name**: `qwas-laugh-server`
   - **Region**: Singapore (또는 가까운 리전)
   - **Branch**: `claude/claw-machine-game-aqBtP` (또는 main에 merge 후 main)
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm i -g pnpm && pnpm install && pnpm --filter @qwas/shared build && pnpm --filter @qwas/server build
     ```
   - **Start Command**:
     ```
     node apps/server/dist/index.js
     ```
   - **Plan**: Free (또는 Starter $7/월)

### 2-3. 환경변수 설정
| 변수 | 값 |
|------|-----|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `CLIENT_ORIGIN` | (Step 3 완료 후 Cloudflare Pages URL 입력) |

4. **Create Web Service** 클릭
5. 배포 완료 후 URL 확인 (예: `https://qwas-laugh-server.onrender.com`)

---

## Step 3: 프론트엔드 배포 (Cloudflare Pages)

### 3-1. Cloudflare 가입
1. https://dash.cloudflare.com 접속 → 가입

### 3-2. Pages 프로젝트 생성
1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 저장소 연결: `Han-D-Peter/qwas-laugh`
3. 빌드 설정:
   - **Framework preset**: None
   - **Build command**:
     ```
     npm i -g pnpm && pnpm install && pnpm --filter @qwas/client build
     ```
   - **Build output directory**: `apps/client/dist`
   - **Root directory**: `/` (비워두기)

### 3-3. 환경변수 설정
| 변수 | 값 |
|------|-----|
| `VITE_SERVER_URL` | `https://qwas-laugh-server.onrender.com` (Step 2에서 받은 URL) |

4. **Save and Deploy** 클릭
5. 배포 완료 후 URL 확인 (예: `https://qwas-laugh.pages.dev`)

### 3-4. Render 환경변수 업데이트
Step 2의 Render 서비스에서:
- `CLIENT_ORIGIN`을 `https://qwas-laugh.pages.dev`로 설정
- **Manual Deploy** → **Deploy latest commit**

---

## Step 4: TURN 서버 설정 (Metered.ca) — 선택사항

> 대부분의 네트워크에서는 STUN만으로 충분합니다. 회사/학교 네트워크 등 제한적인 환경에서 음성채팅이 안 될 때만 필요합니다.

### 4-1. Metered.ca 가입
1. https://www.metered.ca 접속 → 무료 가입
2. Dashboard → **TURN Server** → 자동 생성된 서버 확인
3. API Key와 TURN 서버 정보 복사

### 4-2. Render 환경변수 추가
| 변수 | 값 |
|------|-----|
| `TURN_SERVER_URL` | `turn:global.relay.metered.ca:80` |
| `TURN_USER` | Metered에서 제공한 API Key |
| `TURN_PASSWORD` | Metered에서 제공한 Secret |

---

## 배포 후 확인

1. `https://your-pages-url.pages.dev` 접속
2. 로비 화면이 보이는지 확인
3. 닉네임 입력 → "방 만들기" → 접속코드 생성 확인
4. 다른 기기/브라우저에서 같은 URL 접속 → 접속코드로 입장
5. 4명이 모이면 게임 시작!

### 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 페이지 로드 안 됨 | Cloudflare 빌드 실패 | Pages 대시보드에서 빌드 로그 확인 |
| 방 만들기 실패 | 서버 연결 안 됨 | `VITE_SERVER_URL`이 정확한지 확인 |
| 서버 응답 없음 | Render 슬립 상태 | 30초 대기 후 재시도 (무료 티어) |
| 음성채팅 안 됨 | NAT 통과 실패 | Step 4 TURN 서버 설정 |
| CORS 에러 | `CLIENT_ORIGIN` 미설정 | Render 환경변수 확인 |

---

## 커스텀 도메인 (선택사항)

### Cloudflare Pages
1. Pages 프로젝트 → **Custom domains** → 도메인 추가

### Render
1. Web Service → **Settings** → **Custom Domains** → 도메인 추가

---

## Docker 자체 서버 배포 (대안)

VPS(AWS EC2, DigitalOcean 등)가 있다면:

```bash
git clone https://github.com/Han-D-Peter/qwas-laugh.git
cd qwas-laugh
cp .env.example .env
vi .env  # 비밀번호 등 변경
docker compose up -d --build
```

이 경우 프론트/백엔드/TURN 서버가 모두 하나의 서버에서 실행됩니다.
