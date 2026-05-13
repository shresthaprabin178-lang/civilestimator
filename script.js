/**
 * Nepal Telecom – Estimate Sheet  |  script.js
 * ─────────────────────────────────────────────
 * Features:
 *  • Firebase Realtime Database – auto-save on every change
 *  • localStorage mirror – survives page refresh without internet
 *  • Real-time calculations: Qty = No × L × B × H, Amount = Qty × Rate
 *  • Dynamic add / remove item groups and sub-rows
 *  • Excel export via CSV download
 */

/* ═══════════════════════════════════════════
   1. FIREBASE CONFIGURATION
   ─────────────────────────────────────────
   Replace the placeholder values below with
   your actual Firebase project credentials.
   Find them in:
   Firebase Console → Project Settings → General
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

/* ─── Firebase state ───────────────────── */
let db            = null;   // Firebase database reference
let firebaseReady = false;
const FB_PATH     = "estimate_sheet"; // Realtime DB path key

/* ─── Local state ──────────────────────── */
let saveTimer    = null;
const LS_KEY     = "nt_estimate_data";

/* ══════════════════════════════════════════
   2. DATA MODEL
══════════════════════════════════════════ */
/**
 * A "group" is a top-level item (bold row).
 * Each group has an array of "rows" (detail lines).
 *
 * group: {
 *   id:          string,
 *   description: string,
 *   unit:        string,
 *   rate:        number,
 *   remarks:     string,
 *   rows: [{
 *     id, description, no, length, breadth, height, unit, remarks
 *   }]
 * }
 */
let groups = [];

/* ══════════════════════════════════════════
   3. FIREBASE INIT
══════════════════════════════════════════ */
function initFirebase() {
  try {
    // Only init if credentials look real (not placeholder strings)
    if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
      console.warn("Firebase: using localStorage only (no credentials set).");
      return;
    }

    // Dynamically load Firebase SDK from CDN
    const sdkBase = "https://www.gstatic.com/firebasejs/9.23.0";
    loadScript(`${sdkBase}/firebase-app-compat.js`, () => {
      loadScript(`${sdkBase}/firebase-database-compat.js`, () => {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;
        console.log("Firebase connected ✓");

        // Subscribe to remote changes (multi-device sync)
        db.ref(FB_PATH).on("value", (snapshot) => {
          const remote = snapshot.val();
          if (remote) {
            groups = remote.groups || [];
            renderAll();
            updateTotals();
            restoreMetaFields(remote.meta || {});
          }
        });
      });
    });
  } catch (e) {
    console.error("Firebase init failed:", e);
  }
}

function loadScript(src, cb) {
  const s   = document.createElement("script");
  s.src     = src;
  s.onload  = cb;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════
   4. PERSISTENCE  (Firebase + localStorage)
══════════════════════════════════════════ */
function buildPayload() {
  return {
    meta: {
      projectName: val("projectName"),
      location:    val("location"),
      docDate:     val("docDate")
    },
    groups: groups,
    savedAt: new Date().toISOString()
  };
}

function saveData() {
  const payload = buildPayload();

  // 1) Always write to localStorage
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (_) {}

  // 2) Write to Firebase if available
  if (firebaseReady && db) {
    setSaveStatus("saving");
    db.ref(FB_PATH).set(payload)
      .then(() => setSaveStatus("saved"))
      .catch(() => setSaveStatus("error"));
  } else {
    setSaveStatus("saved"); // localStorage-only is still "saved"
  }
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 600);
}

/* ── Save status indicator ─────────────── */
function setSaveStatus(state) {
  const bar  = document.getElementById("saveStatus");
  const text = document.getElementById("saveText");
  bar.className  = "save-status " + state;
  text.textContent =
    state === "saving" ? "Saving…"    :
    state === "error"  ? "Save failed" :
                         "All saved";
}

/* ══════════════════════════════════════════
   5. LOAD FROM LOCALSTORAGE ON STARTUP
══════════════════════════════════════════ */
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    groups = data.groups || [];
    restoreMetaFields(data.meta || {});
    return true;
  } catch (_) { return false; }
}

function restoreMetaFields(meta) {
  setVal("projectName", meta.projectName || "");
  setVal("location",    meta.location    || "");
  setVal("docDate",     meta.docDate     || "");
}

/* ══════════════════════════════════════════
   6. GROUP & ROW MANAGEMENT
══════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addGroup() {
  groups.push({
    id:          uid(),
    description: "",
    unit:        "",
    rate:        0,
    remarks:     "",
    rows:        [newRow()]
  });
  renderAll();
  updateTotals();
  debouncedSave();
}

function newRow() {
  return { id: uid(), description: "", no: 1, length: 1, breadth: 1, height: 1, unit: "", remarks: "" };
}

function addSubRow(groupId) {
  const g = groups.find(g => g.id === groupId);
  if (!g) return;
  g.rows.push(newRow());
  renderAll();
  debouncedSave();
}

function removeGroup(groupId) {
  groups = groups.filter(g => g.id !== groupId);
  renderAll();
  updateTotals();
  debouncedSave();
}

function removeRow(groupId, rowId) {
  const g = groups.find(g => g.id === groupId);
  if (!g) return;
  if (g.rows.length === 1) { removeGroup(groupId); return; }
  g.rows = g.rows.filter(r => r.id !== rowId);
  renderAll();
  updateTotals();
  debouncedSave();
}

/* ══════════════════════════════════════════
   7. CALCULATIONS
══════════════════════════════════════════ */
function calcRowQty(row) {
  return (num(row.no) * num(row.length) * num(row.breadth) * num(row.height));
}

function calcGroupQty(group) {
  return group.rows.reduce((s, r) => s + calcRowQty(r), 0);
}

function calcGroupAmount(group) {
  return calcGroupQty(group) * num(group.rate);
}

function updateTotals() {
  const total = groups.reduce((s, g) => s + calcGroupAmount(g), 0);
  const vat   = total * 0.13;
  const grand = total + vat;

  setText("totalAmount", fmt(total));
  setText("vatAmount",   fmt(vat));
  setText("grandTotal",  fmt(grand));
}

/* ══════════════════════════════════════════
   8. RENDER
══════════════════════════════════════════ */
const UNITS = ["", "m", "m²", "m³", "ft", "ft²", "ft³", "kg", "nos", "ls", "rft"];

function renderAll() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  groups.forEach((group, gIdx) => {
    const sn       = gIdx + 1;
    const groupQty = calcGroupQty(group);
    const groupAmt = calcGroupAmount(group);

    /* ── Group (parent) row ── */
    const tr = document.createElement("tr");
    tr.className = "group-row";
    tr.dataset.gid = group.id;
    tr.innerHTML = `
      <td class="sn-cell">
        ${sn}
        <button class="add-subrow-btn no-print" title="Add sub-row" onclick="addSubRow('${group.id}')">+</button>
      </td>
      <td class="col-desc">
        <input class="cell-input desc-input"
               value="${esc(group.description)}"
               placeholder="Description…"
               data-field="description" data-gid="${group.id}"
               oninput="onGroupFieldChange(this)" />
      </td>
      <td></td><td></td><td></td><td></td>
      <td>
        <select class="cell-select" data-field="unit" data-gid="${group.id}"
                onchange="onGroupFieldChange(this)">
          ${UNITS.map(u => `<option${u===group.unit?" selected":""}>${u}</option>`).join("")}
        </select>
      </td>
      <td class="computed">${fmt(groupQty)}</td>
      <td>
        <input class="cell-input" type="number" min="0" step="any"
               value="${num(group.rate) || ""}"
               placeholder="0.00"
               data-field="rate" data-gid="${group.id}"
               oninput="onGroupFieldChange(this)" />
      </td>
      <td class="computed">${fmt(groupAmt)}</td>
      <td>
        <input class="cell-input" value="${esc(group.remarks)}"
               placeholder="Remarks"
               data-field="remarks" data-gid="${group.id}"
               oninput="onGroupFieldChange(this)" />
      </td>
      <td class="no-print">
        <button class="btn-icon" title="Remove item" onclick="removeGroup('${group.id}')">&#128465;</button>
      </td>`;
    tbody.appendChild(tr);

    /* ── Child (sub) rows ── */
    group.rows.forEach(row => {
      const rQty = calcRowQty(row);
      const cr   = document.createElement("tr");
      cr.className   = "child-row";
      cr.dataset.rid = row.id;
      cr.innerHTML   = `
        <td></td>
        <td class="col-desc" style="padding-left:28px;">
          <input class="cell-input desc-input"
                 value="${esc(row.description)}"
                 placeholder="detail…"
                 data-field="description" data-gid="${group.id}" data-rid="${row.id}"
                 oninput="onRowFieldChange(this)" />
        </td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.no||""}" placeholder="0"
                   data-field="no" data-gid="${group.id}" data-rid="${row.id}"
                   oninput="onRowFieldChange(this)" /></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.length||""}" placeholder="0"
                   data-field="length" data-gid="${group.id}" data-rid="${row.id}"
                   oninput="onRowFieldChange(this)" /></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.breadth||""}" placeholder="0"
                   data-field="breadth" data-gid="${group.id}" data-rid="${row.id}"
                   oninput="onRowFieldChange(this)" /></td>
        <td><input class="cell-input" type="number" min="0" step="any"
                   value="${row.height||""}" placeholder="0"
                   data-field="height" data-gid="${group.id}" data-rid="${row.id}"
                   oninput="onRowFieldChange(this)" /></td>
        <td>
          <select class="cell-select" data-field="unit" data-gid="${group.id}" data-rid="${row.id}"
                  onchange="onRowFieldChange(this)">
            ${UNITS.map(u => `<option${u===row.unit?" selected":""}>${u}</option>`).join("")}
          </select>
        </td>
        <td class="computed">${fmt(rQty)}</td>
        <td></td>
        <td></td>
        <td>
          <input class="cell-input" value="${esc(row.remarks)}"
                 placeholder="Remarks"
                 data-field="remarks" data-gid="${group.id}" data-rid="${row.id}"
                 oninput="onRowFieldChange(this)" />
        </td>
        <td class="no-print">
          <button class="btn-icon" title="Remove row" onclick="removeRow('${group.id}','${row.id}')">&#128465;</button>
        </td>`;
      tbody.appendChild(cr);
    });
  });
}

/* ══════════════════════════════════════════
   9. CHANGE HANDLERS
══════════════════════════════════════════ */
function onGroupFieldChange(el) {
  const gid   = el.dataset.gid;
  const field = el.dataset.field;
  const g     = groups.find(g => g.id === gid);
  if (!g) return;
  g[field] = field === "rate" ? parseFloat(el.value) || 0 : el.value;
  refreshGroupRow(gid);
  updateTotals();
  debouncedSave();
}

function onRowFieldChange(el) {
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
  refreshRowQty(gid, rid);
  refreshGroupRow(gid);
  updateTotals();
  debouncedSave();
}

/* Refresh only computed cells for a row (avoid full re-render) */
function refreshRowQty(gid, rid) {
  const g   = groups.find(g => g.id === gid);
  const r   = g?.rows.find(r => r.id === rid);
  if (!r) return;
  const qty = calcRowQty(r);
  const tr  = document.querySelector(`tr[data-rid="${rid}"]`);
  if (tr) {
    const cells = tr.querySelectorAll(".computed");
    if (cells[0]) cells[0].textContent = fmt(qty);
  }
}

function refreshGroupRow(gid) {
  const g   = groups.find(g => g.id === gid);
  if (!g) return;
  const qty = calcGroupQty(g);
  const amt = calcGroupAmount(g);
  const tr  = document.querySelector(`tr[data-gid="${gid}"]`);
  if (tr) {
    const cells = tr.querySelectorAll(".computed");
    if (cells[0]) cells[0].textContent = fmt(qty);
    if (cells[1]) cells[1].textContent = fmt(amt);
  }
}

/* Meta field change */
function onMetaChange() { debouncedSave(); }

/* ══════════════════════════════════════════
   10. EXCEL EXPORT (CSV download)
══════════════════════════════════════════ */
function exportExcel() {
  const meta = buildPayload().meta;
  const rows = [
    ["NEPAL TELECOM"],
    ["PROVINCIAL DIRECTORATE BHAIRAHAWA"],
    ["KHUNSA-01, RUPANDEHI"],
    ["ESTIMATE SHEET"],
    [],
    ["Project Name", meta.projectName, "", "Location", meta.location, "", "Date", meta.docDate],
    [],
    ["S.N.", "Description", "No.", "Length", "Breadth", "Height", "Unit", "Quantity", "Rate (NPR)", "Amount (NPR)", "Remarks"]
  ];

  groups.forEach((g, i) => {
    const gQty = calcGroupQty(g);
    const gAmt = calcGroupAmount(g);
    rows.push([i+1, g.description, "", "", "", "", g.unit, fmt(gQty), g.rate, fmt(gAmt), g.remarks]);
    g.rows.forEach(r => {
      const rQty = calcRowQty(r);
      rows.push(["", r.description, r.no, r.length, r.breadth, r.height, r.unit, fmt(rQty), "", "", r.remarks]);
    });
  });

  const total = groups.reduce((s, g) => s + calcGroupAmount(g), 0);
  const vat   = total * 0.13;
  rows.push([]);
  rows.push(["", "", "", "", "", "", "", "", "Total Amount", fmt(total), ""]);
  rows.push(["", "", "", "", "", "", "", "", "VAT (13%)",    fmt(vat), ""]);
  rows.push(["", "", "", "", "", "", "", "", "Grand Total",  fmt(total + vat), ""]);

  const csv  = rows.map(r => r.map(cell => `"${String(cell||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `estimate_sheet_${Date.now()}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════
   11. UTILITIES
══════════════════════════════════════════ */
function num(v) { return parseFloat(v) || 0; }
function fmt(v) { return num(v).toFixed(2); }
function esc(s) { return (s||"").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function val(id) { return (document.getElementById(id)||{}).value || ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

/* ══════════════════════════════════════════
   12. BOOTSTRAP
══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  // Set today's date as default
  document.getElementById("docDate").value = new Date().toISOString().split("T")[0];

  // Attach meta-field listeners
  ["projectName","location","docDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", onMetaChange);
  });

  // Load cached data (Firebase will overwrite if connected)
  const hadLocal = loadFromLocalStorage();
  if (!hadLocal) {
    // Seed two default groups matching the screenshot
    groups = [
      {
        id: uid(), description: "Brickwork 1:4 in cement sand", unit: "m³", rate: 0, remarks: "",
        rows: [{ id: uid(), description: "civil", no: 1, length: 1.2, breadth: 2.1, height: 2, unit: "", remarks: "" }]
      },
      {
        id: uid(), description: "PCC work", unit: "m³", rate: 0, remarks: "",
        rows: [{ id: uid(), description: "civil", no: 1, length: 1, breadth: 1, height: 1, unit: "", remarks: "" }]
      }
    ];
  }

  renderAll();
  updateTotals();

  // Try to connect Firebase (non-blocking)
  initFirebase();
});
