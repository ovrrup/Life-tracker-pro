# Life-tracker-pro
Just a life tracker made in a break time to make my life more easy and clutter-free.
<div align="center">

<img src="https://img.shields.io/badge/platform-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white"/>
<img src="https://img.shields.io/badge/built_with-React-61DAFB?style=for-the-badge&logo=react&logoColor=black"/>
<img src="https://img.shields.io/badge/powered_by-Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white"/>
<img src="https://img.shields.io/badge/AI-Claude_Sonnet-8C4FFF?style=for-the-badge"/>
<img src="https://img.shields.io/badge/storage-100%25_Local-success?style=for-the-badge"/>

# 🧬 Life Tracker Pro

### *Your Personal Operating System*

**The all-in-one habit tracker, task manager, mood journal, goal tracker, and AI life coach — built for people who take their growth seriously.**

[Download APK](#installation) · [Features](#features) · [Tech Stack](#tech-stack) · [Screenshots](#screenshots) · [Contributing](#contributing)

---

</div>

## Overview

Life Tracker Pro is a fully offline-first Android app that puts every aspect of your personal productivity in one beautifully designed interface. Built with React and Capacitor — no server required, no data leaves your device.

Whether you're tracking daily habits, managing tasks by priority, logging mood patterns over time, or getting personalized AI coaching on your progress — Life Tracker Pro has you covered.

---

## Features

### 🏠 Dashboard
A real-time command center showing your day at a glance — habit completion percentage, task progress, today's mood, and active goal count. Automatically surfaces your morning or evening routine based on the time of day.

### 🔁 Habit Tracker
- Create custom habits with emoji, color, and per-day scheduling (e.g. exercise Mon–Fri only)
- 7-day visual completion grid with one-tap logging
- Automatic **streak counter** (🔥) for consecutive days
- Pause/resume habits without losing history
- Full history stored locally, no sync required

### ✅ Task Manager
- Quick-add tasks with Enter key support
- Priority levels: **High / Med / Low** with color-coded badges
- Filter views: Today, Pending, Done, All
- Date scheduling and per-task notes
- Priority-sorted rendering (high priority always floats up)

### 🌅 Routine Builder
- Separate **Morning** and **Evening** routine slots
- Drag-to-reorder with up/down controls
- Per-item emoji, duration (in minutes), and notes
- Total routine duration shown at a glance
- Dashboard auto-selects the correct slot by time of day

### 🏁 Goals & Trackers
- Create goals with current/target values and custom units (books, $, days, km…)
- Animated progress bars with percentage display
- Quick-update input: type a new value and press Enter
- Color-coded cards for visual distinction

### 😊 Mood Tracker
- 5-level mood scale with emoji feedback (Rough → Amazing)
- Optional freeform text note for each day's entry
- 14-day mood heatmap calendar
- Historical mood-averaged score
- Journal notes from mood entries shown in timeline view

### 📖 Journal
- Titled, freeform daily journal entries
- Live character and word count
- Full edit and delete support
- Entries sorted newest-first

### 📊 Analytics
- Habit completion trends over 7 and 30 days
- Task completion rate history
- Mood pattern visualization
- Goal progress at a glance

### 🤖 AI Coach *(powered by Claude)*
- Reads your full data context: habits, tasks, mood, goals, and routine
- Provides personalized insights, motivation, and actionable suggestions
- Conversational multi-turn chat interface
- Powered by `claude-sonnet-4-20250514` via the Anthropic API

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 (via Babel Standalone — no build step) |
| Native Runtime | Apache Capacitor |
| Platform | Android (APK) |
| Storage | `localStorage` with namespaced keys (`lt_v1_*`) |
| AI Integration | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Styling | Custom CSS with CSS variables and dark theme |
| Icons | Custom inline SVG icon system |
| Package ID | `com.lifetracker.pro` |

> **No backend. No database. No cloud.** All data is stored locally on the device using `localStorage` via Capacitor's web view. Data persists across sessions and is never transmitted to any server (except for AI Coach requests to the Anthropic API).

---

## Data Model

All state is persisted to `localStorage` under the `lt_v1_` prefix:

| Key | Type | Description |
|---|---|---|
| `lt_v1_habits` | `Habit[]` | Habit definitions with color, emoji, schedule |
| `lt_v1_logs` | `Record<string, boolean>` | Habit completion log, keyed as `YYYY-MM-DD__habitId` |
| `lt_v1_tasks` | `Task[]` | Tasks with priority, date, done state |
| `lt_v1_trackers` | `Tracker[]` | Goal trackers with current/goal values |
| `lt_v1_mood` | `Record<string, MoodEntry>` | Daily mood level + notes, keyed by date |
| `lt_v1_journals` | `JournalEntry[]` | Titled journal entries |
| `lt_v1_routine` | `{ morning, evening }` | Ordered routine item lists |

### Export / Import
The `DB.exportAll()` and `DB.importAll()` utilities allow full data portability as a JSON snapshot.

---

## Installation

### Prerequisites
- Android 6.0 (API 23) or higher
- Allow installation from unknown sources (for debug APK)

### Install the Debug APK

1. Download `app-debug.apk` from the [Releases](../../releases) page
2. Transfer to your Android device
3. Tap the APK file and follow the install prompts
4. Open **Life Tracker Pro** from your app drawer

> ⚠️ This is a debug build signed with a debug key. For production deployment, generate a release-signed APK via Android Studio.

### Build from Source

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/life-tracker-pro.git
cd life-tracker-pro

# 2. Install dependencies
npm install

# 3. Build the web assets
npm run build

# 4. Sync to Android
npx cap sync android

# 5. Open in Android Studio
npx cap open android
```

Then build and run via Android Studio, or generate an APK via **Build → Build APK(s)**.

---

## AI Coach Setup

The AI Coach feature requires an API key. "it is currently not working."
Stay updated for future changes.
---

## Project Structure

```
life-tracker-pro/
├── www/                        # Web assets (served by Capacitor)
│   ├── index.html              # App shell + CSS + Babel runtime
│   └── app.jsx                 # All React components and logic
├── android/                    # Android project (Capacitor)
│   └── app/
│       └── src/main/
│           └── AndroidManifest.xml
├── capacitor.config.json       # Capacitor configuration
└── package.json
```

The entire frontend lives in two files: `index.html` (styles + shell) and `app.jsx` (all React components, state, and logic). No bundler required — Babel Standalone transpiles JSX at runtime.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test on an Android device or emulator
5. Commit with a clear message: `git commit -m "feat: add weekly summary view"`
6. Push and open a Pull Request

### Ideas for Contribution
- [ ] Dark/light theme toggle
- [ ] Data export to JSON or CSV
- [ ] Notification reminders for habits and routines
- [ ] Widget support for habit check-ins from the home screen
- [ ] Backup/restore via Google Drive
- [ ] Charts and graphs in the Analytics view
- [ ] Custom mood labels

---

## License

MIT License — see [`LICENSE`](LICENSE) for details.

---

<div align="center">

Built with ❤️ using React + Capacitor · 

*All your data stays on your device.*

</div>
