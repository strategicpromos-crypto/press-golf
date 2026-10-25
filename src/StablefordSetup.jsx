import React, { useState, useEffect } from "react";
import { COURSES } from "./golf.js";

// ── STABLEFORD SETUP — v1 (Oct 25, 2026) ─────────────────────────────────────
// Setup screen ONLY — no scoring yet. The director builds the tournament
// here: days, courses, counting mode, points table, players (flight / tee /
// starting handicap / opt-outs), teams, skins, closest, and handicap
// movement. Scoring screens, daily team setup, and Supabase persistence
// come next, after this screen is approved.
//
// Locked design (see MEMORY.md):
// - Stableford ONLY for v1 — stroke play is deferred to later.
// - Days and rounds per day are setup settings, not constants.
// - Counting modes: per-hole net (strokes on hardest holes by course HDCP
//   rank) OR count-up (handicap is starting points, gross points after).
// - Points table fully adjustable, including the worse-than-double value.
// - Team count = balls to count, 1 / 2 / 3 / 4 per hole.
// - Skins per player: gross field, gross flight, net field, net flight.
// - Handicap movement (per day): step 3 points = 1 stroke, capped 3 down /
//   2 up, applied to the NEXT day's handicap. Main 18 only, never the extra 9.
// - Winner = highest total points. Overall 1st is the trophy; money by flight.
// - Missed day = 0 points, handicap unchanged.

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const LS_KEY = "pg-stableford-setups";

function Lbl({ children }) {
  return <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,marginTop:16,fontWeight:600}}>{children}</div>;
}

function PillRow({ options, value, onChange }) {
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {options.map(([id, label]) => (
        <button key={id} onClick={()=>onChange(id)}
          style={{flex:1,padding:"10px 4px",borderRadius:8,background:value===id?C.gold:C.surface,color:value===id?"#0a1a0f":C.muted,border:"1px solid "+(value===id?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:value===id?700:500,whiteSpace:"nowrap"}}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, label, hint }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"10px 0"}}>
      <div>
        <div style={{fontWeight:700,fontSize:14}}>{label}</div>
        {hint&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{hint}</div>}
      </div>
      <button onClick={()=>onChange(!value)}
        style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:value?C.green:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
        <div style={{position:"absolute",top:4,left:value?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
      </button>
    </div>
  );
}

function Stepper({ value, onChange, min, max, label }) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
        <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800}}>{value}</div>
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
      </div>
    </div>
  );
}

const DEFAULT_POINTS = { albatross:5, eagle:4, birdie:3, par:2, bogey:1, double:0, worse:0 };
const DEFAULT_SKINS = { grossField:true, grossFlight:true, netField:true, netFlight:true };

function newPlayer() {
  return {
    id:"p_"+Date.now()+"_"+Math.floor(Math.random()*10000),
    name:"", flight:"B", tee:"", hdcp:12,
    individual:true, skins:{...DEFAULT_SKINS},
  };
}

function newDay() {
  return { courseId:"south-toledo", extra9:false, extraCourseId:"south-toledo", extraNine:"front", extraIndividual:false, extraTeam:true, extraSkins:true };
}

export default function StablefordSetup({ onBack, onPlay }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(4);
  const [dayList, setDayList] = useState([newDay(), newDay(), newDay(), newDay()]);
  const [countingMode, setCountingMode] = useState("net"); // "net" | "countup"
  const [points, setPoints] = useState({...DEFAULT_POINTS});
  const [individualOn, setIndividualOn] = useState(true);
  const [teamsOn, setTeamsOn] = useState(true);
  const [ballsToCount, setBallsToCount] = useState(2);
  const [ctpOn, setCtpOn] = useState(true);
  const [movementOn, setMovementOn] = useState(true);
  const [adjStep, setAdjStep] = useState(3);
  const [adjDownCap, setAdjDownCap] = useState(3);
  const [adjUpCap, setAdjUpCap] = useState(2);
  const [players, setPlayers] = useState([newPlayer(), newPlayer(), newPlayer(), newPlayer()]);
  const [savedMsg, setSavedMsg] = useState("");
  const [savedSetup, setSavedSetup] = useState(null);
  const [savedList, setSavedList] = useState([]);

  function refreshSaved() {
    try { setSavedList(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
    catch { setSavedList([]); }
  }
  useEffect(refreshSaved, []);

  // Load a saved setup back into this form for editing or replaying.
  function loadIntoForm(s) {
    setName(s.name || "");
    setDays(s.days || (s.dayList || []).length || 1);
    setDayList(s.dayList || [newDay()]);
    setCountingMode(s.countingMode || "net");
    setPoints({ ...DEFAULT_POINTS, ...(s.points || {}) });
    setIndividualOn(s.individualOn !== false);
    setTeamsOn(s.teamsOn !== false);
    setBallsToCount(s.ballsToCount || 2);
    setCtpOn(s.ctpOn !== false);
    setMovementOn(s.movementOn !== false);
    setAdjStep(s.adjStep || 3);
    setAdjDownCap(s.adjDownCap || 3);
    setAdjUpCap(s.adjUpCap || 2);
    setPlayers((s.players || []).map(p => ({ ...newPlayer(), ...p, skins: { ...DEFAULT_SKINS, ...(p.skins || {}) } })));
    setSavedSetup(s);
    setSavedMsg("Loaded “" + (s.name || "tournament") + "” — edit it here or tap Play below.");
    window.scrollTo(0, 0);
  }

  const courseOptions = Object.entries(COURSES)
    .map(([id, c]) => ({ id, label: c.name + (c.city ? " (" + c.city + ")" : "") }))
    .sort((a, b) => a.label.localeCompare(b.label));

  function changeDays(n) {
    const next = Math.max(1, Math.min(7, n));
    setDays(next);
    setDayList(prev => {
      const out = [...prev];
      while (out.length < next) out.push(newDay());
      return out.slice(0, next);
    });
  }

  function setDay(i, patch) {
    setDayList(prev => prev.map((d, j) => j === i ? { ...d, ...patch } : d));
  }

  function setPlayer(id, patch) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function setPlayerSkins(id, key) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, skins: { ...p.skins, [key]: !p.skins[key] } } : p));
  }

  function saveSetup() {
    const named = players.filter(p => p.name.trim().length > 0);
    if (!name.trim()) { window.alert("Give the tournament a name first."); return; }
    if (named.length === 0) { window.alert("Add at least one player first."); return; }
    const setup = {
      id:"stableford_"+Date.now(), createdAt:new Date().toISOString(),
      name:name.trim(), days, dayList, countingMode, points,
      individualOn, teamsOn, ballsToCount, ctpOn,
      movementOn, adjStep, adjDownCap, adjUpCap,
      players: named.map(p => ({ ...p, name: p.name.trim() })),
    };
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([setup, ...prev]));
      setSavedSetup(setup);
      refreshSaved();
      setSavedMsg("Saved on this device — tap Play below to start scoring it.");
    } catch {
      setSavedMsg("Could not save on this device, but the setup below is ready to review.");
    }
  }

  const namedCount = players.filter(p => p.name.trim()).length;

  return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.green,fontSize:14,fontWeight:700,cursor:"pointer",padding:0,marginBottom:16}}>‹ Back to Home</button>
        <div style={{fontSize:26,fontWeight:800,marginBottom:4}}>Stableford</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>One-day games or multi-day tournaments — same setup, different switches.</div>
        <div style={{fontSize:11,color:C.gold}}>Setup only in this version. Scoring, daily team setup, and saved-tournament play come next.</div>

        <Lbl>Tournament name</Lbl>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Annual Stableford — 2027"
          style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>

        <Lbl>How many days?</Lbl>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>changeDays(days-1)} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
          <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800}}>{days} {days===1?"day":"days"}</div>
          <button onClick={()=>changeDays(days+1)} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
        </div>

        <Lbl>Counting mode</Lbl>
        <PillRow
          options={[["net","Per-hole net"],["countup","Count-up from HDCP"]]}
          value={countingMode} onChange={setCountingMode}/>
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>
          {countingMode==="net"
            ? "Strokes land on the hardest holes by course handicap rank, and points are net Stableford per hole."
            : "Your handicap is your starting points (an 8 starts at 8), then gross points add up from there. No per-hole net strokes."}
        </div>

        <Lbl>Points table — adjustable</Lbl>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px"}}>
          <Stepper label="Albatross (3 under)" value={points.albatross} onChange={v=>setPoints(p=>({...p,albatross:v}))} min={0} max={10}/>
          <Stepper label="Eagle (2 under)" value={points.eagle} onChange={v=>setPoints(p=>({...p,eagle:v}))} min={0} max={10}/>
          <Stepper label="Birdie (1 under)" value={points.birdie} onChange={v=>setPoints(p=>({...p,birdie:v}))} min={0} max={10}/>
          <Stepper label="Par" value={points.par} onChange={v=>setPoints(p=>({...p,par:v}))} min={0} max={5}/>
          <Stepper label="Bogey (1 over)" value={points.bogey} onChange={v=>setPoints(p=>({...p,bogey:v}))} min={0} max={5}/>
          <Stepper label="Double bogey (2 over)" value={points.double} onChange={v=>setPoints(p=>({...p,double:v}))} min={-2} max={2}/>
          <Stepper label="Worse than double" value={points.worse} onChange={v=>setPoints(p=>({...p,worse:v}))} min={-5} max={0}/>
          <div style={{fontSize:11,color:C.muted}}>Standard table is 5 / 4 / 3 / 2 / 1 / 0 / 0. Change any number to match the tournament.</div>
        </div>

        <Lbl>Individual tournament</Lbl>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"6px 16px"}}>
          <Toggle value={individualOn} onChange={setIndividualOn} label="Individual tournament"
            hint="Cumulative Stableford across all days, first 18 holes only. Overall 1st is the trophy; money is paid by flight."/>
        </div>

        <Lbl>Teams</Lbl>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"6px 16px 16px"}}>
          <Toggle value={teamsOn} onChange={setTeamsOn} label="Team game"
            hint="Teams are set fresh each day. No cumulative team race — daily 1st, 2nd, 3rd only."/>
          {teamsOn&&(<>
            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",margin:"12px 0 6px",fontWeight:600}}>Balls to count per hole</div>
            <PillRow options={[["1","1 ball"],["2","2 balls"],["3","3 balls"],["4","4 balls"]]}
              value={String(ballsToCount)} onChange={v=>setBallsToCount(parseInt(v,10))}/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>On each hole, the team's score is the sum of its best {ballsToCount} net Stableford scores. Team skins run off that same total — highest team total takes the hole, ties are dead.</div>
          </>)}
        </div>

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"6px 16px",marginTop:16}}>
          <Toggle value={ctpOn} onChange={setCtpOn} label="Closest to the pin"
            hint="CTP holes are picked when the day is set up for scoring."/>
          <Toggle value={movementOn} onChange={setMovementOn} label="Handicap movement"
            hint="After each day's main 18, handicaps move for the next day. Off for a simple one-day game."/>
        </div>
        {movementOn&&(
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
            <Stepper label="Points per 1 handicap stroke" value={adjStep} onChange={setAdjStep} min={1} max={5}/>
            <Stepper label="Max down per day" value={adjDownCap} onChange={setAdjDownCap} min={1} max={5}/>
            <Stepper label="Max up per day" value={adjUpCap} onChange={setAdjUpCap} min={1} max={5}/>
            <div style={{fontSize:11,color:C.muted}}>Par points for 18 holes is 36. Every {adjStep} points over 36 moves a player down a stroke (max {adjDownCap} per day); every {adjStep} under moves them up (max {adjUpCap} per day). The extra 9 never moves a handicap. Flights never change.</div>
          </div>
        )}

        <Lbl>Players — {namedCount} named</Lbl>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Flight, tee, and starting handicap are fixed at setup. Skins switches are per player: gross field, gross flight, net field, net flight.</div>
        {players.map((p) => (
          <div key={p.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
            <input value={p.name} onChange={e=>setPlayer(p.id,{name:e.target.value})} placeholder="Player name"
              style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[["A","Flight A"],["B","Flight B"],["C","Flight C"]].map(([id,label])=>(
                <button key={id} onClick={()=>setPlayer(p.id,{flight:id})}
                  style={{flex:1,padding:"10px 4px",borderRadius:8,background:p.flight===id?C.gold:C.surface,color:p.flight===id?"#0a1a0f":C.muted,border:"1px solid "+(p.flight===id?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:p.flight===id?700:500}}>{label}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <input value={p.tee} onChange={e=>setPlayer(p.id,{tee:e.target.value})} placeholder="Tee (label)"
                style={{flex:1,padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setPlayer(p.id,{hdcp:Math.max(0,p.hdcp-1)})} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
                <div style={{textAlign:"center",minWidth:64}}><div style={{fontSize:18,fontWeight:800}}>{p.hdcp}</div><div style={{fontSize:10,color:C.muted}}>HDCP</div></div>
                <button onClick={()=>setPlayer(p.id,{hdcp:Math.min(36,p.hdcp+1)})} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <button onClick={()=>setPlayer(p.id,{individual:!p.individual})}
                style={{flex:1,padding:"8px 4px",borderRadius:8,background:p.individual?C.green:C.surface,color:p.individual?"#0a1a0f":C.muted,border:"1px solid "+(p.individual?C.green:C.border),cursor:"pointer",fontSize:11,fontWeight:p.individual?700:500}}>Individual {p.individual?"on":"off"}</button>
              {[["grossField","Gross field"],["grossFlight","Gross flight"],["netField","Net field"],["netFlight","Net flight"]].map(([key,label])=>(
                <button key={key} onClick={()=>setPlayerSkins(p.id,key)}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,background:p.skins[key]?C.gold:C.surface,color:p.skins[key]?"#0a1a0f":C.muted,border:"1px solid "+(p.skins[key]?C.gold:C.border),cursor:"pointer",fontSize:11,fontWeight:p.skins[key]?700:500}}>{label}</button>
              ))}
            </div>
            <button onClick={()=>setPlayers(prev=>prev.filter(x=>x.id!==p.id))}
              style={{background:"none",border:"none",color:C.red,fontSize:12,cursor:"pointer",padding:0}}>Remove player</button>
          </div>
        ))}
        <button onClick={()=>setPlayers(prev=>[...prev, newPlayer()])}
          style={{width:"100%",padding:"14px",background:"transparent",border:"1.5px dashed "+C.border,borderRadius:12,color:C.green,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:8}}>
          + Add Player
        </button>

        <Lbl>Days &amp; courses</Lbl>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Main 18 follows the tournament switches above and drives the adjustment when movement is on. The extra 9 is always team + skins only in this version — its own individual / team / skins toggles come with scoring.</div>
        {dayList.map((d, i) => (
          <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:10}}>Day {i+1} — main 18</div>
            <select value={d.courseId} onChange={e=>setDay(i,{courseId:e.target.value})}
              style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:10}}>
              {courseOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <Toggle value={d.extra9} onChange={v=>setDay(i,{extra9:v})} label="Extra 9 this day"
              hint="A second team + skins game after the main 18. No individual, no adjustment."/>
            {d.extra9&&(<>
              <select value={d.extraCourseId} onChange={e=>setDay(i,{extraCourseId:e.target.value})}
                style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:10,marginTop:6}}>
                {courseOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <PillRow options={[["front","Front 9"],["back","Back 9"]]} value={d.extraNine} onChange={v=>setDay(i,{extraNine:v})}/>
              <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                <button onClick={()=>setDay(i,{extraIndividual:!d.extraIndividual})}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,background:d.extraIndividual?C.green:C.surface,color:d.extraIndividual?"#0a1a0f":C.muted,border:"1px solid "+(d.extraIndividual?C.green:C.border),cursor:"pointer",fontSize:11,fontWeight:d.extraIndividual?700:500}}>Individual {d.extraIndividual?"on":"off"}</button>
                <button onClick={()=>setDay(i,{extraTeam:!d.extraTeam})}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,background:d.extraTeam?C.green:C.surface,color:d.extraTeam?"#0a1a0f":C.muted,border:"1px solid "+(d.extraTeam?C.green:C.border),cursor:"pointer",fontSize:11,fontWeight:d.extraTeam?700:500}}>Team {d.extraTeam?"on":"off"}</button>
                <button onClick={()=>setDay(i,{extraSkins:!d.extraSkins})}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,background:d.extraSkins?C.green:C.surface,color:d.extraSkins?"#0a1a0f":C.muted,border:"1px solid "+(d.extraSkins?C.green:C.border),cursor:"pointer",fontSize:11,fontWeight:d.extraSkins?700:500}}>Skins {d.extraSkins?"on":"off"}</button>
              </div>
            </>)}
          </div>
        ))}

        <button onClick={saveSetup}
          style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",marginTop:8}}>
          Save setup
        </button>
        {savedMsg&&<div style={{fontSize:13,color:C.gold,marginTop:12,textAlign:"center"}}>{savedMsg}</div>}
        {savedSetup&&onPlay&&(
          <button onClick={()=>onPlay(savedSetup)}
            style={{width:"100%",padding:"16px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",marginTop:12}}>
            ▶ Play this tournament
          </button>
        )}
        {savedList.length > 0 && (
          <div style={{marginTop:24}}>
            <Lbl>Saved on this device</Lbl>
            {savedList.map(s => (
              <div key={s.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{s.name}</div>
                  <div style={{fontSize:12,color:C.muted}}>{s.days} {s.days===1?"day":"days"} · {(s.players||[]).length} players · {s.countingMode==="net"?"Per-hole net":"Count-up"}</div>
                </div>
                <button onClick={()=>loadIntoForm(s)} style={{padding:"10px 14px",background:"transparent",border:"1px solid "+C.border,borderRadius:10,color:C.muted,fontSize:13,fontWeight:600,cursor:"pointer"}}>Edit</button>
                {onPlay&&<button onClick={()=>onPlay(s)} style={{padding:"10px 14px",background:C.gold,border:"none",borderRadius:10,color:"#0a1a0f",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ Play</button>}
              </div>
            ))}
          </div>
        )}

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:20}}>
          <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Setup summary</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.7}}>
            <b style={{color:C.text}}>{name.trim()||"Unnamed tournament"}</b> · {days} {days===1?"day":"days"} · {countingMode==="net"?"Per-hole net":"Count-up from HDCP"}<br/>
            Points: {points.albatross} / {points.eagle} / {points.birdie} / {points.par} / {points.bogey} / {points.double} / {points.worse} (albatross / eagle / birdie / par / bogey / double / worse)<br/>
            Individual {individualOn?"on":"off"} · Teams {teamsOn?"on, "+ballsToCount+" "+(ballsToCount===1?"ball":"balls")+" to count":"off"} · Closest {ctpOn?"on":"off"} · Movement {movementOn?"on":"off"}<br/>
            Players: {namedCount} named · Flights, tees, and starting handicaps fixed at setup; skins switches live on each player.
          </div>
        </div>

        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:20}}>
          ‹ Back to Home
        </button>
      </div>
    </div>
  );
}
