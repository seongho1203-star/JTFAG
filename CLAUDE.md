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
  판독 검산법: `par + rel`의 18홀 합계가 그 차수의 그로스가 되어야 한다.
- **타수는 사람이 입력하지 않는다.** 화면의 타수 칸은 전부 잠겨 있고(`readonly`),
  `syncScoresFromHoles()`(ui.js)가 `grossFromHoles()`로 계산한 값을 `appData.scores`에 채운다.
  즉 **`ROUND_HOLES`에 차수를 추가하고 푸시하면 표의 타수가 저절로 채워진다.**
  홀 기록이 있는 차수는 관리자 메뉴로도 못 고친다 — 고쳐 봐야 다음 접속 때 되돌아가기 때문이다.
  홀 기록이 아직 없는 차수만 관리자 메뉴 → `✏️ 타수 직접 수정`으로 잠시 열 수 있다.
  핸디캡·정산·평균은 예전처럼 `appData.scores`를 읽으므로 계산 쪽은 손댈 필요가 없다.
- **`api.js`** — Supabase 클라이언트, 전역 상태(`appData`), 상수(`golfers`, `RANK_CONFIG`, `COURSE_GEO`), Open-Meteo 날씨 조회.
- **`calc.js`** — 순수 계산 계층. 정산/등급/핸디캡을 산출해 `golfer*Map` 전역 변수들에 채운다.
- **`ui.js`** — DOM 렌더링, 모달, 이벤트 핸들러. 진입점(`DOMContentLoaded` → `fetchFromSupabase()`)이 여기 있다.

새 파일을 추가하면 `index.html`의 `document.write` 블록에도 등록해야 한다.

### 라운드 알림 (푸시)

정적 사이트에는 "정해진 시각에 도는 것"이 없어, 발송을 GitHub Actions가 맡는다.

```
sw.js (서비스워커)  ←푸시←  GitHub Actions (매일 KST 09시)
      ↑구독                        ↓ 읽기
  api.js: subscribeToPush()   Supabase: jtfag_league.payload.nextRoundISO
      ↓                                 push_subscriptions 테이블
  push_subscriptions 테이블
```

- 발송 조건은 `scripts/send-reminder.js`가 판단한다. 오늘(KST)과 `nextRoundISO`의 차이가
  설정한 날 중 하나와 같을 때만 보내고, 아니면 아무것도 안 한다. 워크플로는 하루 한 번만 도므로
  **여러 날을 설정해도 하루에 두 번 가지는 않는다.**
- **알림 시점과 문구는 앱의 관리자 메뉴 → 알림 설정**에서 정하고 `payload.notifySettings`에 저장된다.
  `daysBefore`는 **배열**이다 — `[3, 0]`이면 3일 전과 당일, 두 번 간다. `0`이 당일.
  예전 payload에는 숫자 하나로 들어 있어, `normalizeDaysBefore()`가 두 형식을 모두 받는다.
  이 함수와 `DEFAULT_NOTIFY_SETTINGS`는 **api.js와 발송 스크립트 양쪽에 같은 내용으로 있다 —
  한쪽만 고치지 말 것.**
  문구의 `{디데이}`(→ `3일 뒤` / 당일엔 `오늘`) · `{남은일수}`(숫자만) · `{일정}` 자리표시자는 발송 시 치환된다.
  당일 알림에 `{남은일수}`를 쓰면 "0일 뒤"가 되므로 기본 문구는 `{디데이}`를 쓴다.
  워크플로의 `REMIND_DAYS_BEFORE`는 설정이 없을 때만 쓰이는 예비값이다(쉼표로 여러 날 가능).
- **`nextRoundDate`(화면 문구)에는 연도가 없다.** 그래서 `saveSchedule()`이 `resolveRoundDate()`로
  `nextRoundISO`(`YYYY-MM-DD`)를 따로 저장한다. 문구 형식을 바꿔도 안 깨지도록 한 것이다.
  **이 값에 의존하는 곳이 둘이다** — 알림 발송(`scripts/send-reminder.js`)과 공지 카드의
  D-day 뱃지(`daysUntilNextRound()` in ui.js). 둘 다 기기 시간대와 무관하게 한국 날짜로 비교한다.
  D-day는 자정을 넘겨도 갱신되도록 `visibilitychange`에서 `renderNoticeArea()`를 다시 부른다
  (홈 화면 앱은 백그라운드에 계속 떠 있어서 필요하다).
- 워크플로에 필요한 값은 저장소 Secrets에 있다: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. 공개키는 `api.js`의 `VAPID_PUBLIC_KEY`와 같아야 한다.
- 수동 확인은 Actions 탭에서 workflow_dispatch로 실행한다 (기본이 dry run이라 실제로 안 보낸다).
- `sw.js`의 `fetch` 핸들러는 **크롬이 '설치 가능'으로 판정하는 조건**이라 있는 것이다.
  일부러 캐시를 두지 않았다 — 캐시하면 코드를 고쳐도 예전 화면이 남는다. 지우거나 캐시를 넣지 말 것.

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

`ADMIN_PASSWORD` (api.js)는 클라이언트에 평문 상수로 있고, 사용자 식별은 `localStorage`의 `jtfag_my_name`에 의존한다.
보안 경계가 아니라 모임 내부용 실수 방지 장치다. 로그인이 없어 서버는 접속자를 구분하지 못한다.

`jtfag_league` 테이블의 RLS 정책은 이렇게 걸려 있다:

- SELECT — 허용
- INSERT / UPDATE — `id = 1` 행에만 허용 (앱이 쓰는 `upsert`가 둘 다 필요로 한다)
- DELETE — 정책 없음 = 차단

행 삭제와 쓰레기 행 삽입은 막히지만, **데이터 덮어쓰기는 여전히 가능하다.** 정책을 바꿀 때 이 전제를 깨지 말 것.
`storage.objects`에는 `round-photos` 버킷 한정 INSERT/DELETE 정책이 있다.

## 주의사항

- **`.money-input` 클래스를 재사용하지 말 것.** 상금 테이블 셀 전용이라 `max-width: 68px !important; height: 26px !important`가 걸려 있어, 다른 곳에 붙이면 입력칸이 찌그러진다.
- CSS/JS는 `document.write`로 `?ver=` 랜덤 쿼리를 붙여 캐시를 우회한다. 로컬에서 안 바뀌어 보이면 강력 새로고침(`Ctrl+Shift+R`)을 시도한다.
- HTML 태그에 `style` 속성을 두 번 쓰면 브라우저가 두 번째를 통째로 무시한다. 인라인 스타일을 추가할 때 기존 `style` 속성이 이미 있는지 확인할 것.
- 사진은 Supabase Storage의 `round-photos` 버킷(공개)에 올리고 `appData.roundPhotos`에는 **공개 URL만** 저장한다.
  예전에 등록된 사진은 아직 base64(`data:`로 시작)로 남아 있을 수 있어, 사진을 다루는 코드는 **두 형태를 모두** 처리해야 한다
  (`downloadCurrentPhoto()` 참고). 사진 갤러리의 관리자 버튼이 `migratePhotosToStorage()`로 남은 base64를 옮긴다.
  Storage 헬퍼(`uploadPhotoBlob` / `deletePhotoFromStorage` / `storagePathFromUrl`)는 api.js에 있다.
- payload는 매 저장마다 행 전체가 전송되므로 용량 증가에 민감하다 (`renderStorageUsage()`가 현재 사용량을 표시한다).
- **변경 이력은 없앴다. 남은 로그는 공금뿐이다** (`fundLogs` · 관리자 메뉴의 `📜 공금 수정 로그`).
  타수·골프장·정산 금액·게스트 표시는 일부러 기록하지 않는다 — 화면을 보면 알 수 있고
  payload만 불린다. 예전 `changeLogs` 배열은 접속 시 `dropChangeLogs()`가 걷어낸다.
- UI 문구, 골퍼 이름, 등급명이 모두 한국어다. 문자열을 다룰 때 영어로 바꾸지 말 것.

### 게스트 라운드

게스트가 껴서 5인으로 친 차수는 관리자 메뉴 → `🙋 게스트 라운드`에서 표시한다
(`payload.guestRounds`, 차수 인덱스 0부터를 키로 쓰는 객체).

- **게스트 본인은 앱에 넣지 않는다.** 4인의 시작/남은 금액에 게스트와 주고받은 돈이 이미
  들어 있어 정산이 그대로 맞는다. `golfers`(4인 고정), 4칸 요약 그리드, `RANK_CONFIG`(4계급),
  핸디캡 표가 전부 4인 전제라 5번째 사람을 넣으면 그 전제가 깨진다.
- 표시한 차수는 `processAllRoundSettlements()`에서 **계급 벌금만 0원**이 된다.
  계급 자체는 4인끼리 그대로 매겨지고 `golferRankHistory`에도 남으므로 독수리 연속 뱃지는 이어진다.
- 타수정산 = 손익 − 계급정산이므로, 벌금이 0이면 **손익 전액이 타수정산으로 넘어간다.**
  1·2차전이 (핸디캡 산출용 앞 차수가 없어) 이미 같은 방식으로 동작한다 — 새 규칙이 아니다.
- 그 차수 스코어는 평소처럼 핸디캡 산출에 쓰인다.
