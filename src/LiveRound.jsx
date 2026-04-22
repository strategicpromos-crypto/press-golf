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
  if (score === par - 2) return "Eagle";
  if (score === par - 1) return "Birdie";
  if (score === par)     return "Par v";
  if (score === par + 1) return "Bogey";
  if (score === par + 2) return "Double";
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
  // Nassau is match play — winner of each side is whoever wins more holes, not fewest strokes
  function side(holes) {
    let holesWon = 0, played = 0;
    for (const h of holes) {
      const my  = safeInt(scores["me"]?.[h.hole], -1);
      const opp = safeInt(scores["opp"]?.[h.hole], -1);
      if (my < 0 || opp < 0) continue;
      played++;
      const myNet  = myStrokeHoles.includes(h.hole)  ? my  - 1 : my;
      const oppNet = oppStrokeHoles.includes(h.hole) ? opp - 1 : opp;
      if (myNet < oppNet) holesWon++;
      else if (myNet > oppNet) holesWon--;
    }
    if (played === 0) return 0;
    if (holesWon > 0)  return  betAmount;
    if (holesWon < 0)  return -betAmount;
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

    // If manual presses exist, use the press calculator with pressDown=99 (never auto triggers)
    if (manualPresses.length > 0) {
      const r = calcAutoPressNassau(
        { me: myScores, opp: oppScores },
        course.holes,
        myStrokeHoles,
        oppStrokeHoles,
        opp.betAmount,
        99,
        manualPresses
      );
      function pressLabel(side) {
        if (!side?.bets?.length) return "-";
        return side.bets.map((b,i) => {
          const sym = b.diff < 0 ? (Math.abs(b.diff) + "v") : b.diff > 0 ? (b.diff + "^") : "E";
          return i === 0 ? sym : "P" + sym;
        }).join(" / ");
      }
      return { label: "F: " + pressLabel(r.front) + " | B: " + pressLabel(r.back), total: r.net, pressDetail: r };
    }

    function sideDiff(holes) {
      // Match play: count holes won/lost, not stroke totals
      let holesUp = 0, played = 0;
      for (const h of holes) {
        const my = safeInt(myScores[h.hole],  -1);
        const op = safeInt(oppScores[h.hole], -1);
        if (my < 0 || op < 0) continue;
        played++;
        const myNet  = myStrokeHoles.includes(h.hole)  ? my - 1 : my;
        const oppNet = oppStrokeHoles.includes(h.hole) ? op - 1 : op;
        if (myNet < oppNet) holesUp++;
        else if (myNet > oppNet) holesUp--;
      }
      // negative diff = holesUp (matches standingLabel: diff<0 → Up)
      return { diff: -holesUp, played };
    }
    const front = sideDiff(course.holes.filter(h=>h.side==="front"));
    const back  = sideDiff(course.holes.filter(h=>h.side==="back"));

    function standingLabel(diff, played) {
      if (played === 0) return "-";
      if (diff === 0) return "Even";
      return diff < 0 ? Math.abs(diff) + " Up" : diff + " Down";
    }

    function sideAmt(diff, played) {
      if (played === 0) return 0;
      if (diff < 0) return opp.betAmount;
      if (diff > 0) return -opp.betAmount;
      return 0;
    }
    const frontAmt = sideAmt(front.diff, front.played);
    const backAmt  = sideAmt(back.diff,  back.played);
    const allPlayed = course.holes.filter(h => {
      const my = safeInt(myScores[h.hole], -1);
      const op = safeInt(oppScores[h.hole], -1);
      return my >= 0 && op >= 0;
    }).length;
    const overall   = sideDiff(course.holes);
    const overallAmt = allPlayed === 18 ? sideAmt(overall.diff, overall.played) : 0;

    const label = "F: " + standingLabel(front.diff, front.played) + " | B: " + standingLabel(back.diff, back.played);
    return { label, total: frontAmt + backAmt + overallAmt };
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
      return side.bets.map((b, i) => {
        const sym = b.diff < 0 ? (Math.abs(b.diff) + "v") : b.diff > 0 ? (b.diff + "^") : "E";
        return i === 0 ? sym : "P" + sym;
      }).join(" / ");
    }

    const label = "F: " + pressLabel(r.front) + " | B: " + pressLabel(r.back);
    return {
      label,
      total: r.net,
      pressDetail: r,
    };
  }

  return { label: "-", total: 0 };
}

// -- MAIN COMPONENT ------------------------------------------------------------
export default function LiveRound({ user, players, roundData, onRoundDataChange, onBack, onPostToLedger, onDelete }) {
  // If roundData is provided by App, initialize from it — no internal loading needed
  const [step,        setStep]        = useState(roundData ? "playing" : "setup");
  const [courseId,    setCourseId]    = useState(roundData?.course_id || "south-toledo");
  const [opponents,   setOpponents]   = useState(roundData?.opponents || []);
  const [scores,      setScores]      = useState(roundData?.scores || {});
  const [currentHole, setCurrentHole] = useState(roundData?.current_hole || 1);
  const [sheet,       setSheet]       = useState(null);
  const [myName,      setMyName]      = useState("");
  const [posting,     setPosting]     = useState(false);
  const [liveRoundId, setLiveRoundId] = useState(roundData?.id || null);
  const [resuming,    setResuming]    = useState(false);
  const [liveTab,     setLiveTab]     = useState("score");
  const [showRoundSettings, setShowRoundSettings] = useState(false);
  const [showShareRound,    setShowShareRound]    = useState(false);
  const [back9Adjustments,  setBack9Adjustments]  = useState(roundData?.back9_adjustments||{});
  const [holePars,          setHolePars]          = useState({});
  const realtimeSub   = useRef(null);
  const saveTimerRef  = useRef(null); // named ref to avoid collision with saveTimer state
  const pendingScores = useRef(null); // scores waiting to flush if connection dropped
  const [connStatus,  setConnStatus]  = useState("connecting"); // connecting|online|syncing|offline

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
  const effPar   = holeData ? (holePars[currentHole] ?? holeData.par) : 4;
  const saveTimer = useRef(null);

  // Session management lives in App.jsx (mirrors tournament captain pattern).
  // roundData prop is pre-loaded by App — no internal Supabase loading needed.
  // For new rounds (roundData=null), step="setup" and user fills in opponents.

  // -- Flush pending scores — never touches connStatus on success -----------
  // connStatus only changes on genuine connection failure, not normal saves
  async function flushScores(scoresToSave, hole) {
    try {
      await sb.from("live_rounds").update({
        scores: scoresToSave,
        current_hole: hole,
        back9_adjustments: back9Adjustments,
        updated_at: new Date().toISOString(),
      }).eq("id", liveRoundId);
      pendingScores.current = null;
      // Only update connStatus if we were previously offline/syncing
      setConnStatus(prev => (prev === "offline" || prev === "syncing") ? "online" : prev);
    } catch(e) {
      // Genuine write failure — mark offline
      setConnStatus("offline");
    }
  }

  // -- Auto-save scores — never touches connStatus, just saves silently ----
  useEffect(() => {
    if (!liveRoundId || step !== "playing") return;
    pendingScores.current = { scores, currentHole };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await flushScores(scores, currentHole);
    }, 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [scores, currentHole, back9Adjustments, liveRoundId, step]);

  // -- Stable channel name — no Date.now() so React never creates a duplicate
  // useRef holds the channel ID so it survives re-renders without triggering effects
  const channelName = useRef(null);

  useEffect(() => {
    if (!liveRoundId || step !== "playing") return;

    // Build a stable channel name once per round — never changes on re-render
    if (!channelName.current) {
      channelName.current = "live_round_" + liveRoundId + "_" + teamIdx;
    }

    function buildSub() {
      if (realtimeSub.current) {
        sb.removeChannel(realtimeSub.current);
        realtimeSub.current = null;
      }
      realtimeSub.current = sb
        .channel(channelName.current)
        .on("postgres_changes", {
          event: "UPDATE", schema: "public",
          table: "live_rounds", filter: "id=eq." + liveRoundId,
        }, payload => {
          if (payload.new?.scores) {
            setScores(prev => {
              const incoming = payload.new.scores;
              const merged = { ...incoming };
              merged["me"] = prev["me"] || {};
              return merged;
            });
          }
        })
        .subscribe(status => {
          if (status === "SUBSCRIBED") {
            setConnStatus("online");
            // Silently flush pending scores without changing status to "syncing"
            if (pendingScores.current) {
              flushScores(pendingScores.current.scores, pendingScores.current.currentHole);
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // Only go offline if we were previously online — ignore initial setup noise
            setConnStatus(prev => prev === "online" ? "offline" : prev);
            setTimeout(() => buildSub(), 4000);
          }
        });
    }

    // Store buildSub in ref so visibility handler can call it without stale closure
    subRef.current = { rebuild: buildSub };
    buildSub();

    // iOS visibility reconnect
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        // Only rebuild if we know connection dropped — don't rebuild on every wake
        setConnStatus(prev => {
          if (prev === "offline") {
            subRef.current?.rebuild?.();
          }
          return prev === "offline" ? "connecting" : prev;
        });
        if (pendingScores.current) {
          flushScores(pendingScores.current.scores, pendingScores.current.currentHole);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    // Summary shortcut — fired by home screen Summary button
    function handleShowSummary() { setStep("summary"); }
    window.addEventListener("press_show_summary", handleShowSummary);

    return () => {
      if (realtimeSub.current) {
        sb.removeChannel(realtimeSub.current);
        realtimeSub.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("press_show_summary", handleShowSummary);
    };
  }, [liveRoundId, step]);

  // -- Start round - only advances to playing after confirmed DB insert ------
  async function startRound() {
    if (opponents.length === 0) return;
    setPosting(true);
    let newId = null;
    try {
      const safeCourseId = COURSES[courseId] ? courseId : "south-toledo";
      const { data } = await sb.from("live_rounds").insert({
        owner_id: user.id,
        course_id: safeCourseId,
        course_name: COURSES[safeCourseId]?.name || safeCourseId,
        owner_name: myName.trim() || "Partner",
        opponents,
        scores: {},
        current_hole: 1,
        status: "active",
      }).select().single();
      if (data) {
        newId = data.id;
        setLiveRoundId(data.id);
        if(safeCourseId !== courseId) setCourseId(safeCourseId);
        // Notify App so it can save session to localStorage
        if(onRoundDataChange) onRoundDataChange(data);
      }
    } catch(e) {
      console.warn("live_rounds insert failed:", e);
      setPosting(false);
      return; // Don't advance to playing if insert failed
    }
    if(!newId) {
      setPosting(false);
      return; // Don't advance if we got no ID back
    }
    channelName.current = null; // fresh channel for new round
    setScores({});
    setCurrentHole(1);
    setPosting(false);
    setStep("playing");
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

  // -- Manual Press ----------------------------------------------------------
  function callManualPress(oppId) {
    setOpponents(prev => prev.map(opp => {
      if (opp.playerId !== oppId) return opp;
      // Only add press if not already pressed this hole
      const alreadyPressedThisHole = (opp.manualPresses||[]).some(p => p.hole === currentHole);
      if (alreadyPressedThisHole) return opp;
      return {
        ...opp,
        manualPresses: [...(opp.manualPresses||[]), { hole: currentHole }]
      };
    }));
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
      await sb.from("live_rounds").delete().eq("id", liveRoundId);
    }
    // Tell App to clear session and remove from home screen
    if(onDelete) onDelete();
  }

  // ==========================================================================
  // -- RESUME PROMPT ---------------------------------------------------------
  // ==========================================================================
  // Resume screen handled by App.jsx (mirrors captain_resume pattern).

    if (step === "setup") return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:36}}>⛳</div>
          <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Start Individual Round</div>
        </div>
      </div>

      <div style={{padding:"0 20px"}}>
        {/* Your Name */}
        <div style={{marginBottom:16}}>
          <Lbl>Your Name</Lbl>
          <input
            value={myName}
            onChange={e=>setMyName(e.target.value)}
            placeholder="e.g. Michael"
            style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box"}}
          />
          <div style={{fontSize:11,color:C.muted,marginTop:6}}>Shows on your opponents' scorecards</div>
        </div>

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
          {posting ? "Starting..." : "Tee It Up!"}
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
  // Safety net: if step=playing but course/hole data isn't ready yet, show loading
  if (step === "playing" && !holeData) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"Georgia,serif"}}>
        <div style={{width:40,height:40,border:"3px solid "+C.dim,borderTop:"3px solid "+C.green,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={{color:C.muted,fontSize:14}}>Starting round...</div>
        <button onClick={()=>setStep("setup")} style={{marginTop:16,background:"transparent",border:"1px solid "+C.border,color:C.muted,padding:"8px 16px",borderRadius:10,fontSize:12,cursor:"pointer"}}>← Back to Setup</button>
      </div>
    );
  }

  if (step === "playing" && holeData) {
    const myScore   = getScore("me", currentHole);
    const canAdvance = myScore !== null;
    const isLastHole = currentHole === course.holes.length;

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
        {/* Header */}
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):setStep("setup")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,color:C.text,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {effPar}{effPar!==holeData.par?" !!":""} · Hdcp {holeData.hdcp}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
              <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🏠 Home</button>
              <button onClick={()=>setShowRoundSettings(true)} style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>⚙️ Edit</button>
              {opponents.some(o=>!o.sameGroup)&&liveRoundId&&(
                <button onClick={()=>setShowShareRound(true)} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🔗 Share</button>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        {/* Match standing bar */}
        {opponents.length > 0 && (()=>{
          const opp = opponents[0];
          const absStrokes = Math.abs(opp.strokes||0);
          const strokeHoles = getStrokeHoles(courseId, absStrokes);
          const myS = scores["me"]||{};
          const oppS = scores[opp.playerId]||{};
          // Match play: count holes won/lost per side, not stroke totals
          let front=0, back=0;
          for(const h of course.holes){
            const my=safeInt(myS[h.hole],-1), op=safeInt(oppS[h.hole],-1);
            if(my<0||op<0) continue;
            const myNet = opp.strokes<0&&strokeHoles.includes(h.hole)?my-1:my;
            const opNet = opp.strokes>0&&strokeHoles.includes(h.hole)?op-1:op;
            const result = myNet<opNet ? 1 : myNet>opNet ? -1 : 0;
            if(h.side==="front") front+=result; else back+=result;
          }
          const tot=front+back;
          // Positive = holes up (winning)
          const fmt=v=>v===0?"A/S":v>0?Math.abs(v)+" UP":Math.abs(v)+" DN";
          const clr=v=>v>0?C.green:v<0?C.red:C.muted;
          return(
            <div style={{background:C.card,borderBottom:"1px solid "+C.border,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>Me <span style={{color:C.muted,fontWeight:400,fontSize:12}}>vs</span> {opponents.length===1?opp.name:opponents.length+" players"}</div>
                <div style={{fontSize:11,color:C.muted}}>{course.name} · thru {Math.max(0,currentHole-1)} holes</div>
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

        {/* Connection status banner */}
        {connStatus==="offline"&&(
          <div onClick={()=>{setConnStatus("connecting");startLiveRoundSub();}}
            style={{background:"rgba(224,80,80,0.15)",border:"2px solid rgba(224,80,80,0.7)",margin:"0 12px 10px",borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:"#e05050",flexShrink:0}}/>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:"#e05050"}}>Scores not uploading</div>
                <div style={{fontSize:11,color:"rgba(224,80,80,0.8)",marginTop:2}}>Saved on phone. Tap to reconnect.</div>
              </div>
            </div>
            <div style={{background:"#e05050",color:"#fff",fontSize:11,fontWeight:800,padding:"5px 10px",borderRadius:8,flexShrink:0}}>Reconnect</div>
          </div>
        )}
        {connStatus==="syncing"&&(
          <div style={{background:"rgba(232,184,75,0.12)",border:"2px solid rgba(232,184,75,0.6)",margin:"0 12px 10px",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:"#e8b84b",flexShrink:0}}/>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#e8b84b"}}>Uploading scores...</div>
                <div style={{fontSize:11,color:"rgba(232,184,75,0.7)",marginTop:2}}>Do not close the app</div>
              </div>
            </div>
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

            {/* Hole bubble selector */}
            <div style={{display:"flex",overflowX:"auto",gap:6,marginBottom:14,paddingBottom:4}}>
              {course.holes.map(h=>{
                const scored = getScore("me",h.hole)!==null;
                return(
                  <button key={h.hole} onClick={async()=>{
                    if(saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    if(pendingScores.current) await flushScores(pendingScores.current.scores, pendingScores.current.currentHole);
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
                {opponents.filter(o=>o.sameGroup).map(opp=>{
                  if(opp.betType!=="nassau"&&opp.betType!=="nassau-press") return null;
                  const t=getTally(scores,course,opp,courseId);
                  const alreadyPressed=(opp.manualPresses||[]).some(p=>p.hole===currentHole);
                  if(alreadyPressed) return <button key={opp.playerId} disabled style={{background:"#555",border:"none",color:"#aaa",padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"not-allowed"}}>Pressed ✓</button>;
                  if(t.total<0) return <button key={opp.playerId} onClick={()=>callManualPress(opp.playerId)} style={{background:C.red,border:"none",color:"#fff",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>Press!</button>;
                  return null;
                })}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <ScoreButton label="-" size={60} onClick={()=>setScore("me",currentHole,(myScore!==null?myScore:effPar)-1)}/>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{fontSize:72,fontWeight:800,color:C.text,lineHeight:1}}>{myScore!==null?myScore:"-"}</div>
                  {myScore!==null&&<div style={{fontSize:14,color:scoreColor(myScore,effPar),marginTop:4,fontWeight:700}}>{scoreName(myScore,effPar)}</div>}
                  {myScore===null&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>tap + to start</div>}
                </div>
                <ScoreButton label="+" size={60} onClick={()=>setScore("me",currentHole,(myScore!==null?myScore:effPar-1)+1)}/>
              </div>
            </div>

            {/* Same-group opponents — stacked, editable */}
            {opponents.filter(o=>o.sameGroup).map(opp=>{
              const oppScore=getScore(opp.playerId,currentHole);
              const getsStroke=oppGetsStrokeOnHole(opp,currentHole);
              const iGetStroke=iGetStrokeOnHole(opp,currentHole);
              const tally=getTally(scores,course,opp,courseId);
              return(
                <div key={opp.playerId} style={{background:C.card,border:"1px solid "+(getsStroke||iGetStroke?"rgba(232,184,75,0.5)":C.border),borderRadius:14,padding:"14px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{opp.name} <span style={{fontSize:10,color:C.green,background:"rgba(123,180,80,0.12)",padding:"2px 7px",borderRadius:8}}>Same Group</span></div>
                      {getsStroke&&<div style={{fontSize:11,color:C.gold,marginTop:2}}>⭐ {opp.name} gets a stroke</div>}
                      {iGetStroke&&<div style={{fontSize:11,color:C.green,marginTop:2}}>⭐ You get a stroke</div>}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:tally.label==="Even"?C.muted:tally.label?.includes("Up")?C.green:C.red}}>{tally.label||"-"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                    <ScoreButton label="-" size={52} onClick={()=>setScore(opp.playerId,currentHole,(oppScore!==null?oppScore:effPar)-1)}/>
                    <div style={{flex:1,textAlign:"center"}}>
                      <div style={{fontSize:52,fontWeight:800,color:oppScore!==null?C.text:C.dim,lineHeight:1}}>{oppScore!==null?oppScore:"-"}</div>
                      {oppScore!==null&&getsStroke&&<div style={{fontSize:11,color:C.gold,marginTop:2}}>Net: {oppScore-1}</div>}
                      {oppScore!==null&&iGetStroke&&<div style={{fontSize:11,color:C.green,marginTop:2}}>Your net: {myScore!==null?myScore-1:"-"}</div>}
                      {oppScore===null&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>tap + to enter</div>}
                    </div>
                    <ScoreButton label="+" size={52} onClick={()=>setScore(opp.playerId,currentHole,(oppScore!==null?oppScore:effPar-1)+1)}/>
                  </div>
                </div>
              );
            })}

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

            <button onClick={async()=>{
              // Hard flush before advancing — guaranteed write, no debounce
              if(saveTimerRef.current) clearTimeout(saveTimerRef.current);
              if(pendingScores.current||true){
                setConnStatus("syncing");
                await flushScores(scores, currentHole);
              }
              if(connStatus==="offline"||connStatus==="syncing") startLiveRoundSub();
              if(isLastHole) setStep("summary");
              else setCurrentHole(h=>h+1);
            }} disabled={!canAdvance}
              style={{width:"100%",padding:"16px",background:!canAdvance?"#333":isLastHole?C.gold:C.green,color:!canAdvance?C.muted:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:!canAdvance?"not-allowed":"pointer",marginTop:8}}>
              {!canAdvance?"Enter your score to continue":isLastHole?"Finish Round":"Next - Hole "+(currentHole+1)}
            </button>
            <div style={{textAlign:"center",fontSize:11,color:connStatus==="offline"?"rgba(224,80,80,0.8)":connStatus==="syncing"?"rgba(232,184,75,0.8)":C.dim,marginTop:8}}>
              {connStatus==="offline"?"Scores saved locally — tap Next Hole to retry":connStatus==="syncing"?"Uploading...":"Scores saved · safe to close"}
            </div>
          </>)}

          {/* ── MATCH TAB ── */}
          {liveTab==="match"&&(
            <div>
              {opponents.map(opp=>{
                const tally=getTally(scores,course,opp,courseId);
                const absStrokes=Math.abs(opp.strokes||0);
                const strokeHoles=getStrokeHoles(courseId,absStrokes);
                return(
                  <div key={opp.playerId} style={{marginBottom:20}}>
                    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                      {/* Header */}
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

                      {/* Bet breakdown — Nassau press */}
                      {(opp.betType==="nassau-press"||opp.betType==="nassau")&&tally.pressDetail&&(()=>{
                        function betRow(b, betAmt) {
                          const standing = b.diff===0?"E":b.diff>0?(b.diff+" UP"):(Math.abs(b.diff)+" DN");
                          const standColor = b.diff>0?C.green:b.diff<0?C.red:C.muted;
                          const amtColor = b.amount>0?C.green:b.amount<0?C.red:C.muted;
                          const amtStr = b.amount===0?"$0":b.amount>0?("+$"+b.amount.toFixed(2)):("-$"+Math.abs(b.amount).toFixed(2));
                          const isPress = b.label!=="Original";
                          return(
                            <div key={b.startHole+b.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                              <div style={{flex:1}}>
                                <span style={{fontSize:12,color:isPress?C.muted:C.text,fontWeight:isPress?400:600}}>
                                  {b.label==="Original"?"Original $"+betAmt:b.label.replace("Auto Press","Auto Press")+" (H"+b.startHole+")"}
                                </span>
                              </div>
                              <div style={{fontSize:12,fontWeight:700,color:standColor,minWidth:48,textAlign:"center"}}>{standing}</div>
                              <div style={{fontSize:12,fontWeight:800,color:amtColor,minWidth:52,textAlign:"right"}}>{amtStr}</div>
                            </div>
                          );
                        }

                        function sideTotal(side) {
                          if(!side?.bets?.length) return null;
                          const t = side.total;
                          return(
                            <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0 2px",marginTop:2}}>
                              <span style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:0.5}}>Side total</span>
                              <span style={{fontSize:13,fontWeight:800,color:t===0?C.muted:t>0?C.green:C.red}}>
                                {t===0?"$0":t>0?"+$"+t.toFixed(2):"-$"+Math.abs(t).toFixed(2)}
                              </span>
                            </div>
                          );
                        }

                        const pd = tally.pressDetail;
                        const holesPlayed18 = course.holes.filter(h=>{
                          const my=getScore("me",h.hole); const op=getScore(opp.playerId,h.hole);
                          return my!==null&&op!==null;
                        }).length;

                        return(
                          <div>
                            {/* Front 9 */}
                            {pd.front?.bets?.length>0&&(
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Front 9</div>
                                {pd.front.bets.map(b=>betRow(b,opp.betAmount))}
                                {sideTotal(pd.front)}
                              </div>
                            )}
                            {/* Back 9 */}
                            {pd.back?.bets?.length>0&&(
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Back 9</div>
                                {pd.back.bets.map(b=>betRow(b,opp.betAmount))}
                                {sideTotal(pd.back)}
                              </div>
                            )}
                            {/* 18-hole total */}
                            <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div>
                                <div style={{fontSize:12,color:C.muted}}>18-hole total</div>
                                <div style={{fontSize:10,color:C.dim}}>{holesPlayed18<18?"settles after hole 18":"final"}</div>
                              </div>
                              <div style={{fontSize:13,fontWeight:800,color:pd.total===0?C.muted:pd.total>0?C.green:C.red}}>
                                {holesPlayed18<18?"TBD":pd.total===0?"$0":pd.total>0?"+$"+pd.total.toFixed(2):"-$"+Math.abs(pd.total).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Match Play simple breakdown */}
                      {opp.betType==="match"&&(()=>{
                        const ud = tally.upDown||0;
                        const standing = ud===0?"All Square":ud>0?(ud+" Up"):(Math.abs(ud)+" Down");
                        return(
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                            <div style={{fontSize:13,color:C.muted}}>Match Play ${opp.betAmount}/hole · {opp.played||0} holes</div>
                            <div style={{fontSize:15,fontWeight:800,color:ud===0?C.muted:ud>0?C.green:C.red}}>{standing}</div>
                          </div>
                        );
                      })()}

                      {/* Nassau simple (no press) */}
                      {opp.betType==="nassau"&&!tally.pressDetail&&(()=>{
                        const front=tally.front||0; const back=tally.back||0;
                        return(
                          <div>
                            {[["Front 9",front],["Back 9",back],["18-hole",tally.total]].map(([lbl,amt])=>(
                              <div key={lbl} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                                <span style={{fontSize:12,color:C.muted}}>{lbl} · ${opp.betAmount}</span>
                                <span style={{fontSize:12,fontWeight:800,color:amt===0?C.muted:amt>0?C.green:C.red}}>
                                  {amt===0?"$0":amt>0?"+$"+amt.toFixed(2):"-$"+Math.abs(amt).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Skins */}
                      {opp.betType==="skins"&&(
                        <div style={{fontSize:13,color:C.muted,paddingTop:4}}>
                          See Skins tab for hole-by-hole results
                        </div>
                      )}
                    </div>
                    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",overflowX:"auto"}}>
                      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Scorecard</div>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:360}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid "+C.border}}>
                            <th style={{textAlign:"left",padding:"4px 6px",color:C.muted,fontWeight:500}}>Hole</th>
                            {course.holes.map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:h.hole===currentHole?C.gold:C.muted,fontWeight:h.hole===currentHole?700:400}}>{h.hole}</th>)}
                            <th style={{padding:"3px 6px",textAlign:"center",color:C.green,fontWeight:700}}>TOT</th>
                          </tr>
                          <tr>
                            <td style={{padding:"3px 6px",color:C.dim,fontSize:10}}>Par</td>
                            {course.holes.map(h=><td key={h.hole} style={{padding:"3px",textAlign:"center",color:C.dim,fontSize:11}}>{h.par}</td>)}
                            <td style={{padding:"3px 6px",textAlign:"center",color:C.dim,fontSize:11}}>{course.par}</td>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{borderTop:"1px solid "+C.dim}}>
                            <td style={{padding:"4px 6px",fontWeight:700,color:C.green,fontSize:12}}>You</td>
                            {course.holes.map(h=>{const s=getScore("me",h.hole);const st=strokeHoles.includes(h.hole)&&opp.strokes<0;return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:s!==null?scoreColor(s,h.par):C.dim,position:"relative"}}>{s!==null?s:"--"}{st&&s!==null&&<span style={{fontSize:7,color:C.gold,position:"absolute",top:2,right:2}}>●</span>}</td>;})}
                            <td style={{padding:"4px 6px",textAlign:"center",fontWeight:800,color:C.green}}>{Object.values(scores["me"]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"--"}</td>
                          </tr>
                          <tr style={{borderTop:"1px solid "+C.dim}}>
                            <td style={{padding:"4px 6px",fontWeight:700,color:C.gold,fontSize:12}}>{opp.name.split(" ")[0]}</td>
                            {course.holes.map(h=>{const s=getScore(opp.playerId,h.hole);const st=strokeHoles.includes(h.hole)&&opp.strokes>0;return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:s!==null?scoreColor(s,h.par):C.dim,position:"relative"}}>{s!==null?s:"--"}{st&&s!==null&&<span style={{fontSize:7,color:C.gold,position:"absolute",top:2,right:2}}>●</span>}</td>;})}
                            <td style={{padding:"4px 6px",textAlign:"center",fontWeight:800,color:C.gold}}>{Object.values(scores[opp.playerId]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"--"}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{fontSize:10,color:C.dim,marginTop:8}}>● = stroke hole · updates live</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SUMMARY TAB — live money breakdown mid-round ── */}
          {liveTab==="summary"&&(()=>{
            const results=opponents.map(opp=>({...opp,tally:getTally(scores,course,opp,courseId)}));
            const grandTotal=results.reduce((s,r)=>s+r.tally.total,0);
            const holesPlayed=Object.keys(scores["me"]||{}).length;
            const fmtAmt=v=>v>=0?"+$"+v.toFixed(2):"-$"+Math.abs(v).toFixed(2);

            return(
              <div>
                {holesPlayed===0&&(
                  <div style={{textAlign:"center",padding:"30px 20px",color:C.muted}}>
                    <div style={{fontSize:28,marginBottom:8}}>💰</div>
                    <div style={{fontSize:14}}>Money summary will appear as you enter scores.</div>
                  </div>
                )}
                {holesPlayed>0&&(
                  <>
                    {/* Grand total card */}
                    <div style={{background:C.card,border:"2px solid "+(grandTotal>=0?C.green:C.red),borderRadius:14,padding:"16px",marginBottom:12,textAlign:"center"}}>
                      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Running Total · thru {holesPlayed}</div>
                      <div style={{fontSize:44,fontWeight:800,color:grandTotal>=0?C.green:C.red,letterSpacing:-2}}>
                        {fmtAmt(grandTotal)}
                      </div>
                      <div style={{fontSize:12,color:C.muted,marginTop:2}}>{grandTotal>=0?"You collect":"You owe"}</div>
                    </div>

                    {/* Per opponent — full bet breakdown */}
                    {results.map(r=>{
                      const pd=r.tally.pressDetail;
                      return(
                        <div key={r.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:10}}>

                          {/* Header */}
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <div style={{fontWeight:800,fontSize:15}}>{r.name}</div>
                            <div style={{fontSize:20,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>{fmtAmt(r.tally.total)}</div>
                          </div>
                          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                            {r.betType==="match"?"Match Play $"+r.betAmount+"/hole"
                              :r.betType==="nassau"?"Nassau $"+r.betAmount
                              :r.betType==="nassau-press"?"Nassau + Auto Press "+(r.pressDown||2)+"D · $"+r.betAmount
                              :"Skins $"+r.betAmount}
                            {r.strokes!==0&&(" · "+(r.strokes>0?"You give "+(r.strokes/2)+"/side":"You get "+(Math.abs(r.strokes)/2)+"/side"))}
                          </div>

                          {/* Nassau + Auto Press — full breakdown */}
                          {(r.betType==="nassau-press"||r.betType==="nassau")&&pd&&(
                            <div style={{background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"10px 12px"}}>

                              {/* Front 9 */}
                              {pd.front?.bets?.length>0&&(
                                <div style={{marginBottom:8}}>
                                  <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Front 9</div>
                                  {pd.front.bets.map((b,i)=>(
                                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:4,marginBottom:4,borderBottom:i<pd.front.bets.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                                      <div>
                                        <div style={{fontSize:12,color:C.text,fontWeight:600}}>
                                          {i===0?"Original $"+r.betAmount:(b.label||"Press")+" · hole "+b.startHole}
                                        </div>
                                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                                          {b.diff===0?"All Square":b.diff>0?b.diff+" hole"+(b.diff>1?"s":"")+' up':Math.abs(b.diff)+" hole"+(Math.abs(b.diff)>1?"s":"")+" dn"}
                                        </div>
                                      </div>
                                      <div style={{fontSize:14,fontWeight:800,color:b.amount>=0?C.green:b.amount<0?C.red:C.muted}}>
                                        {b.amount===0?"$0":fmtAmt(b.amount)}
                                      </div>
                                    </div>
                                  ))}
                                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,marginTop:4,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
                                    <span style={{color:C.muted}}>Front subtotal</span>
                                    <span style={{color:pd.front.total>=0?C.green:pd.front.total<0?C.red:C.muted}}>{fmtAmt(pd.front.total)}</span>
                                  </div>
                                </div>
                              )}

                              {/* Back 9 */}
                              {pd.back?.bets?.length>0&&(
                                <div style={{marginBottom:8,paddingTop:pd.front?.bets?.length>0?8:0,borderTop:pd.front?.bets?.length>0?"1px solid rgba(255,255,255,0.08)":"none"}}>
                                  <div style={{fontSize:10,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Back 9</div>
                                  {pd.back.bets.map((b,i)=>(
                                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:4,marginBottom:4,borderBottom:i<pd.back.bets.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                                      <div>
                                        <div style={{fontSize:12,color:C.text,fontWeight:600}}>
                                          {i===0?"Original $"+r.betAmount:(b.label||"Press")+" · hole "+b.startHole}
                                        </div>
                                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                                          {b.diff===0?"All Square":b.diff>0?b.diff+" hole"+(b.diff>1?"s":"")+' up':Math.abs(b.diff)+" hole"+(Math.abs(b.diff)>1?"s":"")+" dn"}
                                        </div>
                                      </div>
                                      <div style={{fontSize:14,fontWeight:800,color:b.amount>=0?C.green:b.amount<0?C.red:C.muted}}>
                                        {b.amount===0?"$0":fmtAmt(b.amount)}
                                      </div>
                                    </div>
                                  ))}
                                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,marginTop:4,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
                                    <span style={{color:C.muted}}>Back subtotal</span>
                                    <span style={{color:pd.back.total>=0?C.green:pd.back.total<0?C.red:C.muted}}>{fmtAmt(pd.back.total)}</span>
                                  </div>
                                </div>
                              )}

                              {/* 18-hole total */}
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,marginTop:4,borderTop:"1px solid rgba(255,255,255,0.12)"}}>
                                <div>
                                  <div style={{fontSize:12,color:C.text,fontWeight:600}}>18-hole total</div>
                                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>No press · paid at end</div>
                                </div>
                                <div style={{fontSize:14,fontWeight:800,color:pd.total>=0?C.green:pd.total<0?C.red:C.muted}}>
                                  {pd.total===0?"$0 (in progress)":fmtAmt(pd.total)}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Match Play breakdown */}
                          {r.betType==="match"&&(()=>{
                            let holesWon=0,holesLost=0,halved=0;
                            for(const h of course.holes){
                              const my=scores["me"]?.[h.hole]; const op=scores[r.playerId]?.[h.hole];
                              if(my===undefined||op===undefined) continue;
                              const myN=myStrokeHoles?.includes?.(h.hole)?my-1:my;
                              const opN=oppStrokeHoles?.includes?.(h.hole)?op-1:op;
                              if(myN<opN) holesWon++; else if(myN>opN) holesLost++; else halved++;
                            }
                            return(
                              <div style={{background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"10px 12px"}}>
                                {[["Holes won",holesWon,"+"+(holesWon*r.betAmount).toFixed(2),C.green],["Holes lost",holesLost,"-"+(holesLost*r.betAmount).toFixed(2),C.red],["Halved",halved,"$0",C.muted]].map(([lbl,ct,amt,clr])=>(
                                  ct>0&&<div key={lbl} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                                    <span style={{color:C.muted}}>{lbl} ({ct})</span>
                                    <span style={{color:clr,fontWeight:700}}>{amt}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Skins breakdown */}
                          {r.betType==="skins"&&(()=>{
                            return(
                              <div style={{background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"10px 12px"}}>
                                <div style={{fontSize:12,color:C.muted}}>See Match tab for hole-by-hole skins detail</div>
                              </div>
                            );
                          })()}

                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })()}

        </div>

        {/* ── SHARE ROUND OVERLAY ── */}
        {showShareRound&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",fontFamily:"Georgia,serif"}}>
            <div style={{padding:"50px 20px 40px",maxWidth:480,margin:"0 auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:20,fontWeight:800,color:C.text}}>🔗 Share Round</div>
                <button onClick={()=>setShowShareRound(false)} style={{background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
              </div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}}>
                Send each player in a different group their own link. They enter their scores on their phone — your screen updates instantly.
              </div>
              {opponents.filter(o=>!o.sameGroup).map(opp=>{
                const link="https://press-golf.vercel.app?round="+liveRoundId+"&player="+opp.playerId;
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
                        style={{flex:2,padding:"12px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>
                        📱 Text {opp.name}
                      </button>
                      <button onClick={()=>{try{navigator.clipboard.writeText(link);}catch(e){}}}
                        style={{flex:1,padding:"12px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                        📋 Copy
                      </button>
                    </div>
                  </div>
                );
              })}
              <button onClick={()=>setShowShareRound(false)} style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:8}}>
                ✓ Done
              </button>
            </div>
          </div>
        )}

        {/* ── EDIT ROUND OVERLAY ── */}
        {showRoundSettings&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",fontFamily:"Georgia,serif"}}>
            <div style={{padding:"50px 20px 40px",maxWidth:480,margin:"0 auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:20,fontWeight:800,color:C.text}}>⚙️ Edit Round</div>
                <button onClick={()=>setShowRoundSettings(false)} style={{background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
              </div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.5}}>
                Edit player names and strokes. Back 9 adjustment adds or removes strokes for the remaining back 9 only.
              </div>

              {opponents.map((opp,i)=>{
                const perSide = Math.abs(opp.strokes||0)/2;
                const dir = opp.strokes>=0?"igive":"iget";
                const b9delta = back9Adjustments[opp.playerId]||0;
                return(
                  <div key={opp.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
                    <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Player {i+1}</div>
                    <input value={opp.name} onChange={e=>setOpponents(prev=>prev.map(o=>o.playerId===opp.playerId?{...o,name:e.target.value}:o))}
                      style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:16,fontWeight:600,outline:"none",boxSizing:"border-box",marginBottom:12}}/>
                    <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Strokes per side</div>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <button onClick={()=>setOpponents(prev=>prev.map(o=>o.playerId===opp.playerId?{...o,strokes:Math.max(0,Math.abs(o.strokes||0)-2)*(o.strokes>=0?1:-1)}:o))}
                        style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
                      <div style={{flex:1,textAlign:"center",fontSize:18,fontWeight:800}}>{perSide===0?"Even":dir==="igive"?"You give "+perSide:"You get "+perSide}</div>
                      <button onClick={()=>setOpponents(prev=>prev.map(o=>o.playerId===opp.playerId?{...o,strokes:(Math.abs(o.strokes||0)+2)*(o.strokes>=0?1:-1)}:o))}
                        style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
                      <button onClick={()=>setOpponents(prev=>prev.map(o=>o.playerId===opp.playerId?{...o,strokes:-(o.strokes||0)}:o))}
                        style={{padding:"8px 14px",background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>Flip ⇌</button>
                    </div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Back 9 Adjustment (kicks in at hole 10)</div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <button onClick={()=>setBack9Adjustments(prev=>({...prev,[opp.playerId]:(prev[opp.playerId]||0)-1}))}
                        style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
                      <div style={{flex:1,textAlign:"center",fontSize:16,fontWeight:700,color:b9delta===0?C.muted:C.gold}}>{b9delta===0?"No adjustment":b9delta>0?"+"+b9delta+" strokes":b9delta+" strokes"}</div>
                      <button onClick={()=>setBack9Adjustments(prev=>({...prev,[opp.playerId]:(prev[opp.playerId]||0)+1}))}
                        style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
                    </div>
                  </div>
                );
              })}

              {/* South Toledo hole #4 par override */}
              {courseId==="south-toledo"&&(
                <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>⛳ Hole #4 Par Override</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Normally par 3. Toggle if your group plays it as par 4.</div>
                  <div style={{display:"flex",gap:8}}>
                    {[3,4].map(p=>(
                      <button key={p} onClick={()=>setHolePars(prev=>({...prev,4:p}))}
                        style={{flex:1,padding:"16px",background:(holePars[4]??3)===p?C.green:"#1a2a1a",color:(holePars[4]??3)===p?"#0a1a0f":"#ffffff",border:"2px solid "+((holePars[4]??3)===p?C.green:"rgba(255,255,255,0.3)"),borderRadius:10,fontSize:16,fontWeight:(holePars[4]??3)===p?800:600,cursor:"pointer"}}>
                        Par {p}{p===3?" (default)":""}
                      </button>
                    ))}
                  </div>
                  {(holePars[4]??3)===4&&<div style={{fontSize:11,color:C.gold,marginTop:8,textAlign:"center"}}>Playing as par 4 — effective course par 71</div>}
                </div>
              )}

              <button onClick={()=>setShowRoundSettings(false)}
                style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:8}}>
                ✓ Done — Back to Round
              </button>
            </div>
          </div>
        )}

      </div>
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

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 20px 20px"}}>
          <button onClick={()=>setStep("playing")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back to Round</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:6}}></div>
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
          {results.map(r => (
            <div key={r.playerId} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:17}}>{r.name}</div>
                <div style={{fontSize:22,fontWeight:800,color:r.tally.total>=0?C.green:C.red}}>
                  {r.tally.total>=0?"+":"-"}${Math.abs(r.tally.total).toFixed(2)}
                </div>
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:8}}>
                {r.betType==="match" ? "Match Play $" + r.betAmount + "/hole"
                  : r.betType==="nassau" ? "Nassau $" + r.betAmount
                  : r.betType==="nassau-press" ? "Nassau - Auto Press " + (r.pressDown||2) + "D $" + r.betAmount
                  : "Skins $" + r.betAmount}
                {" - "}
                {r.strokes===0?"Even":r.strokes>0?"You gave " + (r.strokes/2) + "/side":"You got " + (Math.abs(r.strokes)/2) + "/side"}
              </div>

              {/* Press bet breakdown for nassau-press */}
              {r.betType === "nassau-press" && r.tally.pressDetail && (
                <div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"10px 12px"}}>
                  {/* Front bets */}
                  {r.tally.pressDetail.front?.bets?.length > 0 && (
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:10,color:C.green,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Front 9</div>
                      {r.tally.pressDetail.front.bets.map((b, i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:2}}>
                          <span style={{color:C.muted}}>{i===0 ? ("Original $" + r.betAmount) : (b.label || ("Press " + i)) + " (hole " + b.startHole + ")"}</span>
                          <span style={{color:b.amount>=0?C.green:C.red,fontWeight:700}}>
                            {b.amount>=0?"+":"-"}${Math.abs(b.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 18-hole total - never pressed */}
                  {/* Back bets */}
                  {r.tally.pressDetail.back?.bets?.length > 0 && (
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:10,color:C.green,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Back 9</div>
                      {r.tally.pressDetail.back.bets.map((b, i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:2}}>
                          <span style={{color:C.muted}}>{i===0 ? ("Original $" + r.betAmount) : (b.label || ("Press " + i)) + " (hole " + b.startHole + ")"}</span>
                          <span style={{color:b.amount>=0?C.green:C.red,fontWeight:700}}>
                            {b.amount>=0?"+":"-"}${Math.abs(b.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 18-hole total - never pressed */}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,borderTop:"1px solid "+C.border,paddingTop:6,marginTop:4}}>
                    <span style={{color:C.muted}}>18-hole total (no press)</span>
                    <span style={{color:r.tally.pressDetail.total>=0?C.green:C.red,fontWeight:700}}>
                      {r.tally.pressDetail.total>=0?"+":"-"}${Math.abs(r.tally.pressDetail.total||0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Scorecard — tournament style */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:16}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Scorecard</div>
            {/* Hole bubbles */}
            <div style={{display:"flex",overflowX:"auto",gap:6,marginBottom:14,paddingBottom:4}}>
              {course.holes.map(h=>{
                const scored = getScore("me", h.hole) !== null;
                return (
                  <div key={h.hole} style={{flexShrink:0,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,background:scored?"rgba(123,180,80,0.2)":C.dim,color:scored?C.green:C.muted,border:"1px solid "+(scored?C.green:C.border)}}>{h.hole}</div>
                );
              })}
            </div>
            {/* Score grid */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:280}}>
                <thead>
                  <tr style={{background:"rgba(0,0,0,0.25)"}}>
                    <th style={{textAlign:"left",padding:"5px 8px",color:C.muted,fontWeight:600,fontSize:11}}>Hole</th>
                    <th style={{padding:"5px 4px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Par</th>
                    <th style={{padding:"5px 4px",textAlign:"center",color:C.green,fontWeight:700,fontSize:11}}>You</th>
                    {opponents.map(o=>(<th key={o.playerId} style={{padding:"5px 4px",textAlign:"center",color:C.gold,fontWeight:700,fontSize:11}}>{o.name.split(" ")[0]}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {course.holes.map(h=>{
                    const my = getScore("me", h.hole);
                    const isBack = h.side==="back" && h.hole===10;
                    return (
                      <tr key={h.hole} style={{borderTop:"1px solid "+(isBack?C.green:C.dim),background:isBack?"rgba(123,180,80,0.04)":"transparent"}}>
                        <td style={{padding:"5px 8px",color:C.muted,fontSize:11,fontWeight:isBack?700:400}}>{h.hole}{isBack?" | B9":""}</td>
                        <td style={{padding:"5px 4px",textAlign:"center",color:C.muted}}>{h.par}</td>
                        <td style={{padding:"5px 4px",textAlign:"center",fontWeight:700,color:my!==null?scoreColor(my,h.par):C.dim}}>{my!==null?my:"--"}</td>
                        {opponents.map(opp=>{
                          const s = getScore(opp.playerId, h.hole);
                          const sh = getStrokeHolesForOpp(opp).includes(h.hole);
                          return <td key={opp.playerId} style={{padding:"5px 4px",textAlign:"center",color:s!==null?scoreColor(s,h.par):C.dim}}>{s!==null?s:"--"}{sh?".":""}</td>;
                        })}
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:"2px solid "+C.green,background:"rgba(123,180,80,0.07)"}}>
                    <td style={{padding:"6px 8px",color:C.green,fontWeight:800,fontSize:11,letterSpacing:1}}>TOT</td>
                    <td style={{padding:"6px 4px",textAlign:"center",color:C.muted,fontWeight:700}}>{course.par}</td>
                    <td style={{padding:"6px 4px",textAlign:"center",color:C.green,fontWeight:800}}>{Object.values(scores["me"]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"--"}</td>
                    {opponents.map(opp=>(<td key={opp.playerId} style={{padding:"6px 4px",textAlign:"center",color:C.gold,fontWeight:800}}>{Object.values(scores[opp.playerId]||{}).reduce((s,v)=>s+safeInt(v,0),0)||"--"}</td>))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <BigBtn onClick={postToLedger} disabled={posting} color={C.gold} textColor="#0a1a0f">
            {posting?"Posting...":"Post Results to Ledger"}
          </BigBtn>
          <div style={{height:10}}/>
          <GhostBtn onClick={()=>setStep("playing")}>Back to Round</GhostBtn>
        </div>
      </div>
    );
  }

  // Safety net - never show black screen
  if (step === "playing") {
    return (
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:"#080f0a",color:"#e8f0e9",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16}}>
        <div style={{fontSize:40}}>⛳</div>
        <div style={{fontSize:16,fontWeight:700,color:"#e8b84b"}}>Course data missing</div>
        <div style={{fontSize:13,color:"#6b7f6d",textAlign:"center"}}>Could not load "{courseId}". Try going back and selecting the course again.</div>
        <button onClick={()=>{setStep("setup");setCourseId("south-toledo");}}
          style={{marginTop:8,padding:"14px 28px",background:"#7bb450",border:"none",borderRadius:12,color:"#0a1a0f",fontSize:15,fontWeight:800,cursor:"pointer"}}>
          Back to Setup
        </button>
      </div>
    );
  }

  // Final fallback — should never reach here but prevents black screen
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"Georgia,serif"}}>
      <div style={{color:C.muted,fontSize:14}}>Something went wrong loading this screen.</div>
      <button onClick={()=>setStep("setup")} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>← Back to Setup</button>
    </div>
  );
}
