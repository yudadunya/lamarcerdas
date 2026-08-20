-- Tabel usage harian: HANYA angka agregat (bukan data sensitif/isi chat).
-- Dipakai oleh api/lib/rateLimiter.js untuk soft-limit Cerebras free tier.
create table if not exists ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  message_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table ai_usage_daily enable row level security;

create policy "users can read own usage"
  on ai_usage_daily for select
  using (auth.uid() = user_id);

-- Insert/update dilakukan lewat service role key di backend (rateLimiter.js),
-- jadi tidak perlu policy insert/update untuk role authenticated.
