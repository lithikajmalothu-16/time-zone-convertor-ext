/* TimePort popup */
(function () {
  "use strict";
  const TP = window.TimePort;

  const $ = (id) => document.getElementById(id);
  const targetZoneSel = $("targetZone");
  const smartInput = $("smartInput");
  const hint = $("hint");
  const resultCard = $("resultCard");
  const srcLabel = $("srcLabel");
  const srcTime = $("srcTime");
  const tgtLabel = $("tgtLabel");
  const tgtTime = $("tgtTime");
  const tgtDate = $("tgtDate");
  const detectToggle = $("detectToggle");
  const clockList = $("clockList");
  const addClock = $("addClock");

  const DEFAULT_CLOCKS = ["Asia/Kolkata", "America/New_York", "UTC"];
  let state = { targetZone: "auto", detect: true, clocks: DEFAULT_CLOCKS };

  // ---------- settings ----------
  function save() {
    chrome.storage.sync.set({ timeport: state });
  }

  function labelFor(iana) {
    const found = TP.IANA_CHOICES.find(([, v]) => v === iana);
    return found ? found[0] : iana.split("/").pop().replace(/_/g, " ");
  }

  // ---------- target zone dropdown ----------
  function buildZoneSelect() {
    targetZoneSel.innerHTML = "";
    for (const [label, value] of TP.IANA_CHOICES) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      targetZoneSel.appendChild(opt);
    }
    targetZoneSel.value = state.targetZone;
  }

  // ---------- smart converter ----------
  function runConvert() {
    const text = smartInput.value.trim();
    if (!text) {
      resultCard.classList.add("hidden");
      hint.textContent = "Understands EST, PST, CET, IST, JST, UTC+5:30 and more";
      hint.classList.remove("err");
      return;
    }
    TP.TIME_RE.lastIndex = 0;
    const m = TP.TIME_RE.exec(text);
    const parsed = m ? TP.parseMatch(m) : null;
    if (!parsed) {
      resultCard.classList.add("hidden");
      hint.textContent = 'Couldn\u2019t read that — try something like "9:30 pm PST"';
      hint.classList.add("err");
      return;
    }
    hint.textContent = "";
    hint.classList.remove("err");

    const iana = TP.resolveIana(state.targetZone);
    const out = TP.convert(parsed, iana);

    const srcH12 = ((parsed.hours % 12) || 12) + ":" + String(parsed.minutes).padStart(2, "0") + (parsed.hours >= 12 ? " PM" : " AM");
    srcLabel.textContent = parsed.srcLabel + " (" + TP.fmtOffset(parsed.srcOffset) + ")";
    srcTime.textContent = srcH12;
    tgtLabel.textContent = labelFor(state.targetZone === "auto" ? iana : state.targetZone).toUpperCase();
    tgtTime.textContent = out.timeStr;

    let shiftHtml = "";
    if (out.dayShift > 0) shiftHtml = ' · <span class="shift">next day →</span>';
    if (out.dayShift < 0) shiftHtml = ' · <span class="shift back">← previous day</span>';
    tgtDate.innerHTML = out.dateStr + shiftHtml;

    resultCard.classList.remove("hidden");
  }

  // ---------- world clocks ----------
  function renderClocks() {
    clockList.innerHTML = "";
    const now = new Date();
    for (const iana of state.clocks) {
      const row = document.createElement("div");
      row.className = "clock-row";

      const left = document.createElement("div");
      const city = document.createElement("span");
      city.className = "clock-city";
      city.textContent = labelFor(iana).replace(/ — .*$/, "").replace(/ \(.*\)$/, "");
      const sub = document.createElement("span");
      sub.className = "clock-sub";
      sub.textContent = TP.fmtOffset(TP.zoneOffsetMinutes(iana, now));
      left.appendChild(city);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.className = "clock-right";
      const t = document.createElement("span");
      t.className = "clock-time";
      t.textContent = now.toLocaleTimeString("en-US", {
        timeZone: iana, hour: "numeric", minute: "2-digit",
      });
      const rm = document.createElement("button");
      rm.className = "clock-remove";
      rm.title = "Remove clock";
      rm.textContent = "✕";
      rm.addEventListener("click", () => {
        state.clocks = state.clocks.filter((z) => z !== iana);
        save();
        renderClocks();
        buildAddClock();
      });
      right.appendChild(t);
      right.appendChild(rm);

      row.appendChild(left);
      row.appendChild(right);
      clockList.appendChild(row);
    }
  }

  function buildAddClock() {
    addClock.innerHTML = '<option value="">+ Add</option>';
    for (const [label, value] of TP.IANA_CHOICES) {
      if (value === "auto" || state.clocks.includes(value)) continue;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      addClock.appendChild(opt);
    }
  }

  // ---------- events ----------
  smartInput.addEventListener("input", runConvert);
  targetZoneSel.addEventListener("change", () => {
    state.targetZone = targetZoneSel.value;
    save();
    runConvert();
  });
  detectToggle.addEventListener("change", () => {
    state.detect = detectToggle.checked;
    save();
  });
  addClock.addEventListener("change", () => {
    if (!addClock.value) return;
    if (state.clocks.length < 6) state.clocks.push(addClock.value);
    save();
    renderClocks();
    buildAddClock();
  });

  // ---------- init ----------
  chrome.storage.sync.get("timeport", (res) => {
    if (res && res.timeport) state = Object.assign(state, res.timeport);
    buildZoneSelect();
    detectToggle.checked = state.detect !== false;
    renderClocks();
    buildAddClock();
    smartInput.focus();
  });

  setInterval(renderClocks, 30000);
})();
