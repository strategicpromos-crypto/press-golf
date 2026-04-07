import { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES, getStrokeHoles, calcAutoPressNassau } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

// -- Safe integer helper - NEVER returns NaN or undefined ----------------------
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
        background:C.dim, border:"1px solid "+C.border,
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
      color, border:"1.5px solid "+color, borderRadius:12,
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
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:"1px solid "+C.border,borderBottom:"none",padding:"0 0 44px",maxHeight:"92vh",overflowY:"auto"}}>
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
  border:"1px solid "+C.border, borderRadius:10,
  color:C.text, fontSize:15, outline:"none",
  WebkitAppearance:"none", cursor:"pointer",
};

// -- SCORE NAME LABEL ----------------------------------------------------------
function scoreName(score, par) {
  if (score === par - 2) return "Eagle 🦅";
  if (score === par - 1) return "Birdie 🐦";
  if (score === par)     return "Par v";
  if (score === par + 1) return "Bogey";
  if (score === par + 2) return "Double 😬";
  return score > par ? "+" + (score - par) : "" + (score - par);
}

function scoreColor(score, par) {
  if (score < par)  return C.green;
  if (score > par)  return C.red;
  return C.muted;
}

// -- BET CALCULATORS -----------------------------------------------------------
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

function getTally(scores, course, opp, courseId) {
  const absStrokes = Math.abs(opp.strokes || 0);
  const strokeHoles    = getStrokeHoles(courseId || "south-toledo", absStrokes);
  const myStrokeHoles  = opp.strokes < 0 ? strokeHoles : [];
  const oppStrokeHoles = opp.strokes > 0 ? strokeHoles : [];
  const myScores  = scores["me"]         || {};
  const oppScores = scores[opp.playerId] || {};

  // -- Match Play: show holes up/down --
  if (opp.betType === "match") {
    let upDown = 0, played = 0;
    for (const h of course.holes) {
      const my = safeInt(myScores[h.hole],  -1);
      const op = safeInt(oppScores[h.hole], -1);
      if (my < 0 || op < 0) continue;
      played++;
      const myNet  = myStrokeHoles.includes(h.hole)  ? my - 1 : my;
      const oppNet = oppStrokeHoles.includes(h.hole) ? op - 1 : op;
      if (myNet < oppNet)      upDown++;
      else if (myNet > oppNet) upDown--;
    }
    const label = upDown === 0 ? "Even"
      : upDown > 0 ? upDown + " Up" : Math.abs(upDown) + " Down";
    return { label, upDown, played, total: upDown * opp.betAmount };
  }

  // -- Nassau: show front/back standing --
  if (opp.betType === "nassau") {
    const manualPresses = opp.manualPresses || [];

    // Always run through press calculator so we get per-bet detail
    const r = calcAutoPressNassau(
      { me: myScores, opp: oppScores },
      course.holes,
      myStrokeHoles,
      oppStrokeHoles,
      opp.betAmount,
      99,          // pressDown=99 means never auto-triggers
      manualPresses
    );

    // diff in each bet: positive = YOU ahead, negative = you behind
    const lastFrontDiff = r.front?.bets?.length ? r.front.bets[r.front.bets.length - 1].diff : 0;
    const lastBackDiff  = r.back?.bets?.length  ? r.back.bets[r.back.bets.length  - 1].diff : 0;

    function pressLabel(side) {
      if (!side?.bets?.length) return "-";
      const last = side.bets[side.bets.length - 1];
      const diffStr = last.diff === 0 ? "All Square" : last.diff > 0 ? "You " + last.diff + " Up" : Math.abs(last.diff) + " Down";
      const pressCount = side.bets.length - 1;
      return diffStr + (pressCount > 0 ? " · " + pressCount + "P" : "");
    }

    const label = "Front: " + pressLabel(r.front) + "  |  Back: " + pressLabel(r.back);
    return { label, total: r.net, pressDetail: r, lastFrontDiff, lastBackDiff };
  }

  // -- Skins: show skin count --
  if (opp.betType === "skins") {
    let mySkins = 0, oppSkins = 0, carry = 0, net = 0;
    for (const h of course.holes) {
      const my = safeInt(myScores[h.hole],  -1);
      const op = safeInt(oppScores[h.hole], -1);
      if (my < 0 || op < 0) continue;
      const myNet  = myStrokeHoles.includes(h.hole)  ? my - 1 : my;
      const oppNet = oppStrokeHoles.includes(h.hole) ? op - 1 : op;
      const pot = opp.betAmount + carry;
      if (myNet < oppNet)      { mySkins++; net += pot;  carry = 0; }
      else if (myNet > oppNet) { oppSkins++; net -= pot; carry = 0; }
      else                     { carry += opp.betAmount; }
    }
    const label = mySkins === oppSkins ? "Even"
      : mySkins > oppSkins ? "You " + mySkins + "-" + oppSkins
      : opp.name.split(" ")[0] + " " + oppSkins + "-" + mySkins;
    return { label, total: net };
  }

  // -- Nassau with Auto Press --
  if (opp.betType === "nassau-press") {
    const r = calcAutoPressNassau(
      { me: myScores, opp: oppScores },
      course.holes,
      myStrokeHoles,
      oppStrokeHoles,
      opp.betAmount,
      opp.pressDown || 2,
      opp.manualPresses || []
    );

    // Build label showing front/back bets
    function pressLabel(side) {
      if (!side || !side.bets || side.bets.length === 0) return "-";
      const orig = side.bets[0];
      const origStr = orig.diff === 0 ? "Even" : orig.diff > 0 ? "+" + orig.diff + " ahead" : "-" + Math.abs(orig.diff) + " back";
      const pressCount = side.bets.length - 1;
      return origStr + (pressCount > 0 ? " (" + pressCount + " press)" : "");
    }

    const label = "Front: " + pressLabel(r.front) + "  |  Back: " + pressLabel(r.back);
    return {
      label,
      total: r.net,
      pressDetail: r,
      lastFrontDiff: r.front?.bets?.length ? r.front.bets[r.front.bets.length-1].diff : 0,
      lastBackDiff:  r.back?.bets?.length  ? r.back.bets[r.back.bets.length-1].diff   : 0,
    };
  }

  return { label: "-", total: 0 };
}

// -- MAIN COMPONENT ------------------------------------------------------------
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
  // Press interstitial: list of opponents needing a press decision before next hole
  const [pressCheck,  setPressCheck]  = useState(null); // null | { opps: [...], nextHole: N }

  // Add opponent form
  const [addOppId,       setAddOppId]       = useState("");
  const [addStrokes,     setAddStrokes]     = useState("0");
  const [addStrokesDir,  setAddStrokesDir]  = useState("even");
  const [addBetType,     setAddBetType]     = useState("nassau");
  const [addPressDown,   setAddPressDown]   = useState(2);
  const [addBetAmt,      setAddBetAmt]      = useState("5");
  const [addSameGroup,   setAddSameGroup]   = useState(true); // same group = can enter scores + manual press

  const course = COURSES[courseId];
  const holeData = course?.holes[currentHole - 1];
  const saveTimer = useRef(null);

  // -- Check for existing active round on mount ------------------------------
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

  // -- Auto-save scores to Supabase whenever scores change ------------------
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

  // -- Start round - saves to DB immediately ---------------------------------
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

  // -- Score setter - always uses safe integers ------------------------------
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

  // -- Opponent helpers ------------------------------------------------------
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

  // -- Add opponent ----------------------------------------------------------
  function addOpponent() {
    const player = players.find(p => p.id === addOppId);
    if (!player) return;
    if (opponents.find(o => o.playerId === addOppId)) return;
    const rawStrokes = safeInt(addStrokes, 0);
    // Strokes are entered per side - multiply by 2 for total across 18
    const totalStrokes = rawStrokes * 2;
    const finalStrokes = addStrokesDir === "igive" ? totalStrokes
                       : addStrokesDir === "iget"  ? -totalStrokes
                       : 0;
    setOpponents(prev => [...prev, {
      playerId:    player.id,
      name:        player.name,
      strokes:     finalStrokes,
      betType:     addBetType,
      betAmount:   safeInt(addBetAmt, 5),
      pressDown:   addBetType === "nassau-press" ? addPressDown : 2,
      sameGroup:   addSameGroup,
      manualPresses: [], // holes where manual press was called {hole, betIndex}
      linkedUserId: player.linked_user_id || null,
    }]);
    setAddOppId(""); setAddStrokes("0"); setAddStrokesDir("even"); setAddBetAmt("5");
    setSheet(null);
  }

  // -- Manual Press - records press starting on given hole -------------------
  function callManualPress(oppId, onHole) {
    const pressHole = onHole ?? currentHole;
    setOpponents(prev => prev.map(opp => {
      if (opp.playerId !== oppId) return opp;
      const alreadyPressed = (opp.manualPresses||[]).some(p => p.hole === pressHole);
      if (alreadyPressed) return opp;
      return { ...opp, manualPresses: [...(opp.manualPresses||[]), { hole: pressHole }] };
    }));
  }

  // -- Advance to next hole - check for press decisions first ----------------
  function advanceHole() {
    const totalHoles = course?.holes?.length || 18;
    const lastHole   = currentHole >= totalHoles;

    if (lastHole) { setStep("summary"); return; }

    const nextHole = currentHole + 1;
    const side     = currentHole <= 9 ? "front" : "back";

    // Find opponents eligible for a press decision right now
    const pressable = opponents.filter(opp => {
      if (!opp.sameGroup) return false;
      if (opp.betType !== "nassau" && opp.betType !== "nassau-press") return false;
      if ((opp.manualPresses||[]).some(p => p.hole === currentHole)) return false;
      const tally = getTally(scores, course, opp, courseId);
      const lastDiff = side === "front" ? tally.lastFrontDiff : tally.lastBackDiff;
      return lastDiff === -1 || lastDiff === 1;
    });

    if (pressable.length > 0) {
      setPressCheck({ opps: pressable, nextHole, pressed: [], declined: [] });
    } else {
      setCurrentHole(nextHole);
    }
  }
  async function postToLedger() {
    setPosting(true);
    const today = new Date().toISOString().slice(0, 10);

    for (const opp of opponents) {
      const player = players.find(p => p.id === opp.playerId);
      if (!player) continue;
      const tally = getTally(scores, course, opp, courseId);
      const amount = tally.total;

      await sb.from("rounds").insert({
        owner_id:    user.id,
        player_id:   opp.playerId,
        player_name: opp.name,
        date:        today,
        strokes:     opp.strokes,
        money:       amount,
        notes:       "Live round | " + course.name + " | " + opp.betType + " $" + opp.betAmount,
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
          title:   "Round posted: " + course.name,
          body:    opp.betType + " | " + (amount >= 0 ? "You owe" : "You collect") + " $" + Math.abs(amount).toFixed(2),
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

  // -- Discard round ---------------------------------------------------------
  async function discardRound() {
    if (liveRoundId) {
      await sb.from("live_rounds").update({ status: "complete" }).eq("id", liveRoundId);
    }
    setLiveRoundId(null); setOpponents([]); setScores({});
    setCurrentHole(1); setStep("setup"); setResuming(false);
  }

  // ==========================================================================
  // -- RESUME PROMPT ---------------------------------------------------------
  // ==========================================================================
  if (resuming) return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>⛳</div>
      <div style={{fontWeight:700,fontSize:22,marginBottom:8,textAlign:"center"}}>Round In Progress</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:8,textAlign:"center"}}>{COURSES[courseId]?.name}</div>
      <div style={{fontSize:13,color:C.gold,marginBottom:28,textAlign:"center"}}>
        Hole {currentHole} - {opponents.map(o=>o.name).join(", ")}
      </div>
      <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>
        <BigBtn onClick={()=>{setResuming(false);setStep("playing");}}>Resume Round</BigBtn>
        <GhostBtn onClick={()=>{setResuming(false);setStep("summary");}}>Go to Summary</GhostBtn>
        <GhostBtn onClick={()=>{
          if(window.confirm("Are you sure you want to discard this round? All scores will be lost and cannot be recovered.")) {
            discardRound();
          }
        }} color={C.red}>Discard Round</GhostBtn>
        <GhostBtn onClick={()=>{setResuming(false);setLiveRoundId(null);setStep("setup");}}>Start New Round</GhostBtn>
      </div>
    </div>
  );

  // ==========================================================================
  // -- SETUP SCREEN ----------------------------------------------------------
  // ==========================================================================
  if (step === "setup") return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
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
              <option key={id} value={id}>{c.name} - {c.city}</option>
            ))}
          </select>
          {COURSES[courseId]?.note && <div style={{fontSize:11,color:C.gold,marginTop:6}}>{COURSES[courseId].note}</div>}
        </div>

        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
          Opponents ({opponents.length})
        </div>

        {opponents.length === 0 && (
          <div style={{textAlign:"center",padding:"20px",background:C.card,border:"1px solid "+C.border,borderRadius:12,marginBottom:12,color:C.muted,fontSize:13}}>
            Add at least one opponent to start
          </div>
        )}

        {opponents.map(opp => {
          const sh = getStrokeHolesForOpp(opp).sort((a,b)=>a-b);
          const perSide = Math.abs(opp.strokes) / 2;
          const strokeLabel = opp.strokes === 0 ? "Even"
            : opp.strokes > 0 ? "You give " + perSide + "/side (" + opp.strokes + " total)"
            : "You get " + perSide + "/side (" + Math.abs(opp.strokes) + " total)";
          return (
            <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17,marginBottom:3}}>{opp.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:2}}>
                    {strokeLabel} - {
                      opp.betType === "match" ? "$" + opp.betAmount + "/hole"
                      : opp.betType === "nassau" ? "Nassau $" + opp.betAmount
                      : opp.betType === "nassau-press" ? "Nassau - Auto Press " + (opp.pressDown||2) + "D $" + opp.betAmount
                      : "Skins $" + opp.betAmount
                    }
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

        <button onClick={()=>setSheet("addOpp")} style={{width:"100%",padding:"14px",background:"transparent",border:"1.5px dashed "+C.border,borderRadius:12,color:C.green,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:20}}>
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
              <option value="">- Choose opponent -</option>
              {players.filter(p=>!opponents.find(o=>o.playerId===p.id)).map(p=>(
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Lbl>Strokes Per Side</Lbl>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {[["even","Even"],["igive","I Give"],["iget","I Get"]].map(([d,l])=>(
                <button key={d} onClick={()=>setAddStrokesDir(d)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addStrokesDir===d?700:500,background:addStrokesDir===d?C.green:C.surface,color:addStrokesDir===d?"#0a1a0f":C.muted,border:"1px solid "+(addStrokesDir===d?C.green:C.border),cursor:"pointer",borderRadius:8}}>{l}</button>
              ))}
            </div>
            {addStrokesDir !== "even" && (
              <div>
                <input type="number" min="1" max="9" value={addStrokes} onChange={e=>setAddStrokes(e.target.value)} placeholder="# per side" style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="numeric"/>
                <div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"center"}}>
                  {safeInt(addStrokes,0) > 0
                    ? (addStrokesDir==="igive"?"Giving":"Getting") + " " + addStrokes + " per side = " + (safeInt(addStrokes,0)*2) + " total strokes"
                    : "1 per side = stroke on #1 hdcp hole each side"}
                </div>
              </div>
            )}
          </div>

          <div>
            <Lbl>Bet Type</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["match","Match Play"],["nassau","Nassau"],["nassau-press","Nassau - Auto Press"],["skins","Skins"]].map(([id,label])=>(
                <button key={id} onClick={()=>setAddBetType(id)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addBetType===id?700:500,background:addBetType===id?C.green:C.surface,color:addBetType===id?"#0a1a0f":C.muted,border:"1px solid "+(addBetType===id?C.green:C.border),cursor:"pointer",borderRadius:8}}>{label}</button>
              ))}
            </div>
          </div>

          {/* Press trigger selector - only show for nassau-press */}
          {addBetType === "nassau-press" && (
            <div>
              <Lbl>Auto Press Triggers When</Lbl>
              <div style={{display:"flex",gap:8}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>setAddPressDown(n)} style={{flex:1,padding:"12px 4px",fontSize:13,fontWeight:addPressDown===n?700:500,background:addPressDown===n?C.gold:C.surface,color:addPressDown===n?"#0a1a0f":C.muted,border:"1px solid "+(addPressDown===n?C.gold:C.border),cursor:"pointer",borderRadius:8}}>
                    {n} Down
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"center"}}>
                New bet starts when either player is {addPressDown} down
              </div>
            </div>
          )}

          <div>
            <Lbl>{addBetType==="match"?"$ Per Hole":addBetType==="nassau"?"$ Per Side/Total":addBetType==="nassau-press"?"$ Per Side/Total/Press":"$ Per Skin"}</Lbl>
            <input type="number" min="1" value={addBetAmt} onChange={e=>setAddBetAmt(e.target.value)} placeholder="e.g. 5" style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:20,outline:"none",boxSizing:"border-box",textAlign:"center",fontWeight:700}} inputMode="decimal"/>
          </div>

          {/* Same Group Toggle */}
          <div style={{background:C.dim,borderRadius:12,padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:2}}>Same Group</div>
                <div style={{fontSize:11,color:C.muted}}>
                  {addSameGroup
                    ? "Can enter scores & call manual press"
                    : "Different group - scores optional, no manual press"}
                </div>
              </div>
              <button
                onClick={()=>setAddSameGroup(g=>!g)}
                style={{
                  width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",
                  background:addSameGroup?C.green:"#333",
                  position:"relative",transition:"background 0.2s",flexShrink:0,
                }}
              >
                <div style={{
                  position:"absolute",top:4,
                  left:addSameGroup?26:4,
                  width:20,height:20,borderRadius:"50%",
                  background:"#fff",transition:"left 0.2s",
                }}/>
              </button>
            </div>
          </div>

          <BigBtn onClick={addOpponent} disabled={!addOppId}>Add to Round</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>
    </div>
  );

  // ==========================================================================
  // -- PLAYING SCREEN --------------------------------------------------------
  // ==========================================================================
  if (step === "playing" && holeData) {
    const myScore   = getScore("me", currentHole);
    const canAdvance = myScore !== null;
    const isLastHole = currentHole === course.holes.length;

    return (
      <>
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
        {/* Header */}
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):setStep("setup")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,color:C.text,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} - Hdcp {holeData.hdcp}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
              <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🏠 Home</button>
              <button onClick={()=>setStep("summary")} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12}}>Summary</button>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        <div style={{padding:"14px 18px"}}>

          {/* -- MY SCORE -- */}
          <div style={{background:C.card,border:"2px solid "+C.green,borderRadius:14,padding:"16px",marginBottom:12}}>
            <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>⛳ Your Score</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <ScoreButton label="-" size={60} onClick={()=>{
                const cur = myScore !== null ? myScore : holeData.par;
                setScore("me", currentHole, cur - 1);
              }}/>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:72,fontWeight:800,color:C.text,lineHeight:1}}>
                  {myScore !== null ? myScore : "-"}
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

          {/* -- OPPONENT SCORES -- */}
          {opponents.map(opp => {
            const oppScore    = getScore(opp.playerId, currentHole);
            const getsStroke  = oppGetsStrokeOnHole(opp, currentHole);
            const iGetStroke  = iGetStrokeOnHole(opp, currentHole);
            const tally       = getTally(scores, course, opp, courseId);

            return (
              <div key={opp.playerId} style={{background:C.card,border:(getsStroke||iGetStroke?"1px solid rgba(232,184,75,0.5)":"1px solid "+C.border),borderRadius:14,padding:"14px",marginBottom:10}}>
                {/* Header row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{fontWeight:700,fontSize:16}}>{opp.name}</div>
                      {opp.sameGroup && <div style={{fontSize:10,color:C.green,background:"rgba(123,180,80,0.12)",padding:"2px 7px",borderRadius:8}}>Same Group</div>}
                    </div>
                    {getsStroke && <div style={{fontSize:11,color:C.gold,marginTop:2}}>⭐ {opp.name} gets a stroke this hole</div>}
                    {iGetStroke && <div style={{fontSize:11,color:C.green,marginTop:2}}>⭐ You get a stroke this hole</div>}
                    {!getsStroke && !iGetStroke && !opp.sameGroup && <div style={{fontSize:10,color:C.dim,marginTop:2}}>different group - scores optional</div>}
                  </div>
                </div>

                {/* Score row */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <ScoreButton label="-" size={52} onClick={()=>{
                    const cur = oppScore !== null ? oppScore : holeData.par;
                    setScore(opp.playerId, currentHole, cur - 1);
                  }}/>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:52,fontWeight:800,color:oppScore!==null?C.text:C.dim,lineHeight:1}}>
                      {oppScore !== null ? oppScore : "-"}
                    </div>
                    {oppScore !== null && getsStroke && (
                      <div style={{fontSize:11,color:C.gold,marginTop:2}}>Net score: {oppScore - 1}</div>
                    )}
                    {oppScore !== null && iGetStroke && (
                      <div style={{fontSize:11,color:C.green,marginTop:2}}>Your net: {myScore !== null ? myScore - 1 : "-"}</div>
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
            onClick={advanceHole}
            disabled={!canAdvance}
            color={isLastHole?C.gold:C.green}
            textColor="#0a1a0f"
            style={{marginTop:8}}
          >
            {!canAdvance ? "Enter your score to continue"
              : isLastHole ? "Finish Round ⛳"
              : "Next - Hole " + (currentHole + 1)}
          </BigBtn>

          {/* Standing bar - shows below the Next button */}
          {canAdvance && opponents.length > 0 && (
            <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              {opponents.map(opp => {
                const t = getTally(scores, course, opp, courseId);
                const side = currentHole <= 9 ? "front" : "back";
                const lastDiff = side === "front" ? t.lastFrontDiff : t.lastBackDiff;
                const diffLabel = lastDiff === 0 ? "All Square"
                  : lastDiff > 0 ? "You " + lastDiff + " Up"
                  : opp.name.split(" ")[0] + " " + Math.abs(lastDiff) + " Up";
                const pressCount = (t.pressDetail?.front?.bets?.length||1) + (t.pressDetail?.back?.bets?.length||1) - 2;
                const pressBadge = pressCount > 0 ? " · " + pressCount + "P" : "";
                return (
                  <div key={opp.playerId} style={{
                    background:C.card,border:"1px solid "+C.border,borderRadius:20,
                    padding:"5px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6
                  }}>
                    <span style={{color:C.muted,fontWeight:600}}>{opp.name.split(" ")[0]}:</span>
                    <span style={{fontWeight:700,color:lastDiff>0?C.green:lastDiff<0?C.red:C.muted}}>
                      {diffLabel}{pressBadge}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{textAlign:"center",fontSize:11,color:C.dim,marginTop:10}}>
            Auto-saving · Round is safe if you close the app
          </div>
        </div>
      </div>

      {/* Press Interstitial Modal - appears between holes when press is available */}
      {pressCheck && (
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end"}}>
          <div onClick={()=>{setCurrentHole(pressCheck.nextHole);setPressCheck(null);}} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)"}}/>
          <div style={{position:"relative",width:"100%",background:C.surface,borderRadius:"22px 22px 0 0",border:"1px solid "+C.border,borderBottom:"none",padding:"24px 20px 44px"}}>

            {/* Pill handle */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
              <div style={{width:40,height:4,background:C.dim,borderRadius:2}}/>
            </div>

            <div style={{textAlign:"center",marginBottom:4}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Heading to Hole {pressCheck.nextHole}</div>
              <div style={{fontSize:20,fontWeight:800,marginTop:4}}>Press Decision</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                Press starts on hole {pressCheck.nextHole} · decide before teeing off
              </div>
            </div>

            <div style={{height:1,background:C.border,margin:"16px 0"}}/>

            {pressCheck.opps.map(opp => {
              const tally = getTally(scores, course, opp, courseId);
              const side  = currentHole <= 9 ? "front" : "back";
              const lastDiff = side === "front" ? tally.lastFrontDiff : tally.lastBackDiff;
              const youAreDown = lastDiff === -1;
              const kenIsDown  = lastDiff === 1;
              const alreadyIn      = pressCheck.pressed?.includes(opp.playerId);
              const alreadyDeclined = pressCheck.declined?.includes(opp.playerId);

              return (
                <div key={opp.playerId} style={{marginBottom:16,background:C.card,borderRadius:14,padding:"14px",border:"1px solid "+C.border}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>{opp.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                    {youAreDown
                      ? "You are 1 Down on the current bet — you may press"
                      : opp.name.split(" ")[0] + " is 1 Down — " + opp.name.split(" ")[0] + " may press"}
                  </div>
                  {alreadyIn ? (
                    <div style={{textAlign:"center",padding:"10px",background:"rgba(123,180,80,0.1)",borderRadius:10,border:"1px solid "+C.green,color:C.green,fontWeight:700,fontSize:13}}>
                      ✓ Press On — starts hole {pressCheck.nextHole}
                    </div>
                  ) : alreadyDeclined ? (
                    <div style={{textAlign:"center",padding:"10px",background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid "+C.border,color:C.muted,fontWeight:600,fontSize:13}}>
                      No Press — continuing
                    </div>
                  ) : (
                    <div style={{display:"flex",gap:10}}>
                      <button
                        onClick={() => setPressCheck(pc => ({...pc, pressed: [...(pc.pressed||[]), opp.playerId]}))}
                        style={{flex:1,padding:"12px",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",
                          background: youAreDown?"rgba(224,80,80,0.15)":"rgba(232,184,75,0.15)",
                          border:"1px solid "+(youAreDown?C.red:C.gold),
                          color: youAreDown?C.red:C.gold}}
                      >
                        📢 Yes, Press
                      </button>
                      <button
                        onClick={() => setPressCheck(pc => {
                          // Mark as "declined" so the card shows No Press and we skip
                          const declined = [...(pc.declined||[]), opp.playerId];
                          return {...pc, declined};
                        })}
                        style={{flex:1,padding:"12px",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",
                          background:"transparent",border:"1px solid "+C.border,color:C.muted}}
                      >
                        No Press
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <BigBtn
              color={C.green}
              onClick={() => {
                // Record all presses on current hole (bet starts on nextHole in calcAutoPressNassau)
                (pressCheck.pressed || []).forEach(oppId => callManualPress(oppId, currentHole));
                setCurrentHole(pressCheck.nextHole);
                setPressCheck(null);
              }}
            >
              Continue to Hole {pressCheck.nextHole} →
            </BigBtn>
          </div>
        </div>
      )}
      </>
    );
  }

  // ==========================================================================
  // -- SUMMARY SCREEN --------------------------------------------------------
  // ==========================================================================
  if (step === "summary") {
    const results = opponents.map(opp => ({
      ...opp,
      tally: getTally(scores, course, opp, courseId),
    }));
    const grandTotal = results.reduce((s,r)=>s+r.tally.total, 0);

    // Standing label from diff (+1 = you 1 up, -1 = opp 1 up)
    function standingStr(diff, oppFirst) {
      if (diff > 0) return "You " + diff + " Up";
      if (diff < 0) return oppFirst + " " + Math.abs(diff) + " Up";
      return "All Square";
    }

    // Get holes where presses started (for scorecard markers)
    function getPressHoles(r) {
      const s = new Set();
      if (r.tally.pressDetail) {
        (r.tally.pressDetail.front?.bets || []).slice(1).forEach(b => s.add(b.startHole));
        (r.tally.pressDetail.back?.bets  || []).slice(1).forEach(b => s.add(b.startHole));
      }
      return s;
    }

    // Hole-by-hole net outcomes for a result (W/L/H or null)
    function holeOutcomes(r) {
      const abs = Math.abs(r.strokes || 0);
      const sh  = getStrokeHoles(courseId || "south-toledo", abs);
      const mySH  = r.strokes < 0 ? sh : [];
      const opSH  = r.strokes > 0 ? sh : [];
      const myS   = scores["me"]        || {};
      const opS   = scores[r.playerId]  || {};
      const out   = {};
      for (const h of course.holes) {
        const my = safeInt(myS[h.hole], -1);
        const op = safeInt(opS[h.hole], -1);
        if (my < 0 || op < 0) { out[h.hole] = null; continue; }
        const mn = mySH.includes(h.hole) ? my - 1 : my;
        const on = opSH.includes(h.hole) ? op - 1 : op;
        out[h.hole] = mn < on ? "W" : mn > on ? "L" : "H";
      }
      return out;
    }

    const allPressHoles = new Set();
    results.forEach(r => getPressHoles(r).forEach(h => allPressHoles.add(h)));
    const allOutcomes = {};
    results.forEach(r => { allOutcomes[r.playerId] = holeOutcomes(r); });

    // Bet description line
    function betTypeStr(r) {
      if (r.betType === "match")        return "Match Play $" + r.betAmount + "/hole";
      if (r.betType === "nassau")       return "Nassau $" + r.betAmount + "/side";
      if (r.betType === "nassau-press") return "Nassau - Auto Press " + (r.pressDown||2) + "D · $" + r.betAmount + "/bet";
      return "Skins $" + r.betAmount + "/skin";
    }
    function strokeStr(r) {
      if (!r.strokes) return "Even";
      return r.strokes > 0
        ? "You gave " + (r.strokes/2) + "/side"
        : "You got "  + (Math.abs(r.strokes)/2) + "/side";
    }

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 20px"}}>
          <button onClick={()=>setStep("playing")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back to Round</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:800}}>Round Summary</div>
            <div style={{fontSize:13,color:C.muted}}>{course.name}</div>
          </div>
        </div>

        <div style={{padding:"0 20px"}}>

          {/* Grand total */}
          <div style={{background:C.card,border:"2px solid "+(grandTotal>=0?C.green:C.red),borderRadius:14,padding:"20px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Overall</div>
            <div style={{fontSize:52,fontWeight:800,color:grandTotal>=0?C.green:C.red,letterSpacing:-2}}>
              {grandTotal>=0?"+":"-"}${Math.abs(grandTotal).toFixed(2)}
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{grandTotal>=0?"You collect":"You owe"}</div>
          </div>

          {/* Per opponent */}
          {results.map(r => {
            const pd = r.tally.pressDetail;
            const oppFirst = r.name.split(" ")[0];

            function BetRow({ label, b, betAmount, holesStr }) {
              const won  = b.amount > 0;
              const lost = b.amount < 0;
              // diff: positive = you ahead, negative = you behind
              const standingColor = b.diff > 0 ? C.green : b.diff < 0 ? C.red : C.muted;
              const standingTxt   = b.diff === 0 ? "All Square"
                : b.diff > 0 ? "You " + b.diff + " Up"
                : oppFirst + " " + Math.abs(b.diff) + " Up";
              return (
                <div style={{borderLeft:"3px solid "+(won?C.green:lost?C.red:C.border),paddingLeft:10,marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:1}}>{label}{holesStr?" · holes "+holesStr:""}</div>
                      <div style={{fontSize:14,fontWeight:700,color:standingColor}}>{standingTxt}</div>
                    </div>
                    <div style={{
                      fontSize:15,fontWeight:800,
                      color: won ? C.green : lost ? C.red : C.muted,
                      background: won?"rgba(123,180,80,0.12)":lost?"rgba(224,80,80,0.12)":"transparent",
                      padding:"3px 10px",borderRadius:8,marginLeft:8,flexShrink:0
                    }}>
                      {b.amount===0 ? "Tied" : (won?"+":"-")+"$"+Math.abs(b.amount).toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            }

            function SideBlock({ side, label, sideTotal, sideStart, sideEnd }) {
              if (!side?.bets?.length) return null;
              const totalBets = side.bets.length;
              return (
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700}}>
                      {label} {totalBets > 1 ? "· " + (totalBets-1) + " press" + (totalBets>2?"es":"") : ""}
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:sideTotal>0?C.green:sideTotal<0?C.red:C.muted}}>
                      {sideTotal===0?"Even":(sideTotal>0?"+":"-")+"$"+Math.abs(sideTotal).toFixed(2)}
                    </div>
                  </div>
                  {side.bets.map((b, i) => {
                    const nextStart = side.bets[i+1]?.startHole;
                    const holeEnd   = nextStart ? nextStart - 1 : sideEnd;
                    const holesStr  = b.startHole + "–" + holeEnd;
                    const rowLabel  = i === 0 ? "Original bet" : "Press " + i;
                    return (
                      <BetRow key={i} label={rowLabel} b={b} betAmount={r.betAmount} holesStr={holesStr} />
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={r.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontWeight:700,fontSize:17}}>{r.name}</div>
                  <div style={{fontSize:24,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>
                    {r.tally.total>=0?"+":"-"}${Math.abs(r.tally.total).toFixed(2)}
                  </div>
                </div>
                <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                  {betTypeStr(r)} · {strokeStr(r)}
                </div>

                {/* Nassau / press breakdown */}
                {pd && (
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"10px"}}>
                    <SideBlock side={pd.front} label="FRONT 9" sideTotal={pd.front?.total||0} sideStart={1}  sideEnd={9} />
                    <SideBlock side={pd.back}  label="BACK 9"  sideTotal={pd.back?.total||0}  sideStart={10} sideEnd={18} />

                    {/* 18-hole total */}
                    <div style={{borderTop:"1px solid "+C.border,paddingTop:8,marginTop:4}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
                        <div>
                          <div style={{fontSize:12,color:C.muted}}>18-hole total (no press)</div>
                          <div style={{fontSize:13,fontWeight:700,color:pd.total>0?C.green:pd.total<0?C.red:C.muted}}>
                            {standingStr(
                              (()=>{
                                let myT=0,opT=0;
                                for(const h of course.holes){
                                  const my=safeInt((scores["me"]||{})[h.hole],-1);
                                  const op=safeInt((scores[r.playerId]||{})[h.hole],-1);
                                  if(my<0||op<0)continue;
                                  const abs=Math.abs(r.strokes||0);
                                  const sh=getStrokeHoles(courseId||"south-toledo",abs);
                                  const mySH=r.strokes<0?sh:[];
                                  const opSH=r.strokes>0?sh:[];
                                  myT+=mySH.includes(h.hole)?my-1:my;
                                  opT+=opSH.includes(h.hole)?op-1:op;
                                }
                                return opT-myT; // positive = you ahead by strokes
                              })(),
                              oppFirst
                            )}
                          </div>
                        </div>
                        <div style={{fontSize:16,fontWeight:800,
                          color:pd.total>0?C.green:pd.total<0?C.red:C.muted,
                          background:pd.total>0?"rgba(123,180,80,0.12)":pd.total<0?"rgba(224,80,80,0.12)":"transparent",
                          padding:"3px 10px",borderRadius:8
                        }}>
                          {pd.total===0?"Tied":(pd.total>0?"+":"-")+"$"+Math.abs(pd.total||0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Match play summary */}
                {r.betType === "match" && (
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,color:C.muted}}>Final standing · {r.tally.played} holes</div>
                        <div style={{fontSize:16,fontWeight:700,color:r.tally.upDown>0?C.green:r.tally.upDown<0?C.red:C.muted}}>{r.tally.label}</div>
                      </div>
                      <div style={{fontSize:18,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>
                        {r.tally.total>=0?"+":"-"}${Math.abs(r.tally.total).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Scorecard */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:16,overflowX:"auto"}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
              Scorecard · {allPressHoles.size > 0 ? "📢 = Press started" : ""}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:280}}>
              <thead>
                <tr style={{borderBottom:"1px solid "+C.border}}>
                  <th style={{textAlign:"left",padding:"4px 6px",color:C.muted,fontWeight:600}}>Hole</th>
                  <th style={{padding:"4px 4px",color:C.muted,fontWeight:600}}>Par</th>
                  <th style={{padding:"4px 4px",color:C.green,fontWeight:600}}>You</th>
                  {opponents.map(o=>(
                    <th key={o.playerId} style={{padding:"4px 4px",color:C.gold,fontWeight:600}}>{o.name.split(" ")[0]}</th>
                  ))}
                  {results.length === 1 && (
                    <th style={{padding:"4px 4px",color:C.muted,fontWeight:600,fontSize:10}}>Net</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {course.holes.map(h => {
                  const my = getScore("me", h.hole);
                  const isBack = h.side === "back" && h.hole === 10;
                  const isPress = allPressHoles.has(h.hole);
                  const outcome = results.length === 1 ? allOutcomes[results[0].playerId]?.[h.hole] : null;

                  return (
                    <React.Fragment key={h.hole}>
                      {isBack && (
                        <tr>
                          <td colSpan={3 + opponents.length + (results.length===1?1:0)} style={{padding:"6px 6px",textAlign:"center",fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",background:"rgba(123,180,80,0.06)",borderTop:"1px solid "+C.border}}>
                            ── Back 9 ──
                          </td>
                        </tr>
                      )}
                      <tr style={{borderTop:"1px solid "+C.dim, background: isPress?"rgba(232,184,75,0.04)":undefined}}>
                        <td style={{padding:"5px 6px",fontSize:11,fontWeight:isPress?700:400,color:isPress?C.gold:C.muted}}>
                          {h.hole}{isPress?" 📢":""}
                        </td>
                        <td style={{padding:"5px 4px",textAlign:"center",color:C.muted}}>{h.par}</td>
                        <td style={{padding:"5px 4px",textAlign:"center",fontWeight:700,color:my!==null?scoreColor(my,h.par):C.dim}}>
                          {my !== null ? my : "-"}
                        </td>
                        {opponents.map(opp => {
                          const s  = getScore(opp.playerId, h.hole);
                          const sh = getStrokeHolesForOpp(opp).includes(h.hole);
                          return (
                            <td key={opp.playerId} style={{padding:"5px 4px",textAlign:"center",color:s!==null?scoreColor(s,h.par):C.dim,fontWeight:s!==null?700:400}}>
                              {s !== null ? s : "-"}{sh ? "⭐" : ""}
                            </td>
                          );
                        })}
                        {results.length === 1 && (
                          <td style={{padding:"5px 4px",textAlign:"center",fontWeight:700,fontSize:11,
                            color: outcome==="W"?C.green : outcome==="L"?C.red : outcome==="H"?C.muted : C.dim
                          }}>
                            {outcome || "-"}
                          </td>
                        )}
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Front 9 subtotal */}
                {(() => {
                  const fHoles = course.holes.filter(h=>h.side==="front");
                  const myF = fHoles.reduce((s,h)=>s+safeInt((scores["me"]||{})[h.hole],0),0);
                  return (
                    <tr style={{borderTop:"1.5px solid "+C.border,background:"rgba(123,180,80,0.04)"}}>
                      <td style={{padding:"5px 6px",color:C.green,fontWeight:700,fontSize:11}}>F9</td>
                      <td style={{padding:"5px 4px",textAlign:"center",color:C.muted,fontWeight:600}}>{fHoles.reduce((s,h)=>s+h.par,0)}</td>
                      <td style={{padding:"5px 4px",textAlign:"center",color:C.green,fontWeight:800}}>{myF||"-"}</td>
                      {opponents.map(opp=>(
                        <td key={opp.playerId} style={{padding:"5px 4px",textAlign:"center",color:C.gold,fontWeight:800}}>
                          {fHoles.reduce((s,h)=>s+safeInt((scores[opp.playerId]||{})[h.hole],0),0)||"-"}
                        </td>
                      ))}
                      {results.length===1&&<td/>}
                    </tr>
                  );
                })()}

                {/* Back 9 subtotal */}
                {(() => {
                  const bHoles = course.holes.filter(h=>h.side==="back");
                  const myB = bHoles.reduce((s,h)=>s+safeInt((scores["me"]||{})[h.hole],0),0);
                  return (
                    <tr style={{borderTop:"1px solid "+C.dim,background:"rgba(123,180,80,0.04)"}}>
                      <td style={{padding:"5px 6px",color:C.green,fontWeight:700,fontSize:11}}>B9</td>
                      <td style={{padding:"5px 4px",textAlign:"center",color:C.muted,fontWeight:600}}>{bHoles.reduce((s,h)=>s+h.par,0)}</td>
                      <td style={{padding:"5px 4px",textAlign:"center",color:C.green,fontWeight:800}}>{myB||"-"}</td>
                      {opponents.map(opp=>(
                        <td key={opp.playerId} style={{padding:"5px 4px",textAlign:"center",color:C.gold,fontWeight:800}}>
                          {bHoles.reduce((s,h)=>s+safeInt((scores[opp.playerId]||{})[h.hole],0),0)||"-"}
                        </td>
                      ))}
                      {results.length===1&&<td/>}
                    </tr>
                  );
                })()}

                {/* Grand total row */}
                <tr style={{borderTop:"2px solid "+C.green,background:"rgba(123,180,80,0.06)"}}>
                  <td style={{padding:"6px",color:C.green,fontWeight:800,fontSize:12}}>TOT</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.muted,fontWeight:700}}>{course.par}</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.green,fontWeight:800}}>
                    {Object.values(scores["me"]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"-"}
                  </td>
                  {opponents.map(opp=>(
                    <td key={opp.playerId} style={{padding:"6px",textAlign:"center",color:C.gold,fontWeight:800}}>
                      {Object.values(scores[opp.playerId]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"-"}
                    </td>
                  ))}
                  {results.length===1&&<td/>}
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
