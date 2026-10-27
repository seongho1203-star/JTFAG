-- ─────────────────────────────────────────────────────────────────
-- 사진 저장 용량 조회 (관리자 메뉴의 `📸 사진 용량 확인`)
--
-- 왜: round-photos 통에는 anon 읽기(SELECT) 정책이 없어 앱이 파일 목록을 못 본다.
--     그렇다고 정책을 열면 파일 이름이 전부 새므로, 폴더별 개수·용량만 돌려주는 함수 하나만 연다.
--     읽기 전용이고 합계 숫자 외에는 아무것도 안 돌려준다.
--
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.
-- ─────────────────────────────────────────────────────────────────

create or replace function public.photo_storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, storage
as $$
    select coalesce(jsonb_agg(row_to_json(t) order by t.folder), '[]'::jsonb)
    from (
        select split_part(name, '/', 1)                          as folder,
               count(*)                                          as files,
               coalesce(sum((metadata->>'size')::bigint), 0)     as bytes
        from storage.objects
        where bucket_id = 'round-photos'
        group by 1
    ) t;
$$;

revoke all on function public.photo_storage_usage() from public;
grant execute on function public.photo_storage_usage() to anon, authenticated;
