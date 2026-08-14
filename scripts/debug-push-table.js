// push_subscriptions 접근 실패 원인 진단용. 일시적으로 쓰고 지운다.
// 앱과 같은 anon 키로 같은 요청을 재현해, 어느 동작에서 막히는지 본다.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } = process.env;
const TABLE = 'push_subscriptions';
const TEST_ENDPOINT = 'https://example.invalid/debug-' + Date.now();

const keyHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

async function attempt(label, url, options) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        console.log(`\n[${label}] ${res.status} ${res.statusText}`);
        console.log('   ' + (text.slice(0, 400) || '(본문 없음)'));
        return res.status;
    } catch (err) {
        console.log(`\n[${label}] 요청 자체 실패: ${err.message}`);
        return -1;
    }
}

async function main() {
    const anon = keyHeaders(SUPABASE_ANON_KEY);
    const svc = keyHeaders(SUPABASE_SERVICE_KEY);
    const row = JSON.stringify({ endpoint: TEST_ENDPOINT, p256dh: 'debug', auth: 'debug', name: 'debug' });

    console.log('=== 서비스 키 (RLS 우회) ===');
    await attempt('service · 테이블 조회', `${SUPABASE_URL}/rest/v1/${TABLE}?select=endpoint,name&limit=5`, { headers: svc });

    console.log('\n=== anon 키 (앱과 동일) ===');
    await attempt('anon · SELECT', `${SUPABASE_URL}/rest/v1/${TABLE}?select=endpoint&limit=1`, { headers: anon });
    await attempt('anon · 단순 INSERT', `${SUPABASE_URL}/rest/v1/${TABLE}`,
        { method: 'POST', headers: anon, body: row });
    await attempt('anon · UPSERT (앱이 쓰는 방식)', `${SUPABASE_URL}/rest/v1/${TABLE}`,
        { method: 'POST', headers: { ...anon, Prefer: 'resolution=merge-duplicates' }, body: row });
    await attempt('anon · DELETE', `${SUPABASE_URL}/rest/v1/${TABLE}?endpoint=eq.${encodeURIComponent(TEST_ENDPOINT)}`,
        { method: 'DELETE', headers: anon });

    console.log('\n=== 뒷정리 (서비스 키로 테스트 행 제거) ===');
    await attempt('service · DELETE', `${SUPABASE_URL}/rest/v1/${TABLE}?endpoint=like.https://example.invalid/debug-*`,
        { method: 'DELETE', headers: svc });
}

main().catch(e => { console.error(e); process.exit(1); });
