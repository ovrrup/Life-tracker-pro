// lib/core/services/supabase_service.dart
//
// Full Supabase backend for Lifetrack.
//
// ─── SQL SCHEMA ───────────────────────────────────────────────────────────────
// Run this entire block in Supabase → SQL Editor → New Query → Run
// Re-running is safe: every statement uses IF NOT EXISTS / OR REPLACE.
/*
-- ── EXTENSIONS ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";   -- for display_name search

-- ── PROFILES ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid        primary key references auth.users(id) on delete cascade,
  email          text        not null,
  display_name   text        not null default 'User',
  avatar_url     text,
  total_streak   int         not null default 0,
  longest_streak int         not null default 0,
  timezone       text        not null default 'UTC',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_own"          on public.profiles;
drop policy if exists "profiles_friends_read" on public.profiles;

create policy "profiles_own" on public.profiles
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_friends_read" on public.profiles
  for select using (
    exists (
      select 1 from public.friendships
      where (user_a = auth.uid() and user_b = profiles.id)
         or (user_b = auth.uid() and user_a = profiles.id)
    )
  );

-- ── HABITS ────────────────────────────────────────────────────────────────────
create table if not exists public.habits (
  id             uuid        primary key default uuid_generate_v4(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  name           text        not null,
  color_hex      text        not null default '#3ECFCA',
  active_days    int[]       not null default array[0,1,2,3,4,5,6],
  is_active      boolean     not null default true,
  current_streak int         not null default 0,
  longest_streak int         not null default 0,
  sort_order     int         not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.habits enable row level security;

drop policy if exists "habits_own" on public.habits;
create policy "habits_own" on public.habits
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists habits_user_id_idx on public.habits(user_id);

-- ── HABIT LOGS ────────────────────────────────────────────────────────────────
create table if not exists public.habit_logs (
  id          uuid    primary key default uuid_generate_v4(),
  habit_id    uuid    not null references public.habits(id) on delete cascade,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  date        date    not null,
  completed   boolean not null default false,
  logged_at   timestamptz not null default now(),
  unique (habit_id, date)
);

alter table public.habit_logs enable row level security;

drop policy if exists "habit_logs_own"          on public.habit_logs;
drop policy if exists "habit_logs_friends_read" on public.habit_logs;

create policy "habit_logs_own" on public.habit_logs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "habit_logs_friends_read" on public.habit_logs
  for select using (
    exists (
      select 1 from public.friendships
      where (user_a = auth.uid() and user_b = habit_logs.user_id)
         or (user_b = auth.uid() and user_a = habit_logs.user_id)
    )
  );

create index if not exists habit_logs_user_date_idx  on public.habit_logs(user_id, date);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, date);

-- ── TASKS ─────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  notes        text,
  is_done      boolean     not null default false,
  priority     text        not null default 'medium'
                           check (priority in ('high','medium','low')),
  date         date        not null,
  due_time     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists tasks_user_date_idx on public.tasks(user_id, date);

-- ── MOOD ENTRIES ──────────────────────────────────────────────────────────────
create table if not exists public.mood_entries (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  level       text        not null default 'neutral'
                          check (level in ('terrible','bad','neutral','good','great')),
  note        text,
  tags        text[]      not null default array[]::text[],
  date        date        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.mood_entries enable row level security;

drop policy if exists "mood_own" on public.mood_entries;
create policy "mood_own" on public.mood_entries
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mood_user_date_idx on public.mood_entries(user_id, date);

-- ── JOURNAL ENTRIES ───────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Untitled',
  content     text        not null default '',
  word_count  int         not null default 0,
  date        date        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

drop policy if exists "journal_own" on public.journal_entries;
create policy "journal_own" on public.journal_entries
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists journal_user_date_idx on public.journal_entries(user_id, date desc);

-- Auto word_count + updated_at
create or replace function public.set_journal_meta()
returns trigger language plpgsql as $$
begin
  new.word_count := coalesce(
    array_length(regexp_split_to_array(trim(new.content), '\s+'), 1), 0
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists journal_meta_trigger on public.journal_entries;
create trigger journal_meta_trigger
  before insert or update on public.journal_entries
  for each row execute procedure public.set_journal_meta();

-- ── GOALS ─────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  current_val  numeric     not null default 0,
  target_val   numeric     not null default 100 check (target_val > 0),
  unit         text        not null default 'count',
  color_hex    text        not null default '#3ECFCA',
  deadline     date,
  is_completed boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists "goals_own" on public.goals;
create policy "goals_own" on public.goals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists goals_user_id_idx on public.goals(user_id);

-- ── FRIENDSHIPS ───────────────────────────────────────────────────────────────
-- Normalised: user_a < user_b (by uuid text) eliminates duplicate rows.
create table if not exists public.friendships (
  id         uuid        primary key default uuid_generate_v4(),
  user_a     uuid        not null references auth.users(id) on delete cascade,
  user_b     uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

alter table public.friendships enable row level security;

drop policy if exists "friendships_members" on public.friendships;
create policy "friendships_members" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create index if not exists friendships_a_idx on public.friendships(user_a);
create index if not exists friendships_b_idx on public.friendships(user_b);

-- ── FRIEND REQUESTS ───────────────────────────────────────────────────────────
create table if not exists public.friend_requests (
  id         uuid        primary key default uuid_generate_v4(),
  from_id    uuid        not null references auth.users(id) on delete cascade,
  to_id      uuid        not null references auth.users(id) on delete cascade,
  status     text        not null default 'pending'
                         check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

alter table public.friend_requests enable row level security;

drop policy if exists "requests_parties"  on public.friend_requests;
drop policy if exists "requests_send"     on public.friend_requests;
drop policy if exists "requests_respond"  on public.friend_requests;

create policy "requests_parties" on public.friend_requests
  for select using (auth.uid() = from_id or auth.uid() = to_id);

create policy "requests_send" on public.friend_requests
  for insert with check (auth.uid() = from_id);

create policy "requests_respond" on public.friend_requests
  for update using (auth.uid() = to_id);

-- ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
create table if not exists public.activity_feed (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  action     text        not null,
  subject    text        not null,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_feed enable row level security;

drop policy if exists "activity_own_insert" on public.activity_feed;
drop policy if exists "activity_read"       on public.activity_feed;

create policy "activity_own_insert" on public.activity_feed
  for insert with check (auth.uid() = user_id);

create policy "activity_read" on public.activity_feed
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships
      where (user_a = auth.uid() and user_b = activity_feed.user_id)
         or (user_b = auth.uid() and user_a = activity_feed.user_id)
    )
  );

create index if not exists activity_user_idx on public.activity_feed(user_id, created_at desc);

-- ── FUNCTIONS ─────────────────────────────────────────────────────────────────

-- 1. Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Accept friend request atomically (marks row + inserts normalised friendship)
create or replace function public.accept_friend_request(request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_from uuid;
  v_to   uuid;
begin
  select from_id, to_id into v_from, v_to
  from public.friend_requests
  where id = request_id
    and to_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Request not found or not authorised';
  end if;

  update public.friend_requests
  set status = 'accepted', updated_at = now()
  where id = request_id;

  insert into public.friendships (user_a, user_b)
  values (least(v_from, v_to), greatest(v_from, v_to))
  on conflict (user_a, user_b) do nothing;
end;
$$;

-- 3. Recalculate streak for a habit after any log write
create or replace function public.recalculate_habit_streak(p_habit_id uuid)
returns void language plpgsql security definer as $$
declare
  v_streak     int  := 0;
  v_check_date date := current_date;
  v_completed  boolean;
  v_user_id    uuid;
begin
  select user_id into v_user_id from public.habits where id = p_habit_id;

  loop
    select completed into v_completed
    from public.habit_logs
    where habit_id = p_habit_id and date = v_check_date;

    exit when not found or not v_completed;
    v_streak     := v_streak + 1;
    v_check_date := v_check_date - interval '1 day';
  end loop;

  update public.habits
  set
    current_streak = v_streak,
    longest_streak = greatest(longest_streak, v_streak)
  where id = p_habit_id;

  update public.profiles
  set
    total_streak   = greatest(total_streak, v_streak),
    longest_streak = greatest(
      longest_streak,
      (select max(longest_streak) from public.habits where user_id = v_user_id)
    ),
    updated_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.trigger_streak_recalc()
returns trigger language plpgsql security definer as $$
begin
  perform public.recalculate_habit_streak(new.habit_id);
  return new;
end;
$$;

drop trigger if exists habit_log_streak_trigger on public.habit_logs;
create trigger habit_log_streak_trigger
  after insert or update on public.habit_logs
  for each row execute procedure public.trigger_streak_recalc();

-- ── REALTIME PUBLICATION ──────────────────────────────────────────────────────
-- Run each line separately if you see "already a member of publication" errors:
-- alter publication supabase_realtime add table public.habit_logs;
-- alter publication supabase_realtime add table public.activity_feed;
-- alter publication supabase_realtime add table public.friend_requests;
-- alter publication supabase_realtime add table public.goals;
*/

import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/models.dart';

// ─── RESULT TYPE ──────────────────────────────────────────────────────────────

sealed class ServiceResult<T> {
  const ServiceResult();
}

final class Ok<T> extends ServiceResult<T> {
  final T value;
  const Ok(this.value);
}

final class Err<T> extends ServiceResult<T> {
  final String message;
  final Object? raw;
  const Err(this.message, {this.raw});
}

extension ServiceResultX<T> on ServiceResult<T> {
  bool get isOk  => this is Ok<T>;
  bool get isErr => this is Err<T>;
  T    get value => (this as Ok<T>).value;
  T    valueOr(T fallback) => isOk ? value : fallback;
}

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────

typedef _WriteOp = Future<void> Function();

class _OfflineQueue {
  final _queue   = <_WriteOp>[];
  bool _draining = false;

  void enqueue(_WriteOp op) => _queue.add(op);

  Future<void> drain() async {
    if (_draining || _queue.isEmpty) return;
    _draining = true;
    while (_queue.isNotEmpty) {
      final op = _queue.removeAt(0);
      try {
        await op();
      } catch (_) {
        _queue.insert(0, op); // put back and stop draining
        break;
      }
    }
    _draining = false;
  }
}

// ─── SIMPLE CACHE ─────────────────────────────────────────────────────────────

class _Cache<T> {
  T?        _value;
  DateTime? _fetchedAt;
  final Duration ttl;

  _Cache({this.ttl = const Duration(minutes: 2)});

  bool get isStale  => _fetchedAt == null || DateTime.now().difference(_fetchedAt!) > ttl;
  T?   get value    => isStale ? null : _value;

  void set(T v)     { _value = v; _fetchedAt = DateTime.now(); }
  void invalidate() { _fetchedAt = null; }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

String _ds(DateTime d)  => d.toIso8601String().split('T')[0];
DateTime _today()       => DateTime.now();

// ─── SUPPLEMENTARY TYPES ──────────────────────────────────────────────────────

class HabitDayStat {
  final DateTime date;
  final int completed;
  final int total;
  const HabitDayStat({required this.date, required this.completed, required this.total});
  double get rate => total == 0 ? 0.0 : completed / total;
}

class FriendRequest {
  final String   id;
  final String   fromId;
  final String   fromName;
  final String   fromEmail;
  final String?  fromAvatar;
  final DateTime createdAt;
  const FriendRequest({
    required this.id,
    required this.fromId,
    required this.fromName,
    required this.fromEmail,
    this.fromAvatar,
    required this.createdAt,
  });
}

class FriendActivity {
  final String   id;
  final String   userId;
  final String   userName;
  final String?  avatarUrl;
  final String   action;
  final String   subject;
  final String   type;       // 'habit' | 'goal' | 'general'
  final DateTime createdAt;
  const FriendActivity({
    required this.id,
    required this.userId,
    required this.userName,
    this.avatarUrl,
    required this.action,
    required this.subject,
    required this.type,
    required this.createdAt,
  });
}

class InsightData {
  final int    days;
  final double habitRate;
  final double taskRate;
  final double avgMood;
  final int    currentStreak;
  final int    longestStreak;
  final int    bestWeekday;
  final int    completedTasks;
  final int    totalTasks;
  final int    completedGoals;
  final int    totalGoals;
  final List<dynamic> rawHabitLogs;
  final List<dynamic> rawMoodEntries;
  final List<dynamic> rawTasks;

  const InsightData({
    required this.days,
    required this.habitRate,
    required this.taskRate,
    required this.avgMood,
    required this.currentStreak,
    required this.longestStreak,
    required this.bestWeekday,
    required this.completedTasks,
    required this.totalTasks,
    required this.completedGoals,
    required this.totalGoals,
    required this.rawHabitLogs,
    required this.rawMoodEntries,
    required this.rawTasks,
  });

  static const _days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  String get bestWeekdayLabel => _days[bestWeekday.clamp(0, 6)];
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

class SupabaseService {
  SupabaseService._();
  static final SupabaseService instance = SupabaseService._();

  // ── Internal ──────────────────────────────────────────────────────────────
  SupabaseClient get _db  => Supabase.instance.client;
  String? get currentUserId => _db.auth.currentUser?.id;
  bool    get isSignedIn    => currentUserId != null;

  final _offlineQueue  = _OfflineQueue();
  final _habitsCache   = _Cache<List<Habit>>();
  final _goalsCache    = _Cache<List<Goal>>();
  final _profileCache  = <String, _Cache<AppUser>>{};
  final _channels      = <String, RealtimeChannel>{};

  // ── Error wrapper ─────────────────────────────────────────────────────────
  Future<ServiceResult<T>> _run<T>(Future<T> Function() fn) async {
    try {
      return Ok(await fn());
    } on PostgrestException catch (e) {
      return Err(_pgMsg(e), raw: e);
    } on AuthException catch (e) {
      return Err(e.message, raw: e);
    } on TimeoutException {
      return const Err('Request timed out. Check your connection.');
    } catch (e) {
      return Err(e.toString(), raw: e);
    }
  }

  String _pgMsg(PostgrestException e) => switch (e.code) {
    '23505'    => 'This record already exists.',
    '23503'    => 'Related record not found.',
    '42501'    => 'Permission denied.',
    'PGRST116' => 'Record not found.',
    _          => e.message,
  };

  void _requireAuth() {
    if (!isSignedIn) throw const AuthException('Not signed in');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  Stream<AuthState> get authStateChanges => _db.auth.onAuthStateChange;

  Future<ServiceResult<AuthResponse>> signUp({
    required String email,
    required String password,
    required String displayName,
  }) => _run(() => _db.auth.signUp(
      email: email, password: password,
      data: {'display_name': displayName},
    ));

  Future<ServiceResult<AuthResponse>> signIn({
    required String email,
    required String password,
  }) => _run(() => _db.auth.signInWithPassword(email: email, password: password));

  Future<ServiceResult<void>> signOut() => _run(() async {
    _habitsCache.invalidate();
    _goalsCache.invalidate();
    _profileCache.clear();
    _disposeAllChannels();
    await _db.auth.signOut();
  });

  Future<ServiceResult<void>> resetPassword(String email) =>
      _run(() => _db.auth.resetPasswordForEmail(email));

  Future<ServiceResult<UserResponse>> updatePassword(String newPassword) =>
      _run(() => _db.auth.updateUser(UserAttributes(password: newPassword)));

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILES
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<AppUser>> getProfile(String userId) => _run(() async {
    final cache = _profileCache.putIfAbsent(
        userId, () => _Cache(ttl: const Duration(minutes: 5)));
    if (cache.value != null) return cache.value!;

    final data = await _db
        .from('profiles')
        .select()
        .eq('id', userId)
        .single()
        .timeout(const Duration(seconds: 10));

    final user = AppUser.fromJson(data);
    cache.set(user);
    return user;
  });

  Future<ServiceResult<AppUser>> getMyProfile() {
    _requireAuth();
    return getProfile(currentUserId!);
  }

  Future<ServiceResult<void>> updateProfile({
    String? displayName,
    String? avatarUrl,
    String? timezone,
  }) => _run(() async {
    _requireAuth();
    final updates = <String, dynamic>{
      'updated_at': DateTime.now().toIso8601String(),
      if (displayName != null) 'display_name': displayName,
      if (avatarUrl   != null) 'avatar_url':   avatarUrl,
      if (timezone    != null) 'timezone':      timezone,
    };
    await _db.from('profiles').update(updates).eq('id', currentUserId!);
    _profileCache[currentUserId!]?.invalidate();
  });

  Future<ServiceResult<List<AppUser>>> searchUsers(String query) => _run(() async {
    _requireAuth();
    if (query.trim().length < 2) return <AppUser>[];
    final data = await _db
        .from('profiles')
        .select()
        .ilike('display_name', '%${query.trim()}%')
        .neq('id', currentUserId!)
        .limit(20);
    return (data as List).map((j) => AppUser.fromJson(j)).toList();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HABITS
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<List<Habit>>> getHabits({bool forceRefresh = false}) =>
      _run(() async {
    _requireAuth();
    if (!forceRefresh && _habitsCache.value != null) return _habitsCache.value!;

    final data = await _db
        .from('habits')
        .select()
        .eq('user_id', currentUserId!)
        .order('sort_order')
        .order('created_at');

    final habits = (data as List).map((j) => Habit.fromJson(j)).toList();
    _habitsCache.set(habits);
    return habits;
  });

  Future<ServiceResult<Habit>> createHabit(Habit habit) => _run(() async {
    _requireAuth();
    _habitsCache.invalidate();
    final payload = habit.toJson()
      ..remove('id')
      ..['user_id'] = currentUserId!;
    final data = await _db.from('habits').insert(payload).select().single();
    return Habit.fromJson(data);
  });

  Future<ServiceResult<void>> updateHabit(Habit habit) => _run(() async {
    _requireAuth();
    _habitsCache.invalidate();
    final payload = habit.toJson()
      ..remove('user_id')
      ..remove('created_at')
      ..remove('current_streak')
      ..remove('longest_streak');
    await _db
        .from('habits')
        .update(payload)
        .eq('id', habit.id)
        .eq('user_id', currentUserId!);
  });

  Future<ServiceResult<void>> reorderHabits(List<String> orderedIds) => _run(() async {
    _requireAuth();
    _habitsCache.invalidate();
    await Future.wait(orderedIds.asMap().entries.map((e) => _db
        .from('habits')
        .update({'sort_order': e.key})
        .eq('id', e.value)
        .eq('user_id', currentUserId!)));
  });

  Future<ServiceResult<void>> deleteHabit(String habitId) => _run(() async {
    _requireAuth();
    _habitsCache.invalidate();
    await _db
        .from('habits')
        .delete()
        .eq('id', habitId)
        .eq('user_id', currentUserId!);
  });

  // ── Habit Logs ────────────────────────────────────────────────────────────

  /// Returns a map keyed "habitId_YYYY-MM-DD" → completed bool.
  Future<ServiceResult<Map<String, bool>>> getHabitLogs({
    required DateTime from,
    required DateTime to,
  }) => _run(() async {
    _requireAuth();
    final data = await _db
        .from('habit_logs')
        .select('habit_id, date, completed')
        .eq('user_id', currentUserId!)
        .gte('date', _ds(from))
        .lte('date', _ds(to));

    return {
      for (final r in data as List)
        '${r['habit_id']}_${r['date']}': r['completed'] as bool,
    };
  });

  /// Toggle a single habit log. Optimistic update — queues offline on failure.
  Future<ServiceResult<void>> setHabitLog({
    required String  habitId,
    required DateTime date,
    required bool    completed,
  }) async {
    _requireAuth();
    final uid     = currentUserId!;
    final dateStr = _ds(date);

    final op = () async {
      await _db.from('habit_logs').upsert(
        {
          'habit_id':  habitId,
          'user_id':   uid,
          'date':      dateStr,
          'completed': completed,
          'logged_at': DateTime.now().toIso8601String(),
        },
        onConflict: 'habit_id,date',
      );
      // DB trigger recalculates streak automatically.
      if (completed) {
        final cached = _habitsCache.value;
        final name   = cached
            ?.where((h) => h.id == habitId)
            .map((h) => h.name)
            .firstOrNull ?? 'a habit';
        await _postActivity('completed', name, type: 'habit');
      }
    };

    final result = await _run(op);
    if (result.isErr) _offlineQueue.enqueue(op);
    return result;
  }

  /// Per-day habit completion stats for the Insights chart.
  Future<ServiceResult<List<HabitDayStat>>> getHabitDailyStats({int days = 30}) =>
      _run(() async {
    _requireAuth();
    final habitsRes = await getHabits();
    if (habitsRes.isErr) return <HabitDayStat>[];
    final habits = habitsRes.value;
    if (habits.isEmpty) return <HabitDayStat>[];

    final from    = _today().subtract(Duration(days: days - 1));
    final logsRes = await getHabitLogs(from: from, to: _today());
    final logs    = logsRes.valueOr({});

    return List.generate(days, (i) {
      final date  = from.add(Duration(days: i));
      final dStr  = _ds(date);
      final wd    = date.weekday % 7; // 0=Sun … 6=Sat
      final total = habits.where((h) => h.isActive && h.activeDays.contains(wd)).length;
      final done  = habits.where((h) => logs['${h.id}_$dStr'] == true).length;
      return HabitDayStat(date: date, completed: done, total: total);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<List<Task>>> getTasksForDate(DateTime date) => _run(() async {
    _requireAuth();
    final data = await _db
        .from('tasks')
        .select()
        .eq('user_id', currentUserId!)
        .eq('date', _ds(date))
        .order('created_at');
    return (data as List).map((j) => Task.fromJson(j)).toList();
  });

  Future<ServiceResult<List<Task>>> getTasksInRange({
    required DateTime from,
    required DateTime to,
    bool? isDone,
  }) => _run(() async {
    _requireAuth();
    var q = _db
        .from('tasks')
        .select()
        .eq('user_id', currentUserId!)
        .gte('date', _ds(from))
        .lte('date', _ds(to));
    if (isDone != null) q = q.eq('is_done', isDone);
    final data = await q.order('date').order('created_at');
    return (data as List).map((j) => Task.fromJson(j)).toList();
  });

  Future<ServiceResult<List<Task>>> getPendingTasks() => getTasksInRange(
    from:   _today().subtract(const Duration(days: 7)),
    to:     _today().add(const Duration(days: 30)),
    isDone: false,
  );

  Future<ServiceResult<Task>> createTask(Task task) => _run(() async {
    _requireAuth();
    final payload = task.toJson()
      ..remove('id')
      ..['user_id'] = currentUserId!;
    final data = await _db.from('tasks').insert(payload).select().single();
    return Task.fromJson(data);
  });

  Future<ServiceResult<void>> updateTask(Task task) => _run(() async {
    _requireAuth();
    final payload = task.toJson()
      ..remove('user_id')
      ..remove('created_at');
    if (task.isDone && task.completedAt == null) {
      payload['completed_at'] = DateTime.now().toIso8601String();
    } else if (!task.isDone) {
      payload['completed_at'] = null;
    }
    await _db
        .from('tasks')
        .update(payload)
        .eq('id', task.id)
        .eq('user_id', currentUserId!);
  });

  Future<ServiceResult<void>> deleteTask(String taskId) => _run(() async {
    _requireAuth();
    await _db
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', currentUserId!);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MOOD
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<MoodEntry?>> getMoodForDate(DateTime date) => _run(() async {
    _requireAuth();
    final data = await _db
        .from('mood_entries')
        .select()
        .eq('user_id', currentUserId!)
        .eq('date', _ds(date))
        .maybeSingle();
    return data != null ? MoodEntry.fromJson(data) : null;
  });

  Future<ServiceResult<MoodEntry?>> getTodayMood() => getMoodForDate(_today());

  Future<ServiceResult<List<MoodEntry>>> getMoodHistory({int days = 90}) => _run(() async {
    _requireAuth();
    final from = _today().subtract(Duration(days: days - 1));
    final data = await _db
        .from('mood_entries')
        .select()
        .eq('user_id', currentUserId!)
        .gte('date', _ds(from))
        .order('date', ascending: false);
    return (data as List).map((j) => MoodEntry.fromJson(j)).toList();
  });

  Future<ServiceResult<void>> saveMood(MoodEntry entry) => _run(() async {
    _requireAuth();
    final payload = entry.toJson()
      ..['user_id']    = currentUserId!
      ..['updated_at'] = DateTime.now().toIso8601String();
    // Remove empty id so Postgres can assign one on insert
    if (entry.id.isEmpty) payload.remove('id');
    await _db.from('mood_entries').upsert(payload, onConflict: 'user_id,date');
  });

  Future<ServiceResult<double>> getAverageMood({int days = 30}) => _run(() async {
    final result = await getMoodHistory(days: days);
    if (result.isErr || result.value.isEmpty) return 0.0;
    final sum = result.value.fold<double>(0, (acc, e) => acc + (e.level.index + 1));
    return sum / result.value.length;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // JOURNAL
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<List<JournalEntry>>> getJournalEntries({
    int     limit       = 20,
    int     offset      = 0,
    String? searchQuery,
  }) => _run(() async {
    _requireAuth();
    var q = _db
        .from('journal_entries')
        .select()
        .eq('user_id', currentUserId!);

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final s = searchQuery.trim();
      q = q.or('title.ilike.%$s%,content.ilike.%$s%');
    }

    final data = await q
        .order('date', ascending: false)
        .range(offset, offset + limit - 1);

    return (data as List).map((j) => JournalEntry.fromJson(j)).toList();
  });

  Future<ServiceResult<JournalEntry?>> getJournalEntryForDate(DateTime date) =>
      _run(() async {
    _requireAuth();
    final data = await _db
        .from('journal_entries')
        .select()
        .eq('user_id', currentUserId!)
        .eq('date', _ds(date))
        .maybeSingle();
    return data != null ? JournalEntry.fromJson(data) : null;
  });

  /// Creates if id is empty, otherwise updates.
  Future<ServiceResult<JournalEntry>> saveJournalEntry(JournalEntry entry) =>
      _run(() async {
    _requireAuth();
    final payload = entry.toJson()
      ..['user_id'] = currentUserId!;

    if (entry.id.isEmpty) {
      payload.remove('id');
      final data = await _db.from('journal_entries').insert(payload).select().single();
      return JournalEntry.fromJson(data);
    } else {
      payload['updated_at'] = DateTime.now().toIso8601String();
      final data = await _db
          .from('journal_entries')
          .update(payload)
          .eq('id', entry.id)
          .eq('user_id', currentUserId!)
          .select()
          .single();
      return JournalEntry.fromJson(data);
    }
  });

  Future<ServiceResult<void>> deleteJournalEntry(String entryId) => _run(() async {
    _requireAuth();
    await _db
        .from('journal_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', currentUserId!);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GOALS
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<List<Goal>>> getGoals({bool forceRefresh = false}) =>
      _run(() async {
    _requireAuth();
    if (!forceRefresh && _goalsCache.value != null) return _goalsCache.value!;

    final data = await _db
        .from('goals')
        .select()
        .eq('user_id', currentUserId!)
        .order('created_at');

    final goals = (data as List).map((j) => Goal.fromJson(j)).toList();
    _goalsCache.set(goals);
    return goals;
  });

  Future<ServiceResult<Goal>> createGoal(Goal goal) => _run(() async {
    _requireAuth();
    _goalsCache.invalidate();
    final payload = goal.toJson()
      ..remove('id')
      ..['user_id'] = currentUserId!;
    final data = await _db.from('goals').insert(payload).select().single();
    return Goal.fromJson(data);
  });

  Future<ServiceResult<void>> updateGoalProgress(String goalId, double newValue) =>
      _run(() async {
    _requireAuth();
    _goalsCache.invalidate();
    await _db.from('goals').update({
      'current_val': newValue,
      'updated_at':  DateTime.now().toIso8601String(),
    }).eq('id', goalId).eq('user_id', currentUserId!);
  });

  Future<ServiceResult<void>> updateGoal(Goal goal) => _run(() async {
    _requireAuth();
    _goalsCache.invalidate();
    final isComplete = goal.percentage >= 1.0;
    final payload = goal.toJson()
      ..remove('user_id')
      ..remove('created_at')
      ..['is_completed'] = isComplete
      ..['updated_at']   = DateTime.now().toIso8601String();
    await _db
        .from('goals')
        .update(payload)
        .eq('id', goal.id)
        .eq('user_id', currentUserId!);
    if (isComplete) await _postActivity('reached goal', goal.name, type: 'goal');
  });

  Future<ServiceResult<void>> deleteGoal(String goalId) => _run(() async {
    _requireAuth();
    _goalsCache.invalidate();
    await _db
        .from('goals')
        .delete()
        .eq('id', goalId)
        .eq('user_id', currentUserId!);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SOCIAL
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<List<AppUser>>> getFriends() => _run(() async {
    _requireAuth();
    final uid = currentUserId!;

    final rows = await _db
        .from('friendships')
        .select('user_a, user_b')
        .or('user_a.eq.$uid,user_b.eq.$uid');

    final ids = (rows as List)
        .map((r) => (r['user_a'] as String) == uid
            ? r['user_b'] as String
            : r['user_a'] as String)
        .toList();

    if (ids.isEmpty) return <AppUser>[];

    final profiles = await _db.from('profiles').select().inFilter('id', ids);
    return (profiles as List).map((j) => AppUser.fromJson(j)).toList();
  });

  Future<ServiceResult<void>> sendFriendRequest(String toEmail) => _run(() async {
    _requireAuth();
    final uid = currentUserId!;

    final profile = await _db
        .from('profiles')
        .select('id')
        .eq('email', toEmail.trim().toLowerCase())
        .maybeSingle();

    if (profile == null) throw Exception('No account found with that email.');
    final toId = profile['id'] as String;
    if (toId == uid) throw Exception('You cannot add yourself.');

    // Check already friends
    final a = uid.compareTo(toId) < 0 ? uid : toId;
    final b = uid.compareTo(toId) < 0 ? toId : uid;
    final alreadyFriends = await _db
        .from('friendships')
        .select('id')
        .eq('user_a', a)
        .eq('user_b', b)
        .maybeSingle();
    if (alreadyFriends != null) throw Exception('Already friends with this user.');

    await _db.from('friend_requests').insert({
      'from_id': uid,
      'to_id':   toId,
      'status':  'pending',
    });
  });

  Future<ServiceResult<List<FriendRequest>>> getPendingRequests() => _run(() async {
    _requireAuth();
    final data = await _db
        .from('friend_requests')
        .select('id, from_id, created_at, profiles!from_id(display_name, avatar_url, email)')
        .eq('to_id', currentUserId!)
        .eq('status', 'pending')
        .order('created_at', ascending: false);

    return (data as List).map((r) => FriendRequest(
      id:          r['id']      as String,
      fromId:      r['from_id'] as String,
      fromName:    r['profiles']['display_name'] as String? ?? 'User',
      fromEmail:   r['profiles']['email']        as String? ?? '',
      fromAvatar:  r['profiles']['avatar_url']   as String?,
      createdAt:   DateTime.parse(r['created_at'] as String),
    )).toList();
  });

  /// Calls the `accept_friend_request` Postgres function which atomically
  /// marks the request accepted and inserts the normalised friendship row.
  Future<ServiceResult<void>> acceptFriendRequest(String requestId) =>
      _run(() => _db.rpc('accept_friend_request', params: {'request_id': requestId}));

  Future<ServiceResult<void>> declineFriendRequest(String requestId) => _run(() async {
    _requireAuth();
    await _db.from('friend_requests')
        .update({'status': 'declined', 'updated_at': DateTime.now().toIso8601String()})
        .eq('id', requestId)
        .eq('to_id', currentUserId!);
  });

  Future<ServiceResult<void>> removeFriend(String friendId) => _run(() async {
    _requireAuth();
    final uid = currentUserId!;
    final a   = uid.compareTo(friendId) < 0 ? uid : friendId;
    final b   = uid.compareTo(friendId) < 0 ? friendId : uid;
    await _db.from('friendships').delete().eq('user_a', a).eq('user_b', b);
  });

  // ── Activity feed ─────────────────────────────────────────────────────────

  Future<ServiceResult<List<FriendActivity>>> getActivityFeed({int limit = 30}) =>
      _run(() async {
    _requireAuth();
    final data = await _db
        .from('activity_feed')
        .select('*, profiles!user_id(display_name, avatar_url)')
        .order('created_at', ascending: false)
        .limit(limit);

    return (data as List).map((r) => FriendActivity(
      id:        r['id']      as String,
      userId:    r['user_id'] as String,
      userName:  r['profiles']['display_name'] as String? ?? 'User',
      avatarUrl: r['profiles']['avatar_url']   as String?,
      action:    r['action']  as String,
      subject:   r['subject'] as String,
      type:      (r['metadata'] as Map?)?.containsKey('type') == true
                  ? r['metadata']['type'] as String
                  : 'general',
      createdAt: DateTime.parse(r['created_at'] as String),
    )).toList();
  });

  Future<void> _postActivity(String action, String subject,
      {String type = 'general'}) async {
    try {
      await _db.from('activity_feed').insert({
        'user_id':  currentUserId!,
        'action':   action,
        'subject':  subject,
        'metadata': {'type': type},
      });
    } catch (_) {
      // Non-critical — never propagate
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INSIGHTS
  // ══════════════════════════════════════════════════════════════════════════

  Future<ServiceResult<InsightData>> getInsightData({int days = 30}) => _run(() async {
    _requireAuth();
    final uid  = currentUserId!;
    final from = _ds(_today().subtract(Duration(days: days - 1)));
    final to   = _ds(_today());

    final results = await Future.wait([
      _db.from('habit_logs')
          .select('habit_id, date, completed')
          .eq('user_id', uid).gte('date', from).lte('date', to),
      _db.from('tasks')
          .select('date, is_done, priority')
          .eq('user_id', uid).gte('date', from).lte('date', to),
      _db.from('mood_entries')
          .select('date, level')
          .eq('user_id', uid).gte('date', from).lte('date', to),
      _db.from('goals')
          .select('name, current_val, target_val, color_hex, is_completed')
          .eq('user_id', uid),
      _db.from('habits')
          .select('id, name, current_streak, longest_streak')
          .eq('user_id', uid).eq('is_active', true),
    ]);

    final habitLogs   = results[0] as List;
    final tasks       = results[1] as List;
    final moodEntries = results[2] as List;
    final goals       = results[3] as List;
    final habits      = results[4] as List;

    // Streak
    final streaks   = habits.map((h) => h['current_streak'] as int? ?? 0).toList();
    final maxStreak = streaks.isEmpty ? 0 : streaks.reduce((a, b) => a > b ? a : b);
    final longest   = habits.fold<int>(0, (m, h) {
      final s = h['longest_streak'] as int? ?? 0;
      return s > m ? s : m;
    });

    // Habit rate
    final completedLogs = habitLogs.where((l) => l['completed'] == true).length;
    final possible      = (habits.length * days).clamp(1, 999999);
    final habitRate     = completedLogs / possible;

    // Task rate
    final doneTasks = tasks.where((t) => t['is_done'] == true).length;
    final taskRate  = tasks.isEmpty ? 0.0 : doneTasks / tasks.length;

    // Avg mood
    double avgMood = 0;
    if (moodEntries.isNotEmpty) {
      final levels = moodEntries.map((e) {
        final idx = MoodLevel.values.indexWhere((l) => l.name == (e['level'] as String? ?? 'neutral'));
        return ((idx >= 0 ? idx : 2) + 1).toDouble();
      });
      avgMood = levels.reduce((a, b) => a + b) / levels.length;
    }

    // Best weekday
    final byWD = List.filled(7, 0);
    for (final l in habitLogs.where((l) => l['completed'] == true)) {
      byWD[DateTime.parse(l['date'] as String).weekday % 7]++;
    }
    final bestWD = byWD.indexed.reduce((a, b) => a.$2 >= b.$2 ? a : b).$1;

    return InsightData(
      days:           days,
      habitRate:      habitRate.clamp(0.0, 1.0),
      taskRate:       taskRate.clamp(0.0, 1.0),
      avgMood:        avgMood,
      currentStreak:  maxStreak,
      longestStreak:  longest,
      bestWeekday:    bestWD,
      completedTasks: doneTasks,
      totalTasks:     tasks.length,
      completedGoals: goals.where((g) => g['is_completed'] == true).length,
      totalGoals:     goals.length,
      rawHabitLogs:   habitLogs,
      rawMoodEntries: moodEntries,
      rawTasks:       tasks,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════════════════════════════════

  /// Listen for changes on the current user's habit_logs table.
  /// Returns a channel key to pass to [unsubscribe].
  String subscribeHabitLogs(void Function() onChanged) {
    final uid = currentUserId;
    if (uid == null) return '';
    const key = 'habit_logs';
    _disposeChannel(key);
    _channels[key] = _db
        .channel('habit-logs-$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'habit_logs',
          filter: PostgresChangeFilter(type: FilterType.eq, column: 'user_id', value: uid),
          callback: (_) => onChanged(),
        )
        .subscribe();
    return key;
  }

  /// Listen for new entries in the activity feed (friends completing habits etc.).
  String subscribeActivityFeed(void Function(FriendActivity) onActivity) {
    const key = 'activity_feed';
    _disposeChannel(key);
    _channels[key] = _db
        .channel('lt-activity')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'activity_feed',
          callback: (payload) {
            final r = payload.newRecord;
            onActivity(FriendActivity(
              id:        r['id']      as String? ?? '',
              userId:    r['user_id'] as String? ?? '',
              userName:  'Friend',
              action:    r['action']  as String? ?? '',
              subject:   r['subject'] as String? ?? '',
              type:      (r['metadata'] as Map?)?.containsKey('type') == true
                          ? r['metadata']['type'] as String
                          : 'general',
              createdAt: DateTime.tryParse(r['created_at'] as String? ?? '') ?? DateTime.now(),
            ));
          },
        )
        .subscribe();
    return key;
  }

  /// Listen for incoming friend requests addressed to the current user.
  String subscribeFriendRequests(void Function() onChanged) {
    final uid = currentUserId;
    if (uid == null) return '';
    const key = 'friend_requests';
    _disposeChannel(key);
    _channels[key] = _db
        .channel('lt-fr-$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'friend_requests',
          filter: PostgresChangeFilter(type: FilterType.eq, column: 'to_id', value: uid),
          callback: (_) => onChanged(),
        )
        .subscribe();
    return key;
  }

  void unsubscribe(String key) => _disposeChannel(key);

  void _disposeChannel(String key) {
    final ch = _channels.remove(key);
    if (ch != null) _db.removeChannel(ch);
  }

  void _disposeAllChannels() {
    for (final ch in _channels.values) _db.removeChannel(ch);
    _channels.clear();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OFFLINE QUEUE
  // ══════════════════════════════════════════════════════════════════════════

  /// Call when network connectivity is restored to replay any queued writes.
  Future<void> drainOfflineQueue() => _offlineQueue.drain();

  int get pendingOfflineOps => _offlineQueue._queue.length;
}
