-- ─────────────────────────────────────────────────────────────────
-- 리그 데이터 백업 보관 테이블 (docs/백업.md 참고)
--
-- 왜: 앱 전체 상태가 jtfag_league 한 줄(payload)에 들어 있어, 누가 잘못 저장하거나
--     낡은 폰이 덮어쓰면 되돌릴 길이 없었다. 하루 한 번 GitHub Actions(scripts/backup.js)가
--     그 한 줄과 정산 금액 테이블(jtfag_money)을 통째로 여기에 날짜별로 남긴다.
--
-- 이 표에는 정책을 일부러 만들지 않는다 = 앱(anon 키)은 읽지도 쓰지도 못한다.
-- 정산 금액·개인 정보가 그대로 들어 있어서다. 서비스 키(Actions의 SUPABASE_SERVICE_KEY)만 접근한다.
--
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.jtfag_backups (
    id        bigint generated always as identity primary key,
    taken_at  timestamptz not null default now(),
    kind      text        not null default 'daily' check (kind in ('daily', 'manual', 'pre-restore')),
    digest    text        not null,        -- 내용 지문. 어제와 같으면 새로 안 남긴다
    bytes     integer     not null default 0,
    payload   jsonb       not null,        -- jtfag_league.payload 통째
    money     jsonb                        -- jtfag_money 전체 행 (표가 없으면 null)
);

create index if not exists jtfag_backups_taken_at_idx on public.jtfag_backups (taken_at desc);

alter table public.jtfag_backups enable row level security;

-- 정책이 없으면 anon·authenticated는 전부 막힌다. 혹시 모를 기본 권한까지 걷어 둔다.
revoke all on public.jtfag_backups from anon, authenticated;
