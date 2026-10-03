/* ─────────────────────────────────────────────────────────────────
   정산 금액 — payload에서 떼어 낸 저장소 (supabase/money.sql · docs/금액분리.md)

   **왜 떼어 냈나.** 금액이 payload 한 덩어리 안에 있을 때는 누가 무엇을 저장하든
   (일정 · 사진 · 계급 자동 저장까지) 네 명의 금액 전체를 그 폰이 마지막으로 본 상태로
   다시 써 넣었다. 실시간을 놓친 폰, 예전 코드가 떠 있는 폰 하나가 저장하는 순간
   남의 금액이 0이 되거나 옛 값으로 되돌아갔다. 보호막(ui.js의 `myMoneyEdits`)을 덧대 봤지만
   "내 칸을 1분 동안, 내 폰이 켜져 있을 때만" 지키는 그물이라 넷이 동시에 적는 자리에서 샜다.

   **이제 칸 하나가 테이블의 행 하나다**(`jtfag_money`: round · name · field → value).
   내 칸을 쓰는 일은 그 한 줄만 바꾸므로 **남의 칸에 닿을 수 없다.**
   `appData.roundMoney`는 화면·계산이 읽는 **거울**일 뿐이고, 테이블 값을 늘 그 위에 얹는다
   (`overlayMoney()`). payload에 든 금액이 아무리 낡아도 화면에는 테이블 값이 나온다.

   **테이블이 아직 없으면(SQL을 안 돌렸으면) 예전 방식 그대로 돈다**(`moneyMode = 'payload'`).
   그래서 이 파일을 먼저 올려도 실서비스가 깨지지 않는다.
   ───────────────────────────────────────────────────────────────── */
const MONEY_TABLE = 'jtfag_money';
const MONEY_FIELDS = ['start', 'end', 'donate'];
const MONEY_ECHO_WAIT = 8000;         // 내 쓰기의 메아리를 이만큼 기다린다(실시간이 끊겼을 때 대비)

let moneyMode = 'payload';            // 'table' | 'payload'
let moneyCells = {};                  // "차수|이름|칸" → 테이블에 있는 값
let moneyPending = {};                // "차수|이름|칸" → { rev, value } 내가 썼는데 아직 메아리가 안 온 것
let moneyChains = {};                 // 칸마다 쓰기를 한 줄로 세운다(같은 칸 두 번이 순서가 뒤바뀌지 않게)
let moneySeq = 0;
let moneyMine = {};                   // 이 기기에서 내가 한 번이라도 쓴 칸 — 되돌리기는 이 칸만 손댄다
let moneyChannel = null;
let moneyRenderQueued = false;

function moneyKey(r, name, field) { return `${r}|${name}|${field}`; }

/* 테이블을 통째로 읽는다. 접속할 때와 앱이 앞으로 나올 때(`fetchFromSupabase()`).
   처음 읽기에 성공하면 'table' 모드로 바꾸고 실시간 구독을 건다.
   실패하면 — 테이블이 없거나 연결이 안 되면 — 지금 모드를 그대로 둔다. */
async function loadMoneyTable() {
    try {
        const { data, error } = await window._supabase.from(MONEY_TABLE).select('round,name,field,value,rev');
        if (error) throw error;
        // 줄 목록이 아니면 테이블이 있다고 믿지 않는다 — 어정쩡한 응답에 'table' 모드로 넘어가면
        // 쓰기는 실패하는데 화면은 테이블 값(빈 것)을 믿게 된다.
        if (!Array.isArray(data)) throw new Error('jtfag_money 응답이 줄 목록이 아님');
        const next = {};
        (data || []).forEach(row => { next[moneyKey(row.round, row.name, row.field)] = Number(row.value) || 0; });
        moneyCells = next;
        if (moneyMode !== 'table') {
            moneyMode = 'table';
            subscribeMoney();
            console.log('💰 금액은 jtfag_money 테이블에서 칸마다 따로 저장합니다.');
        }
        return true;
    } catch (e) {
        if (moneyMode !== 'table') console.warn('💰 jtfag_money를 못 읽어 예전 방식(payload)으로 저장합니다.', e && (e.message || e.code));
        return false;
    }
}

/* 테이블 값을 `appData.roundMoney`에 얹는다. **payload에 든 금액보다 언제나 테이블이 이긴다.**
   아직 메아리가 안 온 내 쓰기(`moneyPending`)는 그 위에 한 번 더 얹는다 — 안 그러면
   쓰는 도중에 들어온 남의 저장이 내 칸을 잠깐 옛 값으로 보이게 한다.
   테이블에 없는 칸(한 번도 테이블로 쓴 적 없는 옛 기록)은 payload 값을 그대로 둔다. */
function overlayMoney() {
    if (moneyMode !== 'table' || !appData) return;
    if (!appData.roundMoney) appData.roundMoney = [];
    const put = (key, v) => {
        const [rs, name, field] = key.split('|');
        const r = Number(rs);
        if (!(r >= 0 && r < (appData.totalRounds || 0))) return;    // 지운 차수의 줄은 그냥 둔다
        if (!appData.roundMoney[r]) appData.roundMoney[r] = {};
        if (!appData.roundMoney[r][name]) appData.roundMoney[r][name] = { start: 0, end: 0 };
        appData.roundMoney[r][name][field] = v;
    };
    Object.keys(moneyCells).forEach(k => put(k, moneyCells[k]));
    Object.keys(moneyPending).forEach(k => put(k, moneyPending[k].value));
}

/* 칸 하나를 쓴다. 같은 칸을 잇따라 쓰면 앞의 것이 끝난 뒤에 보낸다 — 두 요청이 동시에 날아가
   DB에 닿는 순서가 뒤바뀌면 나중에 친 값이 먼저 친 값에 덮인다(payload 시절에 실제로 그랬다).
   기다리는 사이 더 새 값이 생기면 낡은 쪽은 아예 안 보낸다. */
function writeMoneyCell(r, name, field, value) {
    const key = moneyKey(r, name, field);
    const rev = `${CLIENT_ID}:${++moneySeq}`;
    moneyPending[key] = { rev, value };
    moneyMine[key] = true;
    moneyChains[key] = (moneyChains[key] || Promise.resolve()).then(() => sendMoneyCell(key, r, name, field, value, rev));
    return moneyChains[key];
}

async function sendMoneyCell(key, r, name, field, value, rev) {
    const tries = [0, 1000, 2000, 4000, 8000];       // 연결이 흔들리면 조금씩 늦춰 다시 보낸다
    for (let i = 0; i < tries.length; i++) {
        if (!moneyPending[key] || moneyPending[key].rev !== rev) return;   // 더 새 값이 생겼다 — 그쪽이 보낸다
        if (tries[i]) await new Promise(res => setTimeout(res, tries[i]));
        if (!moneyPending[key] || moneyPending[key].rev !== rev) return;
        try {
            const { error } = await window._supabase.from(MONEY_TABLE)
                .upsert({ round: r, name, field, value, rev, updated_at: new Date().toISOString() },
                        { onConflict: 'round,name,field' });
            if (error) throw error;
            showSaveStatus("⚡ 동기화 완료");
            // 메아리가 끝내 안 오면(실시간이 끊겼다) 손을 떼고 테이블을 다시 읽어 진짜 값으로 맞춘다.
            setTimeout(() => {
                const p = moneyPending[key];
                if (p && p.rev === rev) {
                    delete moneyPending[key];
                    moneyCells[key] = value;
                    loadMoneyTable().then(() => { overlayMoney(); queueMoneyRender(); });
                }
            }, MONEY_ECHO_WAIT);
            return;
        } catch (e) {
            console.error('💰 금액 저장 실패', i + 1, '번째', e);
            if (i === 0) showSaveStatus("⚠️ 저장 재시도 중…");
        }
    }
    // 끝내 못 보냈다. 붙들고 있으면 '저장된 줄 아는데 실제로는 없는' 상태가 되므로
    // 손을 떼고 테이블 값으로 되돌린 뒤 분명히 알린다.
    if (moneyPending[key] && moneyPending[key].rev === rev) {
        delete moneyPending[key];
        overlayMoney(); queueMoneyRender();
        showToast(`⚠️ ${name} ${MONEY_FIELD_LABEL[field] || field} 저장에 실패했습니다. 연결을 확인하고 다시 입력해 주세요.`, 5000);
    }
}

/* 실시간으로 칸 하나가 바뀌었다.
   **내가 그 칸에 쓰고 아직 메아리를 못 받았으면, 내 마지막 쓰기의 메아리가 올 때까지
   그 칸에 들어오는 것은 무시한다.** 실시간은 DB에 들어간 순서대로 오므로,
   - 남의 것이 내 것보다 먼저 들어갔으면: 남의 것(무시) → 내 것(받음) = DB도 내 것.
   - 내 것이 먼저면: 내 것(받음, 대기 해제) → 남의 것(받음) = DB도 남의 것.
   어느 쪽이든 화면과 DB가 같아진다. */
function onMoneyRow(row) {
    if (!row || row.name === undefined || row.field === undefined) return;
    const key = moneyKey(row.round, row.name, row.field);
    const p = moneyPending[key];
    if (p) {
        if (row.rev !== p.rev) return;
        delete moneyPending[key];
    }
    moneyCells[key] = Number(row.value) || 0;
    if (typeof isLoaded !== 'undefined' && !isLoaded) return;   // 접속 중이면 fetch가 얹는다
    overlayMoney();
    queueMoneyRender();
}

function subscribeMoney() {
    if (moneyChannel) return;
    moneyChannel = window._supabase.channel('public:' + MONEY_TABLE)
        .on('postgres_changes', { event: '*', schema: 'public', table: MONEY_TABLE }, ev => onMoneyRow(ev && ev.new))
        .subscribe();
}

// 넷이 한꺼번에 적으면 이벤트가 몰려온다. 한 번에 모아 한 번만 그린다.
function queueMoneyRender() {
    if (moneyRenderQueued) return;
    moneyRenderQueued = true;
    setTimeout(() => { moneyRenderQueued = false; if (typeof renderAll === 'function') renderAll(); }, 0);
}

/* 테이블에 아직 없는 금액을 payload에서 옮긴다(처음 한 번 · 이후엔 거의 할 일이 없다).
   **이미 있는 줄은 절대 덮지 않는다**(`ignoreDuplicates`) — payload 쪽이 낡았을 수 있다.
   넷이 동시에 접속해 동시에 옮겨도 같은 값을 넣으려다 부딪칠 뿐이라 안전하다.
   0은 옮기지 않는다(없는 것과 같다). */
async function migrateMoneyFromPayload() {
    if (moneyMode !== 'table' || !appData || !appData.roundMoney) return;
    const rows = [];
    appData.roundMoney.forEach((round, r) => {
        if (!round || r >= appData.totalRounds) return;
        golfers.forEach(name => MONEY_FIELDS.forEach(field => {
            const v = Number(round[name] && round[name][field]) || 0;
            if (v && moneyCells[moneyKey(r, name, field)] === undefined) {
                rows.push({ round: r, name, field, value: v, rev: 'migrate' });
            }
        }));
    });
    if (!rows.length) return;
    try {
        const { error } = await window._supabase.from(MONEY_TABLE)
            .upsert(rows, { onConflict: 'round,name,field', ignoreDuplicates: true });
        if (error) throw error;
        // 다른 폰이 그 사이 먼저 넣었을 수 있으니 다시 읽어 진짜 값으로 맞춘다.
        await loadMoneyTable();
        console.log(`💰 payload에 있던 금액 ${rows.length}칸을 테이블로 옮겼습니다.`);
    } catch (e) {
        console.warn('💰 금액 옮기기 실패 — 다음 접속 때 다시 시도합니다.', e);
    }
}

/* 되돌리기. 되돌리기용 사본에는 **남의 금액도 그때 상태로** 들어 있어, 그걸 그대로 쓰면
   그 뒤에 남이 적은 금액을 지운다("다른 사람 금액이 0이 된다"의 한 갈래였다).
   그래서 **이 기기에서 내가 실제로 쓴 칸만**(`moneyMine`) 사본 값과 지금 값이 다를 때 쓴다.
   '고칠 수 있는 칸'(`canEditMoney()`)으로 거르면 관리자 전체 열기 중에는 넷 다 걸려
   같은 일이 다시 생긴다. 남의 칸은 테이블 값이 그대로 남는다. */
function commitUndoMoney(currentData, snapshot) {
    if (moneyMode !== 'table' || !snapshot || !snapshot.roundMoney) return;
    snapshot.roundMoney.forEach((round, r) => {
        if (!round || r >= (snapshot.totalRounds || 0)) return;
        golfers.forEach(name => {
            MONEY_FIELDS.forEach(field => {
                if (!moneyMine[moneyKey(r, name, field)]) return;
                const want = Number(round[name] && round[name][field]) || 0;
                const cur = currentData && currentData.roundMoney && currentData.roundMoney[r] && currentData.roundMoney[r][name];
                const now = Number(cur && cur[field]) || 0;
                if (want !== now) writeMoneyCell(r, name, field, want);
            });
        });
    });
}

/* 새 차수를 만들면 그 차수 칸을 비운다. 예전에 같은 번호의 차수를 지운 적이 있으면
   테이블에 그때 금액이 남아 있다(지울 땐 일부러 안 지운다 — 되돌리기로 살려야 하니까).
   새로 만드는 차수는 새 경기이므로 0에서 시작한다. 0이 아닌 칸만 쓴다. */
function clearMoneyRound(r) {
    if (moneyMode !== 'table') return;
    golfers.forEach(name => MONEY_FIELDS.forEach(field => {
        const key = moneyKey(r, name, field);
        const v = moneyPending[key] ? moneyPending[key].value : moneyCells[key];
        if (v) writeMoneyCell(r, name, field, 0);
    }));
}
