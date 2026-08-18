// 전국 골프장 목록을 OpenStreetMap에서 받아 courses.js를 만든다.
// GitHub Actions에서 수동으로 돌린다 (Actions → '골프장 목록 갱신').
//
// 앱은 courses.js를 그냥 읽기만 한다. 매번 받아오면 느리고 Overpass에도 부담이라,
// 받아온 결과를 파일로 커밋해 두는 방식이다 (stats.js와 같은 방식).
//
// 이름과 함께 좌표가 오므로 날씨(Open-Meteo)도 이 좌표를 그대로 쓴다.

const fs = require('fs');

const OUT_FILE = 'courses.js';
const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

// 대한민국 안의 golf_course를 전부. node/way/relation 모두 받고 중심 좌표를 함께 받는다.
const QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="KR"][admin_level=2]->.kr;
(
  node["leisure"="golf_course"](area.kr);
  way["leisure"="golf_course"](area.kr);
  relation["leisure"="golf_course"](area.kr);
);
out center tags;
`;

// Overpass는 누가 부르는지 밝히지 않으면 거절한다(429 / 406). 반드시 보낼 것.
const HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': 'JTFAG-golf-app/1.0 (https://github.com/seongho1203-star/JTFAG)'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function overpass() {
    let lastErr;
    for (const url of ENDPOINTS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`요청: ${url}${attempt > 1 ? ` (${attempt}번째)` : ''}`);
                const res = await fetch(url, {
                    method: 'POST', headers: HEADERS,
                    body: 'data=' + encodeURIComponent(QUERY)
                });
                if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160).replace(/\s+/g, ' ')}`);
                return await res.json();
            } catch (err) {
                console.error(`  실패: ${err.message}`);
                lastErr = err;
                if (attempt === 1) await sleep(5000);   // 잠깐 쉬었다 한 번 더
            }
        }
    }
    throw lastErr;
}

// OSM의 leisure=golf_course에는 골프장이 아닌 것이 많이 섞여 있다 —
// 스크린골프방, 실내 연습장, 파크골프장(다른 종목), 게이트볼장 따위다.
// 이름으로 걸러낸다. 763곳 중 180곳쯤이 이렇게 빠진다.
const NOT_A_COURSE = /연습장|드라이빙|타석|스크린|실내|파크\s?골프|골프\s?파크|게이트볼|그라운드골프|퍼팅|아카데미|레슨|골프랜드|GDR|골프클리닉|골프존/i;
// '골프존'이 들어가면 대개 스크린골프방이지만, '골프존카운티'는 진짜 골프장 체인이다.
const STILL_A_COURSE = /골프존카운티/;

function isRealCourse(name) {
    if (STILL_A_COURSE.test(name)) return true;
    if (NOT_A_COURSE.test(name)) return false;
    // "골프장", "골프 연습장"처럼 고유명이 없는 것도 쓸모가 없다.
    if (/^골프\s*(장|클럽|연습)?$/.test(name)) return false;
    return true;
}

// "○○컨트리클럽", "○○ Country Club" 같은 꼬리를 떼어 부르는 이름으로 만든다.
// 완전히 지우지는 않는다 — "CC"는 남겨 두는 편이 눈에 익다.
function tidyName(raw) {
    return String(raw)
        .replace(/\s+/g, ' ')
        .replace(/\s*\((golf|골프).*?\)\s*$/i, '')
        .trim();
}

function pickName(tags) {
    const ko = tags['name:ko'] || tags.name;
    if (!ko) return null;
    // 한글이 한 글자도 없으면(영문 전용) 우리 목록에선 쓸모가 적다.
    if (!/[가-힣]/.test(ko)) return null;
    return tidyName(ko);
}

function region(tags) {
    return tags['addr:province'] || tags['addr:city'] || tags['addr:county']
        || tags['addr:district'] || tags['addr:borough'] || '';
}

async function main() {
    const data = await overpass();
    const elements = data.elements || [];
    console.log(`\nOSM에서 받은 항목: ${elements.length}개`);

    const seen = new Map();
    let noName = 0, noGeo = 0, english = 0, notCourse = 0;

    elements.forEach(el => {
        const tags = el.tags || {};
        const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null || lon == null) { noGeo++; return; }

        const raw = tags['name:ko'] || tags.name;
        if (!raw) { noName++; return; }
        const name = pickName(tags);
        if (!name) { english++; return; }
        if (!isRealCourse(name)) { notCourse++; return; }

        // 같은 이름이 여러 번 나오면(코스별로 쪼개졌거나 띄어쓰기만 다른 경우) 처음 것만 쓴다.
        const key = name.replace(/\s+/g, '');
        if (seen.has(key)) return;
        seen.set(key, {
            name,
            lat: Math.round(lat * 10000) / 10000,
            lon: Math.round(lon * 10000) / 10000,
            region: region(tags)
        });
    });

    const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    console.log(`이름 없음 ${noName}개 · 좌표 없음 ${noGeo}개 · 영문뿐 ${english}개 · 골프장 아님 ${notCourse}개 제외`);
    console.log(`최종: ${list.length}곳`);
    console.log(`\n앞 15곳: ${list.slice(0, 15).map(c => c.name).join(', ')}`);
    console.log(`주소 정보가 있는 곳: ${list.filter(c => c.region).length}곳`);

    // 걸러내고도 500곳 아래로 떨어지면 받아온 자료나 거르는 규칙이 잘못된 것이다.
    if (list.length < 500) throw new Error(`${list.length}곳뿐이라 뭔가 잘못됐습니다. 파일을 만들지 않습니다.`);

    const body = list.map(c =>
        `    { name: ${JSON.stringify(c.name)}, lat: ${c.lat}, lon: ${c.lon}` +
        (c.region ? `, region: ${JSON.stringify(c.region)}` : '') + ' }'
    ).join(',\n');

    const out = `// ⛳ 전국 골프장 목록 — OpenStreetMap에서 받아 워크플로가 만든 파일.
// 직접 고치지 말 것. 갱신하려면 Actions → '골프장 목록 갱신'을 실행한다.
// 여기 없는 골프장은 일정에서 '직접 입력'으로 넣으면 되고, 그건 payload에 따로 쌓인다.
//
// 만든 날: ${new Date().toISOString().slice(0, 10)} · ${list.length}곳
// 출처: OpenStreetMap contributors (ODbL)

const GOLF_COURSES = [
${body}
];
`;
    fs.writeFileSync(OUT_FILE, out);
    console.log(`\n${OUT_FILE} 작성 완료 (${Math.round(out.length / 1024)}KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
