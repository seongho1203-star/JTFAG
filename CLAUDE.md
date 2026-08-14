# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 사용자 지침 (User Preferences)

- **한국어로 응답할 것.** 저장소 소유자는 한국어로 소통한다.
- **수정사항은 `main` 브랜치에 직접 커밋 & 푸시한다.** 별도 작업 브랜치나 PR을 만들지 않는다.
  단, 사용자가 특정 건에 대해 "브랜치로 해줘"라고 명시하면 그때만 브랜치를 사용한다.
- 이 저장소는 GitHub Pages로 배포되므로 `main` 푸시는 곧 실서비스 반영이다. 푸시 전에 변경 결과를 확인할 것.

## 프로젝트 개요

JTFAG 골프 모임(4인)의 라운드 스코어 · 상금 정산 · 등급/뱃지 통계를 관리하는 모바일 우선 웹앱.
빌드 도구, 패키지 매니저, 테스트 프레임워크가 **없다.** 정적 파일을 그대로 GitHub Pages가 서빙한다.

## 개발 명령어

빌드/설치 단계 없음. 로컬 확인은 정적 서버로 띄운다 (`file://`로 열면 Supabase 요청이 실패한다).

```bash
python3 -m http.server 8000        # http://localhost:8000
```

변경한 UI를 눈으로 확인해야 할 때는 헤드리스 Chromium으로 스크린샷을 찍는다.
브라우저는 이미 설치돼 있다 (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`). `playwright install`을 실행하지 말 것.

## 아키텍처

### 스크립트 로딩 순서가 곧 의존성 그래프

모듈 시스템이 없다. 모든 함수와 상태가 전역(window)에 올라가고, `index.html` 하단에서 고정된 순서로 로드된다:

```
stats.js → api.js → calc.js → ui.js
```

- **`stats.js`** — 홀 단위 스코어 기록. DB에 없는 유일한 데이터로, 스코어카드 사진을 판독해 갱신한다.
  `ROUND_HOLES`(원본, 차수별 18홀 파+파대비타수) → `ROUND_STATS`(차수별 집계) → `CUMULATIVE_STATS`(누적 총합)로
  **자동 계산**된다. 뒤 두 개는 직접 고치지 말 것. 새 차수는 `ROUND_HOLES`에만 추가하면 된다.
  판독 검산법: `par + rel`의 18홀 합계가 `appData.scores[이름][차수]`의 그로스와 일치해야 한다.
- **`api.js`** — Supabase 클라이언트, 전역 상태(`appData`), 상수(`golfers`, `RANK_CONFIG`, `COURSE_GEO`), Open-Meteo 날씨 조회.
- **`calc.js`** — 순수 계산 계층. 정산/등급/핸디캡을 산출해 `golfer*Map` 전역 변수들에 채운다.
- **`ui.js`** — DOM 렌더링, 모달, 이벤트 핸들러. 진입점(`DOMContentLoaded` → `fetchFromSupabase()`)이 여기 있다.

새 파일을 추가하면 `index.html`의 `document.write` 블록에도 등록해야 한다.

### 데이터 흐름

전체 앱 상태가 Supabase 테이블 `jtfag_league`의 **단일 행(`id = 1`)** 의 `payload` JSON 컬럼 하나에 통째로 들어 있다.

```
fetchFromSupabase()  →  appData 전역 변수  →  renderAll()  →  DOM
                                  ↑                              │
                                  └──── syncToSupabase(appData) ←┘  (사용자 입력 시)
```

- 부분 업데이트가 없다. 값 하나만 바꿔도 `appData` 전체를 upsert한다.
- 상태를 변경하는 함수는 **반드시** `saveState()` (실행취소 스택, 최대 10개) → 값 수정 → `syncToSupabase(appData)` 순서를 지킨다.
- `renderAll()`이 렌더 파이프라인 전체를 돌린다: `renderTable` → `calculateAndRender` → `renderMoneyTable` → `forceTableReflow` → `renderStorageUsage` → `checkAndGreetUser`.
- 데이터 구조 기본형은 `getDefaultData()` (api.js) 참조. 배열들(`courses`, `scores[name]`, `roundMoney`, `roundPhotos`)은 모두 **차수(round) 인덱스로 정렬**되어 있어 길이가 `totalRounds`와 일치해야 한다. 차수를 추가/삭제하는 `addRound()` / `removeRound()`가 이 배열들을 함께 관리한다.

### 정산 · 등급 규칙

`processAllRoundSettlements()` (calc.js)가 핵심 로직이다.

- 차수별 손익 = `roundMoney[r][name].end - start`, 이를 누적해 순위를 매긴다.
- 순위별 벌금은 `RANK_CONFIG` (api.js)에 고정: 독수리 0 / 매 -40,000 / 학 -60,000 / 참새 -100,000원.
- 핸디캡은 **모든 골퍼의 스코어가 채워진 가장 최근 연속 2개 차수**를 자동 선택해 평균으로 산출한다 (`calculateAndRender()`).
- 뱃지 판정은 `getGolferBadgesArray()`. 싱글(79타 이하) 등 일부는 스코어에서, 버디/파 최다 등은 `CUMULATIVE_STATS`에서 나온다.

### 인증

`ADMIN_PASSWORD` (api.js)는 클라이언트에 평문 상수로 있고, 사용자 식별은 `localStorage`의 `jtfag_my_name`에 의존한다. 보안 경계가 아니라 모임 내부용 실수 방지 장치다. 실제 접근 제어는 Supabase RLS에 달려 있다.

## 주의사항

- **`.money-input` 클래스를 재사용하지 말 것.** 상금 테이블 셀 전용이라 `max-width: 68px !important; height: 26px !important`가 걸려 있어, 다른 곳에 붙이면 입력칸이 찌그러진다.
- CSS/JS는 `document.write`로 `?ver=` 랜덤 쿼리를 붙여 캐시를 우회한다. 로컬에서 안 바뀌어 보이면 강력 새로고침(`Ctrl+Shift+R`)을 시도한다.
- HTML 태그에 `style` 속성을 두 번 쓰면 브라우저가 두 번째를 통째로 무시한다. 인라인 스타일을 추가할 때 기존 `style` 속성이 이미 있는지 확인할 것.
- 사진은 base64로 인코딩되어 `appData.roundPhotos`에 그대로 저장된다. 행 전체를 매번 전송하므로 용량 증가에 민감하다 (`renderStorageUsage()`가 현재 사용량을 표시한다).
- UI 문구, 골퍼 이름, 등급명이 모두 한국어다. 문자열을 다룰 때 영어로 바꾸지 말 것.
