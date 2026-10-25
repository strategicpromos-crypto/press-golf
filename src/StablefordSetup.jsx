import React, { useState, useEffect } from "react";
import { COURSES } from "./golf.js";

// ── STABLEFORD SETUP — v2 (Oct 25, 2026) ─────────────────────────────────────
// Redesign after Michael's "back to the drawing board" call: two layers, not
// one long form. The top layer is all a quick game needs — name, days,
// course, players (name + handicap only), counting mode, skins on/off +
// basis, CTP holes picked exactly like the Outing setup, and teams built by
// tapping names from the player list. Everything the annual tournament
// needs lives in a collapsed "Tournament options" section: flights, tees,
// per-player skins switches, handicap movement, the adjustable points table,
// extra 9. Flights and movement are HIDDEN on 1-day games entirely — they
// are multiday-tournament settings, not a one-day match — and appear when
// days goes to 2 or more. Teams off = a pure individual event (the 5-guys
// "let's play Stableford" case). Saving returns to the home list, where the
// tournament sits with Play — no dead end, no reason to tap Save twice.
//
// Locked design carried over: Stableford only (stroke play deferred);
// counting modes per-hole net / count-up; team score = net Stableford,
// balls to count 1-4 per hole; team skins on the counted total; skins ties
// dead except the team-pot tie switch (v2); handicap movement per day,
// step/caps, main 18 only, never the extra 9; flights never re-flight;
// missed day = 0 points, handicap unchanged. Winner = highest points.

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
    name:"", flight:"B", tee:"", hdcp:12, skins:{...DEFAULT_SKINS},
  };
}

function newDay(courseId) {
  return { courseId: courseId || "south-toledo", extra9:false, extraCourseId: courseId || "south-toledo", extraNine:"front" };
}

export default function StablefordSetup({ onBack, onSaved, editSetup }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(1);
  const [dayList, setDayList] = useState([newDay()]);
  const [countingMode, setCountingMode] = useState("net");
  const [points, setPoints] = useState({...DEFAULT_POINTS});
  // Top layer: skins + CTP + teams.
  const [skinsOn, setSkinsOn] = useState(true);
  const [skinsBasis, setSkinsBasis] = useState("strokes"); // "strokes" | "points"
  const [ctpOn, setCtpOn] = useState(true);
  const [ctpHoles, setCtpHoles] = useState(null); // null = never chosen → Day 1 par-3s
  const [teamsOn, setTeamsOn] = useState(false);
  const [teams, setTeams] = useState([]);
  const [ballsToCount, setBallsToCount] = useState(2);
  const [teamTieCarry, setTeamTieCarry] = useState(false); // team-pot tie switch: dead (off) / carry (on)
  // Tournament options (collapsed): flights + movement only exist on multiday.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [flightsOn, setFlightsOn] = useState(false);
  const [movementOn, setMovementOn] = useState(true);
  const [adjStep, setAdjStep] = useState(3);
  const [adjDownCap, setAdjDownCap] = useState(3);
  const [adjUpCap, setAdjUpCap] = useState(2);
  const [players, setPlayers] = useState([newPlayer(), newPlayer(), newPlayer(), newPlayer()]);
  const [savedSetup, setSavedSetup] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");

  const isMultiday = days > 1;
  const day1Course = COURSES[dayList[0]?.courseId] || COURSES["south-toledo"];
  const day1Par3s = (day1Course?.holes || []).filter(h => h.par === 3).map(h => h.hole);
  const effectiveCtpHoles = ctpHoles ?? day1Par3s;
  const homeLabel = isMultiday ? "Multiday tournament" : "Stableford";

  function toggleCtpHole(n) {
    setCtpHoles(prev => {
      const cur = prev ?? day1Par3s;
      return cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n];
    });
  }

  function changeDays(n) {
    const next = Math.max(1, Math.min(7, n));
    setDays(next);
    setDayList(prev => {
      const base = prev[0]?.courseId || "south-toledo";
      if (next > prev.length) return [...prev, ...Array.from({ length: next - prev.length }, () => newDay(base))];
      return prev.slice(0, next);
    });
  }

  function setPlayer(id, patch) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function togglePlayerTeam(teamId, playerId) {
    setTeams(prev => prev.map(t => {
      if (t.id === teamId) {
        const has = t.playerIds.includes(playerId);
        return { ...t, playerIds: has ? t.playerIds.filter(x => x !== playerId) : [...t.playerIds, playerId] };
      }
      return { ...t, playerIds: t.playerIds.filter(x => x !== playerId) };
    }));
  }

  function loadIntoForm(s) {
    setName(s.name || "");
    setDays(s.days || (s.dayList || []).length || 1);
    setDayList((s.dayList || [newDay()]).map(d => ({ courseId: d.courseId || "south-toledo", extra9: d.extra9 || false, extraCourseId: d.extraCourseId || d.courseId || "south-toledo", extraNine: d.extraNine || "front" })));
    setCountingMode(s.countingMode || "net");
    setPoints({ ...DEFAULT_POINTS, ...(s.points || {}) });
    setSkinsOn(s.skinsOn !== false);
    setSkinsBasis(s.skinsBasis || "strokes");
    setCtpOn(s.ctpOn !== false);
    setCtpHoles(s.ctpHoles !== undefined ? s.ctpHoles : null);
    setTeamsOn(s.teamsOn === true);
    setTeams((s.teams || []).map((t, i) => ({ id: t.id || "t_"+i, name: t.name || ("Team " + (i + 1)), playerIds: t.playerIds || [] })));
    setBallsToCount(s.ballsToCount || 2);
    setTeamTieCarry(s.teamTieCarry === true);
    setFlightsOn(s.flightsOn === true);
    setMovementOn(s.movementOn !== false);
    setAdjStep(s.adjStep || 3);
    setAdjDownCap(s.adjDownCap || 3);
    setAdjUpCap(s.adjUpCap || 2);
    setPlayers((s.players || []).map(p => ({ ...newPlayer(), ...p, skins: { ...DEFAULT_SKINS, ...(p.skins || {}) } })));
    setSavedSetup(s);
    setSavedMsg("");
  }

  // Edit flow: App remounts this screen (via key) with the setup to edit.
  useEffect(() => { if (editSetup) loadIntoForm(editSetup); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function saveSetup() {
    const named = players.filter(p => p.name.trim().length > 0);
    if (!name.trim()) { window.alert("Give the tournament a name first."); return; }
    if (named.length === 0) { window.alert("Add at least one player first."); return; }
    if (teamsOn) {
      if (teams.length === 0) { window.alert("Add at least one team, or turn Teams off for an individual event."); return; }
      if (teams.some(t => t.playerIds.length === 0)) { window.alert("Every team needs at least one player — tap names into each team."); return; }
    }
    const setup = {
      id: savedSetup ? savedSetup.id : "stableford_"+Date.now(),
      createdAt: savedSetup ? savedSetup.createdAt : new Date().toISOString(),
      name:name.trim(), days, dayList, countingMode, points,
      skinsOn, skinsBasis, ctpOn, ctpHoles: effectiveCtpHoles,
      teamsOn, teams: teamsOn ? teams : [], ballsToCount, teamTieCarry,
      flightsOn: isMultiday ? flightsOn : false,
      movementOn: isMultiday ? movementOn : false,
      adjStep, adjDownCap, adjUpCap,
      players: named.map(p => ({ ...p, name: p.name.trim() })),
    };
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      const idx = prev.findIndex(s => s.id === setup.id);
      const next = idx >= 0 ? prev.map(s => s.id === setup.id ? setup : s) : [setup, ...prev];
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setSavedSetup(setup);
      // Home is the hub now: saving returns to the home list, where this
      // tournament sits with Play. No dead end, no tap-twice pileup.
      if (onSaved) { onSaved(setup); return; }
      setSavedMsg("Saved on this device.");
    } catch {
      setSavedMsg("Could not save on this device.");
    }
  }

  const namedCount = players.filter(p => p.name.trim()).length;
  const unassigned = teamsOn ? players.filter(p => p.name.trim() && !teams.some(t => t.playerIds.includes(p.id))) : [];

  return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.green,fontSize:14,fontWeight:700,cursor:"pointer",padding:0,marginBottom:16}}>‹ Back to Home</button>
        <div style={{fontSize:26,fontWeight:800,marginBottom:4}}>{editSetup ? "Edit Stableford" : "Stableford setup"}</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>
          {isMultiday ? "This will show on home as a Multiday tournament." : "This will show on home as Stableford."} Teams off means a pure individual event.
        </div>

        <Lbl>Tournament name</Lbl>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Sunday Stableford"
          style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>

        <Lbl>How many days?</Lbl>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>changeDays(days-1)} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
          <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800}}>{days} {days===1?"day":"days"}</div>
          <button onClick={()=>changeDays(days+1)} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
        </div>

        {dayList.map((d, i) => (
          <div key={i}>
            <Lbl>{days === 1 ? "Course" : "Day " + (i + 1) + " course"}</Lbl>
            <select value={d.courseId} onChange={e=>setDayList(prev => prev.map((x, j) => j === i ? { ...x, courseId: e.target.value } : x))}
              style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"}}>
              {Object.entries(COURSES).map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
            </select>
          </div>
        ))}

        <Lbl>Scoring — counting mode</Lbl>
        <PillRow
          options={[["net","Per-hole net"],["countup","Count-up from HDCP"]]}
          value={countingMode} onChange={setCountingMode}/>
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>
          {countingMode==="net"
            ? "Strokes land on the hardest holes by course handicap rank, and points are net Stableford per hole."
            : "Your handicap is your starting points (an 8 starts at 8), then gross points add up from there. No per-hole net strokes."}
        </div>

        <Lbl>Players — {namedCount} named</Lbl>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Name and handicap only. Flights and tees live in Tournament options, and only for multiday tournaments.</div>
        {players.map((p) => (
          <div key={p.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input value={p.name} onChange={e=>setPlayer(p.id,{name:e.target.value})} placeholder="Player name"
                style={{flex:1,padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
              <button onClick={()=>setPlayers(prev => prev.filter(x => x.id !== p.id))}
                style={{background:"transparent",border:"none",color:C.red,fontSize:18,fontWeight:700,cursor:"pointer",padding:"8px"}}>✕</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
              <span style={{fontSize:12,color:C.muted}}>HDCP</span>
              <button onClick={()=>setPlayer(p.id,{hdcp:Math.max(0,p.hdcp-1)})} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
              <div style={{fontSize:18,fontWeight:800,minWidth:32,textAlign:"center"}}>{p.hdcp}</div>
              <button onClick={()=>setPlayer(p.id,{hdcp:Math.min(36,p.hdcp+1)})} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
            </div>
          </div>
        ))}
        <button onClick={()=>setPlayers(prev => [...prev, newPlayer()])}
          style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.green,fontSize:14,fontWeight:700,cursor:"pointer"}}>
          + Add Player
        </button>

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"6px 16px",marginTop:16}}>
          <Toggle value={teamsOn} onChange={setTeamsOn} label="Teams"
            hint="Off = pure individual event. On = build teams by tapping names below."/>
          <Toggle value={skinsOn} onChange={setSkinsOn} label="Skins"
            hint="One field pot when flights are off; flight pots return when flights are on."/>
          <Toggle value={ctpOn} onChange={setCtpOn} label="Closest to the pin"
            hint="Tap the holes below to mark them CTP, same as the Outing setup. Par-3s are preselected until you change them."/>
        </div>

        {teamsOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Balls to count per hole</div>
            <PillRow options={[["1","1 ball"],["2","2 balls"],["3","3 balls"],["4","4 balls"]]}
              value={String(ballsToCount)} onChange={v=>setBallsToCount(parseInt(v,10))}/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>On each hole, the team's score is the sum of its best {ballsToCount} Stableford scores. Team skins run off that same total.</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
              <span style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Team skins — ties</span>
              <PillRow options={[["dead","Dead"],["carry","Carry"]]} value={teamTieCarry ? "carry" : "dead"} onChange={v=>setTeamTieCarry(v === "carry")}/>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>Dead: a tied hole is gone. Carry: a tied hole's skin rolls into the next hole's pot. Field and flight skins are always dead.</div>
            {teams.map((t) => (
              <div key={t.id} style={{marginTop:14,borderTop:"1px solid "+C.dim,paddingTop:12}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                  <input value={t.name} onChange={e=>setTeams(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                    style={{flex:1,padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
                  <button onClick={()=>setTeams(prev => prev.filter(x => x.id !== t.id))}
                    style={{background:"transparent",border:"none",color:C.red,fontSize:18,fontWeight:700,cursor:"pointer",padding:"8px"}}>✕</button>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {players.filter(p => p.name.trim()).map(p => {
                    const inTeam = t.playerIds.includes(p.id);
                    const elsewhere = !inTeam && teams.some(x => x.id !== t.id && x.playerIds.includes(p.id));
                    return (
                      <button key={p.id} onClick={()=>togglePlayerTeam(t.id, p.id)}
                        style={{padding:"8px 12px",borderRadius:20,background:inTeam?C.gold:elsewhere?C.dim:C.surface,color:inTeam?"#0a1a0f":elsewhere?C.muted:C.text,border:"1px solid "+(inTeam?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:inTeam?700:500,opacity:elsewhere?0.5:1}}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {players.filter(p => p.name.trim()).length === 0 && <div style={{fontSize:12,color:C.muted}}>Name players above first, then tap them into teams.</div>}
              </div>
            ))}
            <button onClick={()=>setTeams(prev => [...prev, { id:"t_"+Date.now(), name:"Team "+(prev.length+1), playerIds:[] }])}
              style={{width:"100%",padding:"12px",background:"transparent",border:"1px solid "+C.border,borderRadius:10,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer",marginTop:14}}>
              + Add Team
            </button>
            {unassigned.length > 0 && <div style={{fontSize:12,color:C.muted,marginTop:10}}>Not on a team (still play individual): {unassigned.map(p => p.name).join(", ")}</div>}
          </div>
        )}

        {skinsOn && (
          <div style={{marginTop:12}}>
            <Lbl>Skins — basis</Lbl>
            <PillRow options={[["strokes","Stroke based"],["points","Point based"]]} value={skinsBasis} onChange={setSkinsBasis}/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>
              {skinsBasis==="strokes"
                ? "Gross and net pots, lowest score wins the hole. Ties are dead, never carried."
                : "Most Stableford points on the hole wins the skin — net points in net mode, gross points in count-up. One field pot, plus a team pot when teams are on. Ties in the field pot are dead."}
            </div>
          </div>
        )}

        {ctpOn && (
          <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:12,padding:"14px 16px",marginTop:12}}>
            <div style={{fontWeight:700,fontSize:13,color:C.gold,marginBottom:4}}>📍 Select CTP Holes</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Same as the Outing setup: tap to mark a hole as Closest to the Pin. Par 3s recommended. These holes apply to every day's main 18.</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {(day1Course?.holes || []).slice(0, 18).map(h => {
                const isSelected = effectiveCtpHoles.includes(h.hole);
                const isPar3 = h.par === 3;
                return (
                  <button key={h.hole} onClick={()=>toggleCtpHole(h.hole)}
                    style={{width:52,height:52,borderRadius:10,background:isSelected?C.gold:"rgba(255,255,255,0.06)",color:isSelected?"#0a1a0f":isPar3?C.gold:C.muted,border:"2px solid "+(isSelected?C.gold:isPar3?"rgba(232,184,75,0.4)":"rgba(255,255,255,0.15)"),fontWeight:isSelected?800:600,fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
                    <span style={{fontSize:15,fontWeight:800}}>{h.hole}</span>
                    <span style={{fontSize:8,opacity:0.8}}>P{h.par}</span>
                  </button>
                );
              })}
            </div>
            {effectiveCtpHoles.length > 0 && (
              <div style={{marginTop:12,fontSize:12,color:C.gold}}>
                📍 CTP on holes: {[...effectiveCtpHoles].sort((a, b) => a - b).join(", ")} · Enter distance on the scoring screen
              </div>
            )}
          </div>
        )}

        <button onClick={()=>setOptionsOpen(!optionsOpen)}
          style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",marginTop:20}}>
          {optionsOpen ? "▾ Tournament options" : "▸ Tournament options"}
          <span style={{color:C.muted,fontWeight:500}}> — flights, movement, points, extra 9</span>
        </button>
        {optionsOpen && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
            {!isMultiday && (
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Flights and handicap movement are multiday-tournament settings — they appear here when days is 2 or more.</div>
            )}
            {isMultiday && (
              <>
                <Toggle value={flightsOn} onChange={setFlightsOn} label="Flights"
                  hint="Players are flighted A / B / C at setup and never re-flighted, even as handicaps move."/>
                <Toggle value={movementOn} onChange={setMovementOn} label="Handicap movement"
                  hint="After each day's main 18, handicaps move for the next day. The extra 9 never moves a handicap."/>
                {movementOn && (
                  <div style={{marginTop:8}}>
                    <Stepper label="Points per 1 handicap stroke" value={adjStep} onChange={setAdjStep} min={1} max={5}/>
                    <Stepper label="Max down per day" value={adjDownCap} onChange={setAdjDownCap} min={1} max={5}/>
                    <Stepper label="Max up per day" value={adjUpCap} onChange={setAdjUpCap} min={1} max={5}/>
                    <div style={{fontSize:11,color:C.muted}}>Par points for 18 holes is 36. Every {adjStep} points over 36 moves a player down a stroke (max {adjDownCap} per day); every {adjStep} under moves them up (max {adjUpCap} per day).</div>
                  </div>
                )}
              </>
            )}
            {flightsOn && isMultiday && (
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Flights & tees</div>
                {players.filter(p => p.name.trim()).map(p => (
                  <div key={p.id} style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
                    <span style={{flex:1,fontSize:14}}>{p.name}</span>
                    <PillRow options={[["A","A"],["B","B"],["C","C"]]} value={p.flight} onChange={v=>setPlayer(p.id,{flight:v})}/>
                    <input value={p.tee} onChange={e=>setPlayer(p.id,{tee:e.target.value})} placeholder="Tee"
                      style={{width:70,padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>
            )}
            {skinsOn && flightsOn && isMultiday && (
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Skins per player</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Turn pots off per player. With flights off, everyone is in the field pot.</div>
                {players.filter(p => p.name.trim()).map(p => (
                  <div key={p.id} style={{marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{p.name}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[["grossField","Gross field"],["grossFlight","Gross flight"],["netField","Net field"],["netFlight","Net flight"]].map(([key, label]) => (
                        <button key={key} onClick={()=>setPlayer(p.id,{skins:{...p.skins,[key]:!p.skins[key]}})}
                          style={{padding:"8px 12px",borderRadius:20,background:p.skins[key]?C.gold:C.surface,color:p.skins[key]?"#0a1a0f":C.muted,border:"1px solid "+(p.skins[key]?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:p.skins[key]?700:500}}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Points table — adjustable</div>
              <Stepper label="Albatross (3 under)" value={points.albatross} onChange={v=>setPoints(p=>({...p,albatross:v}))} min={0} max={10}/>
              <Stepper label="Eagle (2 under)" value={points.eagle} onChange={v=>setPoints(p=>({...p,eagle:v}))} min={0} max={10}/>
              <Stepper label="Birdie (1 under)" value={points.birdie} onChange={v=>setPoints(p=>({...p,birdie:v}))} min={0} max={10}/>
              <Stepper label="Par" value={points.par} onChange={v=>setPoints(p=>({...p,par:v}))} min={0} max={5}/>
              <Stepper label="Bogey (1 over)" value={points.bogey} onChange={v=>setPoints(p=>({...p,bogey:v}))} min={0} max={5}/>
              <Stepper label="Double bogey (2 over)" value={points.double} onChange={v=>setPoints(p=>({...p,double:v}))} min={-2} max={2}/>
              <Stepper label="Worse than double" value={points.worse} onChange={v=>setPoints(p=>({...p,worse:v}))} min={-5} max={0}/>
            </div>
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Extra 9 per day</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Team + skins only, never individual, never handicap movement.</div>
              {dayList.map((d, i) => (
                <div key={i} style={{marginBottom:10}}>
                  <Toggle value={d.extra9} onChange={v=>setDayList(prev => prev.map((x, j) => j === i ? { ...x, extra9: v } : x))}
                    label={days === 1 ? "Extra 9" : "Day " + (i + 1) + " extra 9"}/>
                  {d.extra9 && (
                    <div>
                      <select value={d.extraCourseId} onChange={e=>setDayList(prev => prev.map((x, j) => j === i ? { ...x, extraCourseId: e.target.value } : x))}
                        style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:8}}>
                        {Object.entries(COURSES).map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
                      </select>
                      <PillRow options={[["front","Front 9"],["back","Back 9"]]} value={d.extraNine} onChange={v=>setDayList(prev => prev.map((x, j) => j === i ? { ...x, extraNine: v } : x))}/>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={saveSetup}
          style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",marginTop:20}}>
          Save {homeLabel}
        </button>
        {savedMsg&&<div style={{fontSize:13,color:C.gold,marginTop:12,textAlign:"center"}}>{savedMsg}</div>}

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:20}}>
          <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Setup summary</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
            {name || "(no name yet)"} · {homeLabel} · {days} {days===1?"day":"days"}<br/>
            {countingMode==="net"?"Per-hole net":"Count-up from HDCP"} · Points {points.albatross}/{points.eagle}/{points.birdie}/{points.par}/{points.bogey}/{points.double}/{points.worse}<br/>
            {teamsOn ? "Teams on, "+ballsToCount+" "+(ballsToCount===1?"ball":"balls")+" to count" : "Individual event, no teams"} · Skins {skinsOn ? (skinsBasis==="strokes"?"on, stroke based":"on, point based") : "off"} · Closest {ctpOn?(effectiveCtpHoles.length>0?"on holes "+[...effectiveCtpHoles].sort((a,b)=>a-b).join(", "):"on, no holes picked"):"off"}<br/>
            {isMultiday ? "Flights "+(flightsOn?"on":"off")+" · Movement "+(movementOn?"on":"off")+" · " : ""}Players: {namedCount} named
          </div>
        </div>

        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:20}}>
          ‹ Back to Home
        </button>
      </div>
    </div>
  );
}
