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

const fs = require('fs');
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
        if (taken.has(hit)) throw new Error(`${hit}이(가) 사진에 두 번 나옵니다. 이름을 못 가리겠습니다.`);
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
        throw new Error(`"${ambiguous.map(p => p.name).join('", "')}"이(가) 누구인지 가릴 수 없습니다.`);
    }

    rest.forEach(p => {
        const list = cands.get(p);
        if (list.length === 0) { if (squeeze(p.name)) skipped.push(String(p.name).trim()); return; }
        const golfer = list[0];
        if (taken.has(golfer)) {
            throw new Error(`"${p.name}"이(가) ${golfer}인지 아닌지 가릴 수 없습니다. `
                + `성이 같은 사람이 둘 있으면 이름이 다 보이는 화면으로 다시 올려주세요.`);
        }
        assigned.set(p, golfer); taken.add(golfer);
    });

    return { assigned, skipped };
}

// 판독 결과 검산. 통과하면 {course, par, rel}, 아니면 Error를 던진다.
function validate(read, names) {
    const par = read.par;
    if (!Array.isArray(par) || par.length !== HOLES) throw new Error(`파가 ${Array.isArray(par) ? par.length : 0}홀만 읽혔습니다.`);
    if (par.some(p => !Number.isInteger(p) || p < 3 || p > 6)) throw new Error('파에 이상한 값이 있습니다.');
    const parSum = par.reduce((a, b) => a + b, 0);
    if (parSum < 68 || parSum > 74) throw new Error(`파 합계가 ${parSum}입니다. 판독이 어긋난 것 같습니다.`);

    const players = Array.isArray(read.players) ? read.players : [];
    const readNames = players.map(p => String(p.name || '').trim()).filter(Boolean);

    // 사진에 5명이 있는데 4명만 돌려주면, 빠진 한 명 자리에 게스트가 들어앉는다.
    // 그러면 각 줄의 합계는 다 맞아 앞의 검산을 통과해 버린다 —
    // 실제로 게스트(100타)가 박승수로 기록된 적이 있어 넣은 검사다.
    if (read.playerCount !== players.length) {
        throw new Error(`사진에는 ${read.playerCount}명이 있는데 ${players.length}명이 읽혔습니다. `
            + `읽은 이름: ${readNames.join(', ') || '없음'}`);
    }

    // 게스트는 여기서 걸러진다. 우리 4명에게 배정된 사람만 남는다.
    const { assigned, skipped } = resolveNames(players, names);
    const rel = {};

    players.forEach(p => {
        const name = assigned.get(p);
        if (!name) return;
        const strokes = p.strokes;
        if (!Array.isArray(strokes) || strokes.length !== HOLES) throw new Error(`${name}: ${Array.isArray(strokes) ? strokes.length : 0}홀만 읽혔습니다.`);
        if (strokes.some(s => !Number.isInteger(s) || s < 1 || s > 15)) throw new Error(`${name}: 타수에 이상한 값이 있습니다.`);
        const sum = strokes.reduce((a, b) => a + b, 0);
        if (sum !== p.total) throw new Error(`${name}: 18홀 합 ${sum}타인데 카드에 적힌 합계는 ${p.total}타입니다.`);
        if (sum < 50 || sum > 160) throw new Error(`${name}: 합계가 ${sum}타입니다. 판독이 어긋난 것 같습니다.`);
        rel[name] = strokes.map((s, i) => s - par[i]);
    });

    // 못 찾았을 땐 사진에서 뭐라고 읽혔는지 같이 알려 준다. 이게 없으면 원인을 못 찾는다.
    const missing = names.filter(n => !rel[n]);
    if (missing.length) {
        throw new Error(`${missing.join(', ')}의 기록을 못 찾았습니다. `
            + `사진에서 읽은 이름: ${readNames.length ? readNames.join(', ') : '없음'}`);
    }

    return { course: String(read.course || '').trim(), par, rel, skipped, readNames };
}

// ── stats.js 쓰기 ────────────────────────────────────────────────
// 앞 9홀과 뒤 9홀 사이를 벌려 두는 기존 표기를 그대로 따른다.
function formatHoles(arr) {
    return `[${arr.slice(0, 9).join(', ')},   ${arr.slice(9).join(', ')}]`;
}

function formatRoundBlock(round, data, names) {
    const lines = names.map(n => `            "${n}": ${formatHoles(data.rel[n])}`).join(',\n');
    const guest = data.skipped.length ? `        // 게스트 ${data.skipped.join(', ')}는 기록하지 않는다.\n` : '';
    return `    "${round}": {\n` +
        guest +
        `        course: ${JSON.stringify(data.course)},\n` +
        `        par: ${formatHoles(data.par)},\n` +
        `        rel: {\n${lines}\n        }\n` +
        `    }`;
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

async function processOne(req, names) {
    console.log(`\n▸ ${req.round}차 (${req.time}, ${req.by}) 판독 시작`);
    if (!Number.isInteger(req.round) || req.round < 1 || req.round > 99) throw new Error(`차수(${req.round})가 이상합니다.`);
    if (typeof req.url !== 'string' || !/^https?:\/\//.test(req.url)) throw new Error('사진 주소가 이상합니다.');
    const image = await fetchImage(req.url);
    const read = await readScorecard(image, names);
    const data = validate(read, names);

    const totals = names.map(n => `${n} ${data.par.reduce((a, p, i) => a + p + data.rel[n][i], 0)}타`).join(' · ');
    console.log(`  사진 속 이름: ${data.readNames.join(', ')}`);
    console.log(`  판독: ${data.course || '코스 미상'} / ${totals}`);
    if (data.skipped.length) console.log(`  게스트 제외: ${data.skipped.join(', ')}`);

    if (DRY_RUN) { console.log('  [DRY RUN] stats.js는 건드리지 않습니다.'); return { totals, skipped: data.skipped, written: false }; }

    const before = fs.readFileSync(STATS_FILE, 'utf8');
    const after = upsertRound(before, req.round, formatRoundBlock(req.round, data, names));
    fs.writeFileSync(STATS_FILE, after);

    // 형식이 깨졌으면 여기서 걸린다. 깨졌으면 원래대로 되돌린다.
    try {
        execFileSync(process.execPath, ['--check', STATS_FILE], { stdio: 'pipe' });
    } catch (err) {
        fs.writeFileSync(STATS_FILE, before);
        throw new Error('stats.js를 쓰다가 형식이 깨져 되돌렸습니다.');
    }

    return { totals, skipped: data.skipped, written: true };
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
            results.set(req.id, { status: '완료', note: `${out.totals}${guest}` });
            if (out.written) done.push(`${req.round}차`);
        } catch (err) {
            console.error(`  실패: ${err.message}`);
            results.set(req.id, { status: '실패', note: err.message });
        }
    }

    // 판독은 됐는데 푸시가 안 되면 앱에는 반영되지 않는다. 그래서 '완료'가 아니라 '실패'로 남긴다.
    if (done.length) {
        try {
            if (commitAndPush(done)) console.log(`\n${done.join(', ')} 기록을 stats.js에 커밋했습니다.`);
        } catch (err) {
            console.error('푸시 실패:', err.message);
            targets.forEach(req => {
                const r = results.get(req.id);
                if (r && r.status === '완료') results.set(req.id, { status: '실패', note: '판독은 됐지만 저장에 실패했습니다. 다시 올려주세요.' });
            });
        }
    }

    if (!DRY_RUN) await writeStatuses(results);
    await notify(targets, results);
    console.log('끝.');
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
        try {
            await sendPush({
                supabaseUrl: SUPABASE_URL, headers, env,
                title: ok ? `⛳ ${req.round}차 스코어가 등록됐습니다` : `⚠️ ${req.round}차 스코어 판독 실패`,
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
