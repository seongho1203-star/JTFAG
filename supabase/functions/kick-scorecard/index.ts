// 스코어카드 판독 워크플로를 즉시 깨운다.
//
// 왜 있는가 —
//   GitHub의 예약 실행(cron)은 적어 둔 주기를 지키지 않는다. `*/5`로 적어도
//   실제로는 33시간에 28회(7%)만 돌았고 중앙값이 59분, 최대 210분이었다.
//   사진을 올리고 한 시간을 기다리는 일이 실제로 생겨서, 올리는 순간
//   repository_dispatch로 워크플로를 직접 깨우도록 바꿨다.
//
// 왜 앱이 GitHub을 직접 안 부르는가 —
//   저장소가 **공개**라 앱(클라이언트 JS)에 GitHub 토큰을 둘 수 없다. 누구나 읽어 간다.
//   그래서 토큰은 여기(서버)에만 두고, 앱은 이 함수만 부른다.
//
// 아무나 부를 수 있지 않은가 —
//   부를 수는 있다. 다만 **대기 중인 요청이 실제로 있을 때만** 깨우므로,
//   장난으로 불러 봐야 몇 초 만에 그냥 끝나는 워크플로가 한 번 도는 게 전부다.
//   (공개 저장소의 Actions는 무료라 요금도 안 나간다.)
//
// 필요한 것: 저장소 Secret이 아니라 **Supabase 쪽 Secret**이다.
//   GH_DISPATCH_TOKEN — Actions 쓰기 권한만 있는 GitHub 토큰 (그 이상 주지 말 것)
//   GH_REPO           — 예: seongho1203-star/JTFAG (없으면 아래 기본값)
//   GH_BRANCH         — 워크플로를 돌릴 가지. 없으면 main
// SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY는 Supabase가 알아서 넣어 준다.

const GH_REPO = Deno.env.get('GH_REPO') ?? 'seongho1203-star/JTFAG';
const GH_BRANCH = Deno.env.get('GH_BRANCH') ?? 'main';
const WORKFLOW = 'read-scorecard.yml';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// 손가락이 두 번 닿거나 새로고침이 겹칠 때 워크플로를 여러 번 깨우지 않게 한다.
// 인스턴스가 살아 있는 동안만 기억하는 값이라 완벽하진 않지만, 흔한 중복은 이걸로 걸러진다.
// (그래도 새 나가면 워크플로의 concurrency가 줄을 세우므로 두 번 판독되진 않는다.)
const THROTTLE_MS = 20_000;
let lastKick = 0;

function reply(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'POST만 받습니다.' });

    if (!GH_TOKEN) return reply(500, { error: 'GH_DISPATCH_TOKEN이 설정되지 않았습니다.' });
    if (!SB_URL || !SB_KEY) return reply(500, { error: 'Supabase 환경변수가 없습니다.' });

    // 정말로 기다리는 요청이 있는지 확인한다. 이게 이 함수의 유일한 문지기다.
    let pending = 0;
    try {
        const res = await fetch(`${SB_URL}/rest/v1/jtfag_league?id=eq.1&select=payload`, {
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const rows = await res.json();
        const list = rows?.[0]?.payload?.scoreRequests ?? [];
        pending = list.filter((r: { status?: string }) => r?.status === '대기').length;
    } catch (err) {
        return reply(502, { error: `리그 데이터를 읽지 못했습니다: ${err}` });
    }

    if (pending === 0) return reply(200, { kicked: false, reason: '대기 중인 요청이 없습니다.' });

    const since = Date.now() - lastKick;
    if (since < THROTTLE_MS) {
        return reply(200, { kicked: false, reason: '조금 전에 이미 깨웠습니다.', pending });
    }

    // repository_dispatch가 아니라 workflow_dispatch를 쓴다 — 토큰 권한이 좁아서다.
    // repository_dispatch는 저장소 '내용 쓰기'를 요구하는데, 공개 저장소에서
    // 그만한 권한을 가진 토큰을 만들어 두고 싶지 않다. 이쪽은 'Actions 쓰기'면 된다.
    const gh = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: GH_BRANCH })
    });

    // 204가 정상이다. 본문이 없다.
    if (gh.status !== 204) {
        return reply(502, { error: `GitHub이 거절했습니다: ${gh.status} ${await gh.text()}` });
    }

    lastKick = Date.now();
    return reply(200, { kicked: true, pending });
});
