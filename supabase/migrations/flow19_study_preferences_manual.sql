-- Только для ручной проверки. Сначала сравните с существующей таблицей и политиками.
-- Не запускайте автоматически: таблица может уже существовать.
create table if not exists public.study_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monday_minutes integer not null default 180 check (monday_minutes between 0 and 720),
  tuesday_minutes integer not null default 180 check (tuesday_minutes between 0 and 720),
  wednesday_minutes integer not null default 180 check (wednesday_minutes between 0 and 720),
  thursday_minutes integer not null default 180 check (thursday_minutes between 0 and 720),
  friday_minutes integer not null default 180 check (friday_minutes between 0 and 720),
  saturday_minutes integer not null default 180 check (saturday_minutes between 0 and 720),
  sunday_minutes integer not null default 180 check (sunday_minutes between 0 and 720)
);
alter table public.study_preferences enable row level security;
-- Проверить отсутствие одноимённой политики перед выполнением:
create policy "Users manage own study preferences" on public.study_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
