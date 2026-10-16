# 골프장 여권 마크

확인일: 2026-10-15. 앱에 포함된 마크만 사용하며, 앱 실행 중 골프장 홈페이지나 외부 이미지 서버에 요청하지 않는다.

| 골프장 | 파일 | 확인한 출처 |
| --- | --- | --- |
| 함평엘리체 | `v1/hampyeong-eliche.png` | [공식 홈페이지](https://www.hpelichecc.co.kr/hampyeong/index.asp) · [원본](https://www.hpelichecc.co.kr/hampyeong/img/main/logo.png) |
| 어등산 | `v1/eodeungsan.svg` | [공식 홈페이지](https://www.eodeungsancc.com/) · [원본](https://www.eodeungsancc.com/logo-footer.svg) |
| 해피니스 | `v1/happiness.png` | [골프장 공식 예약 앱](https://play.google.com/store/apps/details?id=kr.co.teins.happiness) |
| 광주 | `v1/gwangju.png` | [공식 홈페이지](https://www.kjcc.co.kr/index.asp) · [원본](https://www.kjcc.co.kr/images/logo.png) |
| 무등산 | `v1/mudeungsan.png` | [골프장 공식 예약 앱](https://play.google.com/store/apps/details?id=kr.co.teins.mudeungsancc) |
| JNJ(정남진골프리조트) | `v1/jnj.jpeg` | 사용자가 제공한 마크 `IMG_9255.jpeg` 원본 |
| 여수 디오션CC | `v1/ocean.jpeg` | 사용자가 제공한 마크(여백만 잘라냄) |
| 남해 사우스케이프 | `v1/southcape.jpeg` | 사용자가 제공한 마크(앱 아이콘의 둥근 테두리와 여백을 잘라내고 SC 글자만 남김) |

어등산 SVG는 원본 path를 유지하고 viewBox만 왼쪽 심벌 영역으로 좁혔다. 광주 마크는 원본 파일을 유지하고 CSS로 왼쪽 심벌 영역을 표시한다. 나머지 PNG는 내려받은 원본 그대로다.

JNJ JPEG는 사용자가 제공한 원본을 그대로 포함했다. 미등록 골프장은 이름과 이니셜을 표시한다.

추가·변경 시 `passport.js`의 `PASSPORT_MARKS`와 `sw.js`의 `CLUB_MARK_URLS`를 함께 갱신한다. 같은 이미지 주소의 내용을 바꾸면 폴더·캐시 버전을 올린다.

신규 골프장은 `골프장 마크 자동 등록` 워크플로가 확인한다. 스코어카드 처리 완료·매일 예약·수동 실행을 지원하며, 리그/여행 골프장 이름은 조회만 한다.
공식 사이트 검색 결과에 실제로 등장한 주소에서 로고 후보를 수집하고 이미지 검증을 통과한 것만 저장한다. 사진·대행사·일반 아이콘·불확실한 마크는 등록하지 않는다.
홈페이지에서 확인하지 못하면 공식 예약 앱의 Google Play 대표 아이콘도 검색·검증한다. 실제 검색에 나타난 앱 상세 주소만 사용한다.
기존 수동 마크는 유지한다. 래스터는 원본을 저장하고, 외부 참조가 없는 SVG는 resvg 2.6.2로 PNG 렌더링한다. 자동 파일명은 `v1/auto-<내용 SHA-256>.<확장자>`이고 출처는 `auto.json`의 `site_url`·`source_url`에 기록한다.
한 번에 최대 2곳만 확인한다. 미확인 마크는 `scripts/club-mark-state.json`에 재확인 시각만 남기고 앱에서는 이름으로 표시한다. 이미 받은 마크는 다시 검색·다운로드하지 않는다.
앱이 여권을 열어 두면 자동 목록을 1분 간격으로 확인한다. SW는 `auto.json`을 갱신하고 새 이미지 주소만 캐시하며, 오프라인에서는 저장된 목록과 마크를 사용한다.

자동 수집 검증: `npm install --no-save --ignore-scripts @resvg/resvg-js@2.6.2` 후 `node tests/auto-club-marks.js`(가상 검색·이미지 확인 응답, 실제 유료 요청 없음).

검증: `node tests/club-marks.js`.
