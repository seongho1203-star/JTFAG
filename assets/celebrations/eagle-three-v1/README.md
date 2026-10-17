# 독수리 3연속 시네마틱

`eagle-three.mp4`는 12초, 720×1280, 30fps 세로 영상이다. H.264 Main / AAC 스테레오와 MP4 faststart를 사용한다. 완성 장면은 `poster.jpg`다.

어둠 속 독수리 눈빛 → 세 번의 금빛 표시 → 후광과 펼친 날개 → 금빛 `3연속 독수리` 타이틀로 이어진다. 카메라 이동·입자·빛·문자를 합성한 모션 영상이며, 키프레임 두 장은 내장 **image_gen** 도구로 생성했다. CLI/API 대체 경로는 사용하지 않았다. 효과음·짧은 팡파르는 별도 외부 샘플을 사용하지 않고 합성했다.

달성자의 이름과 실제 차수·타수는 파일에 고정하지 않는다. `eagle-film.js`가 현재 앱 기록을 읽어 7.5초부터 표시한다. 기존 1회 자동 축하·뱃지 재생·관리자 미리보기에서 3연속만 이 영상을 사용한다. 4연속 이상은 기존 대관식이다.

## 재생

사용자 동작이 있는 재생은 효과음을 함께 시도하고, 소리 자동 재생이 막히면 무음으로 재시도한다. 무음도 막히면 재생 버튼을 표시한다. 상단에서 소리·닫기를 조작할 수 있고, 마지막 장면을 잠시 보여 준 뒤 종료한다.

일반 접속 시 큰 영상 파일을 미리 받지 않는다. 첫 재생 시 서비스워커가 이 버전의 영상·포스터를 저장하고, 이후 저장본을 사용한다. Safari의 구간 요청(Range)에도 206 응답을 제공한다. 영상 오류·긴 로딩에는 완성 포스터를 표시한다. `동작 줄이기` 설정에서는 MP4를 받지 않고 완성 장면을 표시한다.

## 재현

```bash
python3 scripts/render-eagle-film.py
node tests/eagle-film.js
```

렌더링에는 Python의 Pillow·numpy·scipy, ffmpeg가 필요하다. 테스트는 가상 DOM·영상 이벤트·캐시로 재생 흐름을 확인하고, ffprobe/ffmpeg로 최종 파일과 디코딩을 검증한다. 서버 데이터 쓰기·알림 발송은 없다.

`source/eagle-hero.png`, `source/eagle-eye.png`는 생성된 원본이다. 원본은 변경하지 않고 영상 안에서 카메라 움직임을 합성한다. `source/Cinzel.ttf`와 `source/BlackHanSans.ttf`는 Google Fonts의 해당 글자만 남긴 프로젝트용 부분집합이다. 내부 글꼴 이름은 각각 JTFAG Film Serif / JTFAG Film Display로 바꿨다. SIL Open Font License는 나란히 보관했다. 앱 재생에는 외부 폰트를 요청하지 않는다.

- Cinzel 원본: https://github.com/google/fonts/tree/main/ofl/cinzel
- Black Han Sans 원본: https://github.com/google/fonts/tree/main/ofl/blackhansans

## 이미지 생성 프롬프트

두 장 모두 내장 image_gen, 새 이미지 생성, 불투명 배경을 사용했다.

### 최종 독수리

> Use case: stylized-concept. Asset type: final hero keyframe for an epic, premium vertical cinematic film celebrating three consecutive eagle-rank golf victories, to be animated later. Create a breathtaking hyperreal cinematic bald eagle with broad fully extended wings, flying straight toward camera, extremely detailed charcoal-black layered feathers and fierce ivory-white head, small powerful head proportion, sharp golden beak and eyes, absolutely majestic, elite championship visual quality, 3D photoreal film still. Vertical 9:16 composition. The entire eagle and every wingtip must fit inside the image with 7% margin on left and right; eagle spans about 86% of frame width and is centered in upper-middle around y=36%, body ends near y=57%. An enormous thin circular halo of molten gold light behind its silhouette like a solar eclipse, towering dark atmospheric smoke and black storm clouds, a few tiny suspended gold embers and sharp shafts of warm rim light, cinematic volumetric lighting, deep rich blacks, restrained burnished gold, HDR but elegant and realistic, magnificent fine feather detail, mild depth of field. Lower 37% of image is almost black atmospheric negative space to allow subsequent custom typography, no objects or feet there. Top 14% is quiet dark smoke. Beautiful deliberate symmetric composition, no busy fantasy scenery, no buildings, no golf equipment. No crown, no shield, no illustration/cartoon, no watermark, no text or numbers or logos anywhere. This must look like a film award title sequence, expensive and awe-inspiring, not like a game icon or stock poster.

### 도입 눈빛

> Use case: stylized-concept. Asset type: opening close-up keyframe for an expensive vertical cinematic title film celebrating a champion called eagle. Hyperreal, breathtaking extreme close-up side portrait of a powerful bald eagle's head emerging from pure black shadow. Vertical 9:16 composition. Head fills the middle 60% of the frame, facing left, single piercing gold amber eye in sharp focus around x=45% y=40%, detailed ivory white feathers and striking sharply curved golden beak, furrowed fierce brow, deep charcoal body. Warm razor-thin golden rim light, restrained cinematic gold glints on the eye and feather edges, dramatic chiaroscuro, no illustration, lifelike premium cinema-camera texture, black background with faint warm smoke, strong shadow areas, no scenery. Top 23% and bottom 25% very dark quiet negative space. Photoreal film still, fine organic details, true majestic eagle proportions, premium sports championship film aesthetic, color palette black, ivory, molten gold. No halo, no crown, no decorative elements, no letters, no numbers, no logos, no watermark.
