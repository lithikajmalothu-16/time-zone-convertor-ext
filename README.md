# TimePort — Instant Timezone Converter

See any time mentioned anywhere on the web — "3pm EST", "14:00 CET", "9:30 AM PST", "17:45 UTC+5:30" — instantly converted to **your** timezone. Works on LinkedIn, Gmail, WhatsApp Web, Slack, Twitter/X, anywhere.

## Install (Chrome / Edge / Brave)

1. Unzip this folder somewhere permanent (don't delete it after installing).
2. Open `chrome://extensions` in your browser.
3. Turn on **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select the `timeport` folder.
5. Pin TimePort from the puzzle-piece icon so it's always one click away.

## How to use

**On any page (automatic):** times with a timezone get a dashed amber underline. Hover one → a tooltip shows the time in your zone, with the date and a "next day / previous day" note when it rolls over.

**Select any text:** highlight text containing a time (a LinkedIn post, an email line, a WhatsApp message) → a small bubble appears with the conversion. Works even on pages where auto-underlining misses something.

**The popup (click the icon):**
- Type or paste any time — `9:30pm PST`, `noon CET`, `13:00 UTC+2` — and see it converted live.
- Pick the timezone you want everything shown in ("Show times in"). Default: your device's timezone.
- World clocks — pin up to 6 cities you care about.
- Toggle page underlining on/off.

## What it understands

- 12h and 24h times: `3pm`, `3:45 PM`, `14:00`, `noon`, `midnight`
- ~50 timezone abbreviations: EST/EDT, CST/CDT, MST/MDT, PST/PDT, ET/CT/MT/PT, GMT, BST, CET/CEST, EET/EEST, MSK, GST, IST, PKT, SGT, HKT, JST, KST, AEST/AEDT, ACST, AWST, NZST/NZDT, SAST, and more
- Explicit offsets: `UTC+5:30`, `GMT-8`, `UTC +2`

## Notes & known limits

- **IST** is treated as India Standard Time (UTC+5:30), and **CST** as US Central — those abbreviations are ambiguous worldwide, so TimePort picks the most common reading.
- **ET/CT/MT/PT** (no S/D) are resolved to standard or daylight time automatically based on whether US DST is currently in effect.
- Dates aren't parsed from the page — conversions assume the time refers to today, and show "next day / previous day" when the conversion crosses midnight.
- Times typed inside input boxes and editors aren't underlined (so the extension never interferes with your typing) — select the text instead to get the bubble.

## Privacy

Everything runs locally in your browser. No servers, no analytics, no data leaves your machine. The only stored data is your settings (target zone, pinned clocks, toggle), synced via Chrome's own storage.
