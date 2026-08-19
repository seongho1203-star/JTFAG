# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 사용자 지침 (User Preferences)

- **한국어로 응답할 것.** 저장소 소유자는 한국어로 소통한다.
- **수정사항은 `main` 브랜치에 직접 커밋 & 푸시한다.** 별도 작업 브랜치나 PR을 만들지 않는다.
  단, 사용자가 특정 건에 대해 "브랜치로 해줘"라고 명시하면 그때만 브랜치를 사용한다.
- **커밋과 푸시까지 묻지 말고 끝낼 것.** 승인을 받아 보다가 되돌린 방식이다 — 매번 물어보는 게
  오히려 번거로웠다. 일이 끝나면 커밋하고 `main`에 푸시한 뒤, 무엇이 바뀌었는지 알린다.
  다만 `main` 푸시는 곧 실서비스 반영이므로 **푸시 전에 변경 결과를 확인할 것**
  (문법 검사, 헤드리스 브라우저로 눈으로 확인 등).
- **훅은 걸지 않는다.** 확인창을 띄우는 `PreToolUse` 훅을 넣었다가 사용자 요청으로 걷어냈다.
  `.claude/settings.json`을 다시 만들지 말 것.

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
stats.js → courses.js → api.js → calc.js → ui.js
```

- **`stats.js`** — 홀 단위 스코어 기록. DB에 없는 유일한 데이터로, 스코어카드 사진을 판독해 갱신한다.
  `ROUND_HOLES`(원본, 차수별 18홀 파+파대비타수) → `ROUND_STATS`(차수별 집계) → `CUMULATIVE_STATS`(누적 총합)로
  **자동 계산**된다. 뒤 두 개는 직접 고치지 말 것. 새 차수는 `ROUND_HOLES`에만 추가하면 된다.
  판독 검산법: `par + rel`의 18홀 합계가 그 차수의 그로스가 되어야 한다.
  앱의 `📋 스코어 등록` 버튼을 쓰면 이 파일을 **워크플로가 대신 고친다** (아래 참고).
- **타수는 사람이 입력하지 않는다.** 화면의 타수 칸은 전부 잠겨 있고(`readonly`),
  `syncScoresFromHoles()`(ui.js)가 `grossFromHoles()`로 계산한 값을 `appData.scores`에 채운다.
  즉 **`ROUND_HOLES`에 차수를 추가하고 푸시하면 표의 타수가 저절로 채워진다.**
  홀 기록이 있는 차수는 관리자 메뉴로도 못 고친다 — 고쳐 봐야 다음 접속 때 되돌아가기 때문이다.
  홀 기록이 아직 없는 차수만 관리자 메뉴 → `✏️ 타수 직접 수정`으로 잠시 열 수 있다.
  핸디캡·정산·평균은 예전처럼 `appData.scores`를 읽으므로 계산 쪽은 손댈 필요가 없다.
- **`courses.js`** — 전국 골프장 이름·좌표. 워크플로가 만드는 파일이라 직접 고치지 말 것 (아래 참고).
- **`api.js`** — Supabase 클라이언트, 전역 상태(`appData`), 상수(`golfers`, `RANK_CONFIG`, `COURSE_GEO`), 골프장 좌표 조회(`courseGeo` / `courseFromText`), Open-Meteo 날씨 조회.
- **`calc.js`** — 순수 계산 계층. 정산/등급/핸디캡을 산출해 `golfer*Map` 전역 변수들에 채운다.
- **`ui.js`** — DOM 렌더링, 모달, 이벤트 핸들러. 진입점(`DOMContentLoaded` → `fetchFromSupabase()`)이 여기 있다.

새 파일을 추가하면 `index.html`의 `document.write` 블록에도 등록해야 한다.

### 스코어카드 판독 (📋 스코어 등록)

사진을 올리면 18홀 타수가 `stats.js`에 자동으로 들어간다. 앱은 요청만 남기고, 판독은 GitHub Actions가 한다.

```
앱: openScoreRequestModal() → 차수 선택 → 사진 업로드
      ↓ Storage(round-photos) 업로드 후 공개 URL만 저장
   payload.scoreRequests = [{id, round, url, time, by, status, note}]
      ↓ 15분마다
GitHub Actions (read-scorecard.yml) → scripts/read-scorecard.js
      ↓ 사진을 Claude에게 보여 par/strokes를 받음 → 검산 → rel 계산
   stats.js의 ROUND_HOLES에 그 차수를 써 넣고 커밋·푸시
      ↓ Pages 배포 후 접속하면
   syncScoresFromHoles()가 표의 타수를 채운다
```

- **버튼은 `SCORE_OWNER`(api.js) 기기에서만 보이고, 누르면 관리자 비밀번호를 또 묻는다.**
  `jtfag_my_name`은 누구나 바꿀 수 있어 보안 경계가 아니다 — 실수 방지 장치다.
- **판독 결과를 그대로 믿지 않는다.** `validate()`가 18홀·파 합계(68~74)·타수 범위와 함께
  **사진에 적힌 합계와 18홀 타수의 합이 같은지**를 본다. 이 검산이 오독을 잡는 핵심이라 빼지 말 것.
  하나라도 어긋나면 `stats.js`를 건드리지 않고 요청을 `실패`로 남긴다 (사유가 앱에 그대로 보인다).
- **`playerCount`(카드에 있는 사람 수)와 `players` 개수가 같은지도 본다.** 이게 없으면
  5인 플레이에서 모델이 4명만 돌려줄 때 **게스트가 빠진 사람 자리에 들어앉는다** —
  그 줄만 보면 합계가 맞아 위 검산을 그냥 통과한다. 실제로 게스트(100타)가
  박승수(98타)로 기록된 적이 있어 넣은 검사다. 빼지 말 것.
- **스코어카드는 본인 말고는 이름을 가려서 보여준다** (`박**`, `이관*`, `김○○`).
  모델에게는 가림표까지 그대로 옮기게 하고, 누구인지는 `resolveNames()`가 정한다 —
  실명이 보이는 사람을 먼저 붙이고, 남은 사람은 **성**으로 붙인다 (우리 넷은 성이 다 다르다).
  후보가 둘 이상이면 **찍지 않고 실패시킨다.**
- **게스트는 이름이 아니라 타수로 뺀다.** 5인 플레이면 앱에서 `게스트 참여 (5인 플레이)`를
  체크하고 그 사람 합계를 적는다 → `req.guestTotal`. `pullOutGuest()`가 이름을 보기 **전에**
  그 타수의 줄을 빼내므로, 이름이 가려져 있든 성이 우리와 겹치든 정확히 한 줄만 빠진다.
  그 타수가 없으면 찍지 않고 실패시킨다.
  체크를 안 하면 예전처럼 이름(성)으로 거른다 — 성이 겹치는 게스트는 그때만 문제가 된다.
- **동타는 버디·파 개수로 가린다.** 게스트와 타수가 같은 사람이 또 있으면 타수만으로는 못 고른다.
  그때만 함께 받아 둔 `guestBirdies` / `guestPars`로 좁힌다 (`holeCounts()`가 18홀에서 직접 센다).
  둘 중 하나만 적어도 되고, 동타가 아니면 아예 쓰지 않으므로 **평소엔 비워두는 값**이다.
  그래도 하나로 안 좁혀지면 실패시킨다 — 사진 속 동타자들의 버디·파를 사유에 실어 보낸다.
- 같은 차수를 다시 올리면 그 블록만 갈아 끼운다(`upsertRound`). 차수가 늘지 않는다.
- **모델에게 파 대비 타수(±)를 시키지 않는다.** 실제 타수를 받아 `rel`은 스크립트가 뺀다 —
  모델이 뺄셈까지 하면 틀릴 자리가 늘어난다.
- **차수는 드롭다운으로 고른다.** 열 때 `defaultScorecardRound()`(홀 기록이 없는 마지막 차수)를
  미리 골라 두므로 대개 사진만 올리면 된다. 차수가 스무 개가 되어도 창 크기가 그대로다 —
  칩을 늘어놓는 방식으로 되돌리지 말 것.
- **판독이 끝나면 알림이 간다.** 성공은 네 명 모두에게, 실패는 사진을 올린 사람(`req.by`)에게만.
  상태를 payload에 확정한 **뒤에** 보낸다 — 그래야 '완료'라고 알려 놓고 실제로는
  푸시가 실패한 경우가 안 생긴다. 알림이 실패해도 판독 결과는 뒤집지 않는다.
- 필요한 Secret은 `ANTHROPIC_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_KEY`
  그리고 알림용 `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY`.
  워크플로가 `stats.js`를 커밋하므로 `permissions: contents: write`가 있어야 한다.
- 급하면 Actions 탭 → workflow_dispatch로 바로 돌린다 (`dry_run`을 켜면 판독만 하고 파일은 안 고친다).

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
- **지금 누가 받고 있는지는 관리자 메뉴 → `🔔 알림 받는 기기`에서 본다.**
  `push_subscriptions`를 그대로 읽어 사람별로 묶어 보여 준다 (사람 수가 아니라 **기기 수**다 —
  한 사람이 폰과 PC로 따로 구독하면 두 줄). endpoint 주소로 브라우저 종류를 짐작해 적고,
  접속한 기기에는 `이 기기`를 붙인다. 못 쓰게 된 구독은 발송할 때 만료로 확인되면 정리된다.
  줄마다 있는 `✕`로 직접 끊을 수도 있다 — 남의 알림을 조용히 끊는 일이라 한 번 더 묻는다.
  **이 기기를 끊을 땐 `unsubscribeFromPush()`를 쓴다** (행만 지우면 브라우저 구독이 남아
  🔔 버튼이 켜진 것처럼 보이는데 발송 목록엔 없는 상태가 된다).
- **실제 발송은 `scripts/push.js`가 한다** (VAPID 등록 · 구독 조회 · 만료 구독 정리).
  라운드 알림과 스코어 판독 알림이 이 한 곳을 같이 쓰므로, 발송 규칙을 고칠 땐 여기만 고친다.
- 워크플로에 필요한 값은 저장소 Secrets에 있다: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. 공개키는 `api.js`의 `VAPID_PUBLIC_KEY`와 같아야 한다.
- 수동 확인은 Actions 탭에서 workflow_dispatch로 실행한다 (기본이 dry run이라 실제로 안 보낸다).
- `sw.js`의 `fetch` 핸들러는 **크롬이 '설치 가능'으로 판정하는 조건**이라 있는 것이다.
  일부러 캐시를 두지 않았다 — 캐시하면 코드를 고쳐도 예전 화면이 남는다. 지우거나 캐시를 넣지 말 것.

### 골프장 목록과 날씨

전국 골프장 574곳의 이름과 좌표가 `courses.js`(`GOLF_COURSES`)에 있다. 일정에서 고르는 곳이자
날씨를 볼 좌표다. **`courses.js`는 직접 고치지 말 것** — 워크플로가 만드는 파일이다.

```
OpenStreetMap (Overpass API)
      ↓ Actions → '골프장 목록 갱신' (수동)
scripts/fetch-courses.js  →  courses.js를 커밋
      ↓ 앱이 읽어서
일정 모달의 검색 목록  ·  courseGeo() → Open-Meteo 날씨
```

- **거르는 규칙이 이 스크립트의 핵심이다.** OSM의 `leisure=golf_course`에는 스크린골프방·실내
  연습장·파크골프장(다른 종목)·게이트볼장이 잔뜩 섞여 있다. 763곳 중 189곳이 그런 것이었다.
  `NOT_A_COURSE` 정규식으로 이름을 보고 걸러내되, **`골프존카운티`는 진짜 골프장 체인이라 남긴다**
  (`STILL_A_COURSE`). 걸러낸 뒤 500곳 아래로 떨어지면 파일을 아예 만들지 않는다.
- 띄어쓰기만 다른 중복(`사우스링스 영암` / `사우스링스영암`)은 공백을 지운 이름으로 합친다.
  같은 이유로 `courseGeo()`·검색도 **공백을 무시하고** 비교한다.
- **`BASE_COURSES`(ui.js)의 이름은 `courses.js`에 있는 것과 글자까지 같아야 한다.** 우리가 자주
  가는 곳을 위에 띄우려고 둔 목록인데, 이름이 어긋나면 좌표가 안 붙어 날씨가 사라진다.
- 목록에 없는 곳은 검색창에 그냥 쳐 넣으면 그게 이름이 된다. 좌표가 없는 이름만
  `payload.customCourses`에 쌓여 다음부터 목록 맨 위에 뜬다(최근 것이 위, `MAX_CUSTOM_COURSES`개까지).
- **일정은 차수에 붙는다.** 일정 모달에서 차수를 고르고 저장하면 그 차수의 골프장이 정해진다 —
  표의 골프장 칸을 따로 칠 필요가 없다. 아직 없는 **다음 차수도 미리 고를 수 있어**
  (`totalRounds + 1`까지 목록에 나온다), 차수를 만들면 이름이 자동으로 들어간다.
- **차수별 골프장은 `payload.roundCourses`에 따로 기억한다** (키가 차수 번호, 1부터).
  표의 `courses[]`는 차수를 지우면 같이 날아가지만 이건 남는다 — **6차를 지웠다 다시 만들어도
  이름이 돌아오는 게 이 때문이다.** 빈 칸을 채우는 건 `applyRoundCourses()`(접속 시)와
  `addRound()`. 이미 적힌 이름은 덮어쓰지 않는다.
  표에서 직접 고쳐도(`updateCourse`) 이 기억이 같이 갱신되므로 두 곳이 어긋나지 않는다.
- **날씨는 `courseFromText()`(api.js)가 일정 문구에서 골프장을 찾아 띄운다.** 문구 끝(`7:30 무등산CC`)을
  먼저 보고, 안 되면 문구 안에 이름이 들어 있는 곳 중 **가장 긴 것**을 쓴다(`화순`과 `화순CC`가
  같이 걸릴 때 뒤엣것). `COURSE_GEO`(api.js)에 남은 짧은 이름 다섯은 **옛 일정 문구용**이다 —
  `푸른솔`처럼 예전 표기로 저장된 payload에도 날씨가 뜨게 하려고 지우지 않았다.
- 좌표를 못 찾으면 날씨칸이 숨겨질 뿐 나머지는 멀쩡하다.

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
- **독수리 연속 달성은 모임에서 크게 축하하기로 한 기록이라 따로 다룬다.**
  `eagleStreak()`(calc.js)가 뒤에서부터 계급 0이 몇 번 이어지는지 센다 — 3에서 멈추지 않고
  4연속·5연속이면 뱃지 숫자가 그대로 올라간다. 뱃지(`.badge-eagle-3`)는 다른 뱃지와 급을 달리해
  금색이 흐르고 광택이 지나가고 테두리가 뛴다.
  3연속 이상이 **처음 보이는 순간** `checkEagleStreakCelebration()`(ui.js)이 색종이 축포를 터뜨린다.
  **기기마다 사람·연속수 조합당 한 번만** 뜬다(`localStorage`의 `jtfag_eagle_{이름}_{연속수}`) —
  접속할 때마다 뜨면 축하가 아니라 방해다. 뱃지를 누르면 언제든 다시 볼 수 있다.
  둘이 동시에 달성해도 한 번에 하나만 띄우고 나머지는 다음 접속 때 뜬다.

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

- **타수 표의 좌우 스크롤은 건드릴 때 조심할 것.** 손가락으로 미는 게 가끔 먹통이 된다는
  제보가 있어 짚이는 곳을 모두 손봤다 (실기기 증상이라 헤드리스로는 재현이 안 됐다):
  `.table-wrapper`에서 `scroll-behavior: smooth`를 뺐고(차수 추가 때의 이동은
  `scrollTo({behavior:'smooth'})`가 직접 하니 문제없다), `overscroll-behavior-x: contain`으로
  왼쪽 끝에서 브라우저 '뒤로 가기'가 먹는 걸 막았고, 잠긴 타수 칸에 `pointer-events: none`을 줘
  숫자 위에서 끌 때 글자 선택이 시작되지 않게 했다. `forceTableReflow()`는 표를 만지는 동안
  건너뛴다 — 미는 도중에 `overflow-x`를 껐다 켜면 그 자리에서 스크롤이 죽는다.
  접속하면 `jumpToLatestRound()`가 표를 오른쪽 끝으로 **한 번만** 보낸다 — 매번 보내면
  앞 차수를 보고 있던 사람이 실시간 갱신 때마다 화면이 튄다.
  평균 열을 오른쪽에 고정(`position: sticky; right: 0`)해 본 적이 있는데 되돌렸다.
- CSS/JS는 `document.write`로 `?ver=` 랜덤 쿼리를 붙여 캐시를 우회한다. **`courses.js`만 예외다** —
  40KB인데 목록 갱신 워크플로를 돌릴 때나 바뀌므로 접속마다 새로 받을 이유가 없다.
  로컬에서 안 바뀌어 보이면 강력 새로고침(`Ctrl+Shift+R`)을 시도한다.
- **창이 떠 있는 동안 뒷배경은 `watchOverlays()`(ui.js)가 잠근다.** 창을 여는 곳이 스무 군데가
  넘어(모달 10개 + 직접 만들어 붙이는 창 6개) 한 곳씩 고치면 반드시 하나를 빠뜨린다 —
  그러면 화면이 잠긴 채 안 풀려서 원래보다 나쁘다. 그래서 여는 코드는 손대지 않고,
  **MutationObserver가 '화면을 덮는 게 생겼는지'를 보고** body를 `position:fixed`로 붙든다.
  덮는 창의 조건은 `body 바로 아래 · position:fixed · pointer-events가 none이 아님 · 화면의 90% 이상`.
  이 조건이 곧 필터다 — 닫힌 모달·토스트·설치 배너는 저절로 빠진다.
  **입장 인사말(`showGreeting()`)도 잠근다.** 저절로 사라지니 빼 뒀었는데 거기서만 배경이 밀려
  눈에 띄었다. 대신 3초를 억지로 기다리지 않게 눌러서 넘길 수 있다.
  **`opacity`는 보지 말 것.** 열릴 때 0에서 서서히 오르는데 관찰자는 첫 프레임에 돌아 0을 읽고,
  그 뒤로 바뀌는 게 없어 영영 다시 안 본다 (관리자 메뉴·일정 모달만 안 잠기는 걸로 실제로 나타났다).
  `pointer-events`는 전환 없이 즉시 바뀌고 '입력을 가로채고 있는가'라는 뜻이라 더 정확하다.
  풀 때 `window.scrollTo`로 보던 자리에 되돌려 놓는다 — 안 그러면 창을 닫을 때마다 맨 위로 튄다.
  새로 만드는 전체화면 창은 **누를 일이 없으면 `pointer-events:none`을 줄 것** (인사말이 그렇다).
- **`.money-input` 클래스를 재사용하지 말 것.** 상금 테이블 셀 전용이라 `max-width: 68px !important; height: 26px !important`가 걸려 있어, 다른 곳에 붙이면 입력칸이 찌그러진다.
- HTML 태그에 `style` 속성을 두 번 쓰면 브라우저가 두 번째를 통째로 무시한다. 인라인 스타일을 추가할 때 기존 `style` 속성이 이미 있는지 확인할 것.
- 사진은 Supabase Storage의 `round-photos` 버킷(공개)에 올리고 `appData.roundPhotos`에는 **공개 URL만** 저장한다.
  예전에 등록된 사진은 아직 base64(`data:`로 시작)로 남아 있을 수 있어, 사진을 다루는 코드는 **두 형태를 모두** 처리해야 한다
  (`downloadCurrentPhoto()` 참고). 사진 갤러리의 관리자 버튼이 `migratePhotosToStorage()`로 남은 base64를 옮긴다.
  Storage 헬퍼(`uploadPhotoBlob` / `deletePhotoFromStorage` / `storagePathFromUrl`)는 api.js에 있다.
- payload는 매 저장마다 행 전체가 전송되므로 용량 증가에 민감하다 (`renderStorageUsage()`가 현재 사용량을 표시한다).
- **공금은 잔액이 아니라 오간 금액으로 고친다.** `showFundPrompt()`에서 `적립`/`사용`을 고르고
  그 금액만 적으면 잔액은 `resultOf()`가 계산한다 (`FUND_MODES`의 `sign`을 곱해 더한다).
  잔액을 잘못 적어 둔 걸 바로잡으려고 `직접`(적은 값이 곧 잔액)도 남겨 뒀다 — 지우지 말 것.
  `editClubFund()`는 계산이 끝난 `after`만 받는다. 저장되는 건 예나 지금이나 잔액 하나뿐이라
  payload 구조는 그대로다.
- **변경 이력은 없앴다. 남은 로그는 공금뿐이다** (`fundLogs` · 관리자 메뉴의 `📜 공금 수정 로그`).
  한 건은 `{time, name, before, after, memo}`다. 적립인지 사용인지는 `after - before`로 알 수 있어
  따로 넣지 않았다. `memo`(내역)는 선택 입력이라 비어 있을 수 있고,
  **이 기능 이전에 쌓인 기록에는 아예 없다** — 렌더 코드는 `memo`가 없는 항목을 그대로 넘길 수 있어야 한다.
  사용자가 적은 글이므로 화면에 넣을 땐 `escapeHtml()`(ui.js)을 거친다.
  타수·골프장·정산 금액은 일부러 기록하지 않는다 — 화면을 보면 알 수 있고 payload만 불린다.
  없앤 기능이 payload에 남긴 필드(`changeLogs`, `guestRounds`)는 접속 시
  `dropRetiredFields()`(ui.js)가 걷어낸다. 기능을 지울 때 이 목록에 필드를 추가할 것.
- UI 문구, 골퍼 이름, 등급명이 모두 한국어다. 문자열을 다룰 때 영어로 바꾸지 말 것.
