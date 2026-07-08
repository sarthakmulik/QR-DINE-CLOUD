create table if not exists public.rate_limits (
    key text primary key,
    attempts int not null default 0,
    lock_until timestamp with time zone
);

-- Enable RLS
alter table public.rate_limits enable row level security;

-- Only service role can access
create policy "Service role only" on public.rate_limits
    for all
    using (auth.role() = 'service_role');
