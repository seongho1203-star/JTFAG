# 골프장 여권 마크

확인일: 2026-10-15. 앱에 포함된 마크만 사용하며, 앱 실행 중 골프장 홈페이지나 외부 이미지 서버에 요청하지 않는다.

| 골프장 | 파일 | 확인한 출처 |
| --- | --- | --- |
| 함평엘리체 | `v1/hampyeong-eliche.png` | [공식 홈페이지](https://www.hpelichecc.co.kr/hampyeong/index.asp) · [원본](https://www.hpelichecc.co.kr/hampyeong/img/main/logo.png) |
| 어등산 | `v1/eodeungsan.svg` | [공식 홈페이지](https://www.eodeungsancc.com/) · [원본](https://www.eodeungsancc.com/logo-footer.svg) |
| 해피니스 | `v1/happiness.png` | [골프장 공식 예약 앱](https://play.google.com/store/apps/details?id=kr.co.teins.happiness) |
| 광주 | `v1/gwangju.png` | [공식 홈페이지](https://www.kjcc.co.kr/index.asp) · [원본](https://www.kjcc.co.kr/images/logo.png) |
| 무등산 | `v1/mudeungsan.png` | [골프장 공식 예약 앱](https://play.google.com/store/apps/details?id=kr.co.teins.mudeungsancc) |

어등산 SVG는 원본 path를 유지하고 viewBox만 왼쪽 심벌 영역으로 좁혔다. 광주 마크는 원본 파일을 유지하고 CSS로 왼쪽 심벌 영역을 표시한다. 나머지 PNG는 내려받은 원본 그대로다.

JNJ는 공식 사이트 CI 이미지 파일을 확보하지 못해 아직 등록하지 않았다. 임의의 마크나 검색 서비스 기본 아이콘을 대신 쓰지 않는다. 미등록 골프장은 이름과 이니셜을 표시한다.

추가·변경 시 `passport.js`의 `PASSPORT_MARKS`와 `sw.js`의 `CLUB_MARK_URLS`를 함께 갱신한다. 같은 이미지 주소의 내용을 바꾸면 폴더·캐시 버전을 올린다.

검증: `node tests/club-marks.js`.
