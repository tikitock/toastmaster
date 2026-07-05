# Toastmaster

Make toast notifications in Obsidian last as long as you actually need to read them, or stop
them from disappearing at all — from any plugin, or from Obsidian core.

## The Problem

Obsidian's toast notifications (`Notice`) auto-hide after a fixed 4 seconds by default, and
there's no setting anywhere in Obsidian to change that. This is a long-standing complaint:

- [Notification toast disappears too fast](https://forum.obsidian.md/t/notification-toast-disappears-too-fast/67655)
- ["Notice" toast message broken](https://forum.obsidian.md/t/notice-toast-message-broken/111100)
- [Keep a log of notification bubbles (toast)](https://forum.obsidian.md/t/keep-a-log-of-notification-bubbles-toast/67938)

If a plugin shows you a message with useful detail (an error, a summary, a list of file
names) and it vanishes before you finish reading it, that's this problem.

## What It Does

Toastmaster patches the single method Obsidian's `Notice` class uses internally to schedule
its auto-hide timer. Because every toast (from every plugin, and from Obsidian core) goes
through that same method, this one patch controls duration for all of them — not just
Toastmaster's own notices.

Two modes, both configurable in Settings → Toastmaster:

- **Minimum toast duration** (default 8000ms): any toast that would have disappeared sooner
  is extended to last at least this long. A toast a plugin intentionally set to last longer
  than this is left alone — this only raises a floor, it never shortens anything.
- **Persist until dismissed**: ignore duration entirely; every toast stays on screen until
  you click it.

Toastmaster also keeps a small log of recent toasts (from any plugin, or core), so you can
review one you missed. Run **"Show recent toasts"** from the command palette, or open it from
Settings → Toastmaster. Capped at a configurable size (default 50), oldest entries dropped
first, and persists across restarts.

## Already-existing behavior worth knowing about

Two things Obsidian already does, that most people don't know about, and which this plugin
doesn't change:

- **Clicking anywhere on a toast dismisses it immediately.**
- **Hovering your mouse over a toast pauses its auto-hide timer** while the cursor is over
  it, resuming about a second after you move away.

## Installation

### From the Community Plugin Browser (recommended)
1. Open Obsidian Settings > Community Plugins
2. Search for **Toastmaster**
3. Click Install, then Enable

### Manual Installation
1. Download `manifest.json` and `main.js` from the latest release
2. Create a folder at `<your-vault>/.obsidian/plugins/toastmaster/`
3. Place both files in that folder
4. Open Obsidian Settings > Community Plugins and enable the plugin

## Configuration

Settings → Toastmaster:
- **Minimum toast duration (ms)** — default 8000
- **Persist all toasts until dismissed** — default off
- **Keep a log of recent toasts** — default on
- **Log size** — default 50

## Compatibility

- Works on desktop and mobile
- Tested on Obsidian 1.x

## Known Limitations

- Patches `Notice.prototype.setAutoHide`, an internal Obsidian API not formally documented in
  the public plugin API (only the `Notice(message, timeout)` constructor itself is
  documented). Works reliably on current Obsidian versions but may need an update if Obsidian
  changes how `Notice` schedules its auto-hide internally.
- Only affects toasts created after the plugin loads; any toast already on screen when you
  enable/disable the plugin keeps its original timing.

## Contributing

Issues and pull requests welcome. Please open an issue before submitting a PR for significant
changes.

## License

MIT
