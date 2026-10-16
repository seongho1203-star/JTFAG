// ◇ trip.js를 나눈 조각 — 일본 골프장 찾기(라쿠텐 GORA) · 일본 이름 한글화(koName)
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// ═══ 일본 골프장 찾기 (라쿠텐 GORA) ═══════════════════════════════
// 흐름: 기준 위치(숙소·역 이름을 찾거나 지도를 눌러 고른다) → 범위·최대 금액 → GORA에 그날 예약 가능한
// 플랜을 묻는다 → 지도와 목록(가까운 순)에 펼친다 → `예약 완료`가 그 날짜의 골프장으로 넣는다.
// **예약·결제는 앱이 못 한다** — 라쿠텐이 예약 API를 열어 두지 않았다. 그래서 그 골프장의 GORA 예약
// 페이지를 열어 주고(원문 / 구글 번역으로 한국어), 사람이 거기서 예약한다.
// 라쿠텐에 묻는 일은 Supabase 함수 `gora`가 한다(열쇠를 앱에 둘 수 없다 — 공개 저장소).
// 그 함수는 이름을 고른 칸만 넘기는 얇은 심부름꾼이라, 묻는 방법을 바꿀 땐 여기만 고치면 된다.

const GORA_RANGES = [20, 40, 60, 100];   // km (직선)
const GORA_PRICES = [0, 10000, 15000, 20000, 30000];   // 0 = 상관없음
const GORA_PAGES = 3;   // 한 번에 30곳씩, 최대 90곳까지 본다
const JP_PREFS_KO = ['홋카이도', '아오모리', '이와테', '미야기', '아키타', '야마가타', '후쿠시마', '이바라키', '도치기', '군마', '사이타마', '지바', '도쿄', '가나가와', '니가타', '도야마', '이시카와', '후쿠이', '야마나시', '나가노', '기후', '시즈오카', '아이치', '미에', '시가', '교토', '오사카', '효고', '나라', '와카야마', '돗토리', '시마네', '오카야마', '히로시마', '야마구치', '도쿠시마', '가가와', '에히메', '고치', '후쿠오카', '사가', '나가사키', '구마모토', '오이타', '미야자키', '가고시마', '오키나와'];
const JP_PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];

let gora = { date: null, base: null, range: 40, price: 0, items: [], all: [], busy: false, map: null, layer: null, places: [], raw: {}, opts: goraLoadOpts(), time: '' };

// ─── 세부 조건 ───
// 라쿠텐에 묻는 칸 이름을 확신할 수 없어(문서가 막혀 있다) **받은 플랜을 앱이 거른다.** 그래서 조건을 바꿔도
// 다시 묻지 않고 그 자리에서 목록이 바뀐다. 플랜마다 `lunch`·`playerNumMin`·`assu2sum`이 온다.
const GORA_OPTS = [
    { key: 'two', label: '👥 2인 가능', tag: '2인', test: p => p.two },
    { key: 'lunch', label: '🍱 점심 포함', tag: '점심', test: p => p.lunch },
    { key: 'no9', label: '⛳ 9홀 제외', tag: '', test: p => !p.half }
];
// 9홀(하프) 플랜 · 9홀짜리 골프장. 라쿠텐에 정해진 칸이 없어 이름과 `round` 값으로 가린다.
// `ハーフ` 하나만으로 보지 말 것 — 18홀 플랜에도 `ハーフ休憩`(9홀 끝나고 쉬는 시간)·`ハーフ後`가 흔히 붙는다.
const HALF_RE = /ハーフ(ラウンド|プレー|プレイ|のみ|プラン|コース|R)|(^|[^0-9０-９])(9|９)\s*(H|Ｈ|ホール|holes?)|0\.5\s*R|9홀|하프/i;
function goraHalf(p) {
    const r = p.round;
    if (typeof r === 'number' && r > 0 && r < 1) return true;
    if (typeof r === 'string' && (/^\s*ハーフ|0\.5/.test(r) || /^\s*(9|９)\s*(H|ホール)?\s*$/i.test(r))) return true;
    return HALF_RE.test(String(p.planName || ''));
}
function goraNine(raw) {
    const n = parseInt(raw.holeCount ?? raw.holes ?? raw.hole, 10);
    if (n === 9) return true;
    return /(^|[^0-9０-９])(9|９)\s*(H|Ｈ|ホール)|ショートコース|ハーフコース/i.test(String(raw.golfCourseName || ''));
}
// 외국인(한국인)을 안 받는 골프장 — 라쿠텐에 따로 칸이 없어 **답에 적힌 글**에서 찾는다(플랜·골프장 검색 답 통째로).
// 적혀 있는 것만 잡히므로 '확실히 받는다'는 뜻이 아니다. 화면에도 그렇게 적는다.
const FOREIGN_NO = /外国(人|籍)[^。\n"]{0,30}?(不可|お断り|ご遠慮|受け?付け?(でき|致しかね|いたしかね|不可)|NG|できません)|日本人(の方)?(のみ|限定)|日本国籍|日本語(が|を)?[^。\n"]{0,10}?(話せ|理解|できる|可能な)[^。\n"]{0,6}?方(のみ|限定|に限)|Japanese (speakers?|residents?|nationals?) only|no foreign/i;
const FOREIGN_OK = /外国(人|籍)[^。\n"]{0,10}?(歓迎|OK|可能|大歓迎|ウェルカム)|インバウンド|English (OK|available|menu|speaking)|foreigners? welcome|訪日/i;
function goraForeign(raw) {
    let t = '';
    try { t = JSON.stringify(raw); } catch (e) { return ''; }
    return FOREIGN_NO.test(t) ? 'no' : FOREIGN_OK.test(t) ? 'yes' : '';
}
const GORA_FOREIGN = { key: 'foreign', label: '🇰🇷 외국인 제한 없는 곳' };
const GORA_TIMES = [['', '전체'], ['am', '🌅 오전 (~11시)'], ['pm', '🌇 오후 (11시~)']];
function goraLoadOpts() { try { const o = JSON.parse(localStorage.getItem('jtfag_gora_opts') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function goraFlag(v) {
    if (v === undefined || v === null || v === '') return undefined;
    if (v === true || v === 1 || v === '1' || v === 'true') return true;
    if (v === false || v === 0 || v === '0' || v === 'false') return false;
    return !!v;
}
function goraHour(v) {
    const m = String(v ?? '').match(/\d+/);
    const h = m ? parseInt(m[0], 10) : NaN;
    return h >= 4 && h <= 19 ? h : undefined;
}
// ─── 플랜 이름 한글화 ───
// 사용자 제보 — `[평일][時間指定]휴식有☆점심지원 포함`처럼 반쯤 일본어로 남았다(`번역이 이렇게가 최선인거야??`).
// 기계 번역(아래)은 폰에서 안 받아지는 때가 있고, 받아져도 골프 말을 엉뚱하게 옮긴다(昼補助 → `낮 보조`, 2サム → `2 샘`).
// 그래서 **사전이 주인이다** — GORA 플랜 이름은 정해진 말을 이어 붙인 것이라 사전만으로 거의 다 한글이 된다.
// 사전으로도 일본어가 남는 이름만 기계 번역에 보낸다(그때도 사전을 먼저 거친 글을 보낸다).
// 긴 말부터 바꾼다(`昼食付き`가 `昼食`보다 먼저) — 순서를 손으로 맞추지 않게 길이로 정렬한다.
const PLAN_WORDS = Object.entries({
    // 요일·시간대
    '平日': '평일', '土日祝日': '주말·공휴일', '土日祝': '주말·공휴일', '土日': '주말', '土曜': '토요일', '日曜': '일요일', '祝日': '공휴일', '休日': '휴일',
    '月曜': '월요일', '火曜': '화요일', '水曜': '수요일', '木曜': '목요일', '金曜': '금요일', '月火水木金': '평일',
    '早朝': '이른 아침', '午前': '오전', '午後': '오후', '薄暮': '해질녘', 'トワイライト': '트와일라잇', 'アフタヌーン': '오후', 'モーニング': '모닝',
    '朝イチ': '첫 티', '朝一': '첫 티', '時間指定': '시간 지정', '時間限定': '시간 한정', 'スタート': '출발',
    // 진행
    'スループレー': '스루 플레이', 'スループレイ': '스루 플레이', 'スルー': '스루 플레이',
    'ハーフ休憩あり': '9홀 후 휴식', 'ハーフ休憩有り': '9홀 후 휴식', 'ハーフ休憩有': '9홀 후 휴식', 'ハーフ休憩': '9홀 후 휴식',
    '休憩あり': '휴식 있음', '休憩有り': '휴식 있음', '休憩有': '휴식 있음', '休憩なし': '휴식 없음', '休憩無し': '휴식 없음', '休憩無': '휴식 없음', '休憩': '휴식',
    'ハーフラウンド': '9홀 라운드', 'ハーフプレー': '9홀 플레이', 'ハーフ': '하프', '1.5ラウンド': '27홀', 'ラウンド': '라운드', 'ホール': '홀',
    // 인원
    '2サム保証': '2인 확약', '2サム確約': '2인 확약', '2サム可': '2인 가능', '2サム': '2인', '3サム': '3인', '2B割増無し': '2인 할증 없음', '2B割増なし': '2인 할증 없음',
    '2B': '2인', '3B': '3인', '4B': '4인', 'お一人様': '1인', 'おひとり様': '1인', 'ひとり予約': '1인 예약', '一人予約': '1인 예약', '1人予約': '1인 예약',
    '名様': '명', '名': '명', '組限定': '팀 한정', '組': '팀', '女性': '여성', 'レディース': '여성', 'シニア': '시니어', 'ジュニア': '주니어', '学生': '학생',
    // 식사·음료
    '昼食付き': '점심 포함', '昼食付': '점심 포함', '昼食込み': '점심 포함', '昼食込': '점심 포함', '昼食券': '점심 식권', '昼食': '점심', '昼補助': '점심 지원', '昼': '점심',
    'ランチ付き': '점심 포함', 'ランチ付': '점심 포함', 'ランチ': '점심', '食事付き': '식사 포함', '食事付': '식사 포함', '食事': '식사', '朝食': '아침 식사',
    '1ドリンク': '음료 1잔', 'ワンドリンク': '음료 1잔', 'ドリンク': '음료', '飲み放題': '음료 무제한', '補助': '지원',
    // 카트·캐디·시설
    '乗用カート': '승용 카트', 'リモコンカート': '리모컨 카트', 'カート付き': '카트 포함', 'カート付': '카트 포함', 'カート': '카트', 'GPSナビ': 'GPS 내비', 'ナビ': '내비', '乗用': '승용',
    'キャディ付き': '캐디 포함', 'キャディ付': '캐디 포함', 'キャディー': '캐디', 'キャディ': '캐디', 'セルフ': '셀프', '練習ボール': '연습공', '練習場': '연습장', '送迎': '송영',
    // 요금·할인
    '割増無し': '할증 없음', '割増なし': '할증 없음', '割増無': '할증 없음', '割増': '할증', '割引': '할인', '直前割': '직전 할인', '早割': '얼리버드', '早期予約': '조기 예약',
    '期間限定': '기간 한정', '枠限定': '수량 한정', '数量限定': '수량 한정', '限定': '한정', '料金': '요금', '税込': '세금 포함', '円': '엔', '無料': '무료', 'サービス': '서비스',
    'ポイント': '포인트', '倍': '배', '特典': '혜택', 'プレゼント': '선물', 'お得': '알뜰', 'おトク': '알뜰', 'オトク': '알뜰', 'イチオシ': '추천', 'オススメ': '추천', 'おすすめ': '추천', '人気': '인기',
    'キャンペーン': '캠페인', 'タイムセール': '타임 세일', 'タイムサービス': '타임 서비스', 'セール': '세일', 'レギュラー': '레귤러', 'スタンダード': '스탠다드', 'プレミアム': '프리미엄',
    // 그 밖
    '保証': '확약', '確約': '확약', '先着': '선착순', '当日': '당일', '予約': '예약', 'コンペ': '단체 경기', 'プラン': '플랜', 'ゴルフ': '골프', '記念': '기념', 'オープン': '오픈',
    '選べる': '선택 가능', '指定': '지정', '以上': '이상', '以降': '이후', 'まで': '까지', '迄': '까지', 'のみ': '만',
    'プレー': '플레이', 'プレイ': '플레이', '楽天': '라쿠텐', 'シーズン': '시즌', '時': '시', '分': '분', 'OK': ' 가능', '可': ' 가능',
    '春': '봄', '夏': '여름', '秋': '가을', '冬': '겨울', '紅葉': '단풍', '新': '새', '込み': ' 포함', '込': ' 포함', '付き': ' 포함', '付': ' 포함',
    'あり': ' 있음', '有り': ' 있음', '有': ' 있음', 'なし': ' 없음', '無し': ' 없음', '無': ' 없음', 'の': ' '
}).map(([ja, ko]) => [ja.normalize('NFKC'), ko]).sort((a, b) => b[0].length - a[0].length);
// 숫자 뒤에 붙는 말(3,980엔 · 2명 · 5배 · 14시)만 붙여 쓰고, 나머지는 앞뒤를 띄워 낱말이 붙지 않게 한다(`이른 아침스루` → `이른 아침 스루`).
const PLAN_SUFFIX = new Set(['엔', '명', '배', '시', '분', '팀', '홀']);
const JA_LEFT = /[぀-ヿ一-鿿]/;   // 가나·한자가 남았으면 덜 옮긴 것
function planTidy(s) {
    return String(s || '')
        .replace(/[【［\[]\s*/g, '[').replace(/\s*[】］\]]/g, '] ')
        .replace(/[「」『』]/g, '').replace(/\s*[☆★◆◇■□●○◎♪♡♥※]+\s*/g, ' · ').replace(/[！!]+/g, ' ')
        .replace(/[〜～]/g, '~').replace(/\s*[・･]\s*/g, ' · ').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s+/g, ' ').replace(/^\s*·\s*|\s*·\s*$/g, '').replace(/\]\s*·\s*/g, '] ').trim();
}
function koPlan(name) {
    let s = String(name || '').normalize('NFKC');
    for (const [ja, ko] of PLAN_WORDS) s = s.split(ja).join(PLAN_SUFFIX.has(ko) ? ko : ` ${ko} `);
    return planTidy(s);
}
// ─── 플랜 이름 기계 번역 (사전으로 다 못 옮긴 것만) ───
// 구글 번역 공개 주소(열쇠가 필요 없다)에 **사전을 거친 글**을 보낸다. 못 받으면(막혔거나 끊김) 사전 결과가 그대로 남는다 —
// 번역은 덤이라 실패해도 알리지 않는다. 옮긴 것은 이 폰에 기억한다(`jtfag_gora_tr2` — 사전이 바뀌어 옛 `jtfag_gora_tr`는 버린다).
const GORA_TR_KEY = 'jtfag_gora_tr2', GORA_TR_MAX = 600, GORA_TR_CHUNK = 500;
try { localStorage.removeItem('jtfag_gora_tr'); } catch (e) {}
let goraTr = (() => { try { return JSON.parse(localStorage.getItem(GORA_TR_KEY)) || {}; } catch (e) { return {}; } })();
const planKey = name => String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
function goraPlanKo(name) {
    const k = planKey(name);
    return goraTr[k] || koPlan(name);
}
async function goraTranslateBatch(list) {
    const src = list.map(k => koPlan(k).replace(/\n/g, ' '));
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=' + encodeURIComponent(src.join('\n')));
    if (!res.ok) throw new Error('번역 ' + res.status);
    const data = await res.json();
    const out = (Array.isArray(data && data[0]) ? data[0] : []).map(seg => (seg && seg[0]) || '').join('').split('\n').map(t => t.trim());
    if (out.length !== list.length) throw new Error('번역 줄 수가 다름');
    return out;
}
async function goraTranslatePlans(seq) {
    // 보이는 플랜부터(골프장마다 셋), 그다음 나머지 — 조건을 바꾸면 다른 플랜이 보이므로 다 옮겨 둔다.
    const order = [...gora.items.flatMap(it => (it.fit || it.plans).slice(0, 3)), ...gora.all.flatMap(it => it.plans)];
    const want = [...new Set(order.map(p => planKey(p.name)))].filter(k => k && !goraTr[k] && JA_LEFT.test(koPlan(k))).slice(0, 200);
    let done = 0;
    for (let i = 0; i < want.length;) {
        const chunk = [];
        let len = 0;
        while (i < want.length && (chunk.length === 0 || len + want[i].length < GORA_TR_CHUNK)) { len += want[i].length + 1; chunk.push(want[i++]); }
        let got = null;
        try { got = await goraTranslateBatch(chunk); }
        catch (e) {
            if (/줄 수/.test(e.message)) {   // 묶음이 어긋나면 하나씩 다시
                got = [];
                for (const k of chunk) { try { got.push((await goraTranslateBatch([k]))[0]); } catch (e2) { got.push(''); } }
            } else { console.warn('[GORA] 플랜 번역 실패:', e.message); break; }
        }
        if (seq !== gora.seq) return;   // 그사이 새로 찾았으면 버린다
        chunk.forEach((k, j) => {
            const t = got[j] ? planTidy(koPlan(got[j])) : '';
            if (!t) return;
            goraTr[k] = t;
            done++;
        });
        if (done) renderGoraResult();
    }
    if (!done) return;
    const keys = Object.keys(goraTr);
    if (keys.length > GORA_TR_MAX) keys.slice(0, keys.length - GORA_TR_MAX).forEach(k => delete goraTr[k]);
    try { localStorage.setItem(GORA_TR_KEY, JSON.stringify(goraTr)); } catch (e) {}
}
function goraPlanTags(p) {
    return [p.hour !== undefined ? `${p.hour}시대` : '', p.half ? '9홀' : '', p.two ? '2인' : '', p.lunch ? '점심' : ''].filter(Boolean);
}
// 켜 둔 조건으로 gora.all → gora.items. 라쿠텐 답에 그 칸이 아예 없으면 거르지 않고 알린다(다 지워 버리면 고장으로 보인다).
function goraApply() {
    const plans = gora.all.flatMap(it => it.plans);
    const active = GORA_OPTS.filter(o => gora.opts[o.key]);
    const usable = active.filter(o => plans.some(p => o.test(p) !== undefined));
    const missing = active.filter(o => !usable.includes(o)).map(o => o.label.replace(/^\S+\s/, ''));
    const timeOk = !gora.time || plans.some(p => p.hour !== undefined);
    if (gora.time && !timeOk) missing.push('시간대');
    const fits = p => usable.every(o => o.test(p) === true)
        && (!gora.time || !timeOk || (p.hour !== undefined && (gora.time === 'am' ? p.hour < 11 : p.hour >= 11)));
    const filtering = usable.length || (gora.time && timeOk);
    gora.items = gora.all.map(it => ({ ...it, fit: filtering ? it.plans.filter(fits) : it.plans }))
        .filter(it => !filtering || it.fit.length)
        .filter(it => !gora.opts.foreign || it.foreign !== 'no')
        .filter(it => !gora.opts.no9 || !it.nine);
    gora.fnote = missing.length ? `라쿠텐 응답에 '${missing.join(', ')}' 정보가 없어 해당 조건은 적용되지 않았습니다` : '';
    gora.hidden = gora.all.length - gora.items.length;
}
function toggleGoraOpt(key) {
    gora.opts[key] = !gora.opts[key];
    try { localStorage.setItem('jtfag_gora_opts', JSON.stringify(gora.opts)); } catch (e) {}
    goraRefilter();
}
function setGoraTime(t) { gora.time = t; goraRefilter(); }
function goraRefilter() {
    if (gora.all.length) goraApply();
    renderGora();
    paintGoraMap();
}

function openGora(date) {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    gora.date = date; gora.seq = (gora.seq || 0) + 1;
    gora.items = []; gora.all = [];
    gora.places = [];
    gora.error = null; gora._searched = false;
    gora.base = trip.base && isFinite(trip.base.lat) ? { ...trip.base } : null;
    document.getElementById('goraModal').classList.add('active');
    watchModalScroll(document.querySelector('#goraModal .modal-body'));
    renderGora();
    loadLeaflet().then(() => { drawGoraMap(); paintGoraMap(); setTimeout(() => gora.map && gora.map.invalidateSize(), 300); })
        .catch(() => { const m = document.getElementById('goraMap'); if (m) m.innerHTML = '<div class="trip-empty">지도를 불러오지 못했습니다.</div>'; });
}
function closeGora() {
    document.getElementById('goraModal').classList.remove('active');
}

// 지도는 한 번 만들어 두고 위(기준 위치)·아래(조건·결과)만 다시 그린다 — 지도까지 다시 만들면 보던 자리가 튄다.
function renderGora() {
    const top = document.getElementById('goraTop'), bottom = document.getElementById('goraBottom');
    if (!top || !bottom) return;
    const chip = (on, label, fn) => `<button type="button" class="trip-chip${on ? ' on' : ''}" onclick="${fn}">${label}</button>`;
    top.innerHTML = `
        <div class="gora-date">📅 ${gora.date ? isoLabel(gora.date) : ''} 라운드 골프장</div>
        <div class="trip-field">📍 기준 위치 (숙소·역·지역)
            <div class="gora-search"><input type="text" id="goraPlace" maxlength="60" value="${gora.base ? escapeHtml(gora.base.name) : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();findGoraPlace();}"><button type="button" class="trip-btn" onclick="findGoraPlace()">찾기</button></div>
        </div>
        <div id="goraPlaces"></div>
        <div class="gora-hint">${gora.base ? `기준: <b>${escapeHtml(gora.base.name)}</b> · 지도의 빈 곳을 눌러 변경할 수 있습니다` : '명칭으로 검색하거나 아래 지도를 눌러 기준 위치를 지정하세요.'}</div>`;
    bottom.innerHTML = `
        <div class="trip-field">범위 (직선거리)<div class="trip-chips">${GORA_RANGES.map(r => chip(gora.range === r, `${r}km <small>차로 ~${driveMinutes(r)}분</small>`, `setGoraRange(${r})`)).join('')}</div></div>
        <div class="trip-field">1인 최대 금액<div class="trip-chips">${GORA_PRICES.map(p => chip(gora.price === p, p ? `¥${p.toLocaleString()}` : '전체', `setGoraPrice(${p})`)).join('')}</div></div>
        <div class="trip-field">조건 <small class="gora-sub">복수 선택 가능 · 검색 후 변경해도 즉시 적용됩니다</small><div class="trip-chips">${[...GORA_OPTS, GORA_FOREIGN].map(o => chip(!!gora.opts[o.key], o.label, `toggleGoraOpt('${o.key}')`)).join('')}</div>${gora.opts.foreign ? '<div class="gora-hint">라쿠텐에 \'외국인 불가\' 등으로 명시된 곳만 제외합니다. 명시되지 않은 곳도 예약 화면의 안내를 확인하세요.</div>' : ''}</div>
        <div class="trip-field">시작 시간<div class="trip-chips">${GORA_TIMES.map(([v, l]) => chip(gora.time === v, l, `setGoraTime('${v}')`)).join('')}</div></div>
        <div class="trip-actions"><button type="button" class="trip-btn primary" onclick="searchGora()"${gora.busy ? ' disabled' : ''}>${gora.busy ? '검색 중…' : '⛳ 해당일 예약 가능 골프장 검색'}</button></div>
        <div id="goraResult"></div>`;
    renderGoraPlaces();
    renderGoraResult();
}

function setGoraRange(r) { gora.range = r; renderGora(); paintGoraMap(); }
function setGoraPrice(p) { gora.price = p; renderGora(); }

// 지도 그림은 Leaflet + OpenStreetMap 타일. 열쇠가 필요 없고, 처음 열 때만 받는다.
let leafletLoading = null;
function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = () => resolve();
        s.onerror = () => { leafletLoading = null; reject(new Error('leaflet')); };
        document.head.appendChild(s);
    });
    return leafletLoading;
}

function drawGoraMap() {
    const box = document.getElementById('goraMap');
    if (!box || !window.L) return;
    if (!gora.map) {
        box.innerHTML = '';
        gora.map = L.map(box, { zoomControl: true, attributionControl: true }).setView([35.68, 139.76], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' }).addTo(gora.map);
        gora.layer = L.layerGroup().addTo(gora.map);
        gora.map.on('click', onGoraMapClick);
    }
}

function paintGoraMap() {
    if (!gora.map || !gora.layer) return;
    gora.layer.clearLayers();
    gora.markers = [];
    const pts = [];
    if (gora.base) {
        L.circle([gora.base.lat, gora.base.lon], { radius: gora.range * 1000, color: '#0f766e', weight: 1, fillOpacity: 0.05 }).addTo(gora.layer);
        // 숙소는 눌리지 않게 하고 골프장 번호 밑에 깐다 — 가까운 골프장 번호를 가려 눌리지 않았다.
        L.marker([gora.base.lat, gora.base.lon], { icon: L.divIcon({ className: 'gora-pin base', html: '🏨', iconSize: [28, 28] }), interactive: false, zIndexOffset: -1000 }).addTo(gora.layer);
        pts.push([gora.base.lat, gora.base.lon]);
    }
    gora.items.forEach((it, i) => {
        if (!it.geo) return;
        const m = L.marker([it.geo.lat, it.geo.lon], { icon: L.divIcon({ className: 'gora-pin', html: `<b>${i + 1}</b>`, iconSize: [24, 24] }) }).addTo(gora.layer);
        // 번호를 누르면 이름이 뜨고, 그 이름을 누르면 목록의 그 골프장으로 간다(사용자 요청).
        // 예전엔 이름이 툴팁이라 눌리지 않아, 이름을 누르면 지도 누르기로 잡혀 `여기를 기준 위치로`가 떴다.
        // 팝업은 누른 것이 지도로 번지지 않는다(Leaflet이 막아 준다).
        m.bindPopup(`<button type="button" class="gora-pin-pop" onclick="goraJumpTo(${i})"><b>${i + 1}. ${escapeHtml(it.ko || it.name)}</b><small>목록에서 보기 ›</small></button>`,
            { className: 'gora-here-pop', offset: [0, -8], closeButton: false, autoPanPadding: [12, 12] });
        m.on('click', ev => { if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent); });
        gora.markers[i] = m;
        pts.push([it.geo.lat, it.geo.lon]);
    });
    if (pts.length > 1) gora.map.fitBounds(pts, { padding: [24, 24], maxZoom: 12 });
    else if (pts.length === 1) gora.map.setView(pts[0], 10);
}

// 지도를 누르면 — 번호 가까이(손가락 크기 안)면 그 골프장으로 간다. 번호는 24px라 손가락이 살짝 빗나가면
// 지도 누르기로 잡혀 **기준 위치가 그 자리로 옮겨졌다**(사용자 제보). 그래서 빈 곳을 눌러도 곧바로 바꾸지 않고
// `여기를 기준 위치로` 단추를 띄워 한 번 더 누르게 한다. 기준 위치가 아직 없을 때만 바로 정한다.
const GORA_PIN_REACH = 32;   // px — 이 안이면 번호를 누른 것으로 본다
function onGoraMapClick(e) {
    let best = null;
    (gora.markers || []).forEach((m, i) => {
        if (!m) return;
        const d = gora.map.latLngToContainerPoint(m.getLatLng()).distanceTo(e.containerPoint);
        if (d <= GORA_PIN_REACH && (!best || d < best.d)) best = { i, d };
    });
    if (best) { gora.markers[best.i].openPopup(); return; }
    const lat = +e.latlng.lat.toFixed(5), lon = +e.latlng.lng.toFixed(5);
    if (!gora.base) { goraBaseHere(lat, lon); return; }
    L.popup({ className: 'gora-here-pop', offset: [0, -4] }).setLatLng(e.latlng)
        .setContent(`<button type="button" class="gora-here" onclick="goraBaseHere(${lat}, ${lon})">📍 여기를 기준 위치로</button>`)
        .openOn(gora.map);
}
function goraBaseHere(lat, lon) {
    if (gora.map) gora.map.closePopup();
    setGoraBase({ name: `지도 지정 위치 (${lat.toFixed(3)}, ${lon.toFixed(3)})`, lat, lon });
}
// 지도의 번호 → 목록의 그 골프장을 화면 맨 위로 올리고 반짝인다(사용자 요청).
function goraJumpTo(i) {
    const row = document.getElementById('goraItem' + i);
    if (!row) return;
    if (gora.map) gora.map.closePopup();
    row.scrollIntoView({ block: 'start' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    clearTimeout(row._flash);
    row._flash = setTimeout(() => row.classList.remove('flash'), 2200);
}
// 목록의 번호 → 지도로 올라가 그 핀을 가운데 두고 이름을 띄운다.
function goraShowOnMap(i) {
    const m = gora.markers && gora.markers[i];
    const box = document.getElementById('goraMap');
    if (!m || !gora.map || !box) return;
    box.scrollIntoView({ block: 'start' });
    gora.map.setView(m.getLatLng(), Math.max(gora.map.getZoom(), 11));
    m.openPopup();
}
// GORA 예약 페이지는 아이폰이면 **사파리로** 바로 연다. 새 창(target=_blank)으로 열면 앱 안 브라우저가 떠
// 번역이 없고, 사파리 단추를 한 번 더 눌러야 했다(사용자 제보). `x-safari-https://`는 iOS 17부터 사파리를 직접 연다.
function openGoraLink(url) {
    if (!IS_IOS || !/^https:\/\//.test(url)) return true;   // 그 밖은 링크 그대로(새 탭)
    let left = false;
    const away = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', away);
    setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        if (!left && !document.hidden) window.open(url, '_blank', 'noopener');   // 옛 iOS — 예전처럼 연다
    }, 1500);
    tripGo('x-safari-' + url);
    return false;
}

// 기준 위치는 OpenStreetMap의 이름 찾기(Nominatim)로 찾는다. 열쇠가 필요 없다(가끔만 쓰는 정도면 된다).
async function findGoraPlace() {
    const q = ((document.getElementById('goraPlace') || {}).value || '').trim();
    if (!q) { showToast('⚠️ 숙소 또는 지역명을 입력해 주세요.'); return; }
    const box = document.getElementById('goraPlaces');
    if (box) box.innerHTML = '<div class="gora-hint">검색 중…</div>';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=jp&accept-language=ko&q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(res.status);
        const list = await res.json();
        gora.places = (Array.isArray(list) ? list : []).map(p => ({
            name: p.name || String(p.display_name || '').split(',')[0],
            full: p.display_name || '', lat: parseFloat(p.lat), lon: parseFloat(p.lon),
            pref: prefCode(p.address)
        })).filter(p => isFinite(p.lat) && isFinite(p.lon));
        if (!gora.places.length && box) { box.innerHTML = '<div class="gora-hint">검색 결과가 없습니다. 영어·일본어로 검색하거나 지도에서 지정하세요.</div>'; return; }
        renderGoraPlaces();
    } catch (e) {
        if (box) box.innerHTML = '<div class="gora-hint">위치 검색에 실패했습니다. 지도에서 직접 지정할 수 있습니다.</div>';
    }
}
function renderGoraPlaces() {
    const box = document.getElementById('goraPlaces');
    if (!box) return;
    box.innerHTML = gora.places.length ? `<div class="gora-places">${gora.places.map((p, i) => `<button type="button" class="gora-place" onclick="pickGoraPlace(${i})"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.full)}</small></button>`).join('')}</div>` : '';
}
function pickGoraPlace(i) {
    const p = gora.places[i];
    if (!p) return;
    gora.places = [];
    setGoraBase({ name: p.name, lat: p.lat, lon: p.lon, pref: p.pref });
}
// 기준 위치는 여행에 남긴다 — 다음에 열거나 남이 열어도 그대로 뜬다.
function setGoraBase(base) {
    gora.base = base;
    const trip = findTrip(tripOpenId);
    if (trip && !(trip.base && trip.base.lat === base.lat && trip.base.lon === base.lon)) {
        editTrip(t => { t.base = { name: base.name, lat: +base.lat.toFixed(5), lon: +base.lon.toFixed(5), ...(base.pref ? { pref: base.pref } : {}) }; });
    }
    renderGora();
    paintGoraMap();
}

function prefCode(addr) {
    const text = addr ? [addr.province, addr.state, addr.region, addr.city].filter(Boolean).join(' ') : '';
    for (let i = 0; i < JP_PREFS_KO.length; i++) if (text.includes(JP_PREFS_KO[i])) return i + 1;
    const i = JP_PREFS.findIndex(p => text.includes(p));
    return i >= 0 ? i + 1 : null;
}

// 현청 소재지 좌표(현 번호 = 배열 순번 + 1). 기준 위치에서 범위 안에 드는 현을 고를 때만 쓴다.
const JP_PREF_CENTER = [[43.06,141.35],[40.82,140.74],[39.70,141.15],[38.27,140.87],[39.72,140.10],[38.24,140.36],[37.75,140.47],[36.34,140.45],[36.57,139.88],[36.39,139.06],[35.86,139.65],[35.61,140.12],[35.69,139.69],[35.45,139.64],[37.90,139.02],[36.70,137.21],[36.59,136.63],[36.07,136.22],[35.66,138.57],[36.65,138.18],[35.39,136.72],[34.98,138.38],[35.18,136.91],[34.73,136.51],[35.00,135.87],[35.02,135.76],[34.69,135.52],[34.69,135.18],[34.69,135.83],[34.23,135.17],[35.50,134.24],[35.47,133.05],[34.66,133.93],[34.40,132.46],[34.19,131.47],[34.07,134.56],[34.34,134.04],[33.84,132.77],[33.56,133.53],[33.61,130.42],[33.25,130.30],[32.74,129.87],[32.79,130.74],[33.24,131.61],[31.91,131.42],[31.56,130.56],[26.21,127.68]];
const GORA_GAP = 400;            // 라쿠텐 한도(초당 1회 남짓)를 넘지 않게 요청 사이를 띄운다
const GORA_GEO_TTL = 30 * 86400000;   // 골프장 위치는 한 달 동안 이 폰에 기억한다
let goraLast = 0;

async function goraCall(api, params, tries = 2) {
    const wait = goraLast + GORA_GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    goraLast = Date.now();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ api, params })
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) return { error: 'no_function' };
    if (out.error === 'not_configured') return { error: 'not_configured' };
    const data = out.data || {};
    if (out.status === 429 && tries > 0) {   // 너무 빨리 물었다 — 잠깐 쉬고 다시
        await new Promise(r => setTimeout(r, 1500));
        return goraCall(api, params, tries - 1);
    }
    if (out.error || data.error || (out.status && out.status >= 400)) {
        // 라쿠텐이 준 답을 **통째로** 적는다 — 판마다 오류 칸 이름이 달라(`error`·`errors`·`message`…)
        // 몇 개만 골라 적었더니 `403` 숫자 하나만 남아 무엇이 틀렸는지 알 수 없었다.
        let detail = '';
        try { detail = JSON.stringify(data); } catch (e) { detail = String(data); }
        if (detail === '{}') detail = '';
        return { error: 'api', message: [out.status, out.message, out.error, detail.slice(0, 400)].filter(Boolean).join(' · ') };
    }
    const raw = data.Items || data.items || [];
    const items = raw.map(x => x && x.Item ? x.Item : x).filter(Boolean);
    if (items[0] && !gora.raw[api]) gora.raw[api] = items[0];   // 문제를 알릴 때 보여 줄 원본 한 건
    return { items, count: data.count, pageCount: data.pageCount };
}

// 위도·경도를 도(°)로 맞춘다. 라쿠텐은 API에 따라 초(″) 단위로 주기도 해서, 180을 넘으면 초로 본다.
function goraDeg(v) {
    const n = parseFloat(v);
    if (!isFinite(n) || !n) return null;
    return Math.abs(n) > 180 ? n / 3600 : n;
}
function goraGeoOf(raw) {
    const lat = goraDeg(raw.latitude), lon = goraDeg(raw.longitude);
    return lat !== null && lon !== null ? { lat, lon } : null;
}
// 예약 주소. `gr.g.rakuten.co.jp`(라쿠텐 안쪽 주소)는 폰에서 안 열려(사용자 제보) 건너뛴다.
// 그 안쪽 주소가 가야 할 곳을 쿼리에 싣고 있으면 그것을 꺼내 쓴다. 라쿠텐 주소의 http는 https로 올린다
// (아이폰에서 사파리로 바로 여는 길(openGoraLink)이 https만 받는다).
const GR_INNER = /\/\/gr\.g\.rakuten\.co\.jp/;
function goraUnwrap(u) {
    if (typeof u !== 'string' || !/^https?:\/\//.test(u)) return '';
    if (GR_INNER.test(u)) {
        try {
            for (const v of new URL(u).searchParams.values()) if (/^https?:\/\//.test(v) && !GR_INNER.test(v)) return goraUnwrap(v);
        } catch (e) { /* 모양이 틀린 주소는 버린다 */ }
        return '';
    }
    return u.replace(/^http:\/\/([\w.-]*rakuten\.co\.jp)/, 'https://$1');
}
function goraUrl(...cands) {
    for (const u of cands) { const v = goraUnwrap(u); if (v) return v; }
    return '';
}
// 마지막 그물 — 이름으로 GORA를 찾는 검색 주소는 늘 열린다.
function goraSearchUrl(name) {
    return `https://www.google.com/search?q=${encodeURIComponent('楽天GORA ' + name)}`;
}

// ─── 일본 이름을 한글로 ───
// 라쿠텐은 골프장 이름을 한자로 주고, 읽는 법(가나)을 따로 준다(`golfCourseNameKana`).
// 가나를 외래어 표기법대로 한글로 옮기고, 골프장 이름에 늘 붙는 말(カントリークラブ 따위)은 뜻으로 바꾼다.
// 원문 일본어는 아래 작은 글씨로 남긴다 — GORA 사이트와 맞춰 볼 때 쓴다.
const KANA_KO = (() => {
    const t = {};
    // '가|카' — 앞엣것은 낱말 첫머리, 뒤엣것은 가운데·끝 (외래어 표기법)
    const rows = 'ア아 イ이 ウ우 エ에 オ오 カ가|카 キ기|키 ク구|쿠 ケ게|케 コ고|코 サ사 シ시 ス스 セ세 ソ소 タ다|타 チ지|치 ツ쓰 テ데|테 ト도|토 ナ나 ニ니 ヌ누 ネ네 ノ노 ハ하 ヒ히 フ후 ヘ헤 ホ호 マ마 ミ미 ム무 メ메 モ모 ヤ야 ユ유 ヨ요 ラ라 リ리 ル루 レ레 ロ로 ワ와 ヰ이 ヱ에 ヲ오 ガ가 ギ기 グ구 ゲ게 ゴ고 ザ자 ジ지 ズ즈 ゼ제 ゾ조 ダ다 ヂ지 ヅ즈 デ데 ド도 バ바 ビ비 ブ부 ベ베 ボ보 パ파 ピ피 プ푸 ペ페 ポ포 ヴ부 ァ아 ィ이 ゥ우 ェ에 ォ오 ャ야 ュ유 ョ요 ヮ와 '
        + 'キャ갸|캬 キュ규|큐 キョ교|쿄 シャ샤 シュ슈 ショ쇼 シェ셰 チャ자|차 チュ주|추 チョ조|초 チェ체 ニャ냐 ニュ뉴 ニョ뇨 ヒャ햐 ヒュ휴 ヒョ효 ミャ먀 ミュ뮤 ミョ묘 リャ랴 リュ류 リョ료 ギャ갸 ギュ규 ギョ교 ジャ자 ジュ주 ジョ조 ジェ제 ビャ뱌 ビュ뷰 ビョ뵤 ピャ퍄 ピュ퓨 ピョ표 '
        + 'ファ파 フィ피 フェ페 フォ포 ティ티 ディ디 トゥ투 ドゥ두 ウィ위 ウェ웨 ウォ워 ヴァ바 ヴィ비 ヴェ베 ヴォ보 テュ튜 デュ듀 フュ퓨';
    rows.split(' ').filter(Boolean).forEach(x => { const k = x.match(/^[ァ-ヿ]+/)[0]; t[k] = x.slice(k.length).split('|'); });
    return t;
})();
// 이름에 늘 붙는 말. 긴 것부터 맞춘다.
const GOLF_WORDS = [
    ['カントリークラブ', '컨트리클럽'], ['カンツリークラブ', '컨트리클럽'], ['カントリー倶楽部', '컨트리클럽'], ['カンツリー倶楽部', '컨트리클럽'],
    ['ゴルフクラブ', '골프클럽'], ['ゴルフ倶楽部', '골프클럽'], ['ゴルフコース', '골프코스'], ['ゴルフリンクス', '골프링크스'],
    ['ゴルフジョウ', '골프장'], ['ゴルフジヨウ', '골프장'], ['ゴルフ場', '골프장'], ['ゴルフパーク', '골프파크'], ['ゴルフリゾート', '골프리조트'],
    ['インターナショナル', '인터내셔널'], ['カントリー', '컨트리'], ['カンツリー', '컨트리'], ['ゴルフ', '골프'], ['クラブ', '클럽'], ['倶楽部', '클럽'], ['俱楽部', '클럽'],
    ['リゾート', '리조트'], ['ホテル', '호텔'], ['コース', '코스'], ['リンクス', '링크스'], ['スプリングス', '스프링스'], ['ヒルズ', '힐스'],
    ['パーク', '파크'], ['レイクス', '레이크스'], ['レイク', '레이크'], ['ガーデン', '가든'], ['ヴィレッジ', '빌리지'], ['ビレッジ', '빌리지'],
    ['ロイヤル', '로열'], ['クラシック', '클래식'], ['グランド', '그랜드'], ['オーシャン', '오션'], ['シーサイド', '시사이드'], ['バレー', '밸리'], ['ヴァレー', '밸리'], ['フォレスト', '포레스트'],
    ['ゴルフ', '골프']
];
function kanaToKo(run) {
    let out = '', prevVowel = '';
    for (let i = 0; i < run.length;) {
        const two = KANA_KO[run.slice(i, i + 2)] && run.slice(i, i + 2);
        const k = two || run[i];
        i += k.length;
        if (k === 'ー') continue;   // 장음은 적지 않는다
        if (k === 'ン' || k === 'ッ') {   // 받침 ㄴ · ㅅ
            const c = out.charCodeAt(out.length - 1);
            if (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 0) out = out.slice(0, -1) + String.fromCharCode(c + (k === 'ン' ? 4 : 19));
            else if (k === 'ン') out += '응';
            continue;
        }
        const ko = KANA_KO[k];
        if (!ko) { out += k; prevVowel = ''; continue; }
        const syl = ko[out ? 1 : 0] || ko[0];
        const jung = (syl.charCodeAt(0) - 0xAC00) % 588 / 28 | 0;
        // 오+우 · 같은 모음이 겹치면 장음이라 적지 않는다 (とうきょう → 도쿄)
        if (out && k === 'ウ' && [8, 12, 13, 17].includes(prevVowel)) continue;
        out += syl;
        prevVowel = jung;
    }
    return out;
}
// 가나(또는 이름)를 한글로. 한자가 남으면 못 옮긴 것이라 ''를 돌려준다.
function koName(src) {
    let s = String(src || '').normalize('NFKC').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[・･]/g, ' ');
    if (!s.trim()) return '';
    s = s.replace(/^\s*ザ\s+/, '더 ');
    for (const [ja, ko] of GOLF_WORDS) s = s.split(ja).join(` ${ko} `);
    s = s.replace(/[ァ-ヺー]+/g, run => kanaToKo(run));
    s = s.replace(/[（(]\s*/g, ' (').replace(/\s*[）)]/g, ')').replace(/\s+/g, ' ').trim();
    return /[぀-ヿ㐀-鿿]/.test(s) ? '' : s;
}
// 주소 앞의 현 이름을 한글로 (福岡県糸島市… → 후쿠오카현 糸島市…). 시·정 이름은 읽는 법이 없어 그대로 둔다.
function koAddress(addr) {
    const a = String(addr || '');
    const i = JP_PREFS.findIndex(p => a.startsWith(p));
    if (i < 0) return a;
    const rest = a.slice(JP_PREFS[i].length);
    const suf = rest[0] === '県' ? '현' : rest[0] === '府' ? '부' : rest[0] === '都' ? '도' : '';
    const ko = JP_PREFS_KO[i] + suf;
    return (ko + ' ' + rest.replace(/^[県府都]/, '')).trim();
}
function koPref(addr) {
    const i = JP_PREFS.findIndex(p => String(addr || '').startsWith(p));
    if (i < 0) return '';
    const r = String(addr)[JP_PREFS[i].length];
    return JP_PREFS_KO[i] + (r === '県' ? '현' : r === '府' ? '부' : r === '都' ? '도' : '');
}

// GORA 플랜 검색 답 한 건을 한 모양으로 맞춘다. 판(formatVersion)에 따라 감싸는 모양이 달라 둘 다 읽는다.
function goraItem(raw) {
    const plans = (raw.planInfo || raw.plans || []).map(p => p && p.plan ? p.plan : p).filter(Boolean).map(p => {
        const call = Array.isArray(p.callInfo) ? p.callInfo[0] : (p.callInfo || {});
        return {
            name: p.planName || '', price: parseInt(p.price || p.basePrice, 10) || 0,
            time: p.startTimeZone || '', hour: goraHour(p.startTimeZone),
            two: (() => { const a = goraFlag(p.assu2sum); const n = parseInt(p.playerNumMin, 10); return a || (isFinite(n) ? n <= 2 : a); })(),
            lunch: goraFlag(p.lunch), half: goraHalf(p),
            url: goraUrl(call && call.reservePageUrlPC, call && call.reservePageUrl, call && call.reservePageUrlMobile, p.planUrl)
        };
    }).sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    return {
        id: raw.golfCourseId, name: raw.golfCourseName || raw.golfCourseAbbr || '(이름 없음)', kana: raw.golfCourseNameKana || '',
        address: raw.address || '', rating: parseFloat(raw.evaluation) || 0,
        geo: goraGeoOf(raw), foreign: goraForeign(raw), nine: goraNine(raw),
        plans, url: goraUrl(raw.reserveCalUrl, raw.golfCourseDetailUrl, ...plans.map(p => p.url))
    };
}

// 현(pref) 하나의 골프장 위치표 — 플랜 검색 답에는 위치가 없어서, 골프장 검색으로 따로 받아 이 폰에 한 달 기억한다.
async function goraCourseGeo(pref, tick) {
    const key = 'jtfag_gora_geo3_' + pref;   // 2 — 읽는 법(k) · 3 — 외국인 제한(f)까지 담는다
    try { localStorage.removeItem('jtfag_gora_geo_' + pref); localStorage.removeItem('jtfag_gora_geo2_' + pref); } catch (e) {}
    try {
        const c = JSON.parse(localStorage.getItem(key) || 'null');
        if (c && Date.now() - c.at < GORA_GEO_TTL && c.map && Object.keys(c.map).length) return c.map;
    } catch (e) {}
    const map = {};
    for (let page = 1; page <= 10; page++) {
        tick();
        const r = await goraCall('course', { areaCode: pref, hits: 30, page });
        if (r.error) break;
        r.items.forEach(raw => {
            if (!raw.golfCourseId) return;
            const g = goraGeoOf(raw);
            map[raw.golfCourseId] = { g: g ? [+g.lat.toFixed(5), +g.lon.toFixed(5)] : null, a: raw.address || '', u: goraUrl(raw.reserveCalUrl, raw.golfCourseDetailUrl), k: raw.golfCourseNameKana || '', f: goraForeign(raw) };
        });
        if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
    }
    if (Object.keys(map).length) { try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), map })); } catch (e) {} }
    return map;
}

async function basePref(base) {
    if (base.pref) return base.pref;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=ko&lat=${base.lat}&lon=${base.lon}`);
        if (res.ok) { const j = await res.json(); const p = prefCode(j.address); if (p) { base.pref = p; return p; } }
    } catch (e) {}
    // 못 찾으면 가장 가까운 현청 소재지로 본다.
    let best = null;
    JP_PREF_CENTER.forEach(([lat, lon], i) => { const km = kmBetween(base, { lat, lon }); if (!best || km < best.km) best = { km, p: i + 1 }; });
    return best ? best.p : null;
}

// 위치로 묻는 칸을 라쿠텐이 무시해서(후쿠오카 기준인데 간토 골프장이 나왔다) **현 단위로 묻고 거리는 앱이 잰다.**
// 범위 안에 드는 이웃 현까지 많아야 셋을 묻는다.
async function searchGora() {
    if (!gora.base) { showToast('⚠️ 먼저 기준 위치를 지정해 주세요.'); return; }
    if (gora.busy) return;
    gora.busy = true; gora.seq = (gora.seq || 0) + 1; gora.items = []; gora.all = []; gora.note = ''; gora.error = null; gora._searched = true; gora.raw = {};
    gora.progress = 0;
    renderGora();
    const tick = () => { gora.progress++; const el = document.getElementById('goraProgress'); if (el) el.textContent = `라쿠텐 GORA 조회 중… (${gora.progress})`; };
    try {
        const home = await basePref(gora.base);
        if (!home) { gora.error = { error: 'api', message: '기준 위치의 현(県)을 확인할 수 없습니다. 지도에서 다시 지정해 주세요.' }; return; }
        const prefs = [home, ...JP_PREF_CENTER.map(([lat, lon], i) => ({ p: i + 1, km: kmBetween(gora.base, { lat, lon }) }))
            .filter(x => x.p !== home && x.km <= gora.range + 50).sort((a, b) => a.km - b.km).map(x => x.p)].slice(0, 3);
        const common = { playDate: gora.date, hits: 30, ...(gora.price ? { maxPrice: gora.price } : {}) };
        let found = [], firstErr = null;
        for (const pref of prefs) {
            for (let page = 1; page <= GORA_PAGES; page++) {
                tick();
                const r = await goraCall('plan', { ...common, areaCode: pref, page });
                if (r.error) { firstErr = firstErr || r; break; }
                found = found.concat(r.items.map(x => ({ raw: x, pref })));
                if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
            }
            if (firstErr && (firstErr.error === 'not_configured' || firstErr.error === 'no_function')) { gora.error = firstErr; return; }
        }
        if (!found.length && firstErr) { gora.error = firstErr; return; }
        const geoBy = {};
        for (const pref of [...new Set(found.map(f => f.pref))]) geoBy[pref] = await goraCourseGeo(pref, tick);
        const seen = new Set();
        gora.items = found.map(({ raw, pref }) => {
            const it = goraItem(raw);
            const g = (geoBy[pref] || {})[raw.golfCourseId];
            if (g) {
                if (!it.geo && g.g) it.geo = { lat: g.g[0], lon: g.g[1] };
                if (!it.address) it.address = g.a;
                it.url = goraUrl(g.u, it.url);
                if (!it.kana) it.kana = g.k || '';
                if (g.f === 'no' || (!it.foreign && g.f)) it.foreign = g.f;
            }
            it.ko = koName(it.kana) || koName(it.name);
            if (!it.url) it.url = goraSearchUrl(it.name);
            return it;
        }).filter(it => { const k = it.id || it.name; if (seen.has(k)) return false; seen.add(k); return true; })
            .map(it => ({ ...it, km: it.geo ? kmBetween(gora.base, it.geo) : null }))
            .filter(it => it.km === null ? true : it.km <= gora.range * 1.05)
            .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
        const unknown = gora.items.filter(it => it.km === null).length;
        if (unknown) gora.note = `위치 정보가 없는 ${unknown}곳은 하단에 표시합니다`;
        gora.all = gora.items;
        goraApply();
    } catch (e) {
        gora.error = { error: 'network', message: String(e && e.message || e) };
    } finally {
        gora.busy = false;
        renderGora();
        paintGoraMap();
    }
    if (gora.all.length) goraTranslatePlans(gora.seq);
}

function toggleGoraRaw() {
    const el = document.getElementById('goraRaw');
    if (!el) return;
    if (el.style.display === 'block') { el.style.display = 'none'; return; }
    let txt = '';
    try { txt = JSON.stringify(gora.raw, null, 1).slice(0, 2500); } catch (e) { txt = String(e); }
    el.textContent = txt || '(수신된 응답이 없습니다)';
    el.style.display = 'block';
}

function renderGoraResult() {
    const box = document.getElementById('goraResult');
    if (!box) return;
    const e = gora.error;
    const rawLink = `<div class="gora-raw-row"><button type="button" class="gora-raw-btn" onclick="toggleGoraRaw()">🔧 라쿠텐 원본 응답 보기 (오류 확인용)</button><pre id="goraRaw" class="gora-raw"></pre></div>`;
    if (e) {
        box.innerHTML = (e.error === 'not_configured' || e.error === 'no_function'
            ? `<div class="gora-setup"><b>아직 라쿠텐과 연결되지 않았습니다.</b><br>라쿠텐 앱 등록과 Supabase 설정이 필요합니다(설명서 <code>docs/일본골프장찾기.md</code>). 설정 완료 후 바로 사용할 수 있습니다.</div>`
            : `<div class="gora-setup">라쿠텐 응답을 받지 못했습니다.<br><small>${escapeHtml(e.message || e.error)}</small></div>`) + rawLink;
        return;
    }
    if (gora.busy) { box.innerHTML = `<div class="gora-hint" id="goraProgress">라쿠텐 GORA 조회 중…</div><div class="gora-hint">처음 조회하는 지역은 골프장 위치 정보 수신으로 10~20초 소요됩니다.</div>`; return; }
    if (!gora.items.length && gora.all.length) { box.innerHTML = `<div class="gora-hint">조건에 맞는 골프장이 없습니다. 검색된 ${gora.all.length}곳이 모두 조건에서 제외되었습니다. 조건을 완화해 보세요.</div>${gora.fnote ? `<div class="gora-hint">${escapeHtml(gora.fnote)}</div>` : ''}` + rawLink; return; }
    if (!gora.items.length) { box.innerHTML = gora.base && gora._searched ? '<div class="gora-hint">해당일 예약 가능한 골프장이 없습니다. 범위나 금액 조건을 넓혀 보세요. (예약은 통상 2~3개월 전부터 가능합니다)</div>' + rawLink : ''; return; }
    box.innerHTML = `<div class="gora-hint">${gora.items.length}곳 · 거리순${gora.hidden ? ` · 조건 미충족 ${gora.hidden}곳 제외` : ''}${gora.note ? ' · ' + escapeHtml(gora.note) : ''}</div>
        ${gora.fnote ? `<div class="gora-hint warn">${escapeHtml(gora.fnote)}</div>` : ''}
        <div class="gora-tip">💡 지도의 번호를 누르면 해당 골프장 목록으로, 목록의 번호를 누르면 지도 위치로 이동합니다.<br>예약 페이지는 ${IS_IOS ? '<b>사파리</b>로 열립니다. 주소창 왼쪽 <b>가가</b> → <b>번역 → 한국어</b>' : '일본어입니다. 브라우저 메뉴의 <b>번역 → 한국어</b>'}를 선택하면 한국어로 표시됩니다.</div>` + gora.items.map((it, i) => {
        const plans = it.fit || it.plans;
        const low = plans.find(p => p.price);
        const shown = plans.slice(0, 3);
        return `
        <div class="gora-item" id="goraItem${i}">
            <div class="gora-item-top">
                <button type="button" class="gora-no"${it.geo ? ` onclick="goraShowOnMap(${i})" title="지도에서 보기"` : ' disabled'}>${i + 1}</button>
                <div class="gora-item-name"><b>${escapeHtml(it.ko || it.name)}</b>${it.ko ? `<small>${escapeHtml(it.name)}</small>` : ''}${it.foreign === 'no' ? '<span class="gora-tag no">⚠️ 외국인 제한 문구 있음</span>' : it.foreign === 'yes' ? '<span class="gora-tag">🌏 외국인 환영</span>' : ''}</div>
            </div>
            <div class="gora-item-meta">
                ${it.km !== null ? `📍 직선 ${it.km.toFixed(0)}km · 차로 약 ${driveMinutes(it.km)}분` : '📍 거리 모름'}
                ${low ? ` · 💴 ¥${low.price.toLocaleString()}~` : ''}${plans.length ? ` · 플랜 ${plans.length}개` : ''}${it.rating ? ` · ⭐${it.rating.toFixed(1)}` : ''}
            </div>
            ${shown.length ? `<div class="gora-plans">${shown.map(p => goraPlanHtml(p, it)).join('')}${plans.length > shown.length ? `<a class="gora-plan more" href="${escapeHtml(it.url || goraSearchUrl(it.name))}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">외 ${plans.length - shown.length}개 플랜 — GORA에서 보기 ›</a>` : ''}</div>` : ''}
            ${it.address ? `<div class="gora-item-meta addr">${escapeHtml(koAddress(it.address))}</div>` : ''}
            <div class="trip-actions">
                <a class="trip-btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">🎫 GORA에서 예약</a>
                <button type="button" class="trip-btn primary" onclick="pickGoraCourse(${i})">예약 완료</button>
            </div>
        </div>`;
    }).join('') + rawLink;
}

// 플랜 한 줄을 누르면 그 날짜·그 플랜의 GORA 예약 페이지로 간다(사용자 요청).
// 주소는 라쿠텐 플랜 검색 답의 callInfo(그날 그 플랜)에서 온다 — 없으면 골프장 예약 달력으로 물러난다.
function goraPlanHtml(p, it) {
    const url = p.url || it.url || goraSearchUrl(it.name);
    return `<a class="gora-plan" href="${escapeHtml(url)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">`
        + `<span class="gora-plan-price">${p.price ? '¥' + p.price.toLocaleString() : ''}</span>`
        + goraPlanTags(p).map(t => `<span class="gora-tag">${escapeHtml(t)}</span>`).join('')
        + `<span class="gora-plan-go">${p.url ? '이 플랜 예약' : '예약 달력'} ›</span>`
        + `<small>${escapeHtml(goraPlanKo(p.name))}</small></a>`;
}

function pickGoraCourse(i) {
    const it = gora.items[i];
    const date = gora.date;
    if (!it || !date) return;
    const area = koPref(it.address) || (it.address.match(/^(.+?[都道府県])/) || [])[1] || '';
    const ok = editTrip(t => {
        const d = t.days.find(x => x.date === date);
        if (!d) return false;
        d.course = it.ko || it.name;
        delete d.golf;
        if (area && !d.area) d.area = area;
        if (it.geo) { d.lat = +it.geo.lat.toFixed(5); d.lon = +it.geo.lon.toFixed(5); } else { delete d.lat; delete d.lon; }
        d.gora = { id: it.id || null, url: /google\.com\/search/.test(it.url) ? '' : (it.url || ''), ...(it.ko ? { ja: it.name } : {}) };
    }, `✅ ${isoLabel(date)} 골프장을 지정했습니다. 예약은 GORA에서 진행해 주세요.`);
    if (ok) { closeGora(); renderTripPage(); }
}
