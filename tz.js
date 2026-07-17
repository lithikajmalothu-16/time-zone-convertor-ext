/* TimePort — shared timezone logic (loaded by popup and content script) */
(function (global) {
  "use strict";

  // Timezone abbreviation → offset in minutes from UTC.
  // Abbreviations already encode DST (EST vs EDT), so fixed offsets are correct.
  const ZONES = {
    UTC: 0, GMT: 0, Z: 0,
    // Europe
    BST: 60, WET: 0, WEST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180,
    // Middle East / Africa
    GST: 240, AST_ARABIA: 180, SAST: 120, EAT: 180, WAT: 60, CAT: 120, TRT: 180,
    // South Asia
    IST: 330, PKT: 300, NPT: 345, BST_BD: 360,
    // East / Southeast Asia
    ICT: 420, WIB: 420, SGT: 480, HKT: 480, MYT: 480, PHT: 480, CST_CHINA: 480,
    JST: 540, KST: 540,
    // Oceania
    AWST: 480, ACST: 570, ACDT: 630, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780,
    // North America
    NST: -210, NDT: -150, AST: -240, ADT: -180,
    EST: -300, EDT: -240, ET: -300 /* resolved below */,
    CST: -360, CDT: -300, CT: -360,
    MST: -420, MDT: -360, MT: -420,
    PST: -480, PDT: -420, PT: -480,
    AKST: -540, AKDT: -480, HST: -600, HDT: -540,
    // South America
    ART: -180, BRT: -180, CLT: -240, COT: -300, PET: -300, VET: -240,
  };

  // ET/CT/MT/PT are "current" US zones — resolve to standard or daylight
  // based on whether US DST is in effect right now.
  function usDstActive(now = new Date()) {
    const jan = zoneOffsetMinutes("America/New_York", new Date(now.getFullYear(), 0, 15));
    const cur = zoneOffsetMinutes("America/New_York", now);
    return cur !== jan;
  }

  function abbrevOffset(abbrev, now = new Date()) {
    const up = abbrev.toUpperCase();
    if (["ET", "CT", "MT", "PT"].includes(up)) {
      const dst = usDstActive(now) ? 60 : 0;
      return ZONES[up] + dst;
    }
    if (up in ZONES) return ZONES[up];
    return null;
  }

  // Current offset (minutes) of an IANA zone.
  function zoneOffsetMinutes(iana, date = new Date()) {
    try {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "shortOffset" });
      const name = dtf.formatToParts(date).find((p) => p.type === "timeZoneName").value;
      const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return 0; // plain "GMT"
      const sign = m[1] === "-" ? -1 : 1;
      return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    } catch {
      return 0;
    }
  }

  // The big detection regex.
  // Matches: "3pm EST", "9:30 AM PST", "14:00 CET", "17:45 UTC+5:30", "10 am GMT-8"
  // Requires an explicit timezone token so we don't hijack plain numbers.
  const ABBREV_LIST = Object.keys(ZONES)
    .filter((k) => !k.includes("_"))
    .concat(["ET", "CT", "MT", "PT"])
    .sort((a, b) => b.length - a.length)
    .join("|");

  const TIME_RE = new RegExp(
    "\\b(?:(?<word>noon|midnight)|(?<h>\\d{1,2})(?::(?<mi>\\d{2}))?\\s*(?<ampm>a\\.?m\\.?|p\\.?m\\.?)?)\\s*" +
      "(?:(?<utc>(?:UTC|GMT)\\s?(?<sign>[+-])\\s?(?<oh>\\d{1,2})(?::?(?<om>\\d{2}))?)|(?<abbr>" + ABBREV_LIST + ")\\b)",
    "gi"
  );

  // Parse one match into { hours, minutes, srcOffset, srcLabel } or null.
  function parseMatch(m, now = new Date()) {
    const g = m.groups || {};
    let h, min = 0, ampm = null, word = null;

    if (g.word) {
      word = g.word.toLowerCase();
      h = word === "noon" ? 12 : 0;
    } else if (g.h) {
      h = parseInt(g.h, 10);
      min = g.mi ? parseInt(g.mi, 10) : 0;
      ampm = g.ampm ? g.ampm.toLowerCase().replace(/\./g, "") : null;
      if (min > 59) return null;
      if (ampm) {
        if (h < 1 || h > 12) return null;
        if (ampm.startsWith("p") && h !== 12) h += 12;
        if (ampm.startsWith("a") && h === 12) h = 0;
      } else {
        if (h > 23) return null;
      }
    } else {
      return null;
    }

    let srcOffset, srcLabel;
    if (g.utc) {
      const sign = g.sign === "-" ? -1 : 1;
      const oh = parseInt(g.oh, 10);
      const om = g.om ? parseInt(g.om, 10) : 0;
      if (oh > 14 || om > 59) return null;
      srcOffset = sign * (oh * 60 + om);
      srcLabel = "UTC" + (sign < 0 ? "-" : "+") + oh + (om ? ":" + String(om).padStart(2, "0") : "");
    } else if (g.abbr) {
      srcOffset = abbrevOffset(g.abbr, now);
      if (srcOffset === null) return null;
      srcLabel = g.abbr.toUpperCase();
    } else {
      return null;
    }

    return {
      hours: h, minutes: min,
      hadColon: !!g.mi, hadAmPm: !!ampm || !!word,
      srcOffset, srcLabel, raw: m[0],
    };
  }

  // Convert parsed time to the target zone. Returns display info.
  function convert(parsed, targetIana, now = new Date()) {
    const tgtOffset = zoneOffsetMinutes(targetIana, now);
    const srcWall = parsed.hours * 60 + parsed.minutes;
    let tgtWall = srcWall - parsed.srcOffset + tgtOffset;

    let dayShift = 0;
    while (tgtWall < 0) { tgtWall += 1440; dayShift -= 1; }
    while (tgtWall >= 1440) { tgtWall -= 1440; dayShift += 1; }

    const th = Math.floor(tgtWall / 60);
    const tm = tgtWall % 60;

    // 12-hour display
    const ampm = th >= 12 ? "PM" : "AM";
    let h12 = th % 12; if (h12 === 0) h12 = 12;
    const timeStr = h12 + ":" + String(tm).padStart(2, "0") + " " + ampm;
    const timeStr24 = String(th).padStart(2, "0") + ":" + String(tm).padStart(2, "0");

    // Date in the target zone, adjusted by dayShift
    const nowInTgt = new Date(now.getTime() + (tgtOffset - (-now.getTimezoneOffset())) * 60000);
    const d = new Date(nowInTgt);
    d.setDate(d.getDate() + dayShift);
    const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const dayNote = dayShift === 0 ? "same day" : dayShift > 0 ? "next day" : "previous day";

    return { timeStr, timeStr24, dateStr, dayShift, dayNote, tgtOffset };
  }

  function fmtOffset(mins) {
    const sign = mins < 0 ? "-" : "+";
    const a = Math.abs(mins);
    return "UTC" + sign + Math.floor(a / 60) + (a % 60 ? ":" + String(a % 60).padStart(2, "0") : "");
  }

  // Curated target-zone choices for the popup.
  const IANA_CHOICES = [
    ["Auto (your device)", "auto"],
    ["India — IST (Kolkata)", "Asia/Kolkata"],
    ["US Eastern (New York)", "America/New_York"],
    ["US Central (Chicago)", "America/Chicago"],
    ["US Mountain (Denver)", "America/Denver"],
    ["US Pacific (Los Angeles)", "America/Los_Angeles"],
    ["UK (London)", "Europe/London"],
    ["Central Europe (Berlin)", "Europe/Berlin"],
    ["Eastern Europe (Athens)", "Europe/Athens"],
    ["UAE (Dubai)", "Asia/Dubai"],
    ["Singapore", "Asia/Singapore"],
    ["Hong Kong", "Asia/Hong_Kong"],
    ["China (Shanghai)", "Asia/Shanghai"],
    ["Japan (Tokyo)", "Asia/Tokyo"],
    ["Korea (Seoul)", "Asia/Seoul"],
    ["Australia East (Sydney)", "Australia/Sydney"],
    ["New Zealand (Auckland)", "Pacific/Auckland"],
    ["Brazil (São Paulo)", "America/Sao_Paulo"],
    ["South Africa (Johannesburg)", "Africa/Johannesburg"],
    ["UTC", "UTC"],
  ];

  function resolveIana(value) {
    if (!value || value === "auto") {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
    return value;
  }

  global.TimePort = { TIME_RE, parseMatch, convert, zoneOffsetMinutes, abbrevOffset, fmtOffset, IANA_CHOICES, resolveIana };
})(typeof window !== "undefined" ? window : globalThis);
