/**
 * Nepal Telecom – Estimate Sheet  |  script.js
 * ─────────────────────────────────────────────
 * Password gate → Project list → Estimate sheet
 * Auto-saves to Firebase + localStorage mirror
 */

/* ═══════════════════════════════════════════
   FIREBASE CONFIG
   Replace placeholders with your credentials
   from Firebase Console → Project Settings
═══════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY_HERE",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID_HERE",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID_HERE",
  appId:             "YOUR_APP_ID_HERE"
};

/* ═══════════════════════════════════════════
   DESCRIPTION DROPDOWN OPTIONS
   Edit this list freely — new options appear
   in the Description dropdown on every row.
═══════════════════════════════════════════ */
const DESC_OPTIONS = [
  "",
  "Brickwork 1:4 in cement sand mortar",
  "PCC work (1:2:4)",
  "RCC work (1:1.5:3)",
  "Earthwork excavation",
  "Earthwork filling and compaction",
  "Sand filling",
  "Stone soling",
  "DPC (Damp Proof Course)",
  "Plastering 1:3",
  "Plastering 1:4",
  "Shuttering and centering",
  "Steel reinforcement",
  "Brick masonry",
  "Stone masonry",
  "Concrete block masonry",
  "Waterproofing treatment",
  "Ducting work (HDPE pipe 110mm)",
  "Ducting work (HDPE pipe 63mm)",
  "Handhole construction",
  "Manhole construction",
  "Backfilling with sand",
  "Gravel base preparation",
  "civil",
  "Other (see remarks)"
];

const UNITS = ["", "m", "m²", "m³", "ft", "ft²", "ft³", "kg", "nos", "ls", "rft", "bag", "quintal"];

/* ═══════════════════════════════════════════
   GLOBALS
═══════════════════════════════════════════ */
const PASSWORD   = "pdcivil";
const LS_KEY_PJT = "nt_projects";          // localStorage key for project list
const LS_KEY_EST = (id) => `nt_est_${id}`; // per-project estimate data

let db            = null;
let firebaseReady = false;

let projects      = [];   // [{id, name, location, createdAt}]
let currentProjId = null; // active project id
let groups        = [];   // estimate rows for current project
let modalMode     = "create"; // "create" | "edit"
let editProjId    = null;
let saveTimer     = null;

/* ═══════════════════════════════════════════
   PAGE ROUTING
═══════════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ═══════════════════════════════════════════
   1. PASSWORD GATE
═══════════════════════════════════════════ */
function checkPassword() {
  const input = document.getElementById("pwdInput").value;
  const err   = document.getElementById("pwdError");
  if (input === PASSWORD) {
    err.textContent = "";
    document.getElementById("pwdInput").value = "";
    showPage("pageProjects");
    loadProjects();
    initFirebase();
  } else {
    err.textContent = "Incorrect password. Please try again.";
    document.getElementById("pwdInput").value = "";
    document.getElementById("pwdInput").focus();
    // Shake animation
    const card = document.querySelector(".lock-card");
    card.style.animation = "none";
    card.offsetHeight; // reflow
    card.style.animation = "shake .4s ease";
  }
}

function togglePwdVis() {
  const inp = document.getElementById("pwdInput");
  const open   = document.getElementById("eyeOpen");
  const closed = document.getElementById("eyeClosed");
  if (inp.type === "password") {
    inp.type = "text";
    open.style.display   = "none";
    closed.style.display = "";
  } else {
    inp.type = "password";
    open.style.display   = "";
    closed.style.display = "none";
  }
}

function lockApp() {
  currentProjId = null;
  groups = [];
  showPage("pageLock");
  setTimeout(() => document.getElementById("pwdInput").focus(), 100);
}

/* Add shake keyframe dynamically */
(function addShake() {
  const s = document.createElement("style");
  s.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`;
  document.head.appendChild(s);
})();

/* ═══════════════════════════════════════════
   2. PROJECT LIST
═══════════════════════════════════════════ */
function loadProjects() {
  try {
    const raw = localStorage.getItem(LS_KEY_PJT);
    projects  = raw ? JSON.parse(raw) : [];
  } catch (_) { projects = []; }
  renderProjects();
}

function saveProjects() {
  try { localStorage.setItem(LS_KEY_PJT, JSON.stringify(projects)); } catch (_) {}
  if (firebaseReady && db) {
    db.ref("projects").set(projects).catch(console.error);
  }
}

function renderProjects() {
  const grid  = document.getElementById("projectGrid");
  const empty = document.getElementById("emptyState");
  grid.innerHTML = "";

  if (!projects.length) {
    empty.classList.add("visible");
    return;
  }
  empty.classList.remove("visible");

  projects.forEach(p => {
    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="card-icon">📋</div>
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-location">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        ${esc(p.location)}
      </div>
      <div class="card-footer">
        <span class="card-date">${formatDate(p.createdAt)}</span>
        <div class="card-actions">
          <button class="card-btn" onclick="event.stopPropagation();editProject('${p.id}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button class="card-btn danger" onclick="event.stopPropagation();deleteProject('${p.id}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete
          </button>
        </div>
      </div>`;
    card.addEventListener("click", () => openEstimate(p.id));
    grid.appendChild(card);
  });
}

function openCreateModal() {
  modalMode = "create";
  editProjId = null;
  document.getElementById("modalTitle").textContent   = "New Estimate Project";
  document.getElementById("modalBtnLabel").textContent = "Create Project";
  document.getElementById("newProjName").value = "";
  document.getElementById("newProjLoc").value  = "";
  document.getElementById("modalError").textContent = "";
  document.getElementById("modalOverlay").classList.add("open");
  setTimeout(() => document.getElementById("newProjName").focus(), 120);
}

function editProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return;
  modalMode  = "edit";
  editProjId = id;
  document.getElementById("modalTitle").textContent    = "Edit Project";
  document.getElementById("modalBtnLabel").textContent = "Save Changes";
  document.getElementById("newProjName").value = p.name;
  document.getElementById("newProjLoc").value  = p.location;
  document.getElementById("modalError").textContent = "";
  document.getElementById("modalOverlay").classList.add("open");
  setTimeout(() => document.getElementById("newProjName").focus(), 120);
}

function deleteProject(id) {
  if (!confirm("Delete this project and all its estimate data? This cannot be undone.")) return;
  projects = projects.filter(p => p.id !== id);
  saveProjects();
  try { localStorage.removeItem(LS_KEY_EST(id)); } catch (_) {}
  if (firebaseReady && db) db.ref(`estimates/${id}`).remove().catch(console.error);
  renderProjects();
}

function submitProjectModal() {
  const name     = document.getElementById("newProjName").value.trim();
  const location = document.getElementById("newProjLoc").value.trim();
  const errEl    = document.getElementById("modalError");
  if (!name)     { errEl.textContent = "Project name is required."; return; }
  if (!location) { errEl.textContent = "Location is required."; return; }
  errEl.textContent = "";

  if (modalMode === "create") {
    const proj = { id: uid(), name, location, createdAt: Date.now() };
    projects.push(proj);
    saveProjects();
    closeModal();
    renderProjects();
    openEstimate(proj.id); // jump straight to it
  } else {
    const p = projects.find(p => p.id === editProjId);
    if (p) { p.name = name; p.location = location; }
    saveProjects();
    closeModal();
    renderProjects();
  }
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}

function goToProjects() {
  showPage("pageProjects");
  renderProjects();
}

/* ═══════════════════════════════════════════
   3. ESTIMATE SHEET
═══════════════════════════════════════════ */
function openEstimate(projId) {
  currentProjId = projId;
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;

  document.getElementById("metaProjectName").textContent = proj.name;
  document.getElementById("metaLocation").textContent    = proj.location;

  // Load estimate data
  groups = loadEstimate(projId);

  if (!groups.length) {
    // Seed one empty group
    groups = [makeGroup()];
  }

  showPage("pageEstimate");
  renderAll();
  updateTotals();

  // Subscribe to Firebase for this project
  if (firebaseReady && db) {
    db.ref(`estimates/${projId}`).on("value", snap => {
      const remote = snap.val();
      if (remote && remote.groups) {
        groups = remote.groups;
        renderAll();
        updateTotals();
      }
    });
  }
}

/* ─── Persistence ─── */
function loadEstimate(projId) {
  try {
    const raw = localStorage.getItem(LS_KEY_EST(projId));
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function saveEstimate() {
  const payload = { groups, savedAt: new Date().toISOString() };
  try { localStorage.setItem(LS_KEY_EST(currentProjId), JSON.stringify(groups)); } catch (_) {}
  if (firebaseReady && db) {
    setSaveStatus("saving");
    db.ref(`estimates/${currentProjId}`).set(payload)
      .then(() => setSaveStatus("saved"))
      .catch(() => setSaveStatus("error"));
  } else {
    setSaveStatus("saved");
  }
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEstimate, 700);
}

function setSaveStatus(state) {
  const bar  = document.getElementById("saveStatus");
  const text = document.getElementById("saveText");
  if (!bar) return;
  bar.className = "save-status " + state;
  text.textContent =
    state === "saving" ? "Saving…"     :
    state === "error"  ? "Save failed" : "All saved";
}

/* ─── Data helpers ─── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeGroup() {
  return { id: uid(), description: "", unit: "", rate: 0, remarks: "", rows: [makeRow()] };
}
function makeRow() {
  return { id: uid(), description: "", no: 1, length: 1, breadth: 1, height: 1, unit: "", remarks: "" };
}

/* ─── Calculations ─── */
function calcRowQty(r) {
  return (num(r.no) * num(r.length) * num(r.breadth) * num(r.height));
}
function calcGroupQty(g)  { return g.rows.reduce((s, r) => s + calcRowQty(r), 0); }
function calcGroupAmt(g)  { return calcGroupQty(g) * num(g.rate); }

function updateTotals() {
  const total = groups.reduce((s, g) => s + calcGroupAmt(g), 0);
  const vat   = total * 0.13;
  setText("totalAmount", fmt(total));
  setText("vatAmount",   fmt(vat));
  setText("grandTotal",  fmt(total + vat));
}

/* ─── Add / Remove ─── */
function addGroup() {
  groups.push(makeGroup());
  renderAll();
  updateTotals();
  debouncedSave();
}
function addSubRow(gid) {
  const g = groups.find(g => g.id === gid);
  if (g) { g.rows.push(makeRow()); renderAll(); debouncedSave(); }
}
function removeGroup(gid) {
  if (!confirm("Remove this item group?")) return;
  groups = groups.filter(g => g.id !== gid);
  renderAll(); updateTotals(); debouncedSave();
}
function removeRow(gid, rid) {
  const g = groups.find(g => g.id === gid);
  if (!g) return;
  if (g.rows.length === 1) { removeGroup(gid); return; }
  g.rows = g.rows.filter(r => r.id !== rid);
  renderAll(); updateTotals(); debouncedSave();
}

/* ═══════════════════════════════════════════
   RENDER
═══════════════════════════════════════════ */
function renderAll() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  groups.forEach((g, idx) => {
    const sn      = idx + 1;
    const gQty    = calcGroupQty(g);
    const gAmt    = calcGroupAmt(g);

    /* ── Group header row ── */
    const tr = document.createElement("tr");
    tr.className    = "group-row";
    tr.dataset.gid  = g.id;

    tr.innerHTML = `
      <td>
        <div class="sn-wrap">
          <span class="sn-num">${sn}</span>
          <button class="add-sub-btn no-print" title="Add sub-row" onclick="addSubRow('${g.id}')">+</button>
        </div>
      </td>
      <td class="td-desc">
        <!-- Dropdown (hidden on print) -->
        <select class="desc-select no-print"
                data-field="description" data-gid="${g.id}"
                onchange="onGroupChange(this); syncDescInput(this)">
          ${DESC_OPTIONS.map(o =>
            `<option value="${esc(o)}"${o===g.description?' selected':''}>${esc(o)||'— select —'}</option>`
          ).join('')}
        </select>
        <!-- Plain text for print -->
        <span class="print-desc" style="display:none;font-weight:700;">${esc(g.description)}</span>
        <!-- Editable input below select for custom / override text -->
        <input class="cell-input left" type="text"
               value="${esc(g.description)}"
               placeholder="or type custom…"
               data-field="description" data-gid="${g.id}"
               oninput="onGroupChange(this); syncDescSelect(this)"
               style="margin-top:3px; font-size:11.5px; color:#555;"/>
      </td>
      <td></td><td></td><td></td><td></td>
      <td>
        <input class="unit-input" type="text"
               value="${esc(g.unit)}" placeholder="unit"
               data-field="unit" data-gid="${g.id}"
               oninput="onGroupChange(this)"/>
      </td>
      <td class="computed">${fmt(gQty)}</td>
      <td>
        <input class="cell-input" type="number" min="0" step="any"
               value="${g.rate||''}" placeholder="0.00"
               data-field="rate" data-gid="${g.id}"
               oninput="onGroupChange(this)"/>
      </td>
      <td class="computed">${fmt(gAmt)}</td>
      <td>
        <input class="cell-input left" type="text"
               value="${esc(g.remarks)}" placeholder=""
               data-field="remarks" data-gid="${g.id}"
               oninput="onGroupChange(this)"/>
      </td>
      <td class="no-print">
        <button class="del-btn" title="Remove group" onclick="removeGroup('${g.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </td>`;
    tbody.appendChild(tr);

    /* ── Child rows ── */
    g.rows.forEach(row => {
      const rQty = calcRowQty(row);
      const cr   = document.createElement("tr");
      cr.className   = "child-row";
      cr.dataset.rid = row.id;

      cr.innerHTML = `
        <td></td>
        <td class="td-desc">
          <select class="desc-select no-print"
                  data-field="description" data-gid="${g.id}" data-rid="${row.id}"
                  onchange="onRowChange(this); syncDescInput(this)">
            ${DESC_OPTIONS.map(o =>
              `<option value="${esc(o)}"${o===row.description?' selected':''}>${esc(o)||'— select —'}</option>`
            ).join('')}
          </select>
          <span class="print-desc" style="display:none">${esc(row.description)}</span>
          <input class="cell-input left" type="text"
                 value="${esc(row.description)}"
                 placeholder="or type custom…"
                 data-field="description" data-gid="${g.id}" data-rid="${row.id}"
                 oninput="onRowChange(this); syncDescSelect(this)"
                 style="margin-top:3px; font-size:11.5px; color:#555;"/>
        </td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.no||''}" placeholder="0"
                   data-field="no" data-gid="${g.id}" data-rid="${row.id}"
                   oninput="onRowChange(this)"/></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.length||''}" placeholder="0"
                   data-field="length" data-gid="${g.id}" data-rid="${row.id}"
                   oninput="onRowChange(this)"/></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.breadth||''}" placeholder="0"
                   data-field="breadth" data-gid="${g.id}" data-rid="${row.id}"
                   oninput="onRowChange(this)"/></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.height||''}" placeholder="0"
                   data-field="height" data-gid="${g.id}" data-rid="${row.id}"
                   oninput="onRowChange(this)"/></td>
        <td>
          <input class="unit-input" type="text"
                 value="${esc(row.unit)}" placeholder="unit"
                 data-field="unit" data-gid="${g.id}" data-rid="${row.id}"
                 oninput="onRowChange(this)"/>
        </td>
        <td class="computed">${fmt(rQty)}</td>
        <td></td>
        <td></td>
        <td>
          <input class="cell-input left" type="text"
                 value="${esc(row.remarks)}" placeholder=""
                 data-field="remarks" data-gid="${g.id}" data-rid="${row.id}"
                 oninput="onRowChange(this)"/>
        </td>
        <td class="no-print">
          <button class="del-btn" title="Remove row" onclick="removeRow('${g.id}','${row.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </td>`;
      tbody.appendChild(cr);
    });
  });
}

/* Keep select ↔ text-input in sync within the same cell */
function syncDescInput(selectEl) {
  const next = selectEl.nextElementSibling?.nextElementSibling; // skip print-span
  if (next && next.tagName === "INPUT") next.value = selectEl.value;
}
function syncDescSelect(inputEl) {
  const prev = inputEl.previousElementSibling?.previousElementSibling; // skip print-span
  if (prev && prev.tagName === "SELECT") {
    // Only set select value if the typed text exactly matches an option
    const exists = [...prev.options].some(o => o.value === inputEl.value);
    if (exists) prev.value = inputEl.value;
    else prev.value = ""; // reset to blank if custom text
  }
}

/* ═══════════════════════════════════════════
   CHANGE HANDLERS
═══════════════════════════════════════════ */
function onGroupChange(el) {
  const gid   = el.dataset.gid;
  const field = el.dataset.field;
  const g     = groups.find(g => g.id === gid);
  if (!g) return;
  g[field] = field === "rate" ? parseFloat(el.value) || 0 : el.value;
  // Update computed cells without full re-render
  refreshGroupComputed(gid);
  updateTotals();
  debouncedSave();
}

function onRowChange(el) {
  const gid   = el.dataset.gid;
  const rid   = el.dataset.rid;
  const field = el.dataset.field;
  const g     = groups.find(g => g.id === gid);
  if (!g) return;
  const r = g.rows.find(r => r.id === rid);
  if (!r) return;
  r[field] = ["no","length","breadth","height"].includes(field)
    ? parseFloat(el.value) || 0
    : el.value;
  refreshRowComputed(gid, rid);
  refreshGroupComputed(gid);
  updateTotals();
  debouncedSave();
}

function refreshRowComputed(gid, rid) {
  const g = groups.find(g => g.id === gid);
  const r = g?.rows.find(r => r.id === rid);
  if (!r) return;
  const tr = document.querySelector(`tr[data-rid="${rid}"]`);
  if (!tr) return;
  const cells = tr.querySelectorAll(".computed");
  if (cells[0]) cells[0].textContent = fmt(calcRowQty(r));
}

function refreshGroupComputed(gid) {
  const g  = groups.find(g => g.id === gid);
  if (!g) return;
  const tr = document.querySelector(`tr[data-gid="${gid}"]`);
  if (!tr) return;
  const cells = tr.querySelectorAll(".computed");
  if (cells[0]) cells[0].textContent = fmt(calcGroupQty(g));
  if (cells[1]) cells[1].textContent = fmt(calcGroupAmt(g));
}

/* ═══════════════════════════════════════════
   EXCEL EXPORT (CSV)
═══════════════════════════════════════════ */
function exportCSV() {
  const proj = projects.find(p => p.id === currentProjId);
  const rows = [
    ["NEPAL TELECOM"],
    ["PROVINCIAL DIRECTORATE BHAIRAHAWA"],
    ["KHUNSA-01, RUPANDEHI"],
    ["ESTIMATE SHEET"],
    [],
    ["Project Name", proj?.name || "", "Location", proj?.location || ""],
    [],
    ["S.N.","Description","No.","Length","Breadth","Height","Unit","Quantity","Rate (NPR)","Amount (NPR)","Remarks"]
  ];

  groups.forEach((g, i) => {
    rows.push([i+1, g.description, "", "", "", "", g.unit, fmt(calcGroupQty(g)), g.rate, fmt(calcGroupAmt(g)), g.remarks]);
    g.rows.forEach(r => {
      rows.push(["", r.description, r.no, r.length, r.breadth, r.height, r.unit, fmt(calcRowQty(r)), "", "", r.remarks]);
    });
  });

  const total = groups.reduce((s, g) => s + calcGroupAmt(g), 0);
  const vat   = total * 0.13;
  rows.push([]);
  rows.push(["","","","","","","","","Total Amount", fmt(total),""]);
  rows.push(["","","","","","","","","VAT (13%)",    fmt(vat),""]);
  rows.push(["","","","","","","","","Grand Total",  fmt(total + vat),""]);

  const csv  = rows.map(r => r.map(c => `"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `estimate_${(proj?.name||"sheet").replace(/\s+/g,"_")}_${Date.now()}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════
   FIREBASE INIT
═══════════════════════════════════════════ */
function initFirebase() {
  if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
    console.info("Firebase: no credentials set. Using localStorage only.");
    return;
  }
  const base = "https://www.gstatic.com/firebasejs/9.23.0";
  loadScript(`${base}/firebase-app-compat.js`, () => {
    loadScript(`${base}/firebase-database-compat.js`, () => {
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;
        console.log("Firebase connected ✓");

        // Sync projects from Firebase
        db.ref("projects").once("value", snap => {
          const remote = snap.val();
          if (remote && Array.isArray(remote)) {
            projects = remote;
            try { localStorage.setItem(LS_KEY_PJT, JSON.stringify(projects)); } catch (_) {}
            renderProjects();
          }
        });
      } catch (e) { console.error("Firebase error:", e); }
    });
  });
}

function loadScript(src, cb) {
  const s = document.createElement("script");
  s.src = src;
  s.onload = cb;
  s.onerror = () => console.warn("Failed to load:", src);
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function num(v) { return parseFloat(v) || 0; }
function fmt(v) { return num(v).toFixed(2); }
function esc(s) { return (s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-NP", { year:"numeric", month:"short", day:"numeric" });
}

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Start at password page
  showPage("pageLock");
  setTimeout(() => document.getElementById("pwdInput").focus(), 200);

  // ESC closes modal
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });
});
