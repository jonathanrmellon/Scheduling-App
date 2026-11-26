/* MY CALENDAR - script.js (how everything works)
   Press Ctrl+F (Cmd+F on Mac) and search for "SECTION 3" etc. to jump to a part:
     SECTION 1: THE BASICS
     SECTION 2: HOLIDAYS
     SECTION 3: EVENT RULES
     SECTION 4: CALENDAR
     SECTION 5: EVENT POPUP
     SECTION 6: TABS and CALENDARS
     SECTION 7: START */

/* ================================================================
   SECTION 1: THE BASICS
   shortcuts, lists, saved data and date/time helpers.
   EDIT HERE to: change the month or weekday names (MONTHS, DOWS), the colors offered
   to new calendars (PRESETS), or how many events fit in a day before "+N more" (MAXCHIPS).
   ================================================================ */

const $ = id => document.getElementById(id);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const PRESETS = ["#1f8a70","#3b6fd4","#c2410c","#9333ea","#be185d","#475569"];
const REPEATS = { none:"", daily:"repeats every day", weekly:"repeats every week", monthly:"repeats every month", yearly:"repeats every year" };
const MAXCHIPS = { 64:2, 96:3, 130:5 };

// Show a visible message instead of a silent blank page if something breaks
window.addEventListener("error", e => {
  const f = $("fatal"); f.hidden = false;
  f.textContent = "Something went wrong: " + e.message + ". Try a hard refresh (Ctrl+Shift+R), and make sure the whole file was uploaded.";
});
// Older browsers without <dialog> support
if (!$("dlg").showModal) {
  $("dlg").showModal = function () { this.setAttribute("open", ""); };
  $("dlg").close = function () { this.removeAttribute("open"); };
}

let state = { accent: PRESETS[0], weekStart: 0, theme: "auto", density: 96, timeFormat: "12", holidays: "us", items: [], nextId: 1, calendars: [], currentCal: 0, nextCalId: 1 };
try { Object.assign(state, JSON.parse(localStorage.getItem("calendar-state") || "{}")); } catch (e) {}
// Convert events saved by earlier versions of this calendar
if (state.events) {
  Object.keys(state.events).forEach(k => state.events[k].forEach(ev => {
    state.items.push({ id: state.nextId++, title: ev.title, date: k, time: ev.time || "", end: "", color: ev.color, repeat: "none" });
  }));
  delete state.events;
}
state.accent = PRESETS[0]; // the accent color is no longer a setting
// Calendars: earlier saves had a single calendar, so those events move into "Calendar 1"
if (!Array.isArray(state.calendars) || !state.calendars.length) state.calendars = [{ id: state.nextCalId++, name: "Calendar 1", color: state.accent }];
state.calendars.forEach(c => {
  if (c.name.trim().toLowerCase() !== "my calendar") return;
  let i = 1, n = "Calendar 1"; while (state.calendars.some(x => x.name === n)) n = "Calendar " + ++i;
  c.name = n;
});
if (!state.firstNamed) { // one time: the first calendar was auto-named "Personal" in the last version
  state.firstNamed = true;
  if (state.calendars[0].name === "Personal" && !state.calendars.some(x => x.name === "Calendar 1")) state.calendars[0].name = "Calendar 1";
}
state.nextCalId = Math.max(state.nextCalId, ...state.calendars.map(c => c.id + 1));
state.items.forEach(it => { if (!state.calendars.some(c => c.id === it.cal)) it.cal = state.calendars[0].id; });
if (state.currentCal !== "all" && !state.calendars.some(c => c.id === state.currentCal)) state.currentCal = state.calendars[0].id;
const calById = id => state.calendars.find(c => c.id === Number(id));
const calName = id => (calById(id) || { name: "" }).name;
const save = () => { try { localStorage.setItem("calendar-state", JSON.stringify(state)); } catch (e) {} };

let view = new Date(); view.setDate(1);
let selected = null, editingId = null;

const pad = n => String(n).padStart(2, "0");
const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseKey = k => { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const dayNum = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const inkFor = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 160 ? "#111" : "#fff"; };

function fmt(t) {
  if (!t) return "";
  if (state.timeFormat === "24") return t;
  const p = t.split(":").map(Number);
  return (p[0] % 12 || 12) + ":" + pad(p[1]) + (p[0] < 12 ? "am" : "pm");
}
const timeText = it => it.time ? fmt(it.time) + (it.end ? " to " + fmt(it.end) : "") : "All day";


/* ================================================================
   SECTION 2: HOLIDAYS
   the national holiday rules for each country, worked out on the device.
   EDIT HERE to: add or remove a holiday, or add another country (copy the us: line,
   then add an <option> for it in the Holidays menu in index.html).
   ================================================================ */

// ---- National holidays, worked out on this device (no internet needed) ----
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const nth = (y, m, wd, n) => new Date(y, m, 1 + ((wd - new Date(y, m, 1).getDay() + 7) % 7) + (n - 1) * 7);
const lastWd = (y, m, wd) => { const e = new Date(y, m + 1, 0); return new Date(y, m, e.getDate() - ((e.getDay() - wd + 7) % 7)); };
function easter(y) { // Gregorian Easter Sunday
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
const HOLIDAYS = {
  us: y => [["New Year's Day", new Date(y,0,1)], ["Martin Luther King Jr. Day", nth(y,0,1,3)], ["Presidents' Day", nth(y,1,1,3)],
    ["Memorial Day", lastWd(y,4,1)], ["Juneteenth", new Date(y,5,19)], ["Independence Day", new Date(y,6,4)], ["Labor Day", nth(y,8,1,1)],
    ["Columbus Day", nth(y,9,1,2)], ["Veterans Day", new Date(y,10,11)], ["Thanksgiving", nth(y,10,4,4)], ["Christmas Day", new Date(y,11,25)]],
  ca: y => [["New Year's Day", new Date(y,0,1)], ["Good Friday", addDays(easter(y),-2)],
    ["Victoria Day", new Date(y,4,24 - ((new Date(y,4,24).getDay() + 6) % 7))], ["Canada Day", new Date(y,6,1)], ["Labour Day", nth(y,8,1,1)],
    ["Truth and Reconciliation Day", new Date(y,8,30)], ["Thanksgiving", nth(y,9,1,2)], ["Remembrance Day", new Date(y,10,11)],
    ["Christmas Day", new Date(y,11,25)], ["Boxing Day", new Date(y,11,26)]],
  uk: y => [["New Year's Day", new Date(y,0,1)], ["Good Friday", addDays(easter(y),-2)], ["Easter Monday", addDays(easter(y),1)],
    ["Early May bank holiday", nth(y,4,1,1)], ["Spring bank holiday", lastWd(y,4,1)], ["Summer bank holiday", lastWd(y,7,1)],
    ["Christmas Day", new Date(y,11,25)], ["Boxing Day", new Date(y,11,26)]]
};
const holCache = {};
function holidaysOn(d) {
  const fn = HOLIDAYS[state.holidays];
  if (!fn) return [];
  const ck = state.holidays + d.getFullYear();
  if (!holCache[ck]) {
    const map = {};
    fn(d.getFullYear()).forEach(h => { const k = key(h[1]); (map[k] = map[k] || []).push(h[0]); });
    holCache[ck] = map;
  }
  return holCache[ck][key(d)] || [];
}


/* ================================================================
   SECTION 3: EVENT RULES
   decides which events appear on which day (repeats and multi-day events).
   Most people never need to change this file.
   ================================================================ */

// Does this event start on day d?
function startsOn(it, d) {
  const s = parseKey(it.date);
  if (dayNum(d) < dayNum(s)) return false;
  if (it.repeat === "daily") return true;
  if (it.repeat === "weekly") return (dayNum(d) - dayNum(s)) % 7 === 0;
  if (it.repeat === "monthly" || it.repeat === "yearly") {
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() !== Math.min(s.getDate(), dim)) return false; // 31st lands on the last day of short months
    return it.repeat === "monthly" || d.getMonth() === s.getMonth();
  }
  return it.date === key(d);
}
const spanOf = it => it.endDate ? Math.max(0, dayNum(parseKey(it.endDate)) - dayNum(parseKey(it.date))) : 0;
// Is day d part of this event? k = how many days after the start (0 = first day)
function occurrence(it, d) {
  const span = spanOf(it);
  for (let k = 0; k <= span; k++) if (startsOn(it, addDays(d, -k))) return { k: k, span: span };
  return null;
}
function eventsOn(d) {
  const out = [];
  state.items.forEach(it => { if (state.currentCal !== "all" && it.cal !== state.currentCal) return; const o = occurrence(it, d); if (o) out.push({ it: it, k: o.k, span: o.span }); });
  return out.sort((a, b) => (a.k > 0 ? "" : a.it.time || "").localeCompare(b.k > 0 ? "" : b.it.time || ""));
}
function metaText(r, d) {
  const it = r.it, parts = [], f = x => x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (r.span > 0) {
    parts.push("Day " + (r.k + 1) + " of " + (r.span + 1) + " (" + f(addDays(d, -r.k)) + " to " + f(addDays(d, r.span - r.k)) + ")");
    if (r.k === 0 && it.time) parts.push("starts " + fmt(it.time));
    else if (r.k === r.span && it.end) parts.push("ends " + fmt(it.end));
    else parts.push("all day");
  } else parts.push(timeText(it));
  if (REPEATS[it.repeat]) parts.push(REPEATS[it.repeat]);
  return parts.join(", ");
}


/* ================================================================
   SECTION 4: CALENDAR
   draws the month grid and applies your settings (theme, etc).
   EDIT HERE to: change what a day box shows, or how event chips look in the grid.
   ================================================================ */

function applySettings() {
  const r = document.documentElement;
  r.style.setProperty("--accent", state.accent);
  r.style.setProperty("--accent-ink", inkFor(state.accent));
  if (state.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", state.theme);
  $("weekStart").value = state.weekStart; $("theme").value = state.theme;
  $("density").value = state.density; $("timeFormat").value = state.timeFormat; $("holidays").value = state.holidays;
}

function render() {
  $("title").innerHTML = MONTHS[view.getMonth()] + " <span>" + view.getFullYear() + "</span>";
  const grid = $("grid"); grid.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const h = document.createElement("div"); h.className = "dow"; h.textContent = DOWS[(i + state.weekStart) % 7]; grid.appendChild(h);
  }
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() - state.weekStart + 7) % 7;
  const start = new Date(first); start.setDate(1 - offset);
  const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + dim) / 7);
  const todayKey = key(new Date());
  const max = MAXCHIPS[state.density] || 3;

  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const cell = document.createElement("button");
    cell.className = "day" + (d.getMonth() !== view.getMonth() ? " other" : "") + (key(d) === todayKey ? " today" : "");
    cell.style.minHeight = state.density + "px";
    cell.setAttribute("aria-label", d.toDateString());
    cell.innerHTML = '<span class="num">' + d.getDate() + "</span>";
    const rows = holidaysOn(d).map(h => ({ hol: h })).concat(eventsOn(d));
    rows.slice(0, max).forEach(r => {
      const e = document.createElement("div");
      if (r.hol) { e.className = "hol"; e.textContent = r.hol; }
      else {
        const it = r.it;
        e.className = "ev"; e.style.background = it.color; e.style.color = inkFor(it.color);
        e.textContent = (it.repeat !== "none" ? "\u21BB " : "") + (r.k === 0 && it.time ? fmt(it.time) + " " : "") + it.title +
          (r.span > 0 ? " (" + (r.k + 1) + "/" + (r.span + 1) + ")" : "");
      }
      cell.appendChild(e);
    });
    if (rows.length > max) { const m = document.createElement("div"); m.className = "more"; m.textContent = "+" + (rows.length - max) + " more"; cell.appendChild(m); }
    cell.onclick = () => openDay(d);
    grid.appendChild(cell);
  }
}


/* ================================================================
   SECTION 5: EVENT POPUP
   the popup that opens when you click a day: the list of events,
   the add/edit form, and its checks (like "end time must be after start time").
   EDIT HERE to: change the form's messages or what gets saved with an event.
   ================================================================ */

function showErr(msg) { const e = $("err"); e.textContent = msg; e.hidden = !msg; }

function resetForm() {
  editingId = null;
  $("evTitle").value = ""; $("evTime").value = ""; $("evEnd").value = ""; $("evLast").value = ""; $("evLast").min = selected || "";
  fillCalSelect(); $("evRepeat").value = "none"; $("evColor").value = calById($("evCal").value).color;
  $("add").textContent = "Add event"; $("cancel").hidden = true; showErr("");
}

function openDay(d) {
  selected = key(d);
  $("dlgTitle").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  resetForm(); renderList();
  $("dlg").showModal(); $("evTitle").focus();
}

function renderList() {
  const list = $("list"); list.innerHTML = "";
  const d = parseKey(selected), hols = holidaysOn(d), evs = eventsOn(d);
  if (!hols.length && !evs.length) { list.innerHTML = '<li class="empty">Nothing planned. Add an event below.</li>'; return; }
  hols.forEach(h => {
    const li = document.createElement("li");
    li.innerHTML = '<span class="dot" style="background:var(--muted)"></span><div class="main"><div class="t"></div><div class="meta">Public holiday</div></div>';
    li.querySelector(".t").textContent = h;
    list.appendChild(li);
  });
  evs.forEach(r => {
    const it = r.it, li = document.createElement("li");
    li.innerHTML = '<span class="dot"></span><div class="main"><div class="t"></div><div class="meta"></div></div>' +
      '<button class="edit">Edit</button><button class="del">Delete</button>';
    li.querySelector(".dot").style.background = it.color;
    li.querySelector(".t").textContent = it.title;
    li.querySelector(".meta").textContent = (state.currentCal === "all" ? calName(it.cal) + ": " : "") + metaText(r, d);
    li.querySelector(".edit").onclick = () => startEdit(it);
    li.querySelector(".del").onclick = () => {
      if ((it.repeat !== "none" || r.span > 0) && !confirm("Delete the whole event, including every day and every repeat?")) return;
      state.items = state.items.filter(x => x.id !== it.id);
      if (editingId === it.id) resetForm();
      save(); renderList(); render();
    };
    list.appendChild(li);
  });
}

function startEdit(it) {
  editingId = it.id; showErr("");
  $("evTitle").value = it.title; $("evTime").value = it.time || ""; $("evEnd").value = it.end || ""; $("evLast").value = it.endDate || ""; $("evLast").min = it.date;
  $("evRepeat").value = it.repeat; $("evColor").value = it.color; fillCalSelect(); $("evCal").value = it.cal;
  $("add").textContent = "Save changes"; $("cancel").hidden = false; $("evTitle").focus();
}

function submit() {
  const title = $("evTitle").value.trim(), time = $("evTime").value, end = $("evEnd").value;
  if (!title) { showErr("Enter a title for the event."); $("evTitle").focus(); return; }
  if (end && !time) { showErr("Set a start time before setting an end time."); return; }
  const first = editingId ? state.items.find(x => x.id === editingId).date : selected, last = $("evLast").value;
  if (last && last < first) { showErr("The last day must be on or after " + parseKey(first).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + "."); return; }
  const multi = !!last && last > first;
  if (multi && dayNum(parseKey(last)) - dayNum(parseKey(first)) > 365) { showErr("An event can run for up to 366 days."); return; }
  if (end && !multi && end <= time) { showErr("The end time must be after the start time."); return; }
  const data = { title: title, time: time, end: end, endDate: multi ? last : "", cal: Number($("evCal").value), color: $("evColor").value, repeat: $("evRepeat").value };
  if (editingId) Object.assign(state.items.find(x => x.id === editingId), data);
  else state.items.push(Object.assign({ id: state.nextId++, date: selected }, data));
  save(); resetForm(); renderList(); render();
}


function fillCalSelect() {
  const sel = $("evCal"); sel.innerHTML = "";
  state.calendars.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
  sel.value = state.currentCal === "all" ? state.calendars[0].id : state.currentCal;
}
$("evCal").onchange = () => { if (!editingId) $("evColor").value = calById($("evCal").value).color; };


/* ================================================================
   SECTION 6: TABS and CALENDARS
   the tab row, the Settings tab, adding a calendar (Calendar 2, 3...),
   and the popup for renaming, recoloring or deleting a calendar.
   EDIT HERE to: change the tab labels (like "My Calendar") or how new calendars are named.
   ================================================================ */

let showSettings = false; // which view is open (not saved)


function renderTabs() {
  const bar = $("tabs"); bar.innerHTML = "";
  const mk = (id, label, color) => {
    const b = document.createElement("button");
    b.className = "tab"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(!showSettings && state.currentCal === id));
    if (color) { const dot = document.createElement("span"); dot.className = "tdot"; dot.style.background = color; b.appendChild(dot); }
    b.appendChild(document.createTextNode(label));
    b.onclick = () => { state.currentCal = id; showSettings = false; save(); renderTabs(); render(); };
    bar.appendChild(b);
  };
  mk("all", "My Calendar", null);
  state.calendars.forEach(c => mk(c.id, c.name, c.color));
  const add = document.createElement("button");
  add.className = "tab add"; add.textContent = "+ New calendar"; add.onclick = addCalendar;
  bar.appendChild(add);
  const gear = document.createElement("button");
  gear.className = "tab gear"; gear.textContent = "Settings"; gear.setAttribute("role", "tab"); gear.setAttribute("aria-selected", String(showSettings));
  gear.onclick = () => { showSettings = true; renderTabs(); };
  bar.appendChild(gear);
  $("settingsPanel").hidden = !showSettings;
  ["top", "tabtools", "grid"].forEach(id => { $(id).hidden = showSettings; });
  const tools = $("tabtools"); tools.innerHTML = "";
  if (state.currentCal === "all") { tools.textContent = "Showing every calendar together. Select +New Calendar to keep different events organized."; return; }
  const edit = document.createElement("button"); edit.textContent = "Edit calendar"; edit.onclick = () => openCalDlg(state.currentCal);
  tools.appendChild(edit);
}

// A new calendar is named "Calendar 2", "Calendar 3" and so on; rename it with Edit calendar
function addCalendar() {
  let i = 2; while (state.calendars.some(c => c.name.toLowerCase() === "calendar " + i)) i++;
  const color = PRESETS.find(p => !state.calendars.some(x => x.color === p)) || PRESETS[state.calendars.length % PRESETS.length];
  const c = { id: state.nextCalId++, name: "Calendar " + i, color: color };
  state.calendars.push(c); state.currentCal = c.id; showSettings = false;
  save(); renderTabs(); render();
}

let calEditing = null; // id of the calendar being edited, or null for a new one
function calErr(m) { $("calErr").textContent = m; $("calErr").hidden = !m; }
function openCalDlg(id) {
  calEditing = id; const c = id ? calById(id) : null;
  $("calTitle").textContent = c ? "Edit calendar" : "New calendar";
  $("calName").value = c ? c.name : "";
  $("calColor").value = c ? c.color : (PRESETS.find(p => !state.calendars.some(x => x.color === p)) || PRESETS[state.calendars.length % PRESETS.length]);
  $("recolorRow").hidden = !c; $("recolor").checked = true;
  $("calDelete").hidden = !c || state.calendars.length < 2;
  calErr(""); $("calDlg").showModal(); $("calName").focus();
}
function saveCal() {
  const name = $("calName").value.trim(), color = $("calColor").value;
  if (!name) { calErr("Enter a name for the calendar."); return; }
  if (name.toLowerCase() === "my calendar") { calErr("\"My Calendar\" is the name of the combined tab. Choose a different name."); return; }
  if (state.calendars.some(c => c.id !== calEditing && c.name.toLowerCase() === name.toLowerCase())) { calErr("You already have a calendar with that name."); return; }
  if (calEditing) {
    const c = calById(calEditing);
    if ($("recolor").checked && color !== c.color) state.items.forEach(it => { if (it.cal === c.id && it.color === c.color) it.color = color; });
    c.name = name; c.color = color;
  } else {
    const c = { id: state.nextCalId++, name: name, color: color };
    state.calendars.push(c); state.currentCal = c.id;
  }
  save(); $("calDlg").close(); renderTabs(); render();
}
$("calSave").onclick = saveCal;
$("calCancel").onclick = () => $("calDlg").close();
$("calName").onkeydown = e => { if (e.key === "Enter") saveCal(); };
$("calDelete").onclick = () => {
  const c = calById(calEditing), n = state.items.filter(it => it.cal === c.id).length;
  if (!confirm("Delete \"" + c.name + "\" and its " + n + " event" + (n === 1 ? "" : "s") + "? This can't be undone.")) return;
  state.items = state.items.filter(it => it.cal !== c.id);
  state.calendars = state.calendars.filter(x => x.id !== c.id);
  state.currentCal = state.calendars[0].id;
  save(); $("calDlg").close(); renderTabs(); render();
};


/* ================================================================
   SECTION 7: START
   connects the buttons and menus to the code above, then starts the app.
   This file must stay last.
   ================================================================ */

$("prev").onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
$("next").onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
$("today").onclick = () => { view = new Date(); view.setDate(1); render(); };
$("add").onclick = submit;
$("cancel").onclick = () => { resetForm(); $("evTitle").focus(); };
$("close").onclick = () => $("dlg").close();
$("evTitle").onkeydown = e => { if (e.key === "Enter") submit(); };
$("weekStart").onchange = e => { state.weekStart = +e.target.value; save(); render(); };
$("theme").onchange = e => { state.theme = e.target.value; save(); applySettings(); };
$("density").onchange = e => { state.density = +e.target.value; save(); render(); };
$("timeFormat").onchange = e => { state.timeFormat = e.target.value; save(); render(); };
$("holidays").onchange = e => { state.holidays = e.target.value; save(); render(); };

applySettings();
renderTabs();
render();
