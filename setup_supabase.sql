-- 太平人大小事｜社團管理中心 v0.2.1
-- 可用於新建 Supabase 專案，也可在 v0.2 已建立的同一專案中重新執行以升級。
-- 執行前請確認 Supabase 專案正確；不要刪除既有資料表。

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  case_code text,
  category text not null,
  target_name text not null,
  facebook_url text,
  detail text not null,
  reporter_contact text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  case_code text,
  display_name text not null,
  post_type text not null,
  post_content text not null,
  reason text not null,
  contact text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  target_name text not null,
  facebook_url text,
  violation_type text not null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.realtor_violations (
  id uuid primary key default gen_random_uuid(),
  target_name text not null,
  facebook_url text,
  detail text not null,
  created_at timestamptz not null default now()
);

-- 升級既有 v0.2 資料表時，補上案件編號欄位。
alter table public.reports add column if not exists case_code text;
alter table public.appeals add column if not exists case_code text;
create unique index if not exists reports_case_code_uidx on public.reports(case_code) where case_code is not null;
create unique index if not exists appeals_case_code_uidx on public.appeals(case_code) where case_code is not null;

-- 儲存雜湊後的來源 IP 與短時間提交次數；不儲存原始 IP。
create table if not exists public.submission_rate_limits (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  submission_count integer not null default 0,
  last_seen_at timestamptz not null default now()
);
alter table public.submission_rate_limits enable row level security;
revoke all on public.submission_rate_limits from anon, authenticated;
comment on table public.submission_rate_limits is '公開表單反垃圾提交：只保存來源 IP 的 SHA-256 雜湊，不保存原始 IP。可定期清理 30 天未活動紀錄。';

alter table public.admin_users enable row level security;
alter table public.reports enable row level security;
alter table public.appeals enable row level security;
alter table public.violations enable row level security;
alter table public.realtor_violations enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 由資料庫端執行公開表單速率限制：每個來源 IP 10 分鐘最多 5 次。
-- 若執行環境未提供可辨識的來源 IP 標頭，會略過 IP 限速；前端仍有基本蜜罐與短時間重送限制。
create or replace function public.enforce_public_submission_rate_limit()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
  v_hash text;
  v_count integer;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(v_headers ->> 'x-real-ip'), '')
  );

  if v_ip is null then
    return;
  end if;

  v_hash := encode(digest(v_ip, 'sha256'), 'hex');
  insert into public.submission_rate_limits(ip_hash, window_start, submission_count, last_seen_at)
  values (v_hash, now(), 1, now())
  on conflict (ip_hash) do update
    set submission_count = case
          when public.submission_rate_limits.window_start < now() - interval '10 minutes' then 1
          else public.submission_rate_limits.submission_count + 1
        end,
        window_start = case
          when public.submission_rate_limits.window_start < now() - interval '10 minutes' then now()
          else public.submission_rate_limits.window_start
        end,
        last_seen_at = now()
  returning submission_count into v_count;

  if v_count > 5 then
    raise exception '送件太頻繁，請 10 分鐘後再試。' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.enforce_public_submission_rate_limit() from public, anon, authenticated;

-- 公開檢舉只透過 RPC 寫入，避免前端 insert().select() 因無讀取權限而失敗。
create or replace function public.submit_public_report(
  p_category text,
  p_target_name text,
  p_facebook_url text,
  p_detail text,
  p_reporter_contact text,
  p_honeypot text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_url text := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_contact text := nullif(btrim(coalesce(p_reporter_contact, '')), '');
begin
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    raise exception '無法送出，請重新整理頁面後再試。' using errcode = 'P0001';
  end if;
  if coalesce(p_category, '') not in ('疑似詐騙','廣告洗版','房仲違規','人身攻擊／公審','個資／肉搜','其他') then
    raise exception '請選擇有效的檢舉類型。' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_target_name, ''))) not between 1 and 120 then
    raise exception '對象名稱不可空白，且不得超過 120 個字。' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_detail, ''))) not between 1 and 5000 then
    raise exception '事件說明不可空白，且不得超過 5000 個字。' using errcode = 'P0001';
  end if;
  if v_url is not null and (char_length(v_url) > 1000 or v_url !~* '^https?://') then
    raise exception '貼文連結格式不正確，請以 http:// 或 https:// 開頭。' using errcode = 'P0001';
  end if;
  if v_contact is not null and char_length(v_contact) > 300 then
    raise exception '聯絡方式不得超過 300 個字。' using errcode = 'P0001';
  end if;

  perform public.enforce_public_submission_rate_limit();
  v_code := 'RPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.reports(case_code, category, target_name, facebook_url, detail, reporter_contact)
  values (v_code, btrim(p_category), btrim(p_target_name), v_url, btrim(p_detail), v_contact);
  return v_code;
end;
$$;

create or replace function public.submit_public_appeal(
  p_display_name text,
  p_post_type text,
  p_post_content text,
  p_reason text,
  p_contact text,
  p_honeypot text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
begin
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    raise exception '無法送出，請重新整理頁面後再試。' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 120 then
    raise exception '姓名或 Facebook 顯示名稱不可空白，且不得超過 120 個字。' using errcode = 'P0001';
  end if;
  if coalesce(p_post_type, '') not in ('一般生活分享','廣告／商業貼文','房屋／租售','協尋／交通事件','其他') then
    raise exception '請選擇有效的文章類型。' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_post_content, ''))) not between 1 and 10000 then
    raise exception '原貼文內容不可空白，且不得超過 10000 個字。' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 5000 then
    raise exception '申訴原因不可空白，且不得超過 5000 個字。' using errcode = 'P0001';
  end if;
  if v_contact is not null and char_length(v_contact) > 300 then
    raise exception '聯絡方式不得超過 300 個字。' using errcode = 'P0001';
  end if;

  perform public.enforce_public_submission_rate_limit();
  v_code := 'APL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.appeals(case_code, display_name, post_type, post_content, reason, contact)
  values (v_code, btrim(p_display_name), btrim(p_post_type), btrim(p_post_content), btrim(p_reason), v_contact);
  return v_code;
end;
$$;

revoke all on function public.submit_public_report(text,text,text,text,text,text) from public;
revoke all on function public.submit_public_appeal(text,text,text,text,text,text) from public;
grant execute on function public.submit_public_report(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.submit_public_appeal(text,text,text,text,text,text) to anon, authenticated;

-- 不再允許匿名用戶直接讀寫資料表；公開提交只走上方已驗證的 RPC。
drop policy if exists "public can submit reports" on public.reports;
drop policy if exists "public can submit appeals" on public.appeals;

-- 管理員：可讀取與更新檢舉、申訴。
drop policy if exists "admins manage reports" on public.reports;
create policy "admins manage reports" on public.reports for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage appeals" on public.appeals;
create policy "admins manage appeals" on public.appeals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 一般違規與房仲紀錄僅管理員可操作。
drop policy if exists "admins manage violations" on public.violations;
create policy "admins manage violations" on public.violations for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage realtor violations" on public.realtor_violations;
create policy "admins manage realtor violations" on public.realtor_violations for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 管理員只能讀取自己的名單資料列；一般訪客不能查詢管理員名單。
drop policy if exists "admin can read own membership" on public.admin_users;
create policy "admin can read own membership" on public.admin_users for select to authenticated using (user_id = auth.uid());

-- 第一次建立管理員：
-- 1) Supabase -> Authentication -> Users 建立 Email/Password 使用者。
-- 2) 複製該使用者 UUID，替換下方 YOUR_USER_UUID，再單獨執行：
-- insert into public.admin_users(user_id) values ('YOUR_USER_UUID');

-- 可選：定期清理 30 天未活動的雜湊限速紀錄（不會刪除檢舉／申訴案件）：
-- delete from public.submission_rate_limits where last_seen_at < now() - interval '30 days';
