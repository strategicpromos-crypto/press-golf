import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES, getStrokeHoles, calcAutoPressNassau } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function safeInt(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function ScoreButton({ label, onClick, size=52 }) {
  return (
    <button onClick={onClick} style={{
      width:size, height:size, borderRadius:"50%",
      background:C.dim, border:"1px solid "+C.border,
      color:C.text, fontSize:size > 48 ? 32 : 26,
      fontWeight:700, cursor:"pointer", flexShrink:0,
      WebkitTapHighlightColor:"transparent", userSelect:"none",
    }}>{label}</button>
  );
}

function BigBtn({ children, onClick, color=C.green, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", padding:"16px", background:disabled?"#333":color,
      color:disabled?C.muted:"#0a1a0f", border:"none", borderRadius:12,
      fontSize:15, fontWeight:700, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.6:1, fontFamily:"Georgia,serif"
    }}>{children}</button>
  );
}

function GhostBtn({ children, onClick, color=C.green }) {
  return (
    <button onClick={onClick} style={{
      width:"100%", padding:"14px", background:"transparent",
      color, border:"1.5px solid "+color, borderRadius:12,
      fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Georgia,serif"
    }}>{children}</button>
  );
}

function scoreName(score, par) {
  if (score <= par-2) return "Eagle";
  if (score === par-1) return "Birdie";
  if (score === par)   return "Par";
  if (score === par+1) return "Bogey";
  return score > par ? "+"+(score-par) : ""+(score-par);
}
function scoreColor(score, par) {
  if (score < par) return C.green;
  if (score > par) return C.red;
  return C.muted;
}

// ── Game calculations (from LiveRound) ───────────────────────────────────────
function getTally(scores, course, opp, courseId) {
  const absStrokes = Math.abs(opp.strokes || 0);
  const strokeHoles = getStrokeHoles(courseId || "south-toledo", absStrokes);
  const myStrokeHoles  = opp.strokes < 0 ? strokeHoles : [];
  const oppStrokeHoles = opp.strokes > 0 ? strokeHoles : [];
  const myScores  = scores["me"]         || {};
  const oppScores = scores[opp.playerId] || {};

  if (opp.betType === "match") {
    let upDown = 0, played = 0;
    for (const h of course.holes) {
      const my = safeInt(myScores[h.hole], -1);
      const op = safeInt(oppScores[h.hole], -1);
      if (my < 0 || op < 0) continue;
      played++;
      const myNet  = myStrokeHoles.includes(h.hole)  ? my-1 : my;
      const oppNet = oppStrokeHoles.includes(h.hole) ? op-1 : op;
      if (myNet < oppNet) upDown++;
      else if (myNet > oppNet) upDown--;
    }
    const label = upDown===0?"Even":upDown>0?upDown+" Up":Math.abs(upDown)+" Down";
    return { label, upDown, played, total: upDown * opp.betAmount };
  }

  if (opp.betType === "nassau" || opp.betType === "nassau-press") {
    const r = calcAutoPressNassau(
      { me: myScores, opp: oppScores },
      course.holes, myStrokeHoles, oppStrokeHoles,
      opp.betAmount,
      opp.betType==="nassau-press" ? (opp.pressDown||2) : 99,
      opp.manualPresses || []
    );
    function pressLabel(side) {
      if (!side?.bets?.length) return "-";
      return side.bets.map((b,i) => {
        const sym = b.diff<0?(Math.abs(b.diff)+"v"):b.diff>0?(b.diff+"^"):"E";
        return i===0?sym:"P"+sym;
      }).join(" / ");
    }
    return { label:"F: "+pressLabel(r.front)+" | B: "+pressLabel(r.back), total:r.net, pressDetail:r };
  }

  if (opp.betType === "skins") {
    let mySkins=0, oppSkins=0, carry=0, net=0;
    for (const h of course.holes) {
      const my = safeInt(myScores[h.hole], -1);
      const op = safeInt(oppScores[h.hole], -1);
      if (my<0||op<0) continue;
      const myNet  = myStrokeHoles.includes(h.hole)  ? my-1 : my;
      const oppNet = oppStrokeHoles.includes(h.hole) ? op-1 : op;
      const pot = opp.betAmount + carry;
      if (myNet<oppNet)      { mySkins++; net+=pot;  carry=0; }
      else if (myNet>oppNet) { oppSkins++; net-=pot; carry=0; }
      else                   { carry+=opp.betAmount; }
    }
    const label = mySkins===oppSkins?"Even":mySkins>oppSkins?"You "+mySkins+"-"+oppSkins:opp.name.split(" ")[0]+" "+oppSkins+"-"+mySkins;
    return { label, total:net };
  }

  return { label:"-", total:0 };
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
// Props mirror TourneyCaptain: roundData=initialRound (full DB row), onBack, onDelete, onPostToLedger
export default function IndividualRound({ user, players, roundData: initialRound, onBack, onDelete, onPostToLedger }) {
  // ── Screen state — "setup" for new rounds, "scoring" for resume (mirrors TeamTournament) ──
  const [screen,      setScreen]      = useState(initialRound ? "scoring" : "setup");

  // ── Setup screen state ─────────────────────────────────────────────────────
  const [courseId,    setCourseId]    = useState(initialRound?.course_id || "south-toledo");
  const [myName,      setMyName]      = useState("");
  const [opponents,   setOpponents]   = useState(initialRound?.opponents || []);
  const [addSheet,    setAddSheet]    = useState(false);
  const [addOppId,    setAddOppId]    = useState("");
  const [addStrokes,  setAddStrokes]  = useState("0");
  const [addStrokesDir,setAddStrokesDir]=useState("even");
  const [addBetType,  setAddBetType]  = useState("nassau");
  const [addPressDown,setAddPressDown]=useState(2);
  const [addBetAmt,   setAddBetAmt]   = useState("5");
  const [addSameGroup,setAddSameGroup]=useState(true);
  const creatingRef = useRef(false);

  // ── Scoring screen state ───────────────────────────────────────────────────
  const [round,       setRound]       = useState(initialRound || null);
  const [currentHole, setCurrentHole] = useState(initialRound?.current_hole || 1);
  const [liveTab,     setLiveTab]     = useState("score");
  const [saveStatus,  setSaveStatus]  = useState("");
  const [posting,     setPosting]     = useState(false);
  const [showSettings,setShowSettings]= useState(false);
  const [showShare,   setShowShare]    = useState(false);
  const [back9Adj,    setBack9Adj]    = useState(initialRound?.back9_adjustments || {});

  // ── TourneyCaptain-identical refs and connection state ─────────────────────
  const saveTimer    = useRef(null);
  const subRef       = useRef(null);
  const pollTimer    = useRef(null);
  const pendingData  = useRef(null);
  const lastConfirmed= useRef(null);
  const [connStatus, setConnStatus]  = useState("connecting");
  const isWriter     = useRef(false);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [claiming,   setClaiming]    = useState(false);

  // ── Derived from round state (scoring screen only) ────────────────────────
  const scores    = round?.scores    || {};
  const holePars  = round?.hole_pars || {};
  const course    = COURSES[courseId];
  const holeData  = course?.holes[currentHole - 1];
  const effPar    = holeData ? (holePars[currentHole] ?? holeData.par) : 4;
  const isLastHole= currentHole === (course?.holes?.length || 18);

  // Back 9 stroke adjustment — adds/removes strokes on holes 10-18 for each opponent
  // back9Adj = { [playerId]: +1 | -1 | 0 }  positive = they get extra strokes, negative = you get extra
  function getEffectiveStrokes(opp, hole) {
    const base = opp.strokes || 0;
    const adj  = back9Adj[opp.playerId] || 0;
    const isBack9 = course?.holes?.find(h=>h.hole===hole)?.side === "back";
    if(!isBack9 || adj === 0) return base;
    // adj is per-side so multiply by 2 for total — but apply proportionally via stroke holes
    // Simpler: just add adj directly to strokes for back 9 stroke hole calculation
    return base + (adj * 2); // adj is per-side strokes, *2 = total strokes adjustment
  }

  // ── Writer lock — per round (not per team) ─────────────────────────────────
  const localKey = "press_individual_" + (round?.id || "new");

  // ── Subscription — identical to TourneyCaptain ────────────────────────────
  function startSubscription() {
    if(subRef.current) sb.removeChannel(subRef.current);
    subRef.current = sb
      .channel("individual_" + (round?.id||"none"))
      .on("postgres_changes", {event:"UPDATE", schema:"public", table:"live_rounds", filter:"id=eq."+(round?.id||"none")},
        payload => { if(payload.new) setRound(prev => ({...prev, ...payload.new, scores: payload.new.scores || prev.scores})); })
      .subscribe(status => {
        if(status === "SUBSCRIBED") {
          if(pendingData.current) { setConnStatus("syncing"); flushSave(pendingData.current); }
          else setConnStatus("online");
        } else if(status==="CLOSED"||status==="CHANNEL_ERROR"||status==="TIMED_OUT") {
          setConnStatus(prev => prev==="online"?"offline":prev);
          setTimeout(() => startSubscription(), 3000);
        }
      });
  }

  function startPolling() {
    if(!round?.id) return; // no round yet
    if(pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const{data} = await sb.from("live_rounds").select("*").eq("id", round?.id).single();
        if(data) setRound(prev => ({...prev, ...data, scores: data.scores || prev.scores}));
        setConnStatus("online");
      } catch(e) { setConnStatus("offline"); }
    }, 30000);
  }

  // ── Writer token — identical pattern to TourneyCaptain ────────────────────
  async function claimWriterToken(token) {
    const{error} = await sb.from("live_rounds").update({writer_token: token, updated_at: new Date().toISOString()}).eq("id", round?.id);
    return !error;
  }

  async function reclaimWriter() {
    setClaiming(true);
    const newToken = Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6);
    const ok = await claimWriterToken(newToken);
    if(ok) { localStorage.setItem(localKey, newToken); isWriter.current=true; setReadOnlyMode(false); }
    setClaiming(false);
  }

  // ── Mount effect — identical to TourneyCaptain ────────────────────────────
  useEffect(() => {
    if(!round?.id) return; // no round yet — skip writer init and subscription
    async function initWriter() {
      const myLocalToken = localStorage.getItem(localKey);
      const{data} = await sb.from("live_rounds").select("writer_token").eq("id", round?.id).single();
      const sbToken = data?.writer_token || null;

      if(!sbToken) {
        const newToken = Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6);
        localStorage.setItem(localKey, newToken);
        isWriter.current = true;
        await claimWriterToken(newToken);
      } else if(myLocalToken && myLocalToken === sbToken) {
        isWriter.current = true;
      } else {
        isWriter.current = false;
        setReadOnlyMode(true);
      }
    }

    initWriter();
    startSubscription();
    startPolling();

    function handleVisibility() {
      if(document.visibilityState === "visible") {
        setConnStatus(prev => { if(prev==="offline") { startSubscription(); return "connecting"; } return prev; });
        if(pendingData.current) flushSave(pendingData.current);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if(subRef.current) sb.removeChannel(subRef.current);
      if(pollTimer.current) clearInterval(pollTimer.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [round?.id]);

  // ── flushSave — identical to TourneyCaptain ───────────────────────────────
  async function flushSave(dataToSave) {
    if(!isWriter.current || !round?.id) return;
    try {
      await sb.from("live_rounds").update({
        scores: dataToSave.scores,
        opponents: dataToSave.opponents,
        current_hole: dataToSave.current_hole,
        back9_adjustments: back9Adj,
        updated_at: new Date().toISOString(),
      }).eq("id", round?.id);
      pendingData.current = null;
      lastConfirmed.current = Date.now();
      setConnStatus(prev => (prev==="offline"||prev==="syncing")?"online":prev);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch(e) {
      setConnStatus("offline");
      setTimeout(() => startSubscription(), 3000);
    }
  }

  function scheduleSync(updatedRound) {
    pendingData.current = updatedRound;
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => flushSave(updatedRound), 800);
  }

  // ── Score helpers ─────────────────────────────────────────────────────────
  function setScore(playerId, hole, rawVal) {
    const val = Math.max(1, Math.min(15, safeInt(rawVal, 1)));
    const newScores = {
      ...scores,
      [playerId]: { ...(scores[playerId]||{}), [hole]: val }
    };
    const updated = { ...round, scores: newScores };
    setRound(updated);
    scheduleSync({ scores: newScores, opponents, current_hole: currentHole });
  }

  function getScore(playerId, hole) {
    const v = scores[playerId]?.[hole];
    return (v===undefined||v===null) ? null : safeInt(v, null);
  }

  function callManualPress(oppId) {
    // Safety: only allow press for same-group opponents
    const target = opponents.find(o => o.playerId===oppId);
    if(!target?.sameGroup) return;
    const newOpps = opponents.map(opp => {
      if(opp.playerId !== oppId) return opp;
      if((opp.manualPresses||[]).some(p => p.hole===currentHole)) return opp;
      return { ...opp, manualPresses: [...(opp.manualPresses||[]), { hole: currentHole }] };
    });
    const updated = { ...round, opponents: newOpps };
    setRound(updated);
    scheduleSync({ scores, opponents: newOpps, current_hole: currentHole });
  }

  async function advanceHole() {
    if(saveTimer.current) clearTimeout(saveTimer.current);
    const toSave = { scores, opponents, current_hole: currentHole };
    if(isWriter.current) await flushSave(toSave);
    if(isLastHole) setLiveTab("summary");
    else setCurrentHole(h => h+1);
  }

  async function postToLedger() {
    setPosting(true);
    const today = new Date().toISOString().slice(0,10);
    for(const opp of opponents) {
      const tally = getTally(scores, course, opp, courseId);
      await sb.from("rounds").insert({
        owner_id: user.id, player_id: opp.playerId, player_name: opp.name,
        date: today, strokes: opp.strokes, money: tally.total,
        notes: "Individual round | "+course.name+" | "+opp.betType+" $"+opp.betAmount,
        season: new Date().getFullYear(), cancelled: false,
      });
      const player = players.find(p => p.id===opp.playerId);
      if(player) await sb.from("players").update({
        round_money: (player.round_money||0)+tally.total,
        bank: (player.bank||0)+tally.total,
      }).eq("id", opp.playerId);
    }
    await sb.from("live_rounds").update({status:"complete"}).eq("id", round?.id);
    localStorage.removeItem(localKey);
    setPosting(false);
    onPostToLedger();
  }

  async function deleteRound() {
    if(window.confirm("Delete this round? All scores will be permanently removed.")) {
      await sb.from("live_rounds").delete().eq("id", round?.id);
      localStorage.removeItem(localKey);
      if(onDelete) onDelete();
    }
  }

  const myScore    = getScore("me", currentHole);
  const canAdvance = myScore !== null;

  // ── Setup screen functions ────────────────────────────────────────────────
  function addOpponent() {
    const player = players.find(p => p.id === addOppId);
    if(!player || opponents.find(o => o.playerId === addOppId)) return;
    const rawStrokes = safeInt(addStrokes, 0);
    const totalStrokes = rawStrokes * 2;
    const finalStrokes = addStrokesDir==="igive" ? totalStrokes : addStrokesDir==="iget" ? -totalStrokes : 0;
    setOpponents(prev => [...prev, {
      playerId: player.id, name: player.name, strokes: finalStrokes,
      betType: addBetType, betAmount: safeInt(addBetAmt, 5),
      pressDown: addBetType==="nassau-press" ? addPressDown : 2,
      sameGroup: addSameGroup, manualPresses: [],
      linkedUserId: player.linked_user_id || null,
    }]);
    setAddOppId(""); setAddStrokes("0"); setAddStrokesDir("even"); setAddBetAmt("5");
    setAddSheet(false);
  }

  async function startRound() {
    if(opponents.length === 0 || creatingRef.current) return;
    creatingRef.current = true;
    setPosting(true);
    try {
      const safeCourseId = COURSES[courseId] ? courseId : "south-toledo";
      const { data } = await sb.from("live_rounds").insert({
        owner_id: user.id,
        course_id: safeCourseId,
        course_name: COURSES[safeCourseId]?.name || safeCourseId,
        owner_name: myName.trim() || user.id,
        opponents,
        scores: {},
        current_hole: 1,
        status: "active",
      }).select().single();
      if(data) {
        setRound(data);
        setCurrentHole(1);
        setPosting(false);
        setScreen("scoring"); // ← identical to TeamTournament's setScreen("scoring")
        return;
      }
    } catch(e) {
      console.warn("live_rounds insert failed:", e);
    }
    creatingRef.current = false;
    setPosting(false);
  }

  // ── SETUP SCREEN — only shows for new rounds ───────────────────────────────
  const selStyle = { width:"100%", padding:"14px", background:C.surface, border:"1px solid "+C.border, borderRadius:10, color:C.text, fontSize:15, outline:"none", WebkitAppearance:"none", cursor:"pointer" };

  if(screen === "setup") return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:20,display:"inline-flex",alignItems:"center",gap:6}}>‹ Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:36}}>⛳</div>
          <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Start Individual Round</div>
        </div>
      </div>
      <div style={{padding:"0 20px"}}>
        {/* Your name */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Your Name</div>
          <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="e.g. Michael"
            style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
          <div style={{fontSize:11,color:C.muted,marginTop:6}}>Shows on your opponents' scorecards</div>
        </div>
        {/* Course */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Select Course</div>
          <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={selStyle}>
            {Object.entries(COURSES).map(([id,c])=>(
              <option key={id} value={id}>{c.name} - {c.city}</option>
            ))}
          </select>
        </div>
        {/* Opponents */}
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Opponents ({opponents.length})</div>
        {opponents.length===0&&(
          <div style={{textAlign:"center",padding:"20px",background:C.card,border:"1px solid "+C.border,borderRadius:12,marginBottom:12,color:C.muted,fontSize:13}}>
            Add at least one opponent to start
          </div>
        )}
        {opponents.map(opp=>{
          const perSide = Math.abs(opp.strokes)/2;
          const strokeLabel = opp.strokes===0?"Even":opp.strokes>0?"You give "+perSide+"/side":"You get "+perSide+"/side";
          return(
            <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:17,marginBottom:2}}>{opp.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{strokeLabel} · {opp.betType==="nassau-press"?"Nassau + Auto Press "+opp.pressDown+"D $"+opp.betAmount:opp.betType==="nassau"?"Nassau $"+opp.betAmount:opp.betType==="match"?"Match Play $"+opp.betAmount+"/hole":"Skins $"+opp.betAmount}</div>
              </div>
              <button onClick={()=>setOpponents(prev=>prev.filter(o=>o.playerId!==opp.playerId))} style={{background:"none",border:"none",color:C.red,fontSize:22,cursor:"pointer",padding:"0 0 0 12px"}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setAddSheet(true)} style={{width:"100%",padding:"14px",background:"transparent",border:"1.5px dashed "+C.border,borderRadius:12,color:C.green,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:20}}>
          + Add Opponent
        </button>
        <button onClick={startRound} disabled={opponents.length===0||posting}
          style={{width:"100%",padding:"18px",background:opponents.length===0||posting?"#333":C.green,color:opponents.length===0||posting?C.muted:"#0a1a0f",border:"none",borderRadius:14,fontSize:17,fontWeight:800,cursor:opponents.length===0||posting?"not-allowed":"pointer",fontFamily:"Georgia,serif"}}>
          {posting?"Starting...":"Tee It Up!"}
        </button>
      </div>

      {/* Add opponent sheet */}
      {addSheet&&(
        <div style={{position:"fixed",inset:0,zIndex:400}}>
          <div onClick={()=>setAddSheet(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}}/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:"1px solid "+C.border,padding:"20px 20px 44px",maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><div style={{width:40,height:4,background:C.dim,borderRadius:2}}/></div>
            <div style={{fontWeight:700,fontSize:20,marginBottom:16}}>Add Opponent</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Select Player</div>
                <select value={addOppId} onChange={e=>setAddOppId(e.target.value)} style={selStyle}>
                  <option value="">- Choose opponent -</option>
                  {players.filter(p=>!opponents.find(o=>o.playerId===p.id)).map(p=>(
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Strokes Per Side</div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  {[["even","Even"],["igive","I Give"],["iget","I Get"]].map(([d,l])=>(
                    <button key={d} onClick={()=>setAddStrokesDir(d)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addStrokesDir===d?700:500,background:addStrokesDir===d?C.green:C.surface,color:addStrokesDir===d?"#0a1a0f":C.muted,border:"1px solid "+(addStrokesDir===d?C.green:C.border),cursor:"pointer",borderRadius:8}}>{l}</button>
                  ))}
                </div>
                {addStrokesDir!=="even"&&(
                  <input type="number" min="1" max="9" value={addStrokes} onChange={e=>setAddStrokes(e.target.value)} placeholder="# per side"
                    style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="numeric"/>
                )}
              </div>
              <div>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Bet Type</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[["match","Match Play"],["nassau","Nassau"],["nassau-press","Nassau + Press"],["skins","Skins"]].map(([id,label])=>(
                    <button key={id} onClick={()=>setAddBetType(id)} style={{flex:1,minWidth:"45%",padding:"10px 4px",fontSize:11,fontWeight:addBetType===id?700:500,background:addBetType===id?C.green:C.surface,color:addBetType===id?"#0a1a0f":C.muted,border:"1px solid "+(addBetType===id?C.green:C.border),cursor:"pointer",borderRadius:8}}>{label}</button>
                  ))}
                </div>
              </div>
              {addBetType==="nassau-press"&&(
                <div>
                  <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Auto Press Triggers When</div>
                  <div style={{display:"flex",gap:8}}>
                    {[1,2,3].map(n=>(
                      <button key={n} onClick={()=>setAddPressDown(n)} style={{flex:1,padding:"12px",fontSize:13,fontWeight:addPressDown===n?700:500,background:addPressDown===n?C.gold:C.surface,color:addPressDown===n?"#0a1a0f":C.muted,border:"1px solid "+(addPressDown===n?C.gold:C.border),cursor:"pointer",borderRadius:8}}>{n} Down</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>
                  {addBetType==="match"?"$ Per Hole":addBetType==="skins"?"$ Per Skin":"$ Per Side/Total"}
                </div>
                <input type="number" min="1" value={addBetAmt} onChange={e=>setAddBetAmt(e.target.value)}
                  style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="decimal"/>
              </div>
              <div style={{background:C.dim,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>Same Group</div>
                  <div style={{fontSize:11,color:C.muted}}>{addSameGroup?"Can enter scores & call press":"Different group - scores optional"}</div>
                </div>
                <button onClick={()=>setAddSameGroup(g=>!g)}
                  style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:addSameGroup?C.green:"#333",position:"relative",flexShrink:0}}>
                  <div style={{position:"absolute",top:4,left:addSameGroup?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                </button>
              </div>
              <button onClick={addOpponent} disabled={!addOppId}
                style={{width:"100%",padding:"16px",background:addOppId?C.green:"#333",color:addOppId?"#0a1a0f":C.muted,border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:addOppId?"pointer":"not-allowed",fontFamily:"Georgia,serif"}}>
                Add to Round
              </button>
              <button onClick={()=>setAddSheet(false)}
                style={{width:"100%",padding:"14px",background:"transparent",color:C.green,border:"1.5px solid "+C.green,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"Georgia,serif"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Read-only banner ──────────────────────────────────────────────────────
  if(readOnlyMode) return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16}}>
      <div style={{background:"rgba(232,184,75,0.1)",border:"2px solid rgba(232,184,75,0.5)",borderRadius:14,padding:"24px",maxWidth:320,width:"100%"}}>
        <div style={{fontWeight:800,fontSize:16,color:C.gold,marginBottom:8}}>VIEW ONLY</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:16}}>This round is open on another device. Scores update live here but can only be entered there.</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Are you the player? Tap below to reclaim scoring access.</div>
        <button onClick={reclaimWriter} disabled={claiming}
          style={{width:"100%",padding:"12px",background:claiming?"#1a2a1a":C.gold,color:claiming?C.muted:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:claiming?"not-allowed":"pointer"}}>
          {claiming?"Reclaiming...":"📲 Reclaim Scoring Access"}
        </button>
        <button onClick={onBack} style={{width:"100%",marginTop:10,padding:"12px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:13,cursor:"pointer"}}>← Back</button>
      </div>
    </div>
  );

  // ── Playing screen ────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>

      {/* Header — identical structure to TourneyCaptain */}
      <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 16px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <button onClick={() => currentHole>1 ? setCurrentHole(h=>h-1) : null}
            style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
            <div style={{fontSize:48,fontWeight:800,lineHeight:1}}>{currentHole}</div>
            <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {effPar} · Hdcp {holeData?.hdcp}</div>
            {saveStatus&&<div style={{fontSize:10,color:saveStatus==="saving"?C.gold:C.green,marginTop:2}}>{saveStatus==="saving"?"Saving...":"Saved ✓"}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <button onClick={onBack}
              style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🏠 Home</button>
            <button onClick={()=>setShowSettings(true)}
              style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>⚙️ Edit</button>
            {opponents.some(o=>!o.sameGroup)&&(
              <button onClick={()=>setShowShare(true)}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🔗 Share</button>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:2}}>
          {course?.holes.map(h => (
            <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
          ))}
        </div>
      </div>

      {/* Match standing bar */}
      {opponents.length>0&&(()=>{
        const opp=opponents[0];
        const strokeHoles=getStrokeHoles(courseId,Math.abs(opp.strokes||0));
        const myS=scores["me"]||{}, oppS=scores[opp.playerId]||{};
        let front=0, back=0;
        for(const h of course.holes){
          const my=safeInt(myS[h.hole],-1), op=safeInt(oppS[h.hole],-1);
          if(my<0||op<0) continue;
          const myNet=opp.strokes<0&&strokeHoles.includes(h.hole)?my-1:my;
          const opNet=opp.strokes>0&&strokeHoles.includes(h.hole)?op-1:op;
          const r=myNet<opNet?1:myNet>opNet?-1:0;
          if(h.side==="front") front+=r; else back+=r;
        }
        const tot=front+back;
        const fmt=v=>v===0?"A/S":v>0?Math.abs(v)+" UP":Math.abs(v)+" DN";
        const clr=v=>v>0?C.green:v<0?C.red:C.muted;
        return(
          <div style={{background:C.card,borderBottom:"1px solid "+C.border,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>Me <span style={{color:C.muted,fontWeight:400,fontSize:12}}>vs</span> {opp.name}</div>
              <div style={{fontSize:11,color:C.muted}}>{course.name} · thru {Math.max(0,currentHole-1)}</div>
            </div>
            <div style={{display:"flex",gap:16}}>
              {[["F9",front],["B9",back],["TOT",tot]].map(([lbl,val])=>(
                <div key={lbl} style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>{lbl}</div>
                  <div style={{fontSize:15,fontWeight:800,color:clr(val)}}>{fmt(val)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Connection banners — identical to TourneyCaptain */}
      {connStatus==="offline"&&(
        <div onClick={()=>{setConnStatus("connecting");startSubscription();}}
          style={{background:"rgba(224,80,80,0.15)",border:"2px solid rgba(224,80,80,0.7)",margin:"8px 12px",borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:C.red}}/>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:C.red}}>Scores not uploading</div>
              <div style={{fontSize:11,color:"rgba(224,80,80,0.8)"}}>Saved on phone · Tap to reconnect</div>
            </div>
          </div>
          <div style={{background:C.red,color:"#fff",fontSize:11,fontWeight:800,padding:"5px 10px",borderRadius:8}}>Reconnect</div>
        </div>
      )}
      {connStatus==="syncing"&&(
        <div style={{background:"rgba(232,184,75,0.12)",border:"2px solid rgba(232,184,75,0.6)",margin:"8px 12px",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:C.gold}}/>
          <div style={{fontSize:13,fontWeight:800,color:C.gold}}>Uploading scores... Do not close</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid "+C.border,background:"rgba(0,0,0,0.2)"}}>
        {[["score","Score"],["match","Match"],["summary","Summary"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setLiveTab(id)} style={{flex:1,padding:"12px",fontSize:13,fontWeight:liveTab===id?700:500,background:"transparent",color:liveTab===id?C.green:C.muted,border:"none",borderBottom:liveTab===id?"2px solid "+C.green:"2px solid transparent",cursor:"pointer"}}>{lbl}</button>
        ))}
      </div>

      <div style={{padding:"14px 16px"}}>

        {/* ── SCORE TAB ── */}
        {liveTab==="score"&&(<>

          {/* Hole bubbles */}
          <div style={{display:"flex",overflowX:"auto",gap:6,marginBottom:14,paddingBottom:4}}>
            {course?.holes.map(h => {
              const scored = getScore("me",h.hole)!==null;
              return (
                <button key={h.hole} onClick={async()=>{
                  if(saveTimer.current) clearTimeout(saveTimer.current);
                  if(pendingData.current&&isWriter.current) await flushSave(pendingData.current);
                  setCurrentHole(h.hole);
                }} style={{
                  flexShrink:0,width:36,height:36,borderRadius:"50%",fontSize:12,fontWeight:700,cursor:"pointer",
                  background:h.hole===currentHole?C.gold:scored?"rgba(123,180,80,0.15)":C.dim,
                  color:h.hole===currentHole?"#0a1a0f":scored?C.green:C.muted,
                  border:"1px solid "+(h.hole===currentHole?C.gold:scored?C.green:C.border),
                }}>{h.hole}</button>
              );
            })}
          </div>

          {/* My score */}
          <div style={{background:C.card,border:"2px solid "+C.green,borderRadius:14,padding:"16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>⛳ Your Score</div>
              {opponents.filter(o=>o.sameGroup).map(opp => {
                if(opp.betType!=="nassau"&&opp.betType!=="nassau-press") return null;
                const alreadyPressed = (opp.manualPresses||[]).some(p=>p.hole===currentHole);
                // Pissed Press — available any time on Nassau games, not just when losing
                if(alreadyPressed) return(
                  <button key={opp.playerId} disabled
                    style={{background:"#333",border:"none",color:"#888",padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"not-allowed"}}>
                    Pressed ✓
                  </button>
                );
                return(
                  <button key={opp.playerId} onClick={()=>callManualPress(opp.playerId)}
                    style={{background:"rgba(224,80,80,0.15)",border:"2px solid "+C.red,color:C.red,padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>
                    🤬 Press!
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <ScoreButton label="-" size={60} onClick={()=>setScore("me",currentHole,(myScore!==null?myScore:effPar)-1)}/>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:72,fontWeight:800,lineHeight:1}}>{myScore!==null?myScore:"-"}</div>
                {myScore!==null&&<div style={{fontSize:14,color:scoreColor(myScore,effPar),marginTop:4,fontWeight:700}}>{scoreName(myScore,effPar)}</div>}
                {myScore===null&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>tap + to start</div>}
              </div>
              <ScoreButton label="+" size={60} onClick={()=>setScore("me",currentHole,(myScore!==null?myScore:effPar-1)+1)}/>
            </div>
          </div>

          {/* Opponents */}
          {opponents.filter(o=>o.sameGroup).map(opp => {
            const oppScore = getScore(opp.playerId, currentHole);
            const getsStroke = opp.strokes>0 && getStrokeHoles(courseId,opp.strokes).includes(currentHole);
            const iGetStroke = opp.strokes<0 && getStrokeHoles(courseId,Math.abs(opp.strokes)).includes(currentHole);
            const tally = getTally(scores,course,opp,courseId);
            return (
              <div key={opp.playerId} style={{background:C.card,border:"1px solid "+(getsStroke||iGetStroke?"rgba(232,184,75,0.5)":C.border),borderRadius:14,padding:"14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:15}}>{opp.name} <span style={{fontSize:10,color:C.green,background:"rgba(123,180,80,0.12)",padding:"2px 7px",borderRadius:8}}>Same Group</span></div>
                    {getsStroke&&<div style={{fontSize:11,color:C.gold,marginTop:2}}>⭐ {opp.name} gets a stroke</div>}
                    {iGetStroke&&<div style={{fontSize:11,color:C.green,marginTop:2}}>⭐ You get a stroke</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <div style={{fontSize:13,fontWeight:700,color:tally.label==="Even"?C.muted:tally.label?.includes("Up")?C.green:C.red}}>{tally.label||"-"}</div>
                    {(opp.betType==="nassau"||opp.betType==="nassau-press")&&(()=>{
                      const alreadyPressed=(opp.manualPresses||[]).some(p=>p.hole===currentHole);
                      if(alreadyPressed) return(
                        <button disabled style={{background:"#333",border:"none",color:"#888",padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,cursor:"not-allowed"}}>Pressed ✓</button>
                      );
                      return(
                        <button onClick={()=>callManualPress(opp.playerId)}
                          style={{background:"rgba(224,80,80,0.15)",border:"2px solid "+C.red,color:C.red,padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:800,cursor:"pointer"}}>
                          🤬 Press!
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <ScoreButton label="-" size={52} onClick={()=>setScore(opp.playerId,currentHole,(oppScore!==null?oppScore:effPar)-1)}/>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:52,fontWeight:800,color:oppScore!==null?C.text:C.dim,lineHeight:1}}>{oppScore!==null?oppScore:"-"}</div>
                    {oppScore===null&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>tap + to enter</div>}
                  </div>
                  <ScoreButton label="+" size={52} onClick={()=>setScore(opp.playerId,currentHole,(oppScore!==null?oppScore:effPar-1)+1)}/>
                </div>
              </div>
            );
          })}

          {/* Next Hole button — hard flush before advancing */}
                    {/* Different-group opponents — read-only live score */}
          {opponents.filter(o=>!o.sameGroup).map(opp=>{
            const oppScore=getScore(opp.playerId,currentHole);
            return(
              <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>{opp.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>Different group · live score</div>
                </div>
                <div style={{fontSize:36,fontWeight:800,color:oppScore!==null?scoreColor(oppScore,effPar):C.dim}}>{oppScore!==null?oppScore:"--"}</div>
              </div>
            );
          })}

          <button onClick={advanceHole} disabled={!canAdvance}
            style={{width:"100%",padding:"16px",background:!canAdvance?"#333":isLastHole?C.gold:C.green,color:!canAdvance?C.muted:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:!canAdvance?"not-allowed":"pointer",marginTop:8,fontFamily:"Georgia,serif"}}>
            {!canAdvance?"Enter your score to continue":isLastHole?"Finish Round":"Next - Hole "+(currentHole+1)}
          </button>
          <div style={{textAlign:"center",fontSize:11,color:C.dim,marginTop:8}}>Scores saved · safe to close</div>
        </>)}

        {/* ── MATCH TAB ── */}
        {liveTab==="match"&&(
          <div>
            {opponents.map(opp => {
              const tally = getTally(scores,course,opp,courseId);
              return (
                <div key={opp.playerId} style={{marginBottom:20}}>
                  <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>Bet — {opp.name}</div>
                        <div style={{fontSize:14,fontWeight:700}}>
                          {opp.betType==="nassau"?"Nassau":opp.betType==="nassau-press"?"Nassau + Auto Press":opp.betType==="match"?"Match Play":"Skins"} · ${opp.betAmount}
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                          {opp.strokes===0?"Even":opp.strokes>0?"You give "+(opp.strokes/2)+"/side":"You get "+(Math.abs(opp.strokes)/2)+"/side"}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:C.muted,marginBottom:2}}>Running</div>
                        <div style={{fontSize:20,fontWeight:800,color:tally.total===0?C.muted:tally.total>0?C.green:C.red}}>
                          {tally.total===0?"$0":tally.total>0?"+$"+tally.total.toFixed(2):"-$"+Math.abs(tally.total).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Press breakdown */}
                    {(opp.betType==="nassau-press"||opp.betType==="nassau")&&tally.pressDetail&&(()=>{
                      const pd=tally.pressDetail;
                      function betRow(b,betAmt) {
                        const standing=b.diff===0?"E":b.diff>0?(b.diff+" UP"):(Math.abs(b.diff)+" DN");
                        const amtStr=b.amount===0?"$0":b.amount>0?("+$"+b.amount.toFixed(2)):("-$"+Math.abs(b.amount).toFixed(2));
                        return (
                          <div key={b.startHole+b.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                            <span style={{fontSize:12,color:b.label==="Original"?C.text:C.muted,fontWeight:b.label==="Original"?600:400}}>
                              {b.label==="Original"?"Original $"+betAmt:b.label+" (H"+b.startHole+")"}
                            </span>
                            <div style={{display:"flex",gap:16}}>
                              <span style={{fontSize:12,fontWeight:700,color:b.diff>0?C.green:b.diff<0?C.red:C.muted}}>{standing}</span>
                              <span style={{fontSize:12,fontWeight:800,color:b.amount>0?C.green:b.amount<0?C.red:C.muted}}>{amtStr}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div>
                          {pd.front?.bets?.length>0&&(
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Front 9</div>
                              {pd.front.bets.map(b=>betRow(b,opp.betAmount))}
                              <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",marginTop:2}}>
                                <span style={{fontSize:11,color:C.muted}}>Front subtotal</span>
                                <span style={{fontSize:13,fontWeight:800,color:pd.front.total>0?C.green:pd.front.total<0?C.red:C.muted}}>
                                  {pd.front.total===0?"$0":pd.front.total>0?"+$"+pd.front.total.toFixed(2):"-$"+Math.abs(pd.front.total).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                          {pd.back?.bets?.length>0&&(
                            <div style={{marginBottom:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                              <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Back 9</div>
                              {pd.back.bets.map(b=>betRow(b,opp.betAmount))}
                              <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",marginTop:2}}>
                                <span style={{fontSize:11,color:C.muted}}>Back subtotal</span>
                                <span style={{fontSize:13,fontWeight:800,color:pd.back.total>0?C.green:pd.back.total<0?C.red:C.muted}}>
                                  {pd.back.total===0?"$0":pd.back.total>0?"+$"+pd.back.total.toFixed(2):"-$"+Math.abs(pd.back.total).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.12)"}}>
                            <div style={{fontSize:12,color:C.muted}}>18-hole total · no press</div>
                            <div style={{fontSize:13,fontWeight:800,color:pd.total>0?C.green:pd.total<0?C.red:C.muted}}>
                              {pd.total===0?"TBD":pd.total>0?"+$"+pd.total.toFixed(2):"-$"+Math.abs(pd.total).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Scorecard */}
                  <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",overflowX:"auto"}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Scorecard</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:360}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid "+C.border}}>
                          <th style={{textAlign:"left",padding:"4px 6px",color:C.muted,fontWeight:500}}>Hole</th>
                          {course?.holes.map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:h.hole===currentHole?C.gold:C.muted,fontWeight:h.hole===currentHole?700:400}}>{h.hole}</th>)}
                          <th style={{padding:"3px 6px",textAlign:"center",color:C.green,fontWeight:700}}>TOT</th>
                        </tr>
                        <tr>
                          <td style={{padding:"3px 6px",color:C.dim,fontSize:10}}>Par</td>
                          {course?.holes.map(h=><td key={h.hole} style={{padding:"3px",textAlign:"center",color:C.dim,fontSize:11}}>{h.par}</td>)}
                          <td style={{padding:"3px 6px",textAlign:"center",color:C.dim,fontSize:11}}>{course?.par}</td>
                        </tr>
                      </thead>
                      <tbody>
                        {[{id:"me",label:"You",color:C.green},{id:opp.playerId,label:opp.name.split(" ")[0],color:C.gold}].map(row=>(
                          <tr key={row.id} style={{borderTop:"1px solid "+C.dim}}>
                            <td style={{padding:"4px 6px",fontWeight:700,color:row.color,fontSize:12}}>{row.label}</td>
                            {course?.holes.map(h=>{const s=getScore(row.id,h.hole);return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:s!==null?scoreColor(s,h.par):C.dim}}>{s!==null?s:"--"}</td>;})}
                            <td style={{padding:"4px 6px",textAlign:"center",fontWeight:800,color:row.color}}>{Object.values(scores[row.id]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"--"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {liveTab==="summary"&&(()=>{
          const results=opponents.map(opp=>({...opp,tally:getTally(scores,course,opp,courseId)}));
          const grandTotal=results.reduce((s,r)=>s+r.tally.total,0);
          const holesPlayed=Object.keys(scores["me"]||{}).length;
          const fmt=v=>v>=0?"+$"+v.toFixed(2):"-$"+Math.abs(v).toFixed(2);
          return(
            <div>
              <div style={{background:C.card,border:"2px solid "+(grandTotal>=0?C.green:C.red),borderRadius:14,padding:"16px",marginBottom:12,textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Running Total · thru {holesPlayed}</div>
                <div style={{fontSize:44,fontWeight:800,color:grandTotal>=0?C.green:C.red,letterSpacing:-2}}>{fmt(grandTotal)}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>{grandTotal>=0?"You collect":"You owe"}</div>
              </div>
              {results.map(r=>(
                <div key={r.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:800,fontSize:15}}>{r.name}</div>
                    <div style={{fontSize:20,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>{fmt(r.tally.total)}</div>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                    {r.betType==="nassau-press"?"Nassau + Auto Press "+(r.pressDown||2)+"D · $"+r.betAmount
                      :r.betType==="nassau"?"Nassau · $"+r.betAmount
                      :r.betType==="match"?"Match Play · $"+r.betAmount+"/hole"
                      :"Skins · $"+r.betAmount}
                    {r.strokes!==0&&(" · "+(r.strokes>0?"Give "+(r.strokes/2)+"/side":"Get "+(Math.abs(r.strokes)/2)+"/side"))}
                  </div>
                  {r.tally.pressDetail&&(()=>{
                    const pd=r.tally.pressDetail;
                    const fmtBets=side=>side?.bets?.map((b,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:2}}>
                        <span style={{color:C.muted}}>{i===0?"Original $"+r.betAmount:(b.label||"Press")+" · hole "+b.startHole}</span>
                        <span style={{color:b.amount>=0?C.green:C.red,fontWeight:700}}>{b.amount>=0?"+$"+b.amount.toFixed(2):"-$"+Math.abs(b.amount).toFixed(2)}</span>
                      </div>
                    ));
                    return(
                      <div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"10px 12px"}}>
                        {pd.front?.bets?.length>0&&<><div style={{fontSize:10,color:C.green,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Front 9</div>{fmtBets(pd.front)}</>}
                        {pd.back?.bets?.length>0&&<><div style={{fontSize:10,color:C.green,letterSpacing:1,textTransform:"uppercase",margin:"8px 0 4px"}}>Back 9</div>{fmtBets(pd.back)}</>}
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,borderTop:"1px solid "+C.border,paddingTop:6,marginTop:4}}>
                          <span style={{color:C.muted}}>18-hole total</span>
                          <span style={{color:pd.total>=0?C.green:C.red,fontWeight:700}}>{pd.total>=0?"+$"+pd.total.toFixed(2):"-$"+Math.abs(pd.total).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
              {isLastHole&&(
                <>
                  <BigBtn onClick={postToLedger} disabled={posting} color={C.gold}>{posting?"Posting...":"Post Results to Ledger"}</BigBtn>
                  <div style={{height:10}}/>
                </>
              )}
              <GhostBtn onClick={()=>setLiveTab("score")}>← Back to Scoring</GhostBtn>
            </div>
          );
        })()}

      </div>

      {/* Share overlay — generates opponent links */}
      {showShare&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",fontFamily:"Georgia,serif"}}>
          <div style={{padding:"50px 20px 40px",maxWidth:480,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:20,fontWeight:800,color:C.text}}>🔗 Share Round</div>
              <button onClick={()=>setShowShare(false)} style={{background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}}>
              Send each player in a different group their own link. They enter their scores on their phone — your screen updates instantly.
            </div>
            {opponents.filter(o=>!o.sameGroup).map(opp=>{
              const link="https://press-golf.vercel.app?round="+(round?.id||"")+"&player="+opp.playerId;
              const sms=encodeURIComponent("Hey "+opp.name+" - enter your scores here as we play:\n"+link+"\n\nYour scores sync to my round in real time. - Press Golf");
              return(
                <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
                  <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>{opp.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                    {opp.betType==="nassau"?"Nassau $"+opp.betAmount:opp.betType==="nassau-press"?"Nassau+Press $"+opp.betAmount:opp.betType==="match"?"Match Play $"+opp.betAmount+"/hole":"Skins $"+opp.betAmount}
                    {" - "}{opp.strokes===0?"Even":opp.strokes>0?"You give "+(opp.strokes/2)+"/side":"You get "+(Math.abs(opp.strokes)/2)+"/side"}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>window.open("sms:?&body="+sms)}
                      style={{flex:2,padding:"12px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"Georgia,serif"}}>
                      📱 Text {opp.name.split(" ")[0]}
                    </button>
                    <button onClick={()=>{try{navigator.clipboard.writeText(link);}catch(e){}}}
                      style={{flex:1,padding:"12px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      📋 Copy
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:12,background:"rgba(232,184,75,0.08)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,padding:"12px 14px",fontSize:12,color:C.gold,lineHeight:1.6}}>
              ⚠️ Send links before teeing off. Links are permanent for this round — scores update live as you play.
            </div>
            <button onClick={()=>setShowShare(false)}
              style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:16,fontFamily:"Georgia,serif"}}>
              ✓ Done
            </button>
          </div>
        </div>
      )}

            {/* Settings overlay */}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",fontFamily:"Georgia,serif"}}>
          <div style={{padding:"50px 20px 40px",maxWidth:480,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:20,fontWeight:800}}>⚙️ Edit Round</div>
              <button onClick={()=>setShowSettings(false)} style={{background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            {opponents.map((opp,i)=>{
              const b9 = back9Adj[opp.playerId] || 0;
              const basePerSide = Math.abs(opp.strokes||0) / 2;
              const adjPerSide = b9;
              const effPerSide = basePerSide + adjPerSide;
              return(
              <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Player {i+1}</div>

                {/* Player name */}
                <input value={opp.name} onChange={e=>{
                  const newOpps=opponents.map(o=>o.playerId===opp.playerId?{...o,name:e.target.value}:o);
                  const updated={...round,opponents:newOpps};
                  setRound(updated);
                  scheduleSync({scores,opponents:newOpps,current_hole:currentHole});
                }} style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:16,fontWeight:600,outline:"none",boxSizing:"border-box",marginBottom:12}}/>

                {/* Back 9 Stroke Adjustment */}
                <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.gold,marginBottom:4}}>⛳ Back 9 Stroke Adjustment</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.5}}>
                    Agree mid-round to adjust strokes on the back 9. Affects hole selection only — does not change the original bet.
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                    <button onClick={()=>{
                      const newAdj={...back9Adj,[opp.playerId]:(b9||0)-1};
                      setBack9Adj(newAdj);
                      scheduleSync({scores,opponents,current_hole:currentHole});
                    }} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer",flexShrink:0}}>−</button>
                    <div style={{flex:1,textAlign:"center"}}>
                      <div style={{fontSize:20,fontWeight:800,color:b9===0?C.muted:C.gold}}>
                        {b9===0?"No adjustment":b9>0?"+"+b9+" stroke"+(Math.abs(b9)>1?"s":"")+" per side to "+opp.name:Math.abs(b9)+" stroke"+(Math.abs(b9)>1?"s":"")+" per side to You"}
                      </div>
                      {b9!==0&&(
                        <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                          Back 9 effective: {effPerSide===0?"Even":opp.strokes>=0?"You give "+effPerSide+"/side":"You get "+Math.abs(effPerSide)+"/side"}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>{
                      const newAdj={...back9Adj,[opp.playerId]:(b9||0)+1};
                      setBack9Adj(newAdj);
                      scheduleSync({scores,opponents,current_hole:currentHole});
                    }} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer",flexShrink:0}}>+</button>
                  </div>
                  {b9!==0&&(
                    <button onClick={()=>{
                      const newAdj={...back9Adj,[opp.playerId]:0};
                      setBack9Adj(newAdj);
                      scheduleSync({scores,opponents,current_hole:currentHole});
                    }} style={{width:"100%",padding:"8px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:8,fontSize:12,cursor:"pointer"}}>
                      Reset to original strokes
                    </button>
                  )}
                </div>
              </div>
              );
            })}
            <button onClick={()=>setShowSettings(false)}
              style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:8,fontFamily:"Georgia,serif"}}>
              ✓ Done
            </button>
            <div style={{height:10}}/>
            <button onClick={()=>{setShowSettings(false);deleteRound();}}
              style={{width:"100%",padding:"14px",background:"transparent",color:C.red,border:"1px solid rgba(224,80,80,0.4)",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"Georgia,serif"}}>
              🗑 Delete Round
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
