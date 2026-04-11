import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function scoreName(s, par) {
  if (s === null) return "";
  const d = s - par;
  if (d <= -2) return "Eagle 🦅";
  if (d === -1) return "Birdie 🐦";
  if (d === 0)  return "Par";
  if (d === 1)  return "Bogey";
  if (d === 2)  return "Double";
  return "+" + d;
}

function scoreColor(s, par) {
  if (s === null) return C.muted;
  const d = s - par;
  if (d <= -1) return C.green;
  if (d >= 1)  return C.red;
  return C.muted;
}

export default function OpponentScoreEntry({ roundId, playerId, onBack }) {
  const [round,       setRound]       = useState(null);
  const [scores,      setScores]      = useState({});
  const [currentHole, setCurrentHole] = useState(1);
  const [saveStatus,  setSaveStatus]  = useState("");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [isIOS]       = useState(()=>/iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isInstalled] = useState(()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall,   setShowInstall]   = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    load();
    // Install prompt
    const handler = e => { e.preventDefault(); setInstallPrompt(e); if(!isInstalled) setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    if (isIOS && !isInstalled) setShowInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from("live_rounds").select("*").eq("id", roundId).single();
    if (error || !data) { setError("Round not found. Check your link."); setLoading(false); return; }
    setRound(data);
    // Load existing scores for this player
    const existing = data.scores?.[playerId] || {};
    setScores(existing);
    setCurrentHole(data.current_hole || 1);
    setLoading(false);
  }

  // Save this player's scores back to the round
  function saveScore(hole, val) {
    const updated = { ...scores, [hole]: val };
    setScores(updated);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // Read current DB state first, then merge just this player's scores
      const { data } = await sb.from("live_rounds").select("scores").eq("id", roundId).single();
      const allScores = { ...(data?.scores || {}), [playerId]: updated };
      await sb.from("live_rounds").update({ scores: allScores, updated_at: new Date().toISOString() }).eq("id", roundId);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    }, 800);
  }

  if (loading) return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:`3px solid ${C.dim}`, borderTop:`3px solid ${C.green}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ color:C.muted }}>Loading round...</div>
    </div>
  );

  if (error) return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⛳</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.red, marginBottom:8 }}>Oops</div>
        <div style={{ fontSize:14, color:C.muted }}>{error}</div>
      </div>
    </div>
  );

  const opp = round?.opponents?.find(o => o.playerId === playerId);
  const course = COURSES[round?.course_id || "south-toledo"];
  const holeData = course?.holes[currentHole - 1];
  const myScore = scores[currentHole] ?? null;
  const isLastHole = currentHole === course?.holes?.length;

  if (!opp || !holeData) return null;

  const holesPlayed = Object.keys(scores).filter(h => scores[h] !== null).length;

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:100 }}>

      {/* Install Banner */}
      {showInstall && !isInstalled && (
        <div style={{ background:"linear-gradient(135deg,rgba(123,180,80,0.15),rgba(123,180,80,0.08))", borderBottom:`1px solid ${C.green}44`, padding:"12px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:13, color:C.green }}>⛳ Add Press to your home screen</div>
              {isIOS
                ? <div style={{ fontSize:11, color:C.muted }}>Tap <b style={{color:C.text}}>Share ↑</b> → Add to Home Screen</div>
                : <div style={{ fontSize:11, color:C.muted }}>Works like a native app — free</div>}
            </div>
            {!isIOS && installPrompt
              ? <button onClick={async()=>{installPrompt.prompt();const r=await installPrompt.userChoice;if(r.outcome==="accepted"){setShowInstall(false);setInstallPrompt(null);}}} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer" }}>Install</button>
              : <button onClick={()=>setShowInstall(false)} style={{ background:"transparent", border:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"44px 16px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):null}
            style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:currentHole>1?C.green:C.dim, fontSize:13, cursor:currentHole>1?"pointer":"default", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>Hole</div>
            <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{currentHole}</div>
            <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            {saveStatus && <div style={{ fontSize:10, color:saveStatus==="saving"?C.gold:C.green, marginTop:2 }}>{saveStatus==="saving"?"💾 Saving...":"✓ Saved"}</div>}
          </div>
          <button onClick={()=>setCurrentHole(h=>Math.min(course.holes.length,h+1))}
            style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>›</button>
        </div>
        {/* Progress */}
        <div style={{ display:"flex", gap:2 }}>
          {course.holes.map(h=>(
            <div key={h.hole} style={{ flex:1, height:4, borderRadius:2, background:scores[h.hole]!==undefined?C.green:h.hole===currentHole?C.gold:C.dim }}/>
          ))}
        </div>
      </div>

      {/* Player + round info */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>{opp.name}</div>
          <div style={{ fontSize:12, color:C.muted }}>{round.course_name} · {holesPlayed} holes entered</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:C.muted }}>vs</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.green }}>{round.opponents?.find(o=>o.playerId!==playerId)?.name || "Partner"}</div>
        </div>
      </div>

      <div style={{ padding:"16px" }}>

        {/* Hole selector */}
        <div style={{ display:"flex", overflowX:"auto", gap:6, marginBottom:16, paddingBottom:4 }}>
          {course.holes.map(h=>{
            const entered = scores[h.hole] !== undefined;
            return(
              <button key={h.hole} onClick={()=>setCurrentHole(h.hole)} style={{
                flexShrink:0, width:36, height:36, borderRadius:"50%", fontSize:12, fontWeight:700, cursor:"pointer",
                background: h.hole===currentHole?C.gold:entered?"rgba(123,180,80,0.15)":C.dim,
                color: h.hole===currentHole?"#0a1a0f":entered?C.green:C.muted,
                border:`1px solid ${h.hole===currentHole?C.gold:entered?C.green:C.border}`
              }}>{h.hole}</button>
            );
          })}
        </div>

        {/* Score entry */}
        <div style={{ background:C.card, border:`2px solid ${C.green}`, borderRadius:16, padding:"20px", marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.green, letterSpacing:2, textTransform:"uppercase", marginBottom:16, fontWeight:600 }}>Your Score — Hole {currentHole}</div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <button onClick={()=>saveScore(currentHole, myScore!==null?Math.max(1,myScore-1):holeData.par-1)}
              style={{ width:64, height:64, borderRadius:"50%", background:C.dim, border:`1px solid ${C.border}`, color:C.text, fontSize:32, fontWeight:700, cursor:"pointer" }}>−</button>
            <div style={{ flex:1, textAlign:"center" }}>
              <div style={{ fontSize:72, fontWeight:800, color:myScore!==null?C.text:C.muted, lineHeight:1 }}>
                {myScore !== null ? myScore : "—"}
              </div>
              {myScore !== null && (
                <div style={{ fontSize:14, fontWeight:700, color:scoreColor(myScore, holeData.par), marginTop:4 }}>
                  {scoreName(myScore, holeData.par)}
                </div>
              )}
              {myScore === null && <div style={{ fontSize:13, color:C.muted, marginTop:8 }}>tap + to enter your score</div>}
            </div>
            <button onClick={()=>saveScore(currentHole, myScore!==null?myScore+1:holeData.par)}
              style={{ width:64, height:64, borderRadius:"50%", background:C.dim, border:`1px solid ${C.border}`, color:C.text, fontSize:32, fontWeight:700, cursor:"pointer" }}>+</button>
          </div>
        </div>

        {/* Next hole */}
        <button onClick={()=>!isLastHole&&setCurrentHole(h=>h+1)} disabled={isLastHole||myScore===null}
          style={{ width:"100%", padding:"18px", background:isLastHole?"#1a2a1a":myScore===null?"#1a2a1a":C.green, color:isLastHole||myScore===null?C.muted:"#0a1a0f", border:"none", borderRadius:14, fontSize:17, fontWeight:800, cursor:isLastHole||myScore===null?"not-allowed":"pointer", marginBottom:12 }}>
          {isLastHole?"Round Complete! ⛳":myScore===null?"Enter score first":` Next — Hole ${currentHole+1}`}
        </button>

        <div style={{ textAlign:"center", fontSize:12, color:C.dim, marginTop:8 }}>
          Scores sync instantly to your partner's phone
        </div>
      </div>
    </div>
  );
}
