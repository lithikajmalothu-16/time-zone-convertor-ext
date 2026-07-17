/* TimePort content script — runs on every page (LinkedIn, Gmail, WhatsApp Web, …) */
(function () {
  "use strict";
  const TP = window.TimePort;
  if (!TP) return;

  let settings = { targetZone: "auto", detect: true };
  let tooltip = null;
  let bubble = null;

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE"]);

  // ---------- settings ----------
  chrome.storage.sync.get("timeport", (res) => {
    if (res && res.timeport) settings = Object.assign(settings, res.timeport);
    if (settings.detect !== false) start();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.timeport) return;
    const nv = changes.timeport.newValue || {};
    const wasOn = settings.detect !== false;
    settings = Object.assign(settings, nv);
    const isOn = settings.detect !== false;
    if (isOn && !wasOn) start();
    if (!isOn && wasOn) unwrapAll();
  });

  function targetIana() { return TP.resolveIana(settings.targetZone); }

  function targetShortLabel() {
    const iana = targetIana();
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" }).formatToParts(new Date());
      return parts.find((p) => p.type === "timeZoneName").value;
    } catch { return "your time"; }
  }

  // ---------- scanning & wrapping ----------
  let observer = null;
  let scanQueued = false;

  function start() {
    scan(document.body);
    if (observer) return;
    observer = new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      setTimeout(() => {
        scanQueued = false;
        scan(document.body);
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("mouseup", onSelection);
  }

  function scan(root) {
    if (!root || settings.detect === false) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest(".tpc-time, .tpc-tooltip, .tpc-bubble, [contenteditable='true']")) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.length < 4 || node.nodeValue.length > 5000) return NodeFilter.FILTER_REJECT;
        TP.TIME_RE.lastIndex = 0;
        return TP.TIME_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
      if (nodes.length > 300) break; // safety cap per scan
    }
    for (const textNode of nodes) wrapMatches(textNode);
  }

  function wrapMatches(textNode) {
    const text = textNode.nodeValue;
    TP.TIME_RE.lastIndex = 0;
    let m, last = 0;
    const frag = document.createDocumentFragment();
    let any = false;

    while ((m = TP.TIME_RE.exec(text))) {
      const parsed = TP.parseMatch(m);
      if (!parsed) continue;
      // Skip super-ambiguous bare matches like "5 EST" on pages? Keep them —
      // but require either colon or am/pm OR a UTC-offset form, to reduce noise.
      if (!parsed.hadColon && !parsed.hadAmPm && !parsed.srcLabel.startsWith("UTC")) {
        // "5 EST" — still useful; allow it.
      }
      any = true;
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement("span");
      span.className = "tpc-time";
      span.textContent = m[0];
      span.dataset.tpc = JSON.stringify(parsed);
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (!any) return;
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function unwrapAll() {
    document.querySelectorAll(".tpc-time").forEach((span) => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
    hideTooltip();
    hideBubble();
  }

  // ---------- hover tooltip ----------
  document.addEventListener("mouseover", (e) => {
    const span = e.target.closest && e.target.closest(".tpc-time");
    if (!span) return;
    let parsed;
    try { parsed = JSON.parse(span.dataset.tpc); } catch { return; }
    showTooltip(span, parsed);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest(".tpc-time")) hideTooltip();
  });

  function showTooltip(anchor, parsed) {
    hideTooltip();
    const out = TP.convert(parsed, targetIana());
    tooltip = document.createElement("div");
    tooltip.className = "tpc-tooltip";

    const big = document.createElement("div");
    big.className = "tpc-big";
    big.textContent = out.timeStr;
    const sub = document.createElement("div");
    sub.className = "tpc-sub";
    let extra = "";
    if (out.dayShift > 0) extra = " · next day";
    if (out.dayShift < 0) extra = " · previous day";
    sub.textContent = targetShortLabel() + " · " + out.dateStr + extra;

    tooltip.appendChild(big);
    tooltip.appendChild(sub);
    document.body.appendChild(tooltip);

    const r = anchor.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    let left = r.left + r.width / 2 - tw / 2 + window.scrollX;
    left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - tw - 8));
    let top = r.top + window.scrollY - tooltip.offsetHeight - 8;
    if (top < window.scrollY + 4) top = r.bottom + window.scrollY + 8;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  // ---------- selection bubble ----------
  function onSelection() {
    setTimeout(() => {
      hideBubble();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString();
      if (!text || text.length > 400) return;
      TP.TIME_RE.lastIndex = 0;
      const m = TP.TIME_RE.exec(text);
      const parsed = m ? TP.parseMatch(m) : null;
      if (!parsed) return;

      const range = sel.getRangeAt(0);
      const r = range.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return;

      const out = TP.convert(parsed, targetIana());
      bubble = document.createElement("div");
      bubble.className = "tpc-bubble";

      const line1 = document.createElement("div");
      line1.className = "tpc-b-src";
      line1.textContent = m[0] + " →";
      const line2 = document.createElement("div");
      line2.className = "tpc-b-tgt";
      line2.textContent = out.timeStr + " " + targetShortLabel();
      const line3 = document.createElement("div");
      line3.className = "tpc-b-date";
      let extra = "";
      if (out.dayShift > 0) extra = " (next day)";
      if (out.dayShift < 0) extra = " (previous day)";
      line3.textContent = out.dateStr + extra;

      bubble.appendChild(line1);
      bubble.appendChild(line2);
      bubble.appendChild(line3);
      document.body.appendChild(bubble);

      let left = r.left + r.width / 2 - bubble.offsetWidth / 2 + window.scrollX;
      left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - bubble.offsetWidth - 8));
      let top = r.top + window.scrollY - bubble.offsetHeight - 10;
      if (top < window.scrollY + 4) top = r.bottom + window.scrollY + 10;
      bubble.style.left = left + "px";
      bubble.style.top = top + "px";
    }, 10);
  }

  document.addEventListener("mousedown", (e) => {
    if (bubble && !bubble.contains(e.target)) hideBubble();
  });

  function hideBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }
})();
