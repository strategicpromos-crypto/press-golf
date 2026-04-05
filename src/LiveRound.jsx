import { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES, getStrokeHoles } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

// ── Safe integer helper — NEVER returns NaN or undefined ──────────────────────
function safeInt(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function ScoreButton({ label, onClick, size=52 }) {
  return (
    <button
      onClick={onClick}
      style={{
        width:size, height:size, borderRadius:"50%",
        background:C.dim, border:`1px solid ${C.border}`,
        color:C.text, fontSize:size > 48 ? 32 : 26,
        fontWeight:700, cursor:"pointer", flexShrink:0,
        WebkitTapHighlightColor:"transparent",
        userSelect:"none",
      }}
    >
      {label}
    </button>
  );
}

function BigBtn({ children, onClick, color=C.green, textColor="#0a1a0f", style={}, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", padding:"16px",
      background:disabled?"#333":color,
      color:disabled?C.muted:textColor,
      border:"none", borderRadius:12, fontSize:15,
      fontWeight:700, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.6:1, ...style
    }}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, color=C.green }) {
  return (
    <button onClick={onClick} style={{
      width:"100%", padding:"14px", background:"transparent",
      color, border:`1.5px solid ${color}`, borderRadius:12,
      fontSize:14, fontWeight:600, cursor:"pointer"
    }}>
      {children}
    </button>
  );
}

function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:400}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,borderBottom:"none",padding:"0 0 44px",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}><div style={{width:40,height:4,background:C.dim,borderRadius:2}}/></div>
        {title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 16px"}}><div style={{fontWeight:700,fontSize:20,color:C.text}}>{title}</div><button onClick={onClose} style={{background:C.dim,border:"none",color:C.muted,width:32,height:32,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button></div>}
        <div style={{padding:"0 20px"}}>{children}</div>
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>{children}</div>;
}

const selStyle = {
  width:"100%", padding:"14px", background:C.surface,
  border:`1px solid ${C.border}`, borderRadius:10,
  color:C.text, fontSize:15, outline:"none",
  WebkitAppearance:"none", cursor:"pointer",
};

// ── SCORE NAME LABEL ──────────────────────────────────────────────────────────
function scoreName(score, par) {
  if (score === par - 2) return "Eagle 🦅";
  if (score === par - 1) return "Birdie 🐦";
  if (score === par)     return "Par ✓";
  if (score === par + 1) return "Bogey";
  if (score === par + 2) return "Double 😬";
  return score > par ? `+${score - par}` : `${score - par}`;
}

function scoreColor(score, par) {
  if (score < par)  return C.green;
  if (score > par)  return C.red;
  return C.muted;
}

// ── BET CALCULATORS ───────────────────────────────────────────────────────────
function calcMatchPlayTotal(scores, course, myStrokeHoles, oppStrokeHoles, betPerHole) {
  let total = 0;
  let played = 0;
  for (const h of course.holes) {
    const my  = safeInt(scores["me"]?.[h.hole], -1);
    const opp = safeInt(scores["opp"]?.[h.hole], -1);
    if (my < 0 || opp < 0) continue;
    played++;
    const myNet  = myStrokeHoles.includes(h.hole)  ? my  - 1 : my;
    const oppNet = oppStrokeHoles.includes(h.hole) ? opp - 1 : opp;
    if (myNet < oppNet)      total += betPerHole;
    else if (myNet > oppNet) total -= betPerHole;
  }
  return { total, played };
}

function calcNassauTotal(scores, course, myStrokeHoles, oppStrokeHoles, betAmount) {
  function side(holes) {
    let myT = 0, oppT = 0, ok = false;
    for (const h of holes) {
      const my  = safeInt(scores["me"]?.[h.hole], -1);
      const opp = safeInt(scores["opp"]?.[h.hole], -1);
      if (my < 0 || opp < 0) continue;
      ok = true;
      myT  += myStrokeHoles.includes(h.hole)  ? my  - 1 : my;
      oppT += oppStrokeHoles.includes(h.hole) ? opp - 1 : opp;
    }
    if (!ok) return 0;
    if (myT < oppT)  return  betAmount;
    if (myT > oppT)  return -betAmount;
    return 0;
  }
  const front = side(course.holes.filter(h=>h.side==="front"));
  const back  = side(course.holes.filter(h=>h.side==="back"));
  const total = side(course.holes);
  return { front, back, total, net: front + back + total };
}

function calcSkinsTotal(scores, course, myStrokeHoles, oppStrokeHoles, betPerSkin) {
  let net = 0, carry = 0;
  for (const h of course.holes) {
    const my  = safeInt(scores["me"]?.[h.hole], -1);
    const opp = safeInt(scores["opp"]?.[h.hole], -1);
    if (my < 0 || opp < 0) continue;
    const myNet  = myStrokeHoles.includes(h.hole)  ? my  - 1 : my;
    const oppNet = oppStrokeHoles.includes(h.hole) ? opp - 1 : opp;
    const pot = betPerSkin + carry;
    if (myNet < oppNet)      { net += pot;  carry = 0; }
    else if (myNet > oppNet) { net -= pot;  carry = 0; }
    else                     { carry += betPerSkin; }
  }
  return net;
}

function getTally(scores, course, opp) {
  const absStrokes = Math.abs(opp.strokes);
  const strokeHoles = getStrokeHoles(course.id || "south-toledo", absStrokes);
  const myStrokeHoles  = opp.strokes < 0 ? strokeHoles : [];
  const oppStrokeHoles = opp.strokes > 0 ? strokeHoles : [];
  const oppScores = { me: scores["me"] || {}, opp: scores[opp.playerId] || {} };

  if (opp.betType === "match") {
    const r = calcMatchPlayTotal(oppScores, course, myStrokeHoles, oppStrokeHoles, opp.betAmount);
    return { total: r.total, played: r.played };
  }
  if (opp.betType === "nassau") {
    const r = calcNassauTotal(oppScores, course, myStrokeHoles, oppStrokeHoles, opp.betAmount);
    return { total: r.net, played: 0 };
  }
  if (opp.betType === "skins") {
    return { total: calcSkinsTotal(oppScores, course, myStrokeHoles, oppStrokeHoles, opp.betAmount), played: 0 };
  }
  return { total: 0, played: 0 };
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function LiveRound({ user, players, onBack, onPostToLedger }) {
  const [step,        setStep]        = useState("setup");
  const [courseId,    setCourseId]    = useState("south-toledo");
  const [opponents,   setOpponents]   = useState([]);
  const [scores,      setScores]      = useState({});
  const [currentHole, setCurrentHole] = useState(1);
  const [sheet,       setSheet]       = useState(null);
  const [posting,     setPosting]     = useState(false);
  const [liveRoundId, setLiveRoundId] = useState(null);
  const [resuming,    setResuming]    = useState(false);

  // Add opponent form
  const [addOppId,       setAddOppId]       = useState("");
  const [addStrokes,     setAddStrokes]     = useState("0");
  const [addStrokesDir,  setAddStrokesDir]  = useState("even");
  const [addBetType,     setAddBetType]     = useState("nassau");
  const [addBetAmt,      setAddBetAmt]      = useState("5");

  const course = COURSES[courseId];
  const holeData = course?.holes[currentHole - 1];
  const saveTimer = useRef(null);

  // ── Check for existing active round on mount ──────────────────────────────
  useEffect(() => {
    async function checkExisting() {
      const { data } = await sb.from("live_rounds")
        .select("*")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setResuming(true);
        // Show resume prompt
        setLiveRoundId(data.id);
        setCourseId(data.course_id);
        setOpponents(data.opponents || []);
        setScores(data.scores || {});
        setCurrentHole(data.current_hole || 1);
      }
    }
    checkExisting();
  }, [user.id]);

  // ── Auto-save scores to Supabase whenever scores change ──────────────────
  useEffect(() => {
    if (!liveRoundId || step !== "playing") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await sb.from("live_rounds").update({
        scores,
        current_hole: currentHole,
        updated_at: new Date().toISOString(),
      }).eq("id", liveRoundId);
    }, 800); // save 0.8s after last change
    return () => clearTimeout(saveTimer.current);
  }, [scores, currentHole, liveRoundId, step]);

  // ── Start round — saves to DB immediately ─────────────────────────────────
  async function startRound() {
    if (opponents.length === 0) return;
    setPosting(true);
    const { data } = await sb.from("live_rounds").insert({
      owner_id: user.id,
      course_id: courseId,
      course_name: course.name,
      opponents,
      scores: {},
      current_hole: 1,
      status: "active",
    }).select().single();
    setPosting(false);
    if (data) {
      setLiveRoundId(data.id);
      setScores({});
      setCurrentHole(1);
      setStep("playing");
    }
  }

  // ── Score setter — always uses safe integers ──────────────────────────────
  function setScore(playerId, hole, rawValue) {
    const value = safeInt(rawValue, 1);
    const safeValue = Math.max(1, Math.min(15, value)); // clamp 1-15
    setScores(prev => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || {}),
        [hole]: safeValue,
      }
    }));
  }

  function getScore(playerId, hole) {
    const val = scores[playerId]?.[hole];
    if (val === undefined || val === null) return null;
    return safeInt(val, null);
  }

  // ── Opponent helpers ──────────────────────────────────────────────────────
  function getStrokeHolesForOpp(opp) {
    return getStrokeHoles(courseId, Math.abs(opp.strokes || 0));
  }

  function oppGetsStrokeOnHole(opp, hole) {
    if (!opp.strokes || opp.strokes <= 0) return false;
    return getStrokeHolesForOpp(opp).includes(hole);
  }

  function iGetStrokeOnHole(opp, hole) {
    if (!opp.strokes || opp.strokes >= 0) return false;
    return getStrokeHolesForOpp(opp).includes(hole);
  }

  // ── Add opponent ──────────────────────────────────────────────────────────
  function addOpponent() {
    const player = players.find(p => p.id === addOppId);
    if (!player) return;
    if (opponents.find(o => o.playerId === addOppId)) return;
    const rawStrokes = safeInt(addStrokes, 0);
    const finalStrokes = addStrokesDir === "igive" ? rawStrokes
                       : addStrokesDir === "iget"  ? -rawStrokes
                       : 0;
    setOpponents(prev => [...prev, {
      playerId:    player.id,
      name:        player.name,
      strokes:     finalStrokes,
      betType:     addBetType,
      betAmount:   safeInt(addBetAmt, 5),
      linkedUserId: player.linked_user_id || null,
    }]);
    setAddOppId(""); setAddStrokes("0"); setAddStrokesDir("even"); setAddBetAmt("5");
    setSheet(null);
  }

  // ── Post results to ledger ────────────────────────────────────────────────
  async function postToLedger() {
    setPosting(true);
    const today = new Date().toISOString().slice(0, 10);

    for (const opp of opponents) {
      const player = players.find(p => p.id === opp.playerId);
      if (!player) continue;
      const tally = getTally(scores, course, opp);
      const amount = tally.total;

      await sb.from("rounds").insert({
        owner_id:    user.id,
        player_id:   opp.playerId,
        player_name: opp.name,
        date:        today,
        strokes:     opp.strokes,
        money:       amount,
        notes:       `Live round · ${course.name} · ${opp.betType} $${opp.betAmount}`,
        season:      new Date().getFullYear(),
        cancelled:   false,
      });

      await sb.from("players").update({
        round_money: (player.round_money || 0) + amount,
        bank:        (player.bank || 0) + amount,
      }).eq("id", opp.playerId);

      if (opp.linkedUserId) {
        await sb.from("notifications").insert({
          user_id: opp.linkedUserId,
          type:    "round_logged",
          title:   `Round posted — ${course.name}`,
          body:    `${opp.betType} · ${amount >= 0 ? "You owe" : "You collect"} $${Math.abs(amount).toFixed(2)}`,
          data:    { player_id: opp.playerId },
        });
      }
    }

    // Mark live round as complete
    if (liveRoundId) {
      await sb.from("live_rounds").update({ status: "complete" }).eq("id", liveRoundId);
    }

    setPosting(false);
    onPostToLedger();
  }

  // ── Discard round ─────────────────────────────────────────────────────────
  async function discardRound() {
    if (liveRoundId) {
      await sb.from("live_rounds").update({ status: "complete" }).eq("id", liveRoundId);
    }
    setLiveRoundId(null); setOpponents([]); setScores({});
    setCurrentHole(1); setStep("setup"); setResuming(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RESUME PROMPT ─────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (resuming) return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>⛳</div>
      <div style={{fontWeight:700,fontSize:22,marginBottom:8,textAlign:"center"}}>Round In Progress</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:8,textAlign:"center"}}>{COURSES[courseId]?.name}</div>
      <div style={{fontSize:13,color:C.gold,marginBottom:28,textAlign:"center"}}>
        Hole {currentHole} · {opponents.map(o=>o.name).join(", ")}
      </div>
      <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>
        <BigBtn onClick={()=>{setResuming(false);setStep("playing");}}>Resume Round →</BigBtn>
        <GhostBtn onClick={()=>{setResuming(false);setStep("summary");}}>Go to Summary</GhostBtn>
        <GhostBtn onClick={()=>{discardRound();}} color={C.red}>Discard Round</GhostBtn>
        <GhostBtn onClick={()=>{setResuming(false);setLiveRoundId(null);setStep("setup");}}>Start New Round</GhostBtn>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── SETUP SCREEN ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "setup") return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:36}}>⛳</div>
          <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Start Live Round</div>
        </div>
      </div>

      <div style={{padding:"0 20px"}}>
        {/* Course picker */}
        <div style={{marginBottom:16}}>
          <Lbl>Select Course</Lbl>
          <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={selStyle}>
            {Object.entries(COURSES).map(([id,c])=>(
              <option key={id} value={id}>{c.name} — {c.city}</option>
            ))}
          </select>
          {COURSES[courseId]?.note && <div style={{fontSize:11,color:C.gold,marginTop:6}}>{COURSES[courseId].note}</div>}
        </div>

        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
          Opponents ({opponents.length})
        </div>

        {opponents.length === 0 && (
          <div style={{textAlign:"center",padding:"20px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:12,color:C.muted,fontSize:13}}>
            Add at least one opponent to start
          </div>
        )}

        {opponents.map(opp => {
          const sh = getStrokeHolesForOpp(opp).sort((a,b)=>a-b);
          const strokeLabel = opp.strokes === 0 ? "Even"
            : opp.strokes > 0 ? `You give ${opp.strokes}`
            : `You get ${Math.abs(opp.strokes)}`;
          return (
            <div key={opp.playerId} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17,marginBottom:3}}>{opp.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:2}}>
                    {strokeLabel} · {opp.betType === "match" ? `$${opp.betAmount}/hole` : opp.betType === "nassau" ? `Nassau $${opp.betAmount}` : `Skins $${opp.betAmount}`}
                  </div>
                  {opp.strokes !== 0 && sh.length > 0 && (
                    <div style={{fontSize:11,color:C.gold}}>Stroke holes: {sh.join(", ")}</div>
                  )}
                </div>
                <button onClick={()=>setOpponents(prev=>prev.filter(o=>o.playerId!==opp.playerId))} style={{background:"none",border:"none",color:C.red,fontSize:20,cursor:"pointer",padding:"0 0 0 10px"}}>✕</button>
              </div>
            </div>
          );
        })}

        <button onClick={()=>setSheet("addOpp")} style={{width:"100%",padding:"14px",background:"transparent",border:`1.5px dashed ${C.border}`,borderRadius:12,color:C.green,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:20}}>
          + Add Opponent
        </button>

        <BigBtn onClick={startRound} disabled={opponents.length === 0 || posting}>
          {posting ? "Starting..." : "Tee It Up! ⛳"}
        </BigBtn>
      </div>

      {/* Add opponent sheet */}
      <Sheet open={sheet==="addOpp"} onClose={()=>setSheet(null)} title="Add Opponent">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <Lbl>Select Player</Lbl>
            <select value={addOppId} onChange={e=>setAddOppId(e.target.value)} style={selStyle}>
              <option value="">— Choose opponent —</option>
              {players.filter(p=>!opponents.find(o=>o.playerId===p.id)).map(p=>(
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Lbl>Strokes</Lbl>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {[["even","Even"],["igive","I Give"],["iget","I Get"]].map(([d,l])=>(
                <button key={d} onClick={()=>setAddStrokesDir(d)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addStrokesDir===d?700:500,background:addStrokesDir===d?C.green:C.surface,color:addStrokesDir===d?"#0a1a0f":C.muted,border:`1px solid ${addStrokesDir===d?C.green:C.border}`,cursor:"pointer",borderRadius:8}}>{l}</button>
              ))}
            </div>
            {addStrokesDir !== "even" && (
              <input type="number" min="1" max="18" value={addStrokes} onChange={e=>setAddStrokes(e.target.value)} placeholder="# strokes" style={{width:"100%",padding:"12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="numeric"/>
            )}
          </div>

          <div>
            <Lbl>Bet Type</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["match","Match Play"],["nassau","Nassau"],["skins","Skins"]].map(([id,label])=>(
                <button key={id} onClick={()=>setAddBetType(id)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addBetType===id?700:500,background:addBetType===id?C.green:C.surface,color:addBetType===id?"#0a1a0f":C.muted,border:`1px solid ${addBetType===id?C.green:C.border}`,cursor:"pointer",borderRadius:8}}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <Lbl>{addBetType==="match"?"$ Per Hole":addBetType==="nassau"?"$ Per Side/Total":"$ Per Skin"}</Lbl>
            <input type="number" min="1" value={addBetAmt} onChange={e=>setAddBetAmt(e.target.value)} placeholder="e.g. 5" style={{width:"100%",padding:"12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="decimal"/>
          </div>

          <BigBtn onClick={addOpponent} disabled={!addOppId}>Add to Round</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── PLAYING SCREEN ────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "playing" && holeData) {
    const myScore   = getScore("me", currentHole);
    const canAdvance = myScore !== null;
    const isLastHole = currentHole === course.holes.length;

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):setStep("setup")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,color:C.text,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            </div>
            <button onClick={()=>setStep("summary")} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,cursor:"pointer",padding:"6px 10px",borderRadius:12}}>Summary</button>
          </div>
          {/* Progress bar */}
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        <div style={{padding:"14px 18px"}}>

          {/* ── MY SCORE ── */}
          <div style={{background:C.card,border:`2px solid ${C.green}`,borderRadius:14,padding:"16px",marginBottom:12}}>
            <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>⛳ Your Score</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <ScoreButton label="−" size={60} onClick={()=>{
                const cur = myScore !== null ? myScore : holeData.par;
                setScore("me", currentHole, cur - 1);
              }}/>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:72,fontWeight:800,color:C.text,lineHeight:1}}>
                  {myScore !== null ? myScore : "—"}
                </div>
                {myScore !== null && (
                  <div style={{fontSize:14,color:scoreColor(myScore,holeData.par),marginTop:4,fontWeight:700}}>
                    {scoreName(myScore, holeData.par)}
                  </div>
                )}
                {myScore === null && (
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>tap + to start</div>
                )}
              </div>
              <ScoreButton label="+" size={60} onClick={()=>{
                const cur = myScore !== null ? myScore : holeData.par - 1;
                setScore("me", currentHole, cur + 1);
              }}/>
            </div>
          </div>

          {/* ── OPPONENT SCORES ── */}
          {opponents.map(opp => {
            const oppScore    = getScore(opp.playerId, currentHole);
            const getsStroke  = oppGetsStrokeOnHole(opp, currentHole);
            const iGetStroke  = iGetStrokeOnHole(opp, currentHole);
            const tally       = getTally(scores, course, opp);

            return (
              <div key={opp.playerId} style={{background:C.card,border:`1px solid ${getsStroke||iGetStroke?"rgba(232,184,75,0.5)":C.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
                {/* Header row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16}}>{opp.name}</div>
                    {getsStroke && <div style={{fontSize:11,color:C.gold,marginTop:2}}>⭐ {opp.name} gets a stroke this hole</div>}
                    {iGetStroke && <div style={{fontSize:11,color:C.green,marginTop:2}}>⭐ You get a stroke this hole</div>}
                    {!getsStroke && !iGetStroke && <div style={{fontSize:10,color:C.dim,marginTop:2}}>optional — enter if in same group</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:tally.total>=0?C.green:C.red}}>
                      {tally.total>=0?"+":"−"}${Math.abs(tally.total).toFixed(2)}
                    </div>
                    <div style={{fontSize:10,color:C.muted}}>running</div>
                  </div>
                </div>

                {/* Score row */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <ScoreButton label="−" size={52} onClick={()=>{
                    const cur = oppScore !== null ? oppScore : holeData.par;
                    setScore(opp.playerId, currentHole, cur - 1);
                  }}/>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:52,fontWeight:800,color:oppScore!==null?C.text:C.dim,lineHeight:1}}>
                      {oppScore !== null ? oppScore : "—"}
                    </div>
                    {oppScore !== null && getsStroke && (
                      <div style={{fontSize:11,color:C.gold,marginTop:2}}>Net score: {oppScore - 1}</div>
                    )}
                    {oppScore !== null && iGetStroke && (
                      <div style={{fontSize:11,color:C.green,marginTop:2}}>Your net: {myScore !== null ? myScore - 1 : "—"}</div>
                    )}
                    {oppScore === null && <div style={{fontSize:11,color:C.dim,marginTop:2}}>tap + to enter</div>}
                  </div>
                  <ScoreButton label="+" size={52} onClick={()=>{
                    const cur = oppScore !== null ? oppScore : holeData.par - 1;
                    setScore(opp.playerId, currentHole, cur + 1);
                  }}/>
                </div>
              </div>
            );
          })}

          {/* Next / Finish */}
          <BigBtn
            onClick={()=>isLastHole?setStep("summary"):setCurrentHole(h=>h+1)}
            disabled={!canAdvance}
            color={isLastHole?C.gold:C.green}
            textColor="#0a1a0f"
            style={{marginTop:8}}
          >
            {!canAdvance ? "Enter your score to continue"
              : isLastHole ? "Finish Round 🏆"
              : `Next → Hole ${currentHole + 1}`}
          </BigBtn>

          <div style={{textAlign:"center",fontSize:11,color:C.dim,marginTop:8}}>
            Auto-saving · Round is safe if you close the app
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── SUMMARY SCREEN ────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "summary") {
    const results = opponents.map(opp => ({
      ...opp,
      tally: getTally(scores, course, opp),
    }));
    const grandTotal = results.reduce((s,r)=>s+r.tally.total, 0);

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 20px"}}>
          <button onClick={()=>setStep("playing")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back to Round</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:6}}>🏆</div>
            <div style={{fontSize:22,fontWeight:800}}>Round Summary</div>
            <div style={{fontSize:13,color:C.muted}}>{course.name}</div>
          </div>
        </div>

        <div style={{padding:"0 20px"}}>
          {/* Grand total */}
          <div style={{background:C.card,border:`2px solid ${grandTotal>=0?C.green:C.red}`,borderRadius:14,padding:"20px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Overall</div>
            <div style={{fontSize:52,fontWeight:800,color:grandTotal>=0?C.green:C.red,letterSpacing:-2}}>
              {grandTotal>=0?"+":"−"}${Math.abs(grandTotal).toFixed(2)}
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{grandTotal>=0?"You collect":"You owe"}</div>
          </div>

          {/* Per opponent */}
          {results.map(r => (
            <div key={r.playerId} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:17}}>{r.name}</div>
                <div style={{fontSize:22,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>
                  {r.tally.total>=0?"+":"−"}${Math.abs(r.tally.total).toFixed(2)}
                </div>
              </div>
              <div style={{fontSize:12,color:C.muted}}>
                {r.betType==="match"?`Match Play $${r.betAmount}/hole`:r.betType==="nassau"?`Nassau $${r.betAmount}`:`Skins $${r.betAmount}`}
                {" · "}
                {r.strokes===0?"Even":r.strokes>0?`You gave ${r.strokes}`:(`You got ${Math.abs(r.strokes)}`)}
              </div>
            </div>
          ))}

          {/* Scorecard */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",marginBottom:16,overflowX:"auto"}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Scorecard</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",padding:"4px 6px",color:C.muted}}>Hole</th>
                  <th style={{padding:"4px 4px",color:C.muted}}>Par</th>
                  <th style={{padding:"4px 4px",color:C.green}}>You</th>
                  {opponents.map(o=><th key={o.playerId} style={{padding:"4px 4px",color:C.gold}}>{o.name.split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {course.holes.map(h=>{
                  const my = getScore("me", h.hole);
                  return (
                    <tr key={h.hole} style={{borderTop:`1px solid ${C.dim}`}}>
                      <td style={{padding:"4px 6px",color:C.muted,fontSize:11}}>{h.hole}{h.side==="back"&&h.hole===10?" ←":""}</td>
                      <td style={{padding:"4px 4px",textAlign:"center",color:C.muted}}>{h.par}</td>
                      <td style={{padding:"4px 4px",textAlign:"center",fontWeight:700,color:my!==null?scoreColor(my,h.par):C.dim}}>
                        {my !== null ? my : "—"}
                      </td>
                      {opponents.map(opp=>{
                        const s = getScore(opp.playerId, h.hole);
                        const sh = getStrokeHolesForOpp(opp).includes(h.hole);
                        return <td key={opp.playerId} style={{padding:"4px 4px",textAlign:"center",color:C.text}}>
                          {s !== null ? s : "—"}{sh?"⭐":""}
                        </td>;
                      })}
                    </tr>
                  );
                })}
                {/* Totals */}
                <tr style={{borderTop:`2px solid ${C.green}`,background:"rgba(123,180,80,0.05)"}}>
                  <td style={{padding:"6px",color:C.green,fontWeight:800,fontSize:12}}>TOT</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.muted,fontWeight:700}}>{course.par}</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.green,fontWeight:800}}>
                    {Object.values(scores["me"]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"—"}
                  </td>
                  {opponents.map(opp=>(
                    <td key={opp.playerId} style={{padding:"6px",textAlign:"center",color:C.gold,fontWeight:800}}>
                      {Object.values(scores[opp.playerId]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <BigBtn onClick={postToLedger} disabled={posting} color={C.gold} textColor="#0a1a0f">
            {posting?"Posting...":"✅ Post Results to Ledger"}
          </BigBtn>
          <div style={{height:10}}/>
          <GhostBtn onClick={()=>setStep("playing")}>Back to Round</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}
