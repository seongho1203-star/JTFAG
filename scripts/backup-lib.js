// 백업·복구 스크립트가 같이 쓰는 도구 (scripts/backup.js · scripts/restore-backup.js).
//
// 서비스 키로 REST를 직접 부른다(다른 scripts/*.js와 같은 방식 — 꾸러미 설치가 없다).

const crypto = require('crypto');

function env() {
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
        if (!v) { console.error(`환경변수 ${k}가 없습니다.`); process.exit(1); }
    }
    return { url: SUPABASE_URL.replace(/\/$/, ''), key: SUPABASE_SERVICE_KEY };
}

function client() {
    const { url, key } = env();
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    async function call(path, init = {}) {
        const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
        if (!res.ok) {
            const text = await res.text();
            const err = new Error(`${init.method || 'GET'} ${path.split('?')[0]} 실패: ${res.status} ${text}`);
            err.status = res.status; err.body = text;
            throw err;
        }
        return res;
    }
    return { call };
}

// 키 순서와 상관없이 같은 내용이면 같은 글자가 되게 펴 쓴다.
// payload는 Postgres의 jsonb라 읽어 올 때마다 키 순서가 달라질 수 있다.
function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') {
        return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
}

// _rev는 '누가 몇 번째로 저장했나' 도장이라 내용이 아니다 — 지문에서 뺀다. 안 빼면 저장할 때마다 다른 백업이 된다.
function digestOf(payload, money) {
    const { _rev, ...rest } = payload || {};
    return crypto.createHash('sha256').update(canonical({ payload: rest, money: money || null })).digest('hex');
}

// 앱의 fetchFromSupabase()와 같은 잣대 — 빈 응답·망가진 자료를 백업하지도 되살리지도 않는다.
function validPayload(p) {
    return !!p && typeof p === 'object' && !Array.isArray(p)
        && Number.isInteger(p.totalRounds) && p.totalRounds >= 1
        && !!p.scores && typeof p.scores === 'object' && !Array.isArray(p.scores);
}

async function readLeague(api) {
    const res = await api.call('jtfag_league?id=eq.1&select=payload');
    const rows = await res.json();
    return rows[0] && rows[0].payload;
}

// 정산 금액 표 전체. 표가 아직 없으면 null(예전 payload 방식이라 payload 안에 있다).
async function readMoney(api) {
    const rows = [];
    try {
        for (let offset = 0; ; offset += 1000) {
            const res = await api.call(`jtfag_money?select=round,name,field,value,rev,updated_at&order=round.asc,name.asc,field.asc&limit=1000&offset=${offset}`);
            const page = await res.json();
            rows.push(...page);
            if (page.length < 1000) break;
        }
    } catch (err) {
        if (err.status === 404 || /PGRST205|42P01/.test(err.body || '')) return null;
        throw err;
    }
    return rows;
}

function tableMissing(err) {
    return err && (err.status === 404 || /PGRST205|42P01|jtfag_backups/.test(err.body || '')) && /jtfag_backups/.test(`${err.message} ${err.body}`);
}
const MISSING_HINT = '백업 보관 테이블(jtfag_backups)이 없습니다. supabase/backup.sql을 Supabase SQL Editor에서 한 번 실행해 주세요 (docs/백업.md).';

async function insertBackup(api, { kind, payload, money }) {
    const digest = digestOf(payload, money);
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    const res = await api.call('jtfag_backups?select=id,taken_at', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ kind, digest, bytes, payload, money })
    });
    const [row] = await res.json();
    return { id: row.id, taken_at: row.taken_at, digest, bytes };
}

module.exports = { client, canonical, digestOf, validPayload, readLeague, readMoney, insertBackup, tableMissing, MISSING_HINT };
