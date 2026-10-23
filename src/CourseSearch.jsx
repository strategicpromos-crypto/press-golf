// ── PRESS GOLF — COURSE SEARCH & IMPORT ──────────────────────────────────────
// Panel that opens from the course pickers ("🔍 Search for a course…").
// Flow: search OpenGolfAPI by name → pick the right course (city/state shown)
// → IMPORT CHECK: the fetched scorecard is displayed and editable → save to
// the shared library (courseStore.saveCourse) → parent selects the new id.
//
// The check screen is the point: free course data is usually right, but not
// always — the user eyeballs pars/handicaps against the real card and fixes
// any hole before the course goes live for captains.

import React, { useState } from "react";
import { searchCourseAPI, fetchCourseFromAPI, saveCourse } from "./courseStore.js";

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
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const inp = {
    width:"100%", padding:"12px", background:C.surface,
    border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
    fontSize:15, outline:"none", boxSizing:"border-box",
  };
  const sel = {
    padding:"8px 4px", background:C.surface, border:`1px solid ${C.border}`,
    borderRadius:8, color:C.text, fontSize:14, outline:"none", width:"100%",
    boxSizing:"border-box", textAlign:"center",
  };

  async function doSearch() {
    if (query.trim().length < 3) { setSearchErr("Type at least 3 letters of the course name."); return; }
    setSearching(true); setSearchErr(""); setSearched(false);
    const { results: r, error } = await searchCourseAPI(query);
    setResults(r); setSearching(false); setSearched(true);
    if (error) setSearchErr("Search didn't go through — check your connection and try again.");
    else if (!r.length) setSearchErr("No courses matched. Try a shorter name (e.g. \"giant oak\").");
  }

  async function choose(result) {
    setLoadingId(result.apiId); setSaveErr("");
    try {
      const course = await fetchCourseFromAPI(result.apiId);
      if (!course.holes.length) throw new Error("empty");
      setDraft(course); setApiId(result.apiId); setPhase("check");
    } catch {
      setSaveErr("Couldn't load that course's scorecard. Try another result.");
    }
    setLoadingId(null);
  }

  function setHole(i, field, value) {
    setDraft(d => {
      const holes = d.holes.map((h, j) => j === i ? { ...h, [field]: Number(value) } : h);
      return { ...d, holes, par: holes.reduce((a, h) => a + (h.par || 0), 0) };
    });
  }

  // Validation — the stroke engine needs a complete card: 18 holes, par set,
  // handicap indexes exactly 1–18. Problems show here and block the save
  // until fixed in the grid (the fix is the point of this screen).
  function problems(d) {
    const out = [];
    if (!d) return out;
    if (!d.name.trim()) out.push("Course name is empty.");
    if (d.holes.length !== 18) out.push(`Card has ${d.holes.length} holes — the app needs all 18. This database entry is incomplete; pick another result or add the course manually.`);
    const hdcps = d.holes.map(h => h.hdcp);
    if (hdcps.some(h => !h || h < 1 || h > 18)) out.push("Every hole needs a handicap index from 1 to 18.");
    else if (new Set(hdcps).size !== 18) out.push("Handicap indexes repeat — each number 1–18 must appear exactly once. Check against the paper card.");
    if (d.holes.some(h => !h.par || h.par < 2 || h.par > 6)) out.push("Every hole needs a par.");
    return out;
  }

  async function doSave() {
    setSaving(true); setSaveErr("");
    try {
      const id = await saveCourse({ ...draft, name: draft.name.trim(), city: draft.city.trim() }, apiId);
      onPick && onPick(id);
    } catch (e) {
      setSaveErr("Save failed — if this is the first course you're adding, the library table may not be set up yet. (" + (e.message || e) + ")");
      setSaving(false);
    }
  }

  const probs = phase === "check" ? problems(draft) : [];

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
              style={{textAlign:"left",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,cursor:"pointer"}}>
              <div style={{fontWeight:700,fontSize:15}}>{r.name}</div>
              <div style={{fontSize:12,color:C.muted}}>{[r.city, r.state].filter(Boolean).join(", ")}{r.par ? ` · Par ${r.par}` : ""}{loadingId===r.apiId ? " · loading card…" : ""}</div>
            </button>
          ))}
        </div>
        {searched && !results.length && !searchErr && (
          <div style={{fontSize:12,color:C.muted,marginTop:8}}>No matches — try fewer words.</div>
        )}
      </>)}

      {phase === "check" && draft && (<>
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
          Check this card against the real scorecard — tap any par or handicap to fix it — then save.
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
              {draft.holes.slice(start, start + 9).map((h, k) => (
                <select key={h.hole} value={h.par} onChange={e=>setHole(start + k, "par", e.target.value)} style={sel}>
                  {[2,3,4,5,6].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"34px repeat(9, 1fr)",gap:4,alignItems:"center"}}>
              <div style={{fontSize:11,color:C.muted}}>Hdcp</div>
              {draft.holes.slice(start, start + 9).map((h, k) => (
                <select key={h.hole} value={h.hdcp || ""} onChange={e=>setHole(start + k, "hdcp", e.target.value)} style={sel}>
                  <option value="">–</option>
                  {[...Array(18)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              ))}
            </div>
          </div>
        ))}
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>Total par: <b style={{color:C.text}}>{draft.par}</b></div>
        {probs.map((p, i) => <div key={i} style={{fontSize:12,color:C.gold,marginBottom:6}}>⚠ {p}</div>)}
        {saveErr && <div style={{fontSize:12,color:C.red,marginBottom:8}}>{saveErr}</div>}
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <button onClick={()=>{ setPhase("search"); setSaveErr(""); }}
            style={{flex:1,padding:"13px",background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>
            ← Back
          </button>
          <button onClick={doSave} disabled={saving || probs.length > 0}
            style={{flex:2,padding:"13px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",opacity:(saving || probs.length > 0)?0.5:1}}>
            {saving ? "Saving…" : "Save to my courses"}
          </button>
        </div>
      </>)}

      <div style={{fontSize:10,color:C.muted,marginTop:12}}>Course data © OpenStreetMap contributors, via OpenGolfAPI (ODbL).</div>
    </div>
  );
}
