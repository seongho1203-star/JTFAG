-- ─────────────────────────────────────────────────────────────────
-- 정산 금액을 payload에서 떼어 내는 테이블 (docs/금액분리.md 참고)
--
-- 왜: 금액이 jtfag_league.payload 한 덩어리 안에 있으면, 누가 무엇을 저장하든
--     (일정 · 사진 · 자동 저장까지) 네 명의 금액 전체를 그 폰이 마지막으로 본 상태로
--     다시 써 넣는다. 낡은 폰 하나가 저장하는 순간 남의 금액이 0이 되거나 옛 값으로
--     되돌아갔다. 칸 하나를 행 하나로 두면 내 칸을 쓰는 일이 남의 칸에 닿을 수 없다.
--
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.jtfag_money (
    round       integer     not null check (round >= 0 and round < 1000),
    name        text        not null,
    field       text        not null check (field in ('start', 'end', 'donate')),
    value       bigint      not null default 0,
    rev         text,                       -- 누가 몇 번째로 썼는지 (앱이 순서를 가리는 데 쓴다)
    updated_at  timestamptz not null default now(),
    primary key (round, name, field)
);

alter table public.jtfag_money enable row level security;

-- 정책은 jtfag_league와 같은 생각이다: 읽기는 열고, 쓰기는 우리 넷의 칸에만, 지우기는 막는다.
-- (로그인이 없어 보안 경계가 아니라 쓰레기 행·실수 방지 장치다.)
drop policy if exists "money read"   on public.jtfag_money;
drop policy if exists "money insert" on public.jtfag_money;
drop policy if exists "money update" on public.jtfag_money;

create policy "money read" on public.jtfag_money
    for select using (true);

create policy "money insert" on public.jtfag_money
    for insert with check (name in ('이관교', '김지명', '신성호', '박승수'));

create policy "money update" on public.jtfag_money
    for update using (true)
    with check (name in ('이관교', '김지명', '신성호', '박승수'));

-- DELETE 정책은 일부러 만들지 않는다 = 지우기 차단. 금액은 0으로 덮어 지운다.

-- 실시간으로 남의 칸이 바뀐 걸 받으려면 publication에 넣어야 한다.
do $$
begin
    alter publication supabase_realtime add table public.jtfag_money;
exception when duplicate_object then
    null;   -- 이미 들어 있다
end $$;
