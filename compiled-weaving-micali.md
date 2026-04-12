# Claw Machine Game — Retro Arcade Visual Redesign

## Context

게임의 모든 기능 구현은 완료되었으나, 시각적으로 "인형뽑기 기계 내부에서 벌어지는 일"이라는 컨셉이 드러나지 않고 있습니다. 현재는 파스텔 톤의 단색 배경 + 단순한 보라색 벽선 미로로, 플레이어가 테마를 느끼기 어렵습니다.

이 계획은 두 가지 목표를 달성합니다:
1. **인형뽑기 기계 내부 공간감** — 미로 벽과 배경이 "플러시 인형으로 가득 찬 아케이드 기계 내부"처럼 보이게 함
2. **레트로 아케이드 연출** — Phase 시작/완료/성공/실패/서스펜스 구간에 80-90년대 오락실 느낌의 과장된 애니메이션(CRT 스캔라인, 네온 글로우, 픽셀 텍스트, 카메라 줌/셰이크, 파티클 버스트, 프라이즈 슈트 낙하 연출)을 입힘

또한 로그인(로비) 화면은 움직이는 인형 배경 + 아케이드 캐비닛 무드의 패럴랙스 씬으로 교체합니다.

기술 스택: Vite + React 19 + Pixi.js 8.6.6 + TypeScript. 렌더링은 100% 절차적(Pixi Graphics), CSS-in-JS 인라인 스타일. 애니메이션 라이브러리 없음 — 기존 패턴(Pixi Graphics + CSS keyframes + requestAnimationFrame) 그대로 유지합니다.

---

## Asset Spec (선택적 제공 가능)

**엄격히 필수인 에셋은 없습니다.** 모든 것을 Pixi Graphics 절차 생성으로 구현합니다. 기존 `drawDoll(typeIndex)` (6종 동물 캐릭터, `apps/client/src/game/sprites/doll.ts:121`)을 재사용해 작은 스케일로 벽·배경·로비에 재배치합니다.

단, 아래 2가지 선택적 에셋을 제공하면 품질이 한 단계 상승합니다:

### (선택) Asset #1 — 마퀴 로고 이미지
- **용도**: 로비 상단 제목 / 게임 내 타이틀 오버레이
- **파일명**: `apps/client/public/marquee-logo.png`
- **사이즈**: 1200 × 300 px (2x 레티나 대응 시 2400 × 600)
- **포맷**: 투명 PNG
- **스타일**: 80년대 오락실 마퀴(marquee) 스타일. "협동 인형뽑기" 또는 "QWAS LAUGH" 문구, 네온 관이 빛나는 느낌, 핫핑크(#ff2e93) + 시안(#00e5ff) 양색 계열, 테두리에 작은 전구 장식 가능
- **사용처**: Lobby.tsx 상단, 게임 캐비닛 상단 레이블(선택)

### (선택) Asset #2 — CRT 프레임 오버레이 PNG
- **용도**: 게임 화면 전체를 아케이드 모니터처럼 감싸는 프레임
- **파일명**: `apps/client/public/crt-frame.png`
- **사이즈**: 1920 × 1080 px
- **포맷**: 투명 PNG (중앙은 완전 투명, 외곽만 그림)
- **스타일**: 두꺼운 아케이드 모니터 베젤(검정/짙은 회색), 모서리 나사, 좌측 아래에 "PLAYER 1" 레이블, 우측 아래에 "INSERT COIN" 라이트, 상단에 "CLAW MACHINE" 마퀴
- **사용처**: `App.tsx` 게임 뷰에 `<img>`로 오버레이

두 에셋 없이도 플랜은 완벽히 동작합니다 — 대안으로 CSS/Pixi로 유사 효과를 구현합니다(네온 텍스트, 베젤은 CSS `box-shadow` + gradient로 대체).

### 웹폰트 (에셋 아님)
Google Fonts **"Press Start 2P"** 추가 — 레트로 픽셀 텍스트용. `apps/client/index.html` `<head>`에 `<link>` 한 줄만 추가. 무료, 라이선스 문제 없음.

---

## Part 1 — Retro Arcade 비주얼 언어

모든 새 컴포넌트가 공유할 디자인 토큰을 `apps/client/src/theme/arcade.ts`(신규)에 정의합니다:

```ts
export const ARCADE = {
  // Neon palette
  NEON_PINK: 0xff2e93,
  NEON_CYAN: 0x00e5ff,
  NEON_PURPLE: 0xb46cff,
  NEON_GREEN: 0x4dff7c,
  NEON_YELLOW: 0xffd23f,
  NEON_AMBER: 0xffb000,
  // Deep background
  DEEP_NAVY: 0x0a0e2c,
  DARK_NAVY: 0x1a1a3d,
  MID_NAVY: 0x2d2d5c,
  // Text shadow glow (CSS strings)
  GLOW_PINK: '0 0 4px #ff2e93, 0 0 10px #ff2e93, 0 0 20px #ff2e93',
  GLOW_CYAN: '0 0 4px #00e5ff, 0 0 10px #00e5ff, 0 0 20px #00e5ff',
  GLOW_YELLOW: '0 0 4px #ffd23f, 0 0 10px #ffd23f, 0 0 20px #ffd23f',
  PIXEL_FONT: "'Press Start 2P', 'Courier New', monospace",
};
```

전역 팔레트를 딥 네이비 기반으로 전환합니다 (`apps/client/index.html` `body` background, `engine.ts:102` Pixi init background color `0xe8dff5` → `0x0a0e2c`).

---

## Part 2 — 인형뽑기 기계 내부 미로 (Phase1Scene)

**파일**: `apps/client/src/game/phase1/Phase1Scene.ts`

### 레이어 구조 재편 (기존 Container에 신규 Graphics 추가)

```
Container (this.container)
├─ bgGraphics           (기존) — 딥 네이비 바닥 + 네온 내부 프레임
├─ dollPileGraphics     (신규) — 배경에 흩뿌려진 작은 인형들 (50-100개)
├─ scanlineGraphics     (신규) — CRT 스캔라인 오버레이
├─ mazeGraphics         (기존) — 네온 벽 라인
├─ wallDollContainer    (신규) — 각 벽 세그먼트를 따라 배치된 작은 인형
├─ obstacleContainer    (기존) — 고스트/유령 인형
├─ dollContainer        (기존) — 타겟 인형
├─ dollBoxGraphics      (기존) — 타겟 박스
├─ clawBoxGraphics      (기존) — 집게 박스 (트레이닝 레벨)
├─ clawContainer        (기존) — 집게
├─ spotlightGraphics    (신규) — 상단 조명 원뿔
├─ fxContainer          (신규) — 파티클/플래시 효과
```

### `buildMaze(maze)` 재작성 (Phase1Scene.ts:43)

1. **캐비닛 내부 배경** (`bgGraphics`):
   - 기존 파스텔 배경 제거.
   - 딥 네이비 → 다크 네이비 세로 그라데이션 (여러 `roundRect` + 감소하는 alpha 레이어로 근사).
   - 외곽 프레임: 더블 네온 스트로크 — 바깥쪽 `NEON_PINK` 3px, 안쪽 `NEON_CYAN` 2px (기존 `roundRect` 위에 네온색 `setStrokeStyle` 덮어쓰기).
   - 코너 볼트는 시안 발광 원으로 변경.
   - 상단 마퀴 영역: `NEON_PINK` 배경 + "CLAW MACHINE" 텍스트 (Pixi `Text` 추가, 픽셀 폰트).
   - 하단에 **프라이즈 슈트 개구부** 그리기 (작은 검은 사각형 + 네온 테두리, 성공 애니메이션 시 여기로 인형이 낙하).

2. **배경 인형 더미** (`dollPileGraphics`) — 신규 메서드 `drawDollPile()`:
   - 시드 기반 난수로 50~100개 인형 위치/타입/회전/스케일 생성.
   - 각 인형: 기존 `drawDoll(typeIndex)` 호출 후 `scale.set(0.3~0.5)`, `rotation = random(-0.3, 0.3)`, `alpha = 0.25~0.45`.
   - 타일의 "뒤쪽/아래쪽"에 산재 배치 — 플레이 그리드 전체 바닥에 깔림.
   - 이 컨테이너는 `this.container.addChildAt(dollPileGraphics, 1)`로 bgGraphics 바로 위에 둠.

3. **네온 벽** (`mazeGraphics`) — 기존 로직 재사용하되 스트로크 변경:
   - 바깥 라인: `width: 6, color: NEON_CYAN, alpha: 0.9`
   - 안쪽 라인 (같은 경로 한 번 더 긋기): `width: 2, color: 0xffffff, alpha: 1` — 네온 내부 하이라이트 효과
   - `cap: 'round', join: 'round'`

4. **벽을 따라 붙은 작은 인형** (`wallDollContainer`) — 신규 메서드 `drawWallDolls(maze)`:
   - 각 벽 세그먼트(길이 = `cellSize`)마다 2~3개의 작은 인형을 선으로 따라 배치.
   - 사용자의 요구사항 "인형으로 된 미로"를 만족 — 벽이 인형에 파묻혀 보임.
   - 각 인형: `drawDoll(random 0-5)`, scale 0.5, rotation random. 벽 라인 바로 아래 또는 위 측에 오프셋.
   - 충돌 판정은 건드리지 않음 (기존 `checkMazeCollision`이 사용하는 벽 라인 그대로). 이 컨테이너는 순수 장식.

5. **CRT 스캔라인** (`scanlineGraphics`) — 신규 메서드 `drawScanlines(width, height)`:
   - 3px 간격으로 가로선 `rect(0, y, totalW, 1)` 반복.
   - `fill({ color: 0x000000, alpha: 0.18 })`
   - 크기는 맵 전체 덮음.

6. **상단 조명** (`spotlightGraphics`) — 신규 메서드 `drawSpotlight()`:
   - 삼각형 모양 그라데이션 (상단 중앙 → 하단 확산).
   - 근사: 여러 겹의 `rect` 또는 `ellipse`를 감소하는 alpha로 스택.
   - color: `NEON_CYAN`, alpha 0.08~0.02.

### `updateAnimations(frame)` 확장 (Phase1Scene.ts:183)

- 배경 인형 더미 전체에 sway 회전: `dollPileGraphics.rotation = Math.sin(frame * 0.005) * 0.01`
- 벽 인형 컨테이너 bob: `wallDollContainer.y = Math.sin(frame * 0.03) * 1`
- 스캔라인 살짝 이동 (CRT 인터레이스): `scanlineGraphics.y = (frame * 0.5) % 3 - 3`
- 스포트라이트 미세 펄스: alpha 변동 `0.08 + Math.sin(frame * 0.02) * 0.02`

---

## Part 3 — Phase 2 내부 (Phase2Scene)

**파일**: `apps/client/src/game/phase2/Phase2Scene.ts`

유사한 방식으로 업데이트:
- `bgGraphics`: 기존 파스텔 배경을 딥 네이비 + 수직 그라데이션으로 교체. 배경에 100~150개 작은 인형 산재 배치 (세로 경로 길이가 기므로 더 많이).
- `pathGraphics`: 벽 라인을 네온 핑크/시안 더블 스트로크로. 경로 안쪽은 `NEON_PURPLE` alpha 0.12로 살짝 발광.
- 양옆 벽을 따라 **작은 인형 라인**(drawWallDolls 유사 로직) 추가 — 좌우 벽에서 경로를 들여다보는 듯한 구도.
- 스캔라인 오버레이 추가.
- 카운트다운 표시용 `countdownText` 필드는 현재 사용 안 됨 — 제거 또는 픽셀 폰트로 교체.
- 경로 **하단 인형 위치에 "PRIZE" 레이블**을 픽셀 폰트 텍스트로 표시 (네온 앰버 글로우).

### 배경 낙하 파티클 (Phase2만)
- `updateAnimations(frame)`에 별자리 같은 작은 점들이 세로로 흐르는 효과 추가 (배경의 수직 움직임 보강). 10~20개 작은 `Graphics` circle, `y += 0.5~1.5`, 화면 밖으로 나가면 상단에서 재스폰.

---

## Part 4 — 로비 애니메이션 배경 (패럴랙스 인형)

**신규 파일**: `apps/client/src/ui/LobbyBackground.tsx`

로비 카드 뒤쪽에 전체화면 Pixi 캔버스를 띄워 움직이는 인형 배경을 렌더링합니다.

### 구조

```tsx
import React, { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { drawDoll } from '../game/sprites/doll.js';
import { ARCADE } from '../theme/arcade.js';

export function LobbyBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = new Application();
    let destroyed = false;
    (async () => {
      await app.init({
        resizeTo: ref.current ?? window,
        background: ARCADE.DEEP_NAVY,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      ref.current?.appendChild(app.canvas);
      buildLobbyScene(app);
    })();
    return () => { destroyed = true; try { app.destroy(true); } catch {} };
  }, []);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}
```

### `buildLobbyScene(app)` 로직

1. **배경 레이어** (`bgLayer`):
   - 딥 네이비 → 다크 네이비 수직 그라데이션 (`Graphics` 세로 스트라이프 스택).
   - 작은 별(cross 모양) 40개, 각각 `sin(frame * 0.02 + seed) * 0.5 + 0.5` alpha로 반짝임.

2. **패럴랙스 인형 3 레이어**:
   - **back** (10개): scale 0.5, alpha 0.5, vx 0.3
   - **mid** (12개): scale 0.75, alpha 0.75, vx 0.6
   - **front** (6개): scale 1.0, alpha 0.95, vx 1.0
   - 각 인형은 `drawDoll(random 0-5)` 생성, 화면 우측 밖 → 좌측 밖으로 드리프트, 화면 밖 나가면 우측에서 재스폰, y는 random, vy는 `sin(frame * 0.02 + seed) * 0.3` 바운스.
   - 회전도 약간: `rotation = sin(frame * 0.01 + seed) * 0.05`

3. **상단 "오락실 집게"** 데모:
   - 5초마다 화면 상단에서 큰 집게가 내려와 (translate y 0 → 300) 뒤에 올라감 (300 → 0), 간헐적으로 번쩍 이펙트.
   - 기존 `drawClaw()` 재사용, scale 2.0.
   - 상태 머신: `idle → descending → grabbing → ascending → idle` (각 구간 duration 고정).

4. **CRT 스캔라인 오버레이** (`Graphics`):
   - 3px 간격 가로 스트라이프, alpha 0.15.

5. **"INSERT COIN" 깜박임 텍스트** (Pixi `Text`, 픽셀 폰트):
   - 화면 하단 중앙, `NEON_YELLOW` 색, 알파 0.5→1.0 펄스 (1초 주기).

### `Lobby.tsx` 수정

- `containerStyle`의 단색 그라데이션 제거, `background: 'transparent'`, `position: 'relative'`.
- 최상단에 `<LobbyBackground />` 렌더 (`zIndex: 0`).
- `<div style={cardStyle}>`에 `zIndex: 1, position: 'relative'` 추가.
- `cardStyle` 배경을 반투명 네이비 + 네온 테두리로:
  - `background: 'rgba(10, 14, 44, 0.82)'`
  - `border: '2px solid #00e5ff'`
  - `boxShadow: '0 0 20px #00e5ff, 0 0 40px #ff2e93, inset 0 0 15px rgba(0,229,255,0.1)'`
  - `backdropFilter: 'blur(4px)'`
- 제목 `<h1>`: 픽셀 폰트, `color: '#fff'`, `textShadow: ARCADE.GLOW_PINK`, fontSize 32px, letter-spacing 2px.
- 모든 버튼: 네온 버튼 스타일 (투명 배경 + 네온 시안 테두리 + 픽셀 폰트 + 호버 시 글로우 증가). Press Start 2P는 한글 미지원이므로 본문(닉네임 입력/플레이어 목록)은 기존 시스템 폰트 유지, 제목과 영문/숫자 표시에만 픽셀 폰트 적용.
- 접속 코드 디스플레이: 네온 테두리 + 시안 글로우 텍스트.

---

## Part 5 — 공통 애니메이션 유틸리티

**신규 파일**: `apps/client/src/game/animations/particles.ts`

재사용 가능한 Pixi 파티클 시스템:

```ts
export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  rotation: number; vr: number;
  life: number; maxLife: number;
  color: number;
  size: number;
  gravity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private graphics: Graphics;
  constructor(private container: Container) {
    this.graphics = new Graphics();
    container.addChild(this.graphics);
  }
  emitConfetti(x: number, y: number, count = 50) { /* ... */ }
  emitSparkles(x: number, y: number, count = 20) { /* ... */ }
  emitStars(x: number, y: number, count = 15) { /* ... */ }
  emitFlash(x: number, y: number) { /* ... */ }
  update(dt: number) { /* decrement life, update physics, redraw */ }
  isActive(): boolean { return this.particles.length > 0; }
  clear() { this.particles.length = 0; this.graphics.clear(); }
}
```

- **confetti**: 랜덤 neon 색상 3~6px 사각형, 중력 `0.15`, 수명 120 frames, 약간 회전.
- **sparkles**: 4점 픽셀 별(작은 cross Graphics), 중력 없음, 빠르게 퇴색.
- **stars**: 확산 방향 속도, 중력 없음, 중간 수명.
- **flash**: 화면 전체 흰색 원이 확장하며 alpha 감소 (1 frame `Graphics.circle` 재생성).

**신규 파일**: `apps/client/src/game/animations/transitions.ts`

Phase 전환 시각 효과:

```ts
export class TransitionFX {
  constructor(private stage: Container, private screenW: number, private screenH: number) {}
  crtPowerOff(): Promise<void>   // 화면이 수평선으로 축소 → 점
  crtPowerOn(): Promise<void>    // 점 → 수평선 → 전체 확장
  flashBang(color = 0xffffff): Promise<void>  // 흰/색 플래시 0.15초
  screenShake(duration: number, intensity: number): void  // stage 위치 흔들기
  cameraZoom(from: number, to: number, duration: number): Promise<void>  // worldContainer scale 애니메이션
  glitchLines(duration: number): Promise<void>  // 랜덤 수평 스트립이 좌우로 틀어지는 효과
}
```

`GameEngine`에 `private fx: TransitionFX` 필드 추가, `init()`에서 `new TransitionFX(this.app.stage, ...)` 생성.

---

## Part 6 — 엔진 레벨 연출 훅

**파일**: `apps/client/src/game/engine.ts`

### Phase 1 시작 (`setupLevel` / `resetPhase1`)
- `setupLevel`에서 메이즈 빌드 직후 `fx.crtPowerOn()` 호출 → 화면이 점에서 확장.
- 이어서 `cameraZoom(1.3, 1.0, 600ms)` 줌인.
- HUD 쪽에 "READY!" → "GO!" 신호를 보내기 위해 `lastResult` 또는 신규 필드 `introFlash: boolean` 추가, HUD가 이를 받아 풀스크린 픽셀 텍스트 오버레이를 1.2s 표시.
- 집게 낙하 애니메이션: claw container y를 `-100`에서 실제 위치로 500ms tween (requestAnimationFrame 기반 수동 tween 또는 `updateAnimations`에서 `introFrame < 30`일 때 오프셋).

### Phase 1 Grab 시도 (`attemptPhase1Grab`)
- 성공/실패 판정 직전:
  - `fx.flashBang(0xffffff)` 짧은 화면 플래시
  - `fx.screenShake(200ms, 4px)` 흔들기
  - `particles.emitSparkles(clawPos.x, clawPos.y, 20)` 집게 위치에 반짝임 버스트
- 성공 시 추가:
  - `particles.emitStars(clawPos.x, clawPos.y, 10)`
  - 집게 "꽉 잡는" 스케일 펄스: claw `scale.set(1.15)` → `1.0` over 300ms

### Phase 1 → Phase 2 전환 (`transitionToPhase2`)
- setTimeout 2500ms 대신 안무된 시퀀스:
  1. 0ms: HUD "PHASE 1 CLEAR!" 오버레이 (이미 있음, 픽셀 폰트로 교체)
  2. 1500ms: `fx.crtPowerOff()` 화면 squish
  3. 2000ms: 실제 `startPhase2()` 호출
  4. 2100ms: `fx.crtPowerOn()` 다음 씬 등장

### Phase 2 카운트다운 (`startPhase2` 내부 countdownInterval)
- 각 카운트 틱 시점에 `fx.flashBang` 짧게 + `screenShake(100ms, 2px)`
- "GO!" 순간: `particles.emitConfetti(centerX, centerY, 30)` + 카메라 펀치 줌 `fx.cameraZoom(0.95, 1.0, 200ms)`

### Phase 2 Grab (`attemptPhase2Grab`)
- 성공/실패 공통: flash + shake + sparkles (위와 동일 패턴)

### 서스펜스 (`startSuspense`)
- 기존 `runSuspenseAnimation`의 phase 콜백에 훅 추가 — `drumroll` 진입 시 `fx.screenShake(2000ms, 3px)` + `fx.glitchLines(2000ms)` 시작.
- `reveal` 진입 시 화이트 플래시.

### 결과: 성공 (`startSuspense` → `lastResult='success'`)
- Pixi 레이어에서 집게 이동 시퀀스 (한 번에 안무):
  1. 집게가 인형 위치에 강하게 스케일 펄스 (0.5s)
  2. 집게가 인형을 "잡고" 하단 프라이즈 슈트 방향으로 이동 (1.0s) — claw + doll 컨테이너를 동일 위치로 tween
  3. 슈트 앞에서 집게 오픈, 인형 낙하 (0.5s) — doll 컨테이너 y → 슈트 위치, rotation 펄스
  4. 슈트로 빨려 들어가며 사라짐 (alpha → 0)
- 동시에 `particles.emitConfetti(screenCenter, 80)` + `particles.emitStars(screenCenter, 30)`
- `fx.flashBang(NEON_YELLOW)` 골드 플래시
- `fx.screenShake(500ms, 6px)`
- HUD: 기존 "성공!" 팝업을 픽셀 폰트 "JACKPOT!!" 로 교체 + 더 큰 글로우 + `scale 0→1.2→1.0` 스프링 애니메이션
- setTimeout 2000ms → 2500ms로 증가 (연출 시간 확보)

### 결과: 실패 (`startSuspense` → `lastResult='fail'`)
- Pixi:
  1. 집게가 인형을 "잡으려다 미끄러짐" — claw는 살짝 스케일 펄스하고, doll은 y += 10 튕김 + rotation random
  2. 집게 droop: claw rotation -0.2로 기울임, alpha 0.7
- `fx.flashBang(0xff2e93)` 짧은 레드 플래시
- `fx.glitchLines(800ms)` 더 강한 글리치
- `fx.screenShake(400ms, 8px)`
- HUD: "실패..." 를 "MISS!!" 픽셀 폰트로, 레드 글로우 + shake 애니메이션, 드롭다운 모션 추가

### 멀티플레이 모드 (`applyServerState`, `startRemoteSuspense`)
- 동일한 `fx.*`/`particles.emit*` 호출을 동일한 훅 위치에 넣어 싱글/멀티 양쪽에서 연출이 재생되도록 함.

---

## Part 7 — HUD 레트로 리디자인 (HUD.tsx)

**파일**: `apps/client/src/ui/HUD.tsx`

### CSS keyframes 확장 (현재 block: HUD.tsx:388)

기존 `pop-in`, `pulse`, `spin`, `shake` 유지하고 추가:

```css
@keyframes neon-flicker {
  0%, 100% { opacity: 1; }
  92% { opacity: 1; }
  93% { opacity: 0.3; }
  95% { opacity: 1; }
  97% { opacity: 0.6; }
}
@keyframes stamp-in {
  0% { transform: scale(3) rotate(-15deg); opacity: 0; }
  60% { transform: scale(0.9) rotate(2deg); opacity: 1; }
  80% { transform: scale(1.05) rotate(-1deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes slide-in-left  { from { transform: translateX(-120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slide-in-right { from { transform: translateX(120%);  opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes bounce-in {
  0%   { transform: scale(0) translateY(-100px); opacity: 0; }
  50%  { transform: scale(1.3) translateY(20px); opacity: 1; }
  70%  { transform: scale(0.9) translateY(-10px); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes glitch {
  0%, 100% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(2px, -1px); }
  60% { transform: translate(-1px, -2px); }
  80% { transform: translate(2px, 1px); }
}
@keyframes confetti-fall {
  to { transform: translateY(100vh) rotate(720deg); }
}
@keyframes drop-in {
  0% { transform: translateY(-200%) rotate(-20deg); opacity: 0; }
  60% { transform: translateY(20px) rotate(5deg); opacity: 1; }
  100% { transform: translateY(0) rotate(0); }
}
```

### CRT 스캔라인 전체 오버레이

HUD 최상단에 항상 렌더되는 `<div>`:

```tsx
<div style={{
  position: 'absolute', inset: 0, pointerEvents: 'none',
  background: 'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
  mixBlendMode: 'multiply',
  zIndex: 50,
}} />
```

그리고 비네팅용 라디얼 그라디언트 `<div>`를 하나 더 추가 (모서리 어둡게).

### 상단 바 (pill)

- `background`: `rgba(10, 14, 44, 0.85)`
- `border`: `1px solid #00e5ff`
- `color`: `#00e5ff`
- `fontFamily`: 픽셀 폰트 (영문/숫자), 한글 라벨이 있을 경우 폴백 시스템 폰트.
- `textShadow`: `ARCADE.GLOW_CYAN`
- 레벨 표시 "Lv.5" → "LV 05" (2자리 패딩, 레트로 느낌)

### Phase 전환 오버레이 (phase1_to_phase2, phase2_to_suspense)

- 배경: `rgba(10,14,44,0.92)` + 네온 핑크 테두리 + 글로우
- 제목: 픽셀 폰트 "PHASE 1 CLEAR!" / "PHASE 2 CLEAR!", 노란 네온 글로우, `stamp-in` 애니메이션
- 확률 표시: 큰 픽셀 숫자, 시안 글로우
- `probBoxStyle`: 어두운 반투명 + 네온 테두리

### Phase 2 Countdown 오버레이

- 숫자 `3`, `2`, `1`: 픽셀 폰트 96px, 네온 색상 사이클(핑크→시안→옐로우), `bounce-in` 애니메이션
- "GO!": 픽셀 폰트 120px, 풀 레인보우 애니메이션 (CSS `background: linear-gradient` + `background-clip: text`), `stamp-in` + `neon-flicker`
- 역할 카드: `slide-in-left` / `slide-in-right` 애니메이션

### 서스펜스 drumroll

- 기존 shake에 `glitch` 추가
- 숫자: 거대한 픽셀 폰트 + `glitch` + `pulse`
- 배경에 스캔라인 깜박임 증가 (추가 `neon-flicker` div)

### 결과 팝업 (성공/실패)

**성공**:
- 배경: 어두운 네이비 + 금색 네온 테두리 + 강한 글로우
- 텍스트 "JACKPOT!!" 픽셀 폰트 72px, 레인보우 gradient-text, `bounce-in` → `neon-flicker`
- 서브텍스트 "확률 XX%로 인형을 뽑았습니다!" (기존 유지, 픽셀 폰트)
- **CSS 컨페티**: 팝업 주변에 50개 `<div>` 파티클, 각각 `confetti-fall` 애니메이션 (Pixi 파티클과 별도, CSS로도 하나 더 얹음)
- setTimeout 3000ms → 3500ms

**실패**:
- 배경: 어두운 네이비 + 네온 핑크 테두리
- 텍스트 "MISS!!" 픽셀 폰트 72px, 레드 글로우, `drop-in` → `glitch` 반복
- 서브텍스트 기존 유지 + 흔들림

### 조작법 패널 (keyboard controls)

- 배경: 어두운 반투명 + 네온 시안 테두리
- `<Key>` 컴포넌트: 네온 박스 스타일, 픽셀 폰트 유지

---

## Part 8 — App 레벨 통합

**파일**: `apps/client/src/App.tsx`

- 글로벌 배경 전환: `index.html`의 body background를 `#0a0e2c`로.
- (선택적 에셋 #2 제공 시) 게임 뷰 최외곽에 `<img src="/crt-frame.png" style="position:absolute;inset:0;pointerEvents:none;zIndex:100" />` 오버레이 추가.
- 픽셀 폰트 로드: `index.html` `<head>`에 `<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">` 추가.
- 기존 pause/connection-lost 오버레이도 픽셀 폰트 + 네온 톤으로 동화.

---

## File Changes Summary

### 신규 파일 (6개)
1. `apps/client/src/theme/arcade.ts` — 팔레트/글로우/폰트 토큰
2. `apps/client/src/ui/LobbyBackground.tsx` — 패럴랙스 인형 Pixi 배경
3. `apps/client/src/game/animations/particles.ts` — 파티클 시스템 (confetti/sparkles/stars/flash)
4. `apps/client/src/game/animations/transitions.ts` — CRT 전환/셰이크/플래시/글리치/카메라 줌
5. `apps/client/src/game/sprites/dollPile.ts` — 시드 기반 배경 인형 더미 생성 (`buildDollPile(width, height, seed): Graphics`)
6. `apps/client/src/game/sprites/wallDolls.ts` — 벽 세그먼트를 따라 배치된 작은 인형 컨테이너 생성 (`buildWallDolls(maze): Container`)

### 수정 파일 (7개)
1. `apps/client/index.html` — body background 딥 네이비 + Google Fonts Press Start 2P `<link>`
2. `apps/client/src/App.tsx` — (선택) CRT 프레임 오버레이, pause/connection 오버레이 톤 동화
3. `apps/client/src/ui/Lobby.tsx` — `LobbyBackground` 렌더, 카드/버튼/타이틀 네온 리디자인
4. `apps/client/src/ui/HUD.tsx` — 신규 keyframes, 스캔라인 오버레이, 픽셀 폰트 적용, 결과 팝업 레트로 연출, 컨페티 `<div>` 파티클
5. `apps/client/src/game/engine.ts` — `TransitionFX`/`ParticleSystem` 인스턴스화, 각 phase 훅에 연출 호출, Pixi 배경색 `0x0a0e2c`
6. `apps/client/src/game/phase1/Phase1Scene.ts` — 레이어 확장, `drawDollPile`/`drawWallDolls`/`drawScanlines`/`drawSpotlight` 연동, 네온 스트로크
7. `apps/client/src/game/phase2/Phase2Scene.ts` — 동일한 레이어 확장 (배경 인형 + 네온 벽 + 스캔라인), "PRIZE" 픽셀 레이블

### 참조만 (수정 X)
- `apps/client/src/game/sprites/doll.ts` — `drawDoll(typeIndex)` 재사용 (벽/배경/로비에 작은 스케일로)
- `apps/client/src/game/sprites/claw.ts` — `drawClaw()` 재사용 (로비 대형 데모용)
- `apps/client/src/game/animations/suspense.ts` — 로직은 유지, 연출 훅은 engine에서 추가

---

## Verification

1. **빌드 확인**
   ```
   cd /Users/jaesunghan/qwas-laugh/apps/client && pnpm dev
   ```
   - 콘솔 에러 없이 로비 렌더링
   - LobbyBackground Pixi 캔버스 60fps 유지 확인

2. **로비 체크리스트**
   - 패럴랙스 인형 3 레이어가 좌측으로 드리프트
   - "INSERT COIN" 깜박임
   - 상단 집게가 5초 주기로 descending/ascending
   - 카드 네온 테두리/글로우 시각 확인
   - "로컬 싱글플레이" 버튼 클릭 → 게임 진입

3. **Phase 1 체크리스트**
   - CRT power-on 연출로 화면 진입
   - 딥 네이비 배경 + 배경 인형 더미 보임
   - 네온 미로 벽 + 벽을 따라 붙은 작은 인형
   - 스캔라인 오버레이 전체
   - 집게 이동 중 카메라 부드러운 팔로우
   - 스페이스 또는 그랩 버튼 → flash/sparkle/shake 연출

4. **Phase 전환 체크리스트**
   - 성공 grab → 화이트 플래시 + "PHASE 1 CLEAR!" 픽셀 텍스트 stamp-in
   - CRT power-off → Phase 2 CRT power-on
   - Phase 2 카운트다운 3-2-1-GO 네온 사이클 + 역할 카드 slide-in

5. **Phase 2 체크리스트**
   - 하강 경로 배경 딥 네이비 + 인형
   - "PRIZE" 픽셀 레이블 하단
   - 자동 grab → 플래시/셰이크/파티클
   - "PHASE 2 CLEAR!" stamp-in

6. **서스펜스 체크리스트**
   - showA/showB 픽셀 숫자 stamp-in
   - calculating 진행바
   - drumroll 글리치 + 스크린 셰이크 + 숫자 펄스
   - reveal 화이트 플래시

7. **결과 체크리스트 — 성공**
   - 집게가 인형 잡고 프라이즈 슈트로 이동 (Pixi 애니메이션)
   - 금색 플래시 + 큰 스크린 셰이크
   - Pixi 컨페티/스타 버스트 + CSS 컨페티 낙하
   - "JACKPOT!!" 픽셀 텍스트 bounce-in + 레인보우 글로우
   - 다음 레벨 자동 진행

8. **결과 체크리스트 — 실패**
   - 집게가 인형에서 미끄러짐 연출
   - 핑크 플래시 + 강한 글리치
   - "MISS!!" drop-in + 지속 흔들림
   - 레벨 리셋

9. **멀티플레이어 (/devtest)**
   ```
   http://localhost:5173/devtest
   ```
   - 4개 클라이언트 창에서 동일한 연출이 동기화되어 재생되는지 확인
   - `applyServerState`/`startRemoteSuspense` 경로에서도 `fx.*`/`particles.emit*` 호출이 이뤄지는지

10. **퍼포먼스 체크**
    - DevTools Performance 탭에서 60fps 유지 (배경 인형 100개, 파티클 최대 100개 동시)
    - 저성능 기기 대비: 파티클 풀 사이즈 상한, 글로우는 CSS text-shadow로 GPU 부담 최소

11. **선택적 에셋 수령 시**
    - `apps/client/public/marquee-logo.png` 제공 → Lobby 상단 `<img>` 교체
    - `apps/client/public/crt-frame.png` 제공 → App 최외곽 오버레이 활성화

---

## Implementation Order (제안)

1. **기반**: `arcade.ts` 토큰 + `index.html` 폰트/배경 업데이트
2. **유틸리티**: `particles.ts` + `transitions.ts` (독립 테스트 가능)
3. **절차적 스프라이트**: `dollPile.ts` + `wallDolls.ts`
4. **Phase1Scene / Phase2Scene**: 신규 스프라이트/스캔라인 연동
5. **GameEngine**: 연출 훅 통합 (로컬 모드 우선, 이후 remote 경로)
6. **HUD.tsx**: keyframes 추가 + 픽셀 폰트 + 결과 팝업 재작성
7. **LobbyBackground.tsx** + `Lobby.tsx` 리디자인
8. **QA 라운드**: 위 Verification 1~10 전체 체크
9. **(선택) 에셋 통합**: 사용자 제공 PNG가 도착하면 `<img>` 삽입

---

## 열린 의사결정 (구현 단계에서 확정)

- **한글 vs 영문 텍스트**: Press Start 2P는 한글 미지원. 제목/결과 텍스트는 영문("JACKPOT!!", "MISS!!", "PHASE CLEAR!", "GO!")으로 대담하게, 설명/닉네임 등 본문은 시스템 폰트 유지. 사용자가 한글 우선을 원하면 네온 글로우 + 시스템 폰트 조합으로 대체 가능.
- **파티클 상한**: 초기값 confetti 80, sparkles 20, stars 30. 퍼포먼스 이슈 시 50/15/20으로 낮춤.
- **컨페티 CSS vs Pixi**: 기본은 Pixi(동적). CSS 컨페티는 결과 팝업 오버레이 안에 추가로 얹음 (이중 연출).
