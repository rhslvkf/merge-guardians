# Merge Guardians

머지(합성) × 레인 디펜스 2D HTML5 게임. 데스크톱 / 모바일 브라우저용이며 Poki, CrazyGames 배포를 목표로 합니다.

**▶ [플레이 (GitHub Pages)](https://rhslvkf.github.io/merge-guardians/)**

> 현재 상태: **Phase 4 (모디파이어 + 3택 업그레이드)**. 웨이브마다 모디파이어가 붙고,
> 클리어할 때마다 3택 업그레이드를 고릅니다. 밸런스 튜닝은 Phase 5에서 합니다.
> 진행 상황은 [docs/PROGRESS.md](docs/PROGRESS.md)를 참고하세요.

---

## 게임 개요

| | |
|---|---|
| 장르 | 머지 × 레인 디펜스 |
| 플랫폼 | 데스크톱 + 모바일 브라우저 |
| 세션 | 1 스테이지 3~5분, 즉시 재도전 |
| 보드 | 7열 × 8행 (상단 4행 적 구역 / 하단 4행 아군 구역) |

**핵심 훅** — 한 화면 안에서 유닛을 합성해 방어선을 유지하고, 웨이브를 클리어할 때마다 3택 업그레이드로 매 판을 다르게 만든다.

### 코어 루프

1. 에너지를 소모해 T1 유닛을 소환 → 아군 구역 랜덤 빈 칸에 배치
2. 같은 티어 유닛 2개를 드래그해 겹치면 다음 티어 1개로 합성 (합성 시 풀피 → 합성이 곧 회복)
3. 적이 열을 따라 내려오고, 유닛은 자기 열 위쪽으로 자동 사격
4. 적이 유닛 칸에 도달하면 정지 후 근접 공격, 유닛이 파괴되면 전진 재개
5. 적이 최하단을 통과하면 라이프 -1, 0이 되면 게임오버
6. 웨이브 전멸 → 3택 업그레이드 → 다음 웨이브
7. 5웨이브(마지막은 보스) 클리어 → 스테이지 클리어

---

## 기술 스택

- **Phaser 3.90.0** (v4 사용 금지)
- TypeScript + Vite
- 물리 엔진 미사용 — 그리드 기반 로직
- 외부 런타임 의존성 없음 (포털 SDK 스크립트 제외)
- `Phaser.Scale.RESIZE` + `CENTER_BOTH`, `pixelArt` / `roundPixels` on, `antialias` off

---

## 시작하기

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 타입체크 + 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 로컬 확인
npm run typecheck  # tsc --noEmit
npm run simulate   # 밸런스 시뮬레이터 (Phase 5에서 구현)
```

Node 22 기준으로 개발 중입니다.

---

## 프로젝트 구조

```
src/
  config/     balance.json, waves.json, upgrades.json, constants.ts
  i18n/       en.json + t() — 모든 표시 문자열은 키로 접근
  core/       Grid, MergeSystem, CombatSystem, WaveRunner, EnergySystem, RunState
  entities/   Unit, Enemy, Projectile
  scenes/     Boot, Preload, Menu, Game, UI, Result
  services/   LayoutService, SaveService, AudioService, portal/*
  ui/         Hud, UpgradePanel, GameOverPanel, Button
tools/        simulate.ts (Node 단독 실행 밸런스 시뮬레이터)
public/assets/
```

### 밸런스 수치는 코드에 없습니다

티어 DPS, 적 체력 공식, 에너지 회복량, 업그레이드 효과는 전부 `src/config/*.json`에 있습니다. 수치를 바꿀 때는 코드가 아니라 이 파일들만 수정합니다.

| 파일 | 내용 |
|---|---|
| `balance.json` | 티어 DPS(T1~T8), 합성 배율, 에너지, 적 타입 5종, 모디파이어, 영구 업그레이드 |
| `waves.json` | 스테이지/웨이브 구성 (현재 스테이지 1~3) |
| `upgrades.json` | 3택 업그레이드 풀 9종과 등장 조건 |

---

## 문서

| 문서 | 용도 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | 고정된 설계 명세. 보드 구조, 전투 규칙, 적 수치, 업그레이드 풀, 포털 SDK 의무사항 |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Phase 1~8 체크리스트 |
| [CLAUDE.md](CLAUDE.md) | 코딩 규칙 10개와 AI 에이전트 작업 지침 |

코드를 수정하기 전에 `docs/SPEC.md`를 먼저 읽으세요. 명세와 코드가 충돌하면 명세가 우선이며, 명세 자체를 바꿔야 한다면 같은 커밋에서 `docs/SPEC.md`를 함께 수정합니다.

---

## 배포

### GitHub Pages (개발 중 확인용)

`main` 브랜치에 푸시하면 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)이 빌드 후 자동 배포합니다. **저장소 설정을 손댈 필요는 없습니다** — `configure-pages`에 `enablement: true`를 줘서, 워크플로가 `pages: write` 권한으로 Pages 사이트를 직접 생성합니다.

- 진행 상황과 배포 URL은 **Actions** 탭에서 확인
- 수동으로 돌리려면 Actions → *Deploy to GitHub Pages* → **Run workflow**
- 빌드는 `npm run build`(= `tsc --noEmit && vite build`)라 타입 에러가 나면 배포가 실패합니다

Vite `base`가 `'./'`로 설정되어 있어 `/merge-guardians/` 같은 하위 경로에서도 에셋 경로가 깨지지 않습니다.

> 워크플로는 `main` 외에 현재 스캐폴딩 브랜치에서도 트리거되도록 되어 있습니다. `main`으로 머지한 뒤에는 워크플로의 해당 브랜치 줄을 지우세요.

### 포털 제출

Phase 8에서 준비합니다. 포털은 zip을 임의 경로에 서빙하므로 모든 에셋 경로는 상대 경로를 유지해야 합니다.

- **Poki** — `gameplayStart()`는 로드 시점이 아닌 플레이어의 첫 입력에 발생해야 하며, `gameplayStart()` / `gameplayStop()`이 연속 2회 발생하면 리젝됩니다.
- **CrazyGames** — HTML5 SDK v3. SDK 미연동(Basic Launch) 상태에서도 게임이 정상 동작해야 합니다.

자세한 규칙은 [docs/SPEC.md](docs/SPEC.md) 10번 항목에 있습니다.
