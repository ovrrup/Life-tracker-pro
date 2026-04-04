# Lifetrack — Flutter App

A sleek, production-ready life tracking app built in Flutter/Dart with Supabase as the real backend.

## Features

- **Dashboard** — Interactive home that lets you act, not just view. Log habits, check off tasks, log mood, all from one screen.
- **Habit Tracker** — Week-view grid, streaks, color-coded, per-day toggles
- **Task Manager** — Priority levels (High/Med/Low), Today/Upcoming/All tabs, quick-add inline
- **Mood Tracker** — Custom-drawn face icons (no emoji), 14-day history, line chart, note journal
- **Journal** — Full-screen editor with word count, titles, edit history
- **Goals** — Progress rings, inline update, color-coded
- **Insights** — 12-week heatmap, task completion bars, AI-generated insight cards
- **Social / Multiplayer** — Real friend accounts via Supabase Auth, friend requests, live activity feed via Supabase Realtime

## Custom Icon System

All icons are hand-drawn via Flutter's `CustomPainter` — **zero emojis, zero Material icons**. Each icon uses clean path geometry on a 24×24 grid with configurable stroke width and color.

## Setup

### 1. Flutter Setup
```bash
flutter pub get
flutter run
```

### 2. Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full schema found in:
   `lib/core/services/supabase_service.dart` (the large comment block at the top)
3. Copy your project URL and anon key from **Settings → API**
4. Replace in `lib/main.dart`:
```dart
const _supabaseUrl  = 'https://YOUR_PROJECT_ID.supabase.co';
const _supabaseAnon = 'YOUR_ANON_KEY';
```

### 3. Run
```bash
flutter run --release  # for performance
```

## Project Structure

```
lib/
├── main.dart                     # Entry point, auth gate, navigation shell
├── core/
│   ├── theme/app_theme.dart      # Design tokens, typography, colors, shadows
│   ├── models/models.dart        # All data models
│   └── services/supabase_service.dart  # All DB operations + SQL schema
├── features/
│   ├── dashboard/dashboard_screen.dart  # Interactive dashboard
│   └── screens.dart             # All other screens (habits, tasks, mood, journal, goals, insights, social, auth)
└── shared/
    ├── icons/lt_icons.dart       # Custom path-drawn icon system
    └── widgets/lt_widgets.dart   # Reusable components
```

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (extends `auth.users`) |
| `habits` | Habit definitions |
| `habit_logs` | Daily habit completion records |
| `tasks` | Task items with priority and date |
| `mood_entries` | Daily mood with notes |
| `journal_entries` | Long-form journal entries |
| `goals` | Goal definitions with progress |
| `friend_requests` | Friend request flow |
| `activity_feed` | Public friend activity events |

All tables have **Row Level Security (RLS)** enabled — users only see their own data (plus friends' public activity).

## Realtime Features

- Friend activity feed updates live when a friend completes a habit or reaches a goal
- Habit log changes sync across devices in real time

## Design System

Colors, spacing, typography, and radius values are all defined as constants in `LTColors`, `LTText`, `LTRadius`, `LTSpace`, and `LTShadow` — making it trivial to retheme the entire app.

```dart
// Example usage
Container(
  decoration: BoxDecoration(
    color: LTColors.surface1,
    borderRadius: LTRadius.lg,
    border: Border.all(color: LTColors.border1),
  ),
  child: Text('Hello', style: LTText.heading(16)),
)
```
