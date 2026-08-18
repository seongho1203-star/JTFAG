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
    return tags['addr:province'] || tags['addr:city'] || tags['addr:county'] || '';
}

async function main() {
    const data = await overpass();
    const elements = data.elements || [];
    console.log(`\nOSM에서 받은 항목: ${elements.length}개`);

    const seen = new Map();
    let noName = 0, noGeo = 0, english = 0;

    elements.forEach(el => {
        const tags = el.tags || {};
        const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null || lon == null) { noGeo++; return; }

        const raw = tags['name:ko'] || tags.name;
        if (!raw) { noName++; return; }
        const name = pickName(tags);
        if (!name) { english++; return; }

        // 같은 이름이 여러 번 나오면(코스별로 쪼개진 경우) 처음 것만 쓴다.
        if (seen.has(name)) return;
        seen.set(name, {
            name,
            lat: Math.round(lat * 10000) / 10000,
            lon: Math.round(lon * 10000) / 10000,
            region: region(tags)
        });
    });

    const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    console.log(`이름 없음 ${noName}개 · 좌표 없음 ${noGeo}개 · 영문뿐 ${english}개 제외`);
    console.log(`최종: ${list.length}곳`);
    console.log(`\n앞 15곳: ${list.slice(0, 15).map(c => c.name).join(', ')}`);
    console.log(`주소 정보가 있는 곳: ${list.filter(c => c.region).length}곳`);

    if (list.length < 100) throw new Error(`${list.length}곳뿐이라 뭔가 잘못됐습니다. 파일을 만들지 않습니다.`);

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
