// 백업 되살리기 — 수동으로만 돈다(.github/workflows/restore-backup.yml). 켜는 법은 docs/백업.md.
//
//  BACKUP_ID 비움     → 최근 백업 목록만 보여 준다(아무것도 안 고친다).
//  BACKUP_ID=latest   → 가장 최근 백업  /  BACKUP_ID=12 → 그 번호
//  DRY_RUN=1(기본)    → 무엇이 어떻게 바뀌는지만 보여 주고 안 고친다.
//  INCLUDE_MONEY=1    → 정산 금액(jtfag_money)도 백업 시점으로 되돌린다. 안 켜면 payload만 되살린다.
//
// 안전장치:
//  · 고치기 **직전의 지금 상태를 먼저 백업**한다(kind=pre-restore). 잘못 되살려도 되돌릴 수 있다.
//  · 백업이 비었거나 유효하지 않으면 거절한다.
//  · 쓸 때 저장 도장을 `{by:'workflow'}`로 바꾼다 — 읽어 온 도장을 그대로 두면 마지막에 쓴 사람의 앱이
//    이 갱신을 자기 메아리로 착각해 혼자만 못 본다(read-scorecard.js와 같은 주석).
//  · 금액은 줄을 덮어쓰기(upsert)만 한다. 지우는 일은 없다(백업에 없는 줄은 그대로 둔다).

const { client, validPayload, readLeague, readMoney, insertBackup, tableMissing, MISSING_HINT } = require('./backup-lib');

const { BACKUP_ID = '', DRY_RUN = '1', INCLUDE_MONEY = '' } = process.env;
const dry = DRY_RUN !== '' && DRY_RUN !== '0' && DRY_RUN !== 'false';

const kst = t => new Date(new Date(t).getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
const kb = n => `${(n / 1024).toFixed(1)}KB`;

function summary(p) {
    const fund = p.clubFund !== undefined ? ` · 공금 ${Number(p.clubFund).toLocaleString('ko-KR')}원` : '';
    const trips = Array.isArray(p.trips) ? ` · 여행 ${p.trips.length}개` : '';
    return `차수 ${p.totalRounds}개 · 다음 일정 "${p.nextRoundDate || '없음'}"${fund}${trips}`;
}

async function main() {
    const api = client();
    let list;
    try {
        list = await (await api.call('jtfag_backups?select=id,taken_at,kind,bytes&order=id.desc&limit=30')).json();
    } catch (err) {
        if (tableMissing(err)) throw new Error(MISSING_HINT);
        throw err;
    }

    if (!BACKUP_ID) {
        console.log('최근 백업 (번호 · 한국 시각 · 종류 · 크기):');
        list.forEach(r => console.log(`  #${r.id} · ${kst(r.taken_at)} · ${r.kind} · ${kb(r.bytes)}`));
        console.log('\n되살리려면 backup_id에 번호(또는 latest)를 넣고 다시 실행하세요. 처음에는 dry_run을 켠 채로 확인하세요.');
        return;
    }

    const wantId = BACKUP_ID === 'latest' ? (list[0] && list[0].id) : Number(BACKUP_ID);
    if (!Number.isInteger(wantId)) throw new Error(`backup_id를 읽지 못했습니다: "${BACKUP_ID}" (번호 또는 latest)`);
    const rows = await (await api.call(`jtfag_backups?id=eq.${wantId}&select=id,taken_at,kind,payload,money`)).json();
    const backup = rows[0];
    if (!backup) throw new Error(`백업 #${wantId}이 없습니다. backup_id를 비우고 실행하면 목록이 나옵니다.`);
    if (!validPayload(backup.payload)) throw new Error(`백업 #${wantId}의 payload가 유효하지 않아 되살리지 않습니다.`);

    const current = await readLeague(api);
    console.log(`되살릴 백업: #${backup.id} · ${kst(backup.taken_at)} · ${backup.kind}`);
    console.log(`  백업 시점: ${summary(backup.payload)}`);
    console.log(`  지금 상태: ${current ? summary(current) : '(비어 있음)'}`);

    const money = INCLUDE_MONEY && INCLUDE_MONEY !== '0' ? backup.money : null;
    if (INCLUDE_MONEY && INCLUDE_MONEY !== '0') {
        console.log(money ? `  정산 금액: ${money.length}줄을 백업 시점 값으로 덮어씁니다.` : '  정산 금액: 이 백업에는 금액 표가 없어 건드리지 않습니다.');
    } else {
        console.log('  정산 금액(jtfag_money)은 건드리지 않습니다. 금액도 되돌리려면 include_money를 켜세요.');
    }

    if (dry) {
        console.log('\n[DRY RUN] 아무것도 고치지 않았습니다. 실제로 되살리려면 dry_run을 끄고 다시 실행하세요.');
        return;
    }

    // 1) 고치기 전의 지금 상태를 남긴다 — 되돌릴 길이다.
    if (validPayload(current)) {
        const nowMoney = await readMoney(api);
        const saved = await insertBackup(api, { kind: 'pre-restore', payload: current, money: nowMoney });
        console.log(`\n복구 직전 상태를 백업 #${saved.id}로 남겼습니다. (잘못 되살렸다면 이 번호로 다시 되살리세요)`);
    } else {
        console.log('\n지금 payload가 비어 있거나 유효하지 않아 복구 직전 백업은 건너뜁니다.');
    }

    // 2) payload 되살리기
    const payload = { ...backup.payload, _rev: { by: 'workflow', n: Date.now() } };
    await api.call('jtfag_league?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payload }) });
    console.log('payload를 되살렸습니다.');

    // 3) 금액 되살리기(켰을 때만)
    if (money && money.length) {
        await api.call('jtfag_money?on_conflict=round,name,field', {
            method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(money.map(m => ({ round: m.round, name: m.name, field: m.field, value: m.value, rev: m.rev })))
        });
        console.log(`정산 금액 ${money.length}줄을 되살렸습니다.`);
    }
    console.log('\n앱을 새로고침하면 보입니다.');
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
