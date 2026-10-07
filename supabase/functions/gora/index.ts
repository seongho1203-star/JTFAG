// 라쿠텐 GORA(일본 골프장 예약 사이트)에 물어보는 심부름꾼.
//
// 왜 앱이 라쿠텐을 직접 안 부르는가 —
//   라쿠텐 열쇠(앱 ID · 액세스 키)를 앱(클라이언트 JS)에 두면 공개 저장소라 그대로 새어 나간다.
//   열쇠는 여기(서버)에만 두고, 앱은 이 함수만 부른다. kick-scorecard와 같은 생각이다.
//
// 왜 이렇게 얇은가 —
//   이 함수는 사람이 Supabase 화면에 손으로 붙여넣어 올린다. 고칠 때마다 그 일을 시키지 않으려고
//   **받은 값을 정해 둔 이름만 골라 그대로 넘기고, 받은 답을 그대로 돌려준다.**
//   무엇을 어떻게 물을지(거리·지역·날짜)는 앱(trip.js)이 정한다 — 그쪽은 밀면 바로 바뀐다.
//
// 아무나 부를 수 있지 않은가 —
//   부를 수는 있다. 할 수 있는 일은 GORA 검색 세 가지뿐이고(예약·결제는 라쿠텐 사이트에서 사람이 한다),
//   한 번에 30건까지만 묻게 막았다. 라쿠텐 한도는 앱 ID마다 걸린다.
//
// 필요한 것 (Supabase → Edge Functions → Secrets):
//   RAKUTEN_APP_ID      — 라쿠텐 앱 ID (UUID 모양)
//   RAKUTEN_ACCESS_KEY  — 액세스 키 (pk_ 로 시작)
//   RAKUTEN_REFERER     — 앱 등록 때 '허용된 웹사이트'로 적은 주소. 없으면 아래 기본값.
//                         라쿠텐 새 API는 Referer가 없거나 다르면 403을 준다.

const APP_ID = Deno.env.get('RAKUTEN_APP_ID') ?? '';
const ACCESS_KEY = Deno.env.get('RAKUTEN_ACCESS_KEY') ?? '';
const REFERER = Deno.env.get('RAKUTEN_REFERER') ?? 'https://seongho1203-star.github.io/JTFAG/';
const BASE = Deno.env.get('RAKUTEN_BASE') ?? 'https://openapi.rakuten.co.jp/engine/api/Gora';

// 물을 수 있는 것은 이 셋뿐이다.
const APIS: Record<string, string> = {
    plan: 'GoraPlanSearch/20170623',          // 그날 예약할 수 있는 플랜(가격·시간대·예약 주소)
    course: 'GoraGolfCourseSearch/20170623',  // 골프장 목록
    detail: 'GoraGolfCourseDetail/20170623'   // 골프장 하나의 자세한 정보
};
// 넘겨줄 수 있는 칸. 이름만 고르고 값은 글자 길이만 막는다(라쿠텐이 알아서 검사한다).
const PARAMS = new Set([
    'playDate', 'areaCode', 'latitude', 'longitude', 'searchRange', 'keyword', 'golfCourseId',
    'minPrice', 'maxPrice', 'startTimeZone', 'planType', 'lunch', 'caddie', 'round',
    'sort', 'hits', 'page', 'datumType', 'carrier', 'elements', 'reservation'
]);

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'POST만 받습니다.' });
    if (!APP_ID || !ACCESS_KEY) return reply(503, { error: 'not_configured', message: '라쿠텐 열쇠(RAKUTEN_APP_ID · RAKUTEN_ACCESS_KEY)가 아직 없습니다.' });

    let body: { api?: string; params?: Record<string, unknown> } = {};
    try { body = await req.json(); } catch { return reply(400, { error: '요청을 읽지 못했습니다.' }); }
    const path = APIS[String(body.api || '')];
    if (!path) return reply(400, { error: '모르는 검색입니다.' });

    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatVersion', '2');
    url.searchParams.set('applicationId', APP_ID);
    url.searchParams.set('accessKey', ACCESS_KEY);
    for (const [k, v] of Object.entries(body.params || {})) {
        if (!PARAMS.has(k) || v === null || v === undefined || v === '') continue;
        const s = String(v).slice(0, 60);
        url.searchParams.set(k, k === 'hits' ? String(Math.min(30, Math.max(1, parseInt(s, 10) || 30))) : s);
    }

    try {
        const res = await fetch(url, {
            headers: { 'Referer': REFERER, 'Origin': new URL(REFERER).origin, 'Accept': 'application/json' }
        });
        const text = await res.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
        // 라쿠텐의 답(오류 포함)을 그대로 돌려준다 — 무엇이 틀렸는지 앱 화면에 그대로 적기 위해서다.
        return reply(res.ok ? 200 : 502, { status: res.status, data });
    } catch (err) {
        return reply(502, { error: '라쿠텐에 닿지 못했습니다.', message: String(err) });
    }
});
