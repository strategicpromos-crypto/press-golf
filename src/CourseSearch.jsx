// ── PRESS GOLF — COURSE SEARCH & IMPORT ──────────────────────────────────────
// Panel that opens from the course pickers ("🔍 Search for a course…").
// Two jobs, one panel:
//   1) FIND: search OpenGolfAPI by name → pick the right course (city/state
//      shown) → IMPORT CHECK: the fetched scorecard is displayed and editable
//      → save to the shared library (courseStore.saveCourse) → parent selects
//      the new id.
//   2) EDIT: a saved library course's card can be fixed or finished here
//      (courseStore.updateCourse, same id) — this is how a course saved
//      without handicaps gets its handicaps later, right in the app.
//
// The check screen is the point: free course data is usually right, but not
// always — the user eyeballs pars/handicaps against the real card and fixes
// any hole before the course goes live for captains. Every number is shown
// as plain text (tap to change it); the old narrow dropdowns hid their
// values on phones, so a card could not be confirmed at a glance.
//
// Save rules: pars are required (18 holes, par 2–6) — a course without pars
// cannot be scored. Handicaps are NOT required: a card may save with all
// handicaps empty (pars only). Such a course scores fine and plays gross
// skins, but stroke bets cannot use it until handicaps are added — the
// stroke engine returns no stroke holes for it (golf.js), and bet setup
// blocks strokes on it. Handicaps must be all 18 (1–18, each once) or all
// empty; a half-filled row blocks save until it is finished or cleared.

import React, { useState } from "react";
import { searchCourseAPI, fetchCourseFromAPI, saveCourse, getLibraryCourses, getLibraryCourse, updateCourse } from "./courseStore.js";

const DEFAULT_C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

export default function CourseSearch({ C: Cin, onPick, onClose }) {
  const C = { ...DEFAULT_C, ...(Cin || {}) };
  const [phase, setPhase] = useState("search"); // search | check
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searched, setSearched] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [apiId, setApiId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  // Tap-to-edit cell: {row:"par"|"hdcp", idx:0–17} + the text being typed.
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [qfPar, setQfPar] = useState("");
  const [qfHdcp, setQfHdcp] = useState("");
  const [qfErr, setQfErr] = useState("");

  const libCourses = getLibraryCourses();

  const inp = {
    width:"100%", padding:"12px", background:C.surface,
    border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
    fontSize:15, outline:"none", boxSizing:"border-box",
  };
  const resultBtn = {
    textAlign:"left", padding:"12px 14px", background:C.surface,
    border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
    cursor:"pointer", width:"100%", boxSizing:"border-box",
  };
  const cellBtn = {
    minHeight:38, background:C.surface, border:`1px solid ${C.border}`,
    borderRadius:8, color:C.text, fontSize:16, fontWeight:700,
    cursor:"pointer", padding:0, width:"100%",
  };
  const cellInp = {
    minHeight:38, width:"100%", background:C.bg, border:`2px solid ${C.green}`,
    borderRadius:8, color:C.text, fontSize:16, fontWeight:700,
    textAlign:"center", outline:"none", boxSizing:"border-box", padding:0,
  };
  const smallBtn = {
    padding:"12px 14px", background:C.surface, color:C.text,
    border:`1px solid ${C.border}`, borderRadius:10, fontWeight:700,
    fontSize:13, cursor:"pointer", whiteSpace:"nowrap",
  };

  async function doSearch() {
    if (query.trim().length < 3) { setSearchErr("Type at least 3 letters of the course name."); return; }
    setSearching(true); setSearchErr(""); setSearched(false);
    const { results: r, error } = await searchCourseAPI(query);
    setResults(r); setSearching(false); setSearched(true);
    if (error) setSearchErr("Search didn't go through — check your connection and try again.");
    else if (!r.length) setSearchErr("No courses matched. Try a shorter name (e.g. \"giant oak\").");
  }

  function resetCheckState() {
    setEditing(null); setEditVal("");
    setQfPar(""); setQfHdcp(""); setQfErr("");
    setSaveErr("");
  }

  async function choose(result) {
    setLoadingId(result.apiId); setSaveErr("");
    try {
      const course = await fetchCourseFromAPI(result.apiId);
      if (!course.holes.length) throw new Error("empty");
      setDraft(course); setApiId(result.apiId); setEditId(null);
      resetCheckState(); setPhase("check");
    } catch {
      setSaveErr("Couldn't load that course's scorecard. Try another result.");
    }
    setLoadingId(null);
  }

  function startEdit(lib) {
    const src = getLibraryCourse(lib.id);
    if (!src) return;
    setDraft({ name: src.name, city: src.city || "", par: src.par,
      holes: src.holes.map(h => ({ ...h })) });
    setApiId(null); setEditId(lib.id);
    resetCheckState(); setPhase("check");
  }

  function setHole(i, field, value) {
    setDraft(d => {
      const holes = d.holes.map((h, j) => j === i ? { ...h, [field]: (value === "" || value === null ? null : Number(value)) } : h);
      return { ...d, holes, par: holes.reduce((a, h) => a + (h.par || 0), 0) };
    });
  }

  function commitEdit() {
    if (!editing) return;
    const { row, idx } = editing;
    const raw = (editVal || "").trim();
    if (raw === "") {
      // Clearing is allowed for handicaps (all-or-none rule sorts it out);
      // pars can never be empty, so an empty par edit just reverts.
      if (row === "hdcp") { setHole(idx, "hdcp", null); advanceEdit(row, idx); }
      else setEditing(null);
      return;
    }
    const n = parseInt(raw, 10);
    const ok = row === "par" ? (n >= 2 && n <= 6) : (n >= 1 && n <= 18);
    if (!ok) { setEditing(null); return; } // invalid — revert, don't save junk
    setHole(idx, row, n);
    advanceEdit(row, idx);
  }

  function advanceEdit(row, idx) {
    // Move to the next hole in the same 9-hole block so a paper card can be
    // typed straight down the row; stop at the end of the block.
    const blockStart = idx < 9 ? 0 : 9;
    const next = idx + 1;
    if (next < blockStart + 9) {
      const h = draft.holes[next];
      const v = row === "par" ? h.par : h.hdcp;
      setEditing({ row, idx: next });
      setEditVal(v === null || v === undefined ? "" : String(v));
    } else {
      setEditing(null);
    }
  }

  function applyQuickFill(field) {
    const raw = field === "par" ? qfPar : qfHdcp;
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    const label = field === "par" ? "Pars" : "Handicaps";
    if (parts.length !== 18) { setQfErr(label + " quick-fill needs exactly 18 numbers — you entered " + parts.length + "."); return; }
    const nums = parts.map(p => parseInt(p, 10));
    if (nums.some(isNaN)) { setQfErr("Quick-fill: every entry must be a number."); return; }
    if (field === "par" && nums.some(n => n < 2 || n > 6)) { setQfErr("Pars must be between 2 and 6."); return; }
    if (field === "hdcp" && (nums.some(n => n < 1 || n > 18) || new Set(nums).size !== 18)) {
      setQfErr("Handicaps must be 1–18, each used exactly once."); return;
    }
    setDraft(d => {
      const holes = d.holes.map((h, i) => ({ ...h, [field]: nums[i] }));
      return { ...d, holes, par: holes.reduce((a, h) => a + (h.par || 0), 0) };
    });
    setQfErr("");
  }

  function clearHdcp() {
    setDraft(d => ({ ...d, holes: d.holes.map(h => ({ ...h, hdcp: null })) }));
  }

  // Validation. Pars block save; handicaps are all-or-none (all 18 valid,
  // or all empty). A half-filled handicap row blocks save until finished
  // or cleared — a partial row would silently mis-assign strokes.
  function problems(d) {
    const out = [];
    if (!d) return out;
    if (!d.name.trim()) out.push("Course name is empty.");
    if (d.holes.length !== 18) out.push(`Card has ${d.holes.length} holes — the app needs all 18. This database entry is incomplete; pick another result or add the course manually.`);
    if (d.holes.some(h => !h.par || h.par < 2 || h.par > 6)) out.push("Every hole needs a par.");
    const filled = d.holes.filter(h => h.hdcp !== null && h.hdcp !== undefined);
    if (filled.length > 0) {
      if (filled.length < 18) out.push("Handicaps are incomplete — fill all 18, or clear them to save without handicaps.");
      else if (d.holes.some(h => !h.hdcp || h.hdcp < 1 || h.hdcp > 18)) out.push("Every handicap index must be from 1 to 18.");
      else if (new Set(d.holes.map(h => h.hdcp)).size !== 18) out.push("Handicap indexes repeat — each number 1–18 must appear exactly once. Check against the paper card.");
    }
    return out;
  }

  async function doSave() {
    setSaving(true); setSaveErr("");
    try {
      const payload = { ...draft, name: draft.name.trim(), city: draft.city.trim() };
      const id = editId ? await updateCourse(editId, payload) : await saveCourse(payload, apiId);
      onPick && onPick(id);
    } catch (e) {
      setSaveErr("Save failed — if this is the first course you're adding, the library table may not be set up yet. (" + (e.message || e) + ")");
      setSaving(false);
    }
  }

  function renderCell(row, idx) {
    const h = draft.holes[idx];
    const val = row === "par" ? h.par : h.hdcp;
    const missing = val === null || val === undefined;
    if (editing && editing.row === row && editing.idx === idx) {
      return (
        <input key={row + idx} autoFocus value={editVal}
          inputMode="numeric" pattern="[0-9]*"
          onFocus={e => e.target.select()}
          onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
          style={cellInp} />
      );
    }
    return (
      <button key={row + idx}
        onClick={() => { setEditing({ row, idx }); setEditVal(missing ? "" : String(val)); }}
        style={{ ...cellBtn, color: missing ? C.gold : C.text }}>
        {missing ? "–" : val}
      </button>
    );
  }

  const probs = phase === "check" ? problems(draft) : [];
  const hdcpEmpty = draft ? draft.holes.every(h => h.hdcp === null || h.hdcp === undefined) : false;
  const hdcpMixed = draft ? (() => {
    const filled = draft.holes.filter(h => h.hdcp !== null && h.hdcp !== undefined).length;
    return filled > 0 && filled < 18;
  })() : false;
  const saveLabel = editId
    ? (hdcpEmpty ? "Save changes (no handicaps)" : "Save changes")
    : (hdcpEmpty ? "Save without handicaps" : "Save to my courses");

  return (
    <div style={{background:C.card,border:`1px solid ${C.green}`,borderRadius:12,padding:16,marginTop:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontWeight:800,fontSize:15}}>🔍 Find a course</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:"0 4px"}} aria-label="Close">×</button>
      </div>

      {phase === "search" && (<>
        <div style={{display:"flex",gap:8}}>
          <input value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>{ if (e.key === "Enter") doSearch(); }}
            placeholder="Course name — e.g. giant oak" style={{...inp, flex:1}} />
          <button onClick={doSearch} disabled={searching}
            style={{padding:"12px 18px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontWeight:800,fontSize:15,cursor:"pointer",opacity:searching?0.6:1}}>
            {searching ? "…" : "Search"}
          </button>
        </div>
        {searchErr && <div style={{fontSize:12,color:C.gold,marginTop:8}}>{searchErr}</div>}
        {saveErr && <div style={{fontSize:12,color:C.red,marginTop:8}}>{saveErr}</div>}
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
          {results.map(r => (
            <button key={r.apiId} onClick={()=>choose(r)} disabled={loadingId===r.apiId}
              style={resultBtn}>
              <div style={{fontWeight:700,fontSize:15}}>{r.name}</div>
              <div style={{fontSize:12,color:C.muted}}>{[r.city, r.state].filter(Boolean).join(", ")}{r.par ? ` · Par ${r.par}` : ""}{loadingId===r.apiId ? " · loading card…" : ""}</div>
            </button>
          ))}
        </div>
        {searched && !results.length && !searchErr && (
          <div style={{fontSize:12,color:C.muted,marginTop:8}}>No matches — try fewer words.</div>
        )}

        <div style={{marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>✏️ Edit a saved course</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Fix a card, or add handicaps to a course saved without them — no search needed.</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {libCourses.map(c => (
              <button key={c.id} onClick={()=>startEdit(c)} style={resultBtn}>
                <div style={{fontWeight:700,fontSize:15}}>{c.name}</div>
                <div style={{fontSize:12,color:c.hdcpOk?C.muted:C.gold}}>
                  {c.city || "Saved course"}{c.hdcpOk ? " · handicaps set" : " · ⚠ no handicaps"}
                </div>
              </button>
            ))}
          </div>
          {libCourses.length === 0 && (
            <div style={{fontSize:12,color:C.muted}}>No saved courses yet — import one above and it appears here.</div>
          )}
        </div>
      </>)}

      {phase === "check" && draft && (<>
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
          Check this card against the real scorecard — every number is shown. Tap a number to change it, or fill a whole row with quick-fill — then save.
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input value={draft.name} onChange={e=>setDraft({...draft, name:e.target.value})} style={{...inp, flex:2}} placeholder="Course name" />
          <input value={draft.city} onChange={e=>setDraft({...draft, city:e.target.value})} style={{...inp, flex:1}} placeholder="City, ST" />
        </div>
        {[0, 9].map(start => (
          <div key={start} style={{marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"34px repeat(9, 1fr)",gap:4,alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:700}}>{start === 0 ? "OUT" : "IN"}</div>
              {draft.holes.slice(start, start + 9).map(h => (
                <div key={h.hole} style={{textAlign:"center",fontSize:11,color:C.muted,fontWeight:700}}>{h.hole}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"34px repeat(9, 1fr)",gap:4,alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:11,color:C.muted}}>Par</div>
              {draft.holes.slice(start, start + 9).map((h, k) => renderCell("par", start + k))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"34px repeat(9, 1fr)",gap:4,alignItems:"center"}}>
              <div style={{fontSize:11,color:C.muted}}>Hdcp</div>
              {draft.holes.slice(start, start + 9).map((h, k) => renderCell("hdcp", start + k))}
            </div>
          </div>
        ))}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Quick-fill a whole row — 18 numbers, spaces or commas:</div>
          <div style={{display:"flex",gap:8,marginBottom:6}}>
            <input value={qfPar} onChange={e=>setQfPar(e.target.value)} placeholder="Pars: 4 4 4 3 5 …" style={{...inp, flex:1}} />
            <button onClick={()=>applyQuickFill("par")} style={smallBtn}>Fill pars</button>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={qfHdcp} onChange={e=>setQfHdcp(e.target.value)} placeholder="Handicaps: 7 5 11 15 1 …" style={{...inp, flex:1}} />
            <button onClick={()=>applyQuickFill("hdcp")} style={smallBtn}>Fill handicaps</button>
          </div>
          {qfErr && <div style={{fontSize:12,color:C.gold,marginTop:6}}>{qfErr}</div>}
        </div>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>Total par: <b style={{color:C.text}}>{draft.par}</b></div>
        {probs.map((p, i) => <div key={i} style={{fontSize:12,color:C.gold,marginBottom:6}}>⚠ {p}</div>)}
        {hdcpMixed && (
          <button onClick={clearHdcp} style={{...smallBtn, marginBottom:8}}>Clear handicaps (save without them)</button>
        )}
        {hdcpEmpty && probs.length === 0 && (
          <div style={{fontSize:12,color:C.gold,marginBottom:8}}>
            No handicaps on this card — scoring and gross skins work fine. Stroke bets need handicaps; add them anytime from Search for a course… → Edit a saved course.
          </div>
        )}
        {saveErr && <div style={{fontSize:12,color:C.red,marginBottom:8}}>{saveErr}</div>}
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <button onClick={()=>{ setPhase("search"); setSaveErr(""); }}
            style={{flex:1,padding:"13px",background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>
            ← Back
          </button>
          <button onClick={doSave} disabled={saving || probs.length > 0}
            style={{flex:2,padding:"13px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",opacity:(saving || probs.length > 0)?0.5:1}}>
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </>)}

      <div style={{fontSize:10,color:C.muted,marginTop:12}}>Course data © OpenStreetMap contributors, via OpenGolfAPI (ODbL).</div>
    </div>
  );
}
