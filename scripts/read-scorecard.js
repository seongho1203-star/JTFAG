// 스코어카드 판독기. GitHub Actions가 주기적으로 실행한다.
//
// 앱의 [📋 스코어 등록] 버튼이 payload.scoreRequests에 요청을 쌓으면,
// 이 스크립트가 사진을 Claude에게 보여 18홀 타수를 읽고 stats.js의 ROUND_HOLES에
// 그 차수를 써 넣은 뒤 커밋·푸시한다. Pages가 배포되면 앱의 타수 칸이 저절로 채워진다
// (ui.js: syncScoresFromHoles).
//
// 판독 결과를 그대로 믿지 않는다. 아래를 모두 통과해야 파일을 건드린다:
//   · 18홀이 다 있고 숫자가 상식 범위인가
//   · 사진에 적힌 합계와 18홀 타수의 합이 같은가  ← 오독을 잡는 핵심 검산
//   · 파 합계가 68~74인가
//   · 우리 4명이 모두 나왔는가 (5인 플레이의 게스트는 여기서 걸러진다)
// 하나라도 어긋나면 그 요청은 '실패'로 남기고 stats.js는 그대로 둔다.
//
// 해외 라운드(req.overseas)는 전반·후반 사진 두 장을 따로 읽어 합친다 — 아래 processOverseas().
// 카드에 타수 합계가 없어 합계 검산 대신 같은 사진을 여러 번 읽어 일치를 본다.

const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { sendPush } = require('./push');

const {
    ANTHROPIC_API_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT = 'mailto:seongho1203@gmail.com',
    DRY_RUN = ''
} = process.env;

// 요청에 올린 사람이 안 적혀 있을 때만 쓰는 예비값 (api.js의 SCORE_OWNER와 같다).
const SCORE_OWNER_FALLBACK = '신성호';

for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
    if (!v) { console.error(`환경변수 ${k}가 없습니다.`); process.exit(1); }
}

const TABLE = 'jtfag_league';
const STATS_FILE = 'stats.js';
const MODEL = 'claude-opus-5';
const MAX_PER_RUN = 3;          // 한 번 돌 때 처리할 요청 수
const HOLES = 18;

const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
};

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// 사진에 보이는 것만 옮겨 적게 한다. 파 대비 타수(±)가 아니라 실제 타수를 받아
// rel은 이쪽에서 계산한다 — 모델에게 뺄셈까지 시키면 틀릴 자리가 늘어난다.
const SYSTEM = `당신은 골프 스코어카드 사진을 판독하는 도구다.
사진에 보이는 숫자를 그대로 옮겨 적을 뿐, 어떤 값도 추정하거나 보정하지 않는다.

- par: 1번홀부터 18번홀까지의 파를 순서대로 18개.
- players[].strokes: 그 사람이 각 홀에서 친 실제 타수를 1번홀부터 18번홀까지 18개.
  파 대비 타수(+1, -1 같은 값)가 아니라 실제로 친 타수다.
- players[].total: 스코어카드에 인쇄되어 있는 그 사람의 합계를 그대로 옮긴다.
  직접 더한 값이 아니라 카드에 적힌 값이어야 한다. 합계가 안 보일 때만 18홀을 더해 적는다.
- playerCount: 스코어카드에 이름이 올라 있는 사람 수를 먼저 센다. 보통 4명이지만
  게스트가 끼면 5명일 수도 있다. players를 채우기 전에 세어라.
- 사진에 있는 사람은 **한 명도 빼지 말고** 모두 players에 넣는다. 게스트도 넣는다.
  players의 개수는 playerCount와 반드시 같아야 한다.
- 이름은 사진에 적힌 그대로 적는다. 스코어카드는 본인 말고는 이름을 가려서
  보여주는 일이 많은데("박**", "이관*", "김○○"), 가림표까지 그대로 옮긴다.
  누구인지 추측해서 이름을 채워 넣지 마라. 누구인지 가리는 일은 뒤에서 한다.
- 숫자가 가려졌거나 확실하지 않으면 지어내지 말고 그 사람을 players에서 통째로 뺀다.`;

const SCHEMA = {
    type: 'object',
    properties: {
        course: { type: 'string', description: '골프장과 코스 이름. 안 보이면 빈 문자열.' },
        playerCount: { type: 'integer', description: '스코어카드에 이름이 올라 있는 사람 수. players의 개수와 같아야 한다.' },
        par: { type: 'array', items: { type: 'integer' }, description: '1~18번홀의 파, 18개.' },
        players: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    strokes: { type: 'array', items: { type: 'integer' }, description: '1~18번홀의 실제 타수, 18개.' },
                    total: { type: 'integer', description: '스코어카드에 적힌 18홀 합계.' }
                },
                required: ['name', 'strokes', 'total'],
                additionalProperties: false
            }
        }
    },
    required: ['course', 'playerCount', 'par', 'players'],
    additionalProperties: false
};

// ── 해외 라운드(태블릿 스코어 화면, 전반·후반 두 장) ──────────────────────
// 영문 이름은 성으로 우리 넷에 붙인다. 우리 넷은 성이 다 다르다.
// 골퍼가 바뀌면 이 표도 고칠 것(키는 payload.scores의 이름과 같아야 한다).
const OVERSEAS_SURNAMES = { LEE: '이관교', KIM: '김지명', SHIN: '신성호', PARK: '박승수' };
const OVERSEAS_PAR_MIN = 66, OVERSEAS_PAR_MAX = 76;   // 국내(68~74)보다 조금 넓게 본다
const HALF = 9;

const SYSTEM_HALF = `당신은 골프 스코어 화면(태블릿) 사진을 판독하는 도구다.
한 장에는 9홀(전반 OUT 1~9번 또는 후반 IN 10~18번)만 나온다. 사진에 보이는 숫자를 그대로 옮겨 적을 뿐, 추정하거나 보정하지 않는다.

- firstHole: 이 화면 맨 앞 홀의 번호. 전반이면 1, 후반이면 10.
- par: 이 화면의 홀 9개의 파. 홀 번호 아래에 "4/9"처럼 적혀 있으면 앞의 숫자(4)가 파이고 뒤의 숫자는 난이도 순번이다.
- players[].strokes: 그 사람이 이 9홀에서 친 실제 타수 9개. 왼쪽 홀부터 순서대로.
  숫자의 색(파랑·빨강·검정)은 의미가 없으니 무시하고 숫자만 읽는다.
  칸이 비어 있거나, 효과 그림·글자에 가려 확실히 안 읽히면 지어내지 말고 그 칸에 0을 적는다.
- 오른쪽의 HALF·TOTAL 칸이나 아래 입력 패널에 보이는 숫자는 퍼트 수·포인트·현재 입력값이다. 타수가 아니니 절대 옮기지 마라.
- NiceBirdie! 같은 효과 글자와 노란 강조 열은 무시한다.
- playerCount: 이름이 올라 있는 사람 수를 먼저 센다. players의 개수와 반드시 같아야 한다.
- 사진에 있는 사람은 한 명도 빼지 말고 모두 players에 넣는다.
- 이름은 화면에 적힌 그대로 적는다(영문일 수 있다). 철자가 흐리면 보이는 대로 적는다.`;

const SCHEMA_HALF = {
    type: 'object',
    properties: {
        course: { type: 'string', description: '골프장·코스 이름이 화면에 보이면 적고, 안 보이면 빈 문자열.' },
        firstHole: { type: 'integer', description: '맨 앞 홀 번호. 전반 1, 후반 10.' },
        playerCount: { type: 'integer', description: '이름이 올라 있는 사람 수. players의 개수와 같아야 한다.' },
        par: { type: 'array', items: { type: 'integer' }, description: '이 화면 9홀의 파, 9개.' },
        players: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    strokes: { type: 'array', items: { type: 'integer' }, description: '이 화면 9홀의 실제 타수, 9개. 안 읽히면 0.' }
                },
                required: ['name', 'strokes'],
                additionalProperties: false
            }
        }
    },
    required: ['course', 'firstHole', 'playerCount', 'par', 'players'],
    additionalProperties: false
};

async function readPayload() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=payload`, { headers });
    if (!res.ok) throw new Error(`리그 데이터 조회 실패: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return (rows[0] && rows[0].payload) || null;
}

// 상태만 갱신한다. 그 사이 앱이 payload를 바꿨을 수 있어 직전에 다시 읽어서 덮어쓴다.
async function writeStatuses(results) {
    const payload = await readPayload();
    if (!payload || !Array.isArray(payload.scoreRequests)) return;
    let changed = false;
    payload.scoreRequests.forEach(req => {
        const r = results.get(req.id);
        if (!r) return;
        req.status = r.status;
        req.note = r.note;
        changed = true;
    });
    if (!changed) return;

    // **쓰는 사람 도장을 내 것으로 바꾼다.** 앱은 `_rev.by`가 자기 것이면 '내가 보낸 메아리'로
    // 보고 그 실시간 이벤트를 통째로 무시한다(금액 칸이 되돌아가는 걸 막는 장치다).
    // 읽어 온 payload의 도장을 그대로 두고 쓰면, 마지막에 쓴 사람의 앱이 이 갱신을
    // 자기 메아리로 착각해 **판독 결과가 그 사람 화면에만 안 뜬다.**
    payload._rev = { by: 'workflow', n: Date.now() };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1`, {
        method: 'PATCH', headers, body: JSON.stringify({ payload })
    });
    if (!res.ok) throw new Error(`상태 갱신 실패: ${res.status} ${await res.text()}`);
}

async function fetchImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`사진을 받지 못했습니다 (${res.status})`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const media = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type) ? type : 'image/jpeg';
    return { media, data: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

async function readScorecard(image, names) {
    // Opus 5는 따로 켜지 않아도 생각을 하고 effort도 high가 기본이라 그대로 둔다.
    // format을 주면 응답 첫 블록이 SCHEMA를 지킨 JSON으로 온다.
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: image.media, data: image.data } },
                { type: 'text', text: `이 스코어카드를 판독해라. 우리 모임 사람은 ${names.join(', ')} 넷이다. 이 넷 말고 다른 사람(게스트)이 함께 쳤다면 그 사람도 사진에 적힌 이름 그대로 players에 넣어라.` }
            ]
        }]
    });
    if (response.stop_reason === 'refusal') throw new Error('판독이 거부되었습니다.');
    const text = response.content.find(b => b.type === 'text');
    if (!text) throw new Error('판독 결과가 비어 있습니다.');
    return JSON.parse(text.text);
}

async function readHalf(image) {
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        output_config: { format: { type: 'json_schema', schema: SCHEMA_HALF } },
        system: SYSTEM_HALF,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: image.media, data: image.data } },
                { type: 'text', text: '이 화면 한 장(9홀)을 판독해라.' }
            ]
        }]
    });
    if (response.stop_reason === 'refusal') throw new Error('판독이 거부되었습니다.');
    const text = response.content.find(b => b.type === 'text');
    if (!text) throw new Error('판독 결과가 비어 있습니다.');
    return JSON.parse(text.text);
}

// 영문 이름의 성 조각으로 우리 넷 중 하나를 고른다. 못 붙이면 null(게스트로 친다).
// "LEE KWANKYO"·"Kwankyo Lee"·"K. LEE"처럼 성이 어느 자리에 있어도, 철자가 조금 달라도 성으로만 본다.
// 둘 이상 걸리면 찍지 않고 Error.
function surnameGolfer(raw, names) {
    const tokens = String(raw || '').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    const hits = new Set();
    tokens.forEach(t => { const g = OVERSEAS_SURNAMES[t]; if (g && names.includes(g)) hits.add(g); });
    if (hits.size > 1) throw new Error(`"${raw}"이(가) ${[...hits].join('·')} 중 누구인지 식별할 수 없습니다.`);
    return hits.size === 1 ? [...hits][0] : null;
}

// 한 장(9홀)을 검산해 {firstHole, par, byGolfer:{이름:[9타수]}, skipped}로 돌려준다.
function validateHalf(read, names, label) {
    if (read.firstHole !== 1 && read.firstHole !== 10) throw new Error(`${label}: 시작 홀이 ${read.firstHole}번으로 읽혔습니다. 전반(1번~) 또는 후반(10번~) 화면이어야 합니다.`);
    const par = read.par;
    if (!Array.isArray(par) || par.length !== HALF) throw new Error(`${label}: 파가 ${Array.isArray(par) ? par.length : 0}홀만 읽혔습니다.`);
    if (par.some(p => !Number.isInteger(p) || p < 3 || p > 6)) throw new Error(`${label}: 파 값에 오류가 있습니다.`);

    const players = Array.isArray(read.players) ? read.players : [];
    const readNames = players.map(p => String(p.name || '').trim()).filter(Boolean);
    if (read.playerCount !== players.length) {
        throw new Error(`${label}: 화면에는 ${read.playerCount}명이나 ${players.length}명만 판독되었습니다. 읽은 이름: ${readNames.join(', ') || '없음'}`);
    }

    const byGolfer = {};
    const skipped = [];
    players.forEach(p => {
        const g = surnameGolfer(p.name, names);
        if (!g) { if (String(p.name || '').trim()) skipped.push(String(p.name).trim()); return; }
        if (byGolfer[g]) throw new Error(`${label}: ${g}이(가) 화면에 두 번 나옵니다. 이름을 식별할 수 없습니다.`);
        const st = p.strokes;
        if (!Array.isArray(st) || st.length !== HALF) throw new Error(`${label}: ${g}의 타수가 ${Array.isArray(st) ? st.length : 0}홀만 읽혔습니다.`);
        const blank = st.findIndex(s => !Number.isInteger(s) || s < 1);
        if (blank !== -1) throw new Error(`${label}: ${g}의 ${read.firstHole + blank}번홀 타수가 비어 있거나 읽히지 않았습니다. 라운드가 끝난 화면으로 다시 찍어 주세요.`);
        if (st.some(s => s > 15)) throw new Error(`${label}: ${g}의 타수 값에 오류가 있습니다.`);
        byGolfer[g] = st;
    });
    const missing = names.filter(n => !byGolfer[n]);
    if (missing.length) {
        throw new Error(`${label}: ${missing.join(', ')}의 기록을 찾을 수 없습니다. 화면에서 읽은 이름: ${readNames.join(', ') || '없음'}`);
    }
    return { firstHole: read.firstHole, par, byGolfer, skipped, course: String(read.course || '').trim(), readNames };
}

// 합계 검산이 불가능한 화면이라(HALF·TOTAL 칸은 퍼트 수) 같은 사진을 두 번 읽어 서로 맞는지로 대신한다.
// 어긋나면 한 번 더 읽어 둘이 맞는 쪽을 쓰고, 그래도 안 맞으면 찍지 않고 실패시킨다.
const sameHalf = (a, b) => JSON.stringify([a.firstHole, a.par, names4(a)]) === JSON.stringify([b.firstHole, b.par, names4(b)]);
const names4 = h => Object.keys(h.byGolfer).sort().map(n => [n, h.byGolfer[n]]);

async function readHalfChecked(image, names, label) {
    const reads = [];
    for (let i = 0; i < 3; i++) {
        const half = validateHalf(await readHalf(image), names, label);
        reads.push(half);
        if (i >= 1) {
            const match = reads.slice(0, i).find(r => sameHalf(r, half));
            if (match) return half;
        }
    }
    throw new Error(`${label}: 같은 사진을 세 번 읽었는데 결과가 서로 달라 확정할 수 없습니다. 사진을 더 선명하게(화면 정면, 반사 없이) 다시 찍어 주세요.`);
}

const squeeze = s => String(s == null ? '' : s).replace(/\s+/g, '');

// 스코어카드는 본인 말고는 이름을 가려서 보여준다 ("박**", "이관*", "김○○").
// 가림표를 떼어 앞에 남은 글자만 돌려준다. "박**" → "박"
const MASK_TAIL = /[*＊○◯ㅇoOxX·ㆍ.\-_]+$/;
function visibleNamePart(raw) {
    return squeeze(raw).replace(MASK_TAIL, '');
}

// 사진 속 이름을 우리 4명 중 하나에 붙인다. 못 붙이면 null(게스트로 친다).
// 띄어쓰기는 무시하고, 이름이 통째로 들어 있으면("이관교님") 같은 사람으로 본다.
// 다만 '이관교'와 '이관수'처럼 다른 사람이 섞이면 안 되므로 부분 글자로는 안 붙인다.
// 가려진 이름은 여기서 처리하지 않는다 — 아래 resolveNames가 따로 맡는다.
function matchGolfer(raw, names) {
    const name = squeeze(raw);
    if (!name) return null;
    const exact = names.find(n => squeeze(n) === name);
    if (exact) return exact;
    const contained = names.filter(n => name.includes(squeeze(n)));
    return contained.length === 1 ? contained[0] : null;   // 둘 이상 걸리면 애매하니 포기
}

// 사진 속 사람들을 우리 4명에게 배정한다. {player → 골퍼} Map을 돌려준다.
//
// ① 실명이 그대로 보이는 사람부터 붙인다.
// ② 남은 사람은 가려진 이름의 앞글자로 붙인다. 우리 넷은 성이 다 달라
//    "박**"이면 박승수 하나로 정해진다.
// 단 앞글자로 후보가 둘 이상이거나, 두 사람이 같은 골퍼를 가리키면
// (예: 성이 김씨인 게스트가 껴서 "김**"이 두 번) 찍지 않고 실패시킨다.
function resolveNames(players, names) {
    const assigned = new Map();          // player → 골퍼 이름
    const taken = new Set();
    const skipped = [];

    players.forEach(p => {
        const hit = matchGolfer(p.name, names);
        if (!hit) return;
        if (taken.has(hit)) throw new Error(`${hit}이(가) 사진에 두 번 나옵니다. 이름을 식별할 수 없습니다.`);
        assigned.set(p, hit); taken.add(hit);
    });

    // 남은 사람들의 후보를 한꺼번에 구한다 (순서에 따라 결과가 달라지지 않도록).
    const rest = players.filter(p => !assigned.has(p));
    const cands = new Map();
    rest.forEach(p => {
        const part = visibleNamePart(p.name);
        cands.set(p, part ? names.filter(n => !taken.has(n) && n.startsWith(part)) : []);
    });

    const ambiguous = rest.filter(p => cands.get(p).length > 1);
    if (ambiguous.length) {
        throw new Error(`"${ambiguous.map(p => p.name).join('", "')}"이(가) 누구인지 식별할 수 없습니다.`);
    }

    rest.forEach(p => {
        const list = cands.get(p);
        if (list.length === 0) { if (squeeze(p.name)) skipped.push(String(p.name).trim()); return; }
        const golfer = list[0];
        if (taken.has(golfer)) {
            throw new Error(`"${p.name}"이(가) ${golfer}인지 식별할 수 없습니다. `
                + `성이 같은 인원이 있으면 이름이 모두 표시된 화면으로 다시 업로드해 주세요.`);
        }
        assigned.set(p, golfer); taken.add(golfer);
    });

    return { assigned, skipped };
}

// 한 사람의 18홀에서 버디(파-1)와 파 개수를 센다. 홀 수가 안 맞으면 null.
function holeCounts(player, par) {
    const strokes = player.strokes;
    if (!Array.isArray(strokes) || strokes.length !== HOLES) return null;
    let birdies = 0, pars = 0;
    strokes.forEach((s, i) => {
        const rel = s - par[i];
        if (rel === -1) birdies++;
        else if (rel === 0) pars++;
    });
    return { birdies, pars };
}

// 게스트를 이름이 아니라 '타수'로 지목해 빼낸다.
// 스코어카드가 이름을 가려 보여줘도, 게스트 성이 우리와 겹쳐도 이 한 줄만 정확히 빠진다.
// 앱에서 게스트 타수를 적어 보냈을 때만 돈다.
//
// 같은 타수인 사람이 둘이면(동타) 타수만으로는 못 가린다. 그때만 앱에서 함께 받은
// 버디·파 개수를 열쇠로 쓴다. 그래도 하나로 안 좁혀지면 찍지 않고 실패시킨다.
function pullOutGuest(players, par, guest) {
    const { total, birdies, pars } = guest;
    let hits = players.filter(p => p.total === total);

    if (hits.length === 0) {
        throw new Error(`입력한 게스트 타수(${total}타)와 일치하는 인원이 사진에 없습니다. `
            + `읽힌 합계: ${players.map(p => p.total).join(', ')}`);
    }

    if (hits.length > 1) {
        const keys = [];
        if (birdies !== null && birdies !== undefined) keys.push('버디');
        if (pars !== null && pars !== undefined) keys.push('파');
        if (keys.length === 0) {
            throw new Error(`${total}타가 ${hits.length}명이어서 게스트를 식별할 수 없습니다. `
                + `게스트의 버디·파 개수를 함께 입력해 다시 업로드해 주세요.`);
        }

        const narrowed = hits.filter(p => {
            const c = holeCounts(p, par);
            if (!c) return false;
            if (birdies !== null && birdies !== undefined && c.birdies !== birdies) return false;
            if (pars !== null && pars !== undefined && c.pars !== pars) return false;
            return true;
        });

        if (narrowed.length !== 1) {
            const seen = hits.map(p => {
                const c = holeCounts(p, par);
                return c ? `버디 ${c.birdies}·파 ${c.pars}` : '판독 불가';
            }).join(' / ');
            throw new Error(`${total}타가 ${hits.length}명인데 ${keys.join('·')} 개수로도 `
                + `${narrowed.length === 0 ? '일치하는 인원이 없습니다' : '1명으로 특정되지 않습니다'}. `
                + `사진 속 ${total}타: ${seen}`);
        }
        hits = narrowed;
    }

    return { guest: hits[0], rest: players.filter(p => p !== hits[0]) };
}

// 판독 결과 검산. 통과하면 {course, par, rel}, 아니면 Error를 던진다.
// guest는 앱에서 게스트 참여를 체크했을 때만 온다: {total, birdies, pars}
function validate(read, names, guest) {
    const par = read.par;
    if (!Array.isArray(par) || par.length !== HOLES) throw new Error(`파가 ${Array.isArray(par) ? par.length : 0}홀만 읽혔습니다.`);
    if (par.some(p => !Number.isInteger(p) || p < 3 || p > 6)) throw new Error('파 값에 오류가 있습니다.');
    const parSum = par.reduce((a, b) => a + b, 0);
    if (parSum < 68 || parSum > 74) throw new Error(`파 합계가 ${parSum}입니다. 판독 오류로 보입니다.`);

    const players = Array.isArray(read.players) ? read.players : [];
    const readNames = players.map(p => String(p.name || '').trim()).filter(Boolean);

    // 사진에 5명이 있는데 4명만 돌려주면, 빠진 한 명 자리에 게스트가 들어앉는다.
    // 그러면 각 줄의 합계는 다 맞아 앞의 검산을 통과해 버린다 —
    // 실제로 게스트(100타)가 박승수로 기록된 적이 있어 넣은 검사다.
    if (read.playerCount !== players.length) {
        throw new Error(`사진에는 ${read.playerCount}명이나 ${players.length}명만 판독되었습니다. `
            + `읽은 이름: ${readNames.join(', ') || '없음'}`);
    }

    // 게스트 타수를 적어 보냈으면 그 줄부터 빼낸다. 이름을 보기 전에 빼야
    // 성이 겹치는 게스트도 안전하게 걸러진다.
    let candidates = players;
    const skipped = [];
    if (guest) {
        const out = pullOutGuest(players, par, guest);
        candidates = out.rest;
        skipped.push(`${guest.total}타`);
    }

    // 남은 사람을 우리 4명에게 붙인다. (게스트 타수를 안 적었으면 이름으로 걸러진다)
    const { assigned, skipped: byName } = resolveNames(candidates, names);
    skipped.push(...byName);
    const rel = {};

    candidates.forEach(p => {
        const name = assigned.get(p);
        if (!name) return;
        const strokes = p.strokes;
        if (!Array.isArray(strokes) || strokes.length !== HOLES) throw new Error(`${name}: ${Array.isArray(strokes) ? strokes.length : 0}홀만 읽혔습니다.`);
        if (strokes.some(s => !Number.isInteger(s) || s < 1 || s > 15)) throw new Error(`${name}: 타수 값에 오류가 있습니다.`);
        const sum = strokes.reduce((a, b) => a + b, 0);
        if (sum !== p.total) throw new Error(`${name}: 18홀 합계 ${sum}타가 카드 기재 합계 ${p.total}타와 다릅니다.`);
        if (sum < 50 || sum > 160) throw new Error(`${name}: 합계가 ${sum}타입니다. 판독 오류로 보입니다.`);
        rel[name] = strokes.map((s, i) => s - par[i]);
    });

    // 못 찾았을 땐 사진에서 뭐라고 읽혔는지 같이 알려 준다. 이게 없으면 원인을 못 찾는다.
    const missing = names.filter(n => !rel[n]);
    if (missing.length) {
        throw new Error(`${missing.join(', ')}의 기록을 찾을 수 없습니다. `
            + `사진에서 읽은 이름: ${readNames.length ? readNames.join(', ') : '없음'}`);
    }

    return { course: String(read.course || '').trim(), par, rel, skipped, readNames };
}

// ── stats.js 쓰기 ────────────────────────────────────────────────
// 앞 9홀과 뒤 9홀 사이를 벌려 두는 기존 표기를 그대로 따른다.
function formatHoles(arr) {
    return `[${arr.slice(0, 9).join(', ')},   ${arr.slice(9).join(', ')}]`;
}

function formatRoundBlock(round, data, names, year) {
    const lines = names.map(n => `            "${n}": ${formatHoles(data.rel[n])}`).join(',\n');
    const guest = data.skipped.length ? `        // 게스트 ${data.skipped.join(', ')}는 기록하지 않는다.\n` : '';
    return `    "${round}": {\n` +
        guest +
        `        course: ${JSON.stringify(data.course)},\n` +
        (Number.isInteger(year) ? `        year: ${year},\n` : '') +
        `        par: ${formatHoles(data.par)},\n` +
        `        rel: {\n${lines}\n        }\n` +
        `    }`;
}

// 방금 쓴 stats.js를 그대로 실행해 집계를 꺼내 온다. 파일이 원본이므로
// 여기서 나온 값은 앱이 보게 될 값과 정확히 같다.
function loadStats(source) {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(source + '\n;this.__out = { ROUND_HOLES, ROUND_STATS, grossFromHoles };', ctx);
    return ctx.__out;
}

// 이번 라운드에서 깨진 기록을 찾는다. 이전 차수가 없으면(첫 차수) 아무것도 안 나온다.
// 축하할 만한 것만 골라 두 줄 안쪽으로 돌려준다.
function findRecords(source, round, names) {
    let S;
    try { S = loadStats(source); } catch (err) {
        console.error('  기록 확인 실패(알림에서만 빠집니다):', err.message);
        return [];
    }
    const key = String(round);
    const past = Object.keys(S.ROUND_HOLES).filter(r => r !== key);
    const lines = [];

    names.forEach(name => {
        const stat = S.ROUND_STATS[key] && S.ROUND_STATS[key][name];
        if (!stat) return;

        // 홀인원·이글은 기록 경신과 상관없이 그 자체로 알린다.
        if (stat.holeInOne > 0) lines.push(`🕳️ ${name} 홀인원!`);
        else if (stat.eagle > 0) lines.push(`🦅 ${name} 이글!`);

        const gross = S.grossFromHoles(round, name);
        const pastGross = past.map(r => S.grossFromHoles(r, name)).filter(g => g !== null);
        if (gross !== null && pastGross.length > 0 && gross < Math.min(...pastGross)) {
            lines.push(`🎉 ${name} 개인 최저타 경신! ${Math.min(...pastGross)} → ${gross}타`);
        }

        const pastBirdies = past.map(r => (S.ROUND_STATS[r] && S.ROUND_STATS[r][name] || {}).birdie)
            .filter(b => Number.isInteger(b));
        if (stat.birdie > 0 && pastBirdies.length > 0 && stat.birdie > Math.max(...pastBirdies)) {
            lines.push(`🐦 ${name} 버디 ${stat.birdie}개, 한 라운드 최다!`);
        }
    });

    return lines.slice(0, 3);   // 알림이 길어지지 않게 세 줄까지만
}

// { 로 시작하는 위치를 받아 짝이 맞는 } 의 위치를 돌려준다.
// ROUND_HOLES 안에는 중괄호가 든 문자열이 없어 단순 세기로 충분하다.
function matchBrace(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return i; }
    }
    throw new Error('stats.js의 괄호 짝이 맞지 않습니다.');
}

/* 차수 하나를 통째로 지운다. 잘못 올라간 카드를 되돌리는 유일한 길이다 —
   `stats.js`는 저장소 파일이라 앱이 직접 못 고치고, 홀 기록이 있는 차수는
   타수 칸이 잠겨 관리자 메뉴로도 못 고치기 때문이다(8차 카드가 9차로 올라간 적이 있다).

   앞의 쉼표까지 같이 걷어낸다. 안 그러면 `}, }`가 남아 형식이 깨진다.
   마지막 블록이면 뒤 쉼표가 없으므로 앞 쉼표를 지우는 쪽이 맞다. */
function removeRoundBlock(source, round) {
    const anchor = source.indexOf('const ROUND_HOLES = {');
    if (anchor === -1) throw new Error('stats.js에서 ROUND_HOLES를 찾지 못했습니다.');
    const objOpen = source.indexOf('{', anchor);
    const objClose = matchBrace(source, objOpen);

    const body = source.slice(objOpen + 1, objClose);
    const keyRe = new RegExp(`\\n[ \\t]*"${round}"\\s*:\\s*\\{`);
    const hit = keyRe.exec(body);
    if (!hit) throw new Error(`${round}차 홀 기록이 없어 삭제할 대상이 없습니다.`);

    const blockOpen = body.indexOf('{', hit.index + hit[0].length - 1);
    const blockClose = matchBrace(body, blockOpen);

    let head = body.slice(0, hit.index);        // 이 블록 앞
    let tail = body.slice(blockClose + 1);      // 이 블록 뒤

    if (/^\s*,/.test(tail)) tail = tail.replace(/^\s*,/, '');   // 뒤에 형제가 있으면 그 쉼표를 먹는다
    else head = head.replace(/,\s*$/, '');                      // 마지막 블록이면 앞 쉼표를 뗀다

    return source.slice(0, objOpen + 1) + head + tail + source.slice(objClose);
}

function upsertRound(source, round, block) {
    const anchor = source.indexOf('const ROUND_HOLES = {');
    if (anchor === -1) throw new Error('stats.js에서 ROUND_HOLES를 찾지 못했습니다.');
    const objOpen = source.indexOf('{', anchor);
    const objClose = matchBrace(source, objOpen);

    const body = source.slice(objOpen + 1, objClose);
    // 들여쓰기만 넘기고 줄바꿈은 넘지 않는다([ \t]). \s*로 두면 블록 앞의 빈 줄까지
    // 먹어 버려서, 같은 차수를 다시 올릴 때마다 엉뚱한 한 줄이 지워진다.
    const keyRe = new RegExp(`\\n[ \\t]*"${round}"\\s*:\\s*\\{`);
    const hit = keyRe.exec(body);

    if (hit) {
        // 이미 있는 차수는 통째로 갈아 끼운다 (다시 올리면 덮어쓰기).
        const blockOpen = body.indexOf('{', hit.index + hit[0].length - 1);
        const blockClose = matchBrace(body, blockOpen);
        const newBody = body.slice(0, hit.index + 1) + block.replace(/^\s+/, '    ') + body.slice(blockClose + 1);
        return source.slice(0, objOpen + 1) + newBody + source.slice(objClose);
    }

    // 새 차수는 마지막 블록 뒤에 붙인다.
    const trimmed = body.replace(/\s*$/, '');
    return source.slice(0, objOpen + 1) + trimmed + ',\n\n' + block + '\n' + source.slice(objClose);
}

async function processOverseas(req, names) {
    console.log(`\n▸ ${req.round}차 해외 (${req.time}, ${req.by}) 판독 시작 · 전반·후반 두 장`);
    for (const k of ['url', 'url2']) {
        if (typeof req[k] !== 'string' || !/^https?:\/\//.test(req[k])) throw new Error('사진 주소가 올바르지 않습니다.');
    }
    const [imgA, imgB] = [await fetchImage(req.url), await fetchImage(req.url2)];
    const a = await readHalfChecked(imgA, names, '전반 사진');
    const b = await readHalfChecked(imgB, names, '후반 사진');

    // 어느 사진이 전반이든 시작 홀 번호로 순서를 정한다. 같은 쪽을 두 번 올렸으면 여기서 걸린다.
    if (a.firstHole === b.firstHole) {
        throw new Error(`두 사진이 모두 ${a.firstHole === 1 ? '전반(1~9번홀)' : '후반(10~18번홀)'}으로 읽혔습니다. 전반·후반 사진을 각각 올려 주세요.`);
    }
    const [front, back] = a.firstHole === 1 ? [a, b] : [b, a];
    if (a.firstHole !== 1) console.log('  (전반·후반 사진이 서로 바뀌어 올라와 시작 홀 번호로 바로잡았습니다.)');

    const par = [...front.par, ...back.par];
    const parSum = par.reduce((x, y) => x + y, 0);
    if (parSum < OVERSEAS_PAR_MIN || parSum > OVERSEAS_PAR_MAX) {
        throw new Error(`파 합계가 ${parSum}입니다(허용 ${OVERSEAS_PAR_MIN}~${OVERSEAS_PAR_MAX}). 판독 오류로 보입니다.`);
    }

    const rel = {};
    names.forEach(n => {
        const strokes = [...front.byGolfer[n], ...back.byGolfer[n]];
        const sum = strokes.reduce((x, y) => x + y, 0);
        if (sum < 50 || sum > 160) throw new Error(`${n}: 합계가 ${sum}타입니다. 판독 오류로 보입니다.`);
        rel[n] = strokes.map((st, i) => st - par[i]);
    });

    const skipped = [...new Set([...front.skipped, ...back.skipped])];
    const course = String(req.course || front.course || back.course || '').trim();
    const data = { course, par, rel, skipped };

    const totals = names.map(n => `${n} ${par.reduce((x, p, i) => x + p + rel[n][i], 0)}타`).join(' · ');
    console.log(`  판독: ${course || '코스 미상'} / ${totals}`);
    return writeRound(req, names, data, totals);
}

async function processOne(req, names) {
    if (!Number.isInteger(req.round) || req.round < 1 || req.round > 99) throw new Error(`차수(${req.round})가 올바르지 않습니다.`);

    // 삭제 요청은 사진도 판독도 없다. 그 차수 블록만 걷어낸다.
    if (req.action === '삭제') return removeOne(req);
    // 멀리건 사용 알림(mission.js의 useMulligan). 파일은 안 건드리고 알림만 보낸다 — notify()가 나머지 동반자에게.
    if (req.action === '멀리건') {
        console.log(`\n▸ ${req.round}차 멀리건 사용 알림 (${req.time}, ${req.by})`);
        return { totals: `${req.by || '동반자'}님이 ${req.round}차 라운드에서 멀리건을 사용했습니다.`, skipped: [], records: [], written: false };
    }

    if (req.overseas) return processOverseas(req, names);

    console.log(`\n▸ ${req.round}차 (${req.time}, ${req.by}) 판독 시작`);
    if (typeof req.url !== 'string' || !/^https?:\/\//.test(req.url)) throw new Error('사진 주소가 올바르지 않습니다.');
    // 게스트 참여를 체크했을 때만 온다. 버디·파는 동타일 때 쓰는 보조값이라 없을 수 있다.
    const num = (v) => Number.isInteger(v) ? v : null;
    const guest = Number.isInteger(req.guestTotal)
        ? { total: req.guestTotal, birdies: num(req.guestBirdies), pars: num(req.guestPars) }
        : null;
    if (guest) {
        const extra = [guest.birdies !== null ? `버디 ${guest.birdies}` : null,
                       guest.pars !== null ? `파 ${guest.pars}` : null].filter(Boolean).join('·');
        console.log(`  게스트 ${guest.total}타${extra ? ` (${extra})` : ''} — 이 줄은 빼고 기록합니다.`);
    }
    const image = await fetchImage(req.url);
    const read = await readScorecard(image, names);
    const data = validate(read, names, guest);

    const totals = names.map(n => `${n} ${data.par.reduce((a, p, i) => a + p + data.rel[n][i], 0)}타`).join(' · ');
    console.log(`  사진 속 이름: ${data.readNames.join(', ')}`);
    console.log(`  판독: ${data.course || '코스 미상'} / ${totals}`);
    if (data.skipped.length) console.log(`  게스트 제외: ${data.skipped.join(', ')}`);
    return writeRound(req, names, data, totals);
}

// 검산을 통과한 한 차수를 stats.js에 쓴다. 국내·해외가 같이 쓴다.
function writeRound(req, names, data, totals) {
    const before = fs.readFileSync(STATS_FILE, 'utf8');
    // 특별미션 시즌은 재접속·재판독 시에도 바뀌지 않도록 홀 기록에 남긴다.
    const previous = loadStats(before).ROUND_HOLES[String(req.round)];
    const year = previous ? (previous.year || 2026) : (Number.isInteger(req.year) ? req.year : Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date())));
    const after = upsertRound(before, req.round, formatRoundBlock(req.round, data, names, year));

    // 기록 경신은 새 파일 기준으로 찾는다 (파일을 쓰기 전에도 확인할 수 있어 DRY RUN에서도 나온다).
    const records = findRecords(after, req.round, names);
    records.forEach(line => console.log(`  ${line}`));

    if (DRY_RUN) { console.log('  [DRY RUN] stats.js는 건드리지 않습니다.'); return { totals, skipped: data.skipped, records, written: false }; }

    fs.writeFileSync(STATS_FILE, after);

    // 형식이 깨졌으면 여기서 걸린다. 깨졌으면 원래대로 되돌린다.
    try {
        execFileSync(process.execPath, ['--check', STATS_FILE], { stdio: 'pipe' });
    } catch (err) {
        fs.writeFileSync(STATS_FILE, before);
        throw new Error('stats.js 기록 중 형식 오류가 발생해 원복했습니다.');
    }

    return { totals, skipped: data.skipped, records, written: true };
}

// 홀 기록 지우기. 판독과 같은 자리에서 처리해 커밋·상태·알림 흐름을 그대로 탄다.
function removeOne(req) {
    console.log(`\n▸ ${req.round}차 (${req.time}, ${req.by}) 홀 기록 삭제`);
    const before = fs.readFileSync(STATS_FILE, 'utf8');
    const after = removeRoundBlock(before, req.round);       // 없는 차수면 여기서 걸린다

    if (DRY_RUN) { console.log('  [DRY RUN] stats.js는 건드리지 않습니다.'); return { totals: `${req.round}차 홀 기록 삭제`, skipped: [], records: [], written: false }; }

    fs.writeFileSync(STATS_FILE, after);
    try {
        execFileSync(process.execPath, ['--check', STATS_FILE], { stdio: 'pipe' });
    } catch (err) {
        fs.writeFileSync(STATS_FILE, before);
        throw new Error('stats.js 삭제 중 형식 오류가 발생해 원복했습니다.');
    }
    console.log(`  ${req.round}차 블록을 걷어냈습니다.`);
    return {
        totals: `${req.round}차 홀 기록을 삭제했습니다. 스코어표 타수 칸 잠금이 해제됩니다.`,
        skipped: [], records: [], written: true
    };
}

async function main() {
    const payload = await readPayload();
    if (!payload) { console.log('데이터가 없습니다. 종료.'); return; }

    const pending = (payload.scoreRequests || []).filter(r => r && r.status === '대기');
    if (pending.length === 0) { console.log('판독할 요청이 없습니다. 종료.'); return; }

    // 골퍼 이름은 payload에서 그대로 가져온다 (api.js의 golfers와 같은 값이다).
    const names = Object.keys(payload.scores || {});
    if (names.length !== 4) { console.log(`골퍼가 ${names.length}명으로 읽혔습니다. 종료.`); return; }

    const targets = pending.slice(0, MAX_PER_RUN);
    console.log(`대기 ${pending.length}건 중 ${targets.length}건 처리 · 골퍼: ${names.join(', ')}`);

    const results = new Map();
    const done = [];
    for (const req of targets) {
        try {
            const out = await processOne(req, names);
            const guest = out.skipped.length ? ` (게스트 ${out.skipped.join(', ')} 제외)` : '';
            const records = out.records.length ? `\n${out.records.join('\n')}` : '';
            results.set(req.id, { status: '완료', note: `${out.totals}${guest}${records}` });
            if (out.written) done.push(`${req.round}차${req.action === '삭제' ? ' 삭제' : ''}`);
        } catch (err) {
            console.error(`  실패: ${err.message}`);
            results.set(req.id, { status: '실패', note: err.message });
        }
    }

    // 판독은 됐는데 푸시가 안 되면 앱에는 반영되지 않는다. 그래서 '완료'가 아니라 '실패'로 남긴다.
    if (done.length) {
        try {
            if (commitAndPush(done)) {
                console.log(`\n${done.join(', ')} 기록을 stats.js에 커밋했습니다.`);
                // 푸시만으로는 아직 앱에 안 보인다 — Pages 배포(약 1분)가 끝나야 타수가 채워진다.
                // 알림이 그보다 먼저 가면 '등록됐다'는데 타수가 비어 있어, 배포를 기다린 뒤 상태·알림을 보낸다.
                await waitForDeploy();
            }
        } catch (err) {
            console.error('푸시 실패:', err.message);
            targets.forEach(req => {
                const r = results.get(req.id);
                if (r && r.status === '완료') results.set(req.id, { status: '실패', note: '판독은 완료되었으나 저장에 실패했습니다. 다시 업로드해 주세요.' });
            });
        }
    }

    if (!DRY_RUN) await writeStatuses(results);
    await notify(targets, results);
    console.log('끝.');
}

// 방금 푸시한 stats.js가 실제 사이트에 올라올 때까지 기다린다(최대 4분 · 못 기다려도 그냥 진행한다).
// 사이트의 stats.js를 받아 방금 쓴 파일과 같아지면 배포가 끝난 것이다. 주소는 Actions의 GITHUB_REPOSITORY에서 낸다.
async function waitForDeploy() {
    const repo = process.env.GITHUB_REPOSITORY;           // 'owner/name' — Actions 밖에서는 없다
    if (!repo || DRY_RUN) return;
    const [owner, name] = repo.split('/');
    const url = `https://${owner}.github.io/${name}/stats.js`;
    const want = fs.readFileSync(STATS_FILE, 'utf8').trim();
    const until = Date.now() + 4 * 60 * 1000;
    console.log(`Pages 배포를 기다립니다: ${url}`);
    while (Date.now() < until) {
        await new Promise(r => setTimeout(r, 8000));
        try {
            const res = await fetch(`${url}?cb=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
            if (res.ok && (await res.text()).trim() === want) { console.log('  배포가 반영되었습니다.'); return; }
        } catch (err) { /* 잠깐 안 닿아도 계속 기다린다 */ }
    }
    console.log('  배포 확인을 시간 안에 못 했습니다. 그대로 진행합니다.');
}

// 판독이 끝났다고 알린다. 상태가 확정된 뒤에 보내야 '완료'라고 알려 놓고
// 사실은 푸시가 실패한 경우가 안 생긴다.
// 성공은 네 명 모두에게, 실패는 사진을 올린 사람에게만 보낸다.
async function notify(targets, results) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.log('VAPID 키가 없어 알림을 건너뜁니다.');
        return;
    }
    const env = { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY };

    for (const req of targets) {
        const r = results.get(req.id);
        if (!r) continue;
        const ok = r.status === '완료';
        if (req.action === '멀리건') {
            if (!ok || !req.by) continue;
            try {
                const left = Number.isInteger(req.left) ? ` (남은 사용권 ${req.left}장)` : '';
                await sendPush({
                    supabaseUrl: SUPABASE_URL, headers, env,
                    title: `🏌️ ${req.by}님 멀리건 사용`,
                    body: `${req.round}차 라운드에서 멀리건 사용권 1장을 사용했습니다${left}.`,
                    tag: `mulligan-${req.round}-${req.by}`,
                    exceptName: req.by,
                    dryRun: !!DRY_RUN
                });
            } catch (err) { console.error('멀리건 알림 발송 실패:', err.message); }
            continue;
        }
        try {
            await sendPush({
                supabaseUrl: SUPABASE_URL, headers, env,
                title: ok ? `⛳ ${req.round}차 스코어가 등록되었습니다` : `⚠️ ${req.round}차 스코어 판독 실패`,
                body: r.note,
                tag: `score-${req.round}`,
                onlyName: ok ? null : (req.by || SCORE_OWNER_FALLBACK),
                dryRun: !!DRY_RUN
            });
        } catch (err) {
            // 알림이 안 갔다고 판독 결과까지 뒤집지는 않는다.
            console.error('알림 발송 실패:', err.message);
        }
    }
}

function commitAndPush(done) {
    execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
    execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    execFileSync('git', ['add', STATS_FILE]);

    // 같은 사진을 다시 올려 내용이 그대로면 커밋할 게 없다. 그건 실패가 아니다.
    const staged = execFileSync('git', ['diff', '--cached', '--name-only']).toString().trim();
    if (!staged) { console.log('\n판독 결과가 기존 기록과 같아 커밋할 것이 없습니다.'); return false; }

    execFileSync('git', ['commit', '-m', `스코어카드 판독: ${done.join(', ')}`], { stdio: 'inherit' });

    // 그 사이 main이 앞서 갔으면 rebase하고 다시 민다.
    try {
        execFileSync('git', ['push'], { stdio: 'inherit' });
    } catch (err) {
        console.log('푸시가 밀려 rebase 후 다시 시도합니다.');
        execFileSync('git', ['pull', '--rebase', 'origin', 'main'], { stdio: 'inherit' });
        execFileSync('git', ['push'], { stdio: 'inherit' });
    }
    return true;
}

main().catch(err => { console.error(err); process.exit(1); });
