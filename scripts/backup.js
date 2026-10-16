// 리그 데이터 백업기 — 하루 한 번(.github/workflows/backup.yml) 돈다.
//
// jtfag_league.payload(앱 전체 상태)와 jtfag_money(정산 금액)를 jtfag_backups에 통째로 남긴다.
// 켜는 법과 되살리는 법은 docs/백업.md.
//
//  · 어제와 내용이 같으면 새로 안 남긴다(digest 비교 · 저장 도장 _rev는 내용이 아니다).
//  · 비어 있거나 망가진 payload는 백업하지 않고 빨갛게 실패한다 — 그걸 남기면 좋은 백업을 밀어낸다.
//  · 오래된 것은 지운다: 30일이 지난 것 중 일요일(한국 시각) 것은 180일까지 남긴다.
//    '직접'·'복구 직전' 백업도 일요일 것과 같이 180일 남긴다. 어떤 경우에도 최근 5개는 남긴다.
//  · 앱의 데이터는 건드리지 않는다. 읽기만 하고 jtfag_backups에만 쓴다.

const {
    client, digestOf, validPayload, readLeague, readMoney, insertBackup, tableMissing, MISSING_HINT
} = require('./backup-lib');

const DAILY_DAYS = 30;
const KEEP_DAYS = 180;
const MIN_KEEP = 5;
const DAY = 86400000;
const KIND = process.env.BACKUP_KIND === 'manual' ? 'manual' : 'daily';

const isKstSunday = t => new Date(new Date(t).getTime() + 9 * 3600000).getUTCDay() === 0;

// 지울 것을 가른다. (순수 함수 — tests/backup.js가 그대로 부른다)
function pickExpired(rows, now = Date.now()) {
    const sorted = rows.slice().sort((a, b) => a.id - b.id);
    const protectedIds = new Set(sorted.slice(-MIN_KEEP).map(r => r.id));
    return sorted.filter(r => {
        if (protectedIds.has(r.id)) return false;
        const age = now - new Date(r.taken_at).getTime();
        if (age <= DAILY_DAYS * DAY) return false;
        const keepLong = r.kind !== 'daily' || isKstSunday(r.taken_at);
        return !(keepLong && age <= KEEP_DAYS * DAY);
    }).map(r => r.id);
}

async function main() {
    const api = client();
    const payload = await readLeague(api);
    if (!validPayload(payload)) {
        throw new Error('jtfag_league의 payload가 비었거나 유효하지 않아 백업하지 않습니다. 앱 데이터부터 확인해 주세요.');
    }
    const money = await readMoney(api);
    const digest = digestOf(payload, money);

    let last = null;
    try {
        const res = await api.call('jtfag_backups?select=id,taken_at,digest,bytes&order=id.desc&limit=1');
        last = (await res.json())[0] || null;
    } catch (err) {
        if (tableMissing(err)) throw new Error(MISSING_HINT);
        throw err;
    }

    const bytes = Buffer.byteLength(JSON.stringify(payload));
    console.log(`지금 데이터: 차수 ${payload.totalRounds}개 · payload ${(bytes / 1024).toFixed(1)}KB · 금액 ${money ? money.length + '줄' : '(payload 안)'}`);

    if (last && last.digest === digest && KIND === 'daily') {
        console.log(`#${last.id}(${last.taken_at})과 내용이 같아 새로 남기지 않습니다.`);
    } else {
        if (last && last.bytes > 20000 && bytes < last.bytes * 0.5) {
            console.warn(`::warning::payload가 직전 백업(${(last.bytes / 1024).toFixed(0)}KB)의 절반 아래(${(bytes / 1024).toFixed(0)}KB)로 줄었습니다. 데이터가 잘렸는지 확인해 주세요 — 직전 백업 #${last.id}은 그대로 남아 있습니다.`);
        }
        const row = await insertBackup(api, { kind: KIND, payload, money });
        console.log(`백업 #${row.id} 저장 (${KIND}, ${(row.bytes / 1024).toFixed(1)}KB)`);
    }

    const res = await api.call('jtfag_backups?select=id,taken_at,kind&order=id.asc&limit=5000');
    const rows = await res.json();
    const expired = pickExpired(rows);
    if (expired.length) {
        await api.call(`jtfag_backups?id=in.(${expired.join(',')})`, { method: 'DELETE' });
        console.log(`오래된 백업 ${expired.length}개를 지웠습니다. (남은 ${rows.length - expired.length}개)`);
    } else {
        console.log(`지울 오래된 백업 없음 (모두 ${rows.length}개)`);
    }
}

if (require.main === module) main().catch(err => { console.error(err.message || err); process.exit(1); });
module.exports = { pickExpired };
