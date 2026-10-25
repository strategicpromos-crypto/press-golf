import React, { useState, useEffect, useMemo, useRef } from "react";
import { COURSES } from "./golf.js";

// ── STABLEFORD PLAY — v2 (Oct 25, 2026) ──────────────────────────────────────
// Restyle after Michael's "same look or subscribers jump ship" call: scoring
// now mirrors the Outing/tournament screens scorekeepers already know —
// hole selector on top, player cards with − / score / +, the gold CTP
// button on CTP holes only, and the "did you get a closest to the pin?"
// prompt on Next. The Stableford math lives underneath, not as a new UI.
// Tabs: Scores | Individual | Teams (when teams are on) | Skins | CTP.
//
// Rules carried over from the locked design:
// - Points per hole from the setup table; net mode strokes by course-HDCP
//   rank (2nd stroke on hardest holes past 18); count-up adds that day's
//   handicap to the day total, gross points per hole.
// - Adjustment (multiday + movement on): per-hole table points only vs 36,
//   per-day caps, applied next day; missed day = no adjustment.
// - Skins: strokes basis = gross/net field (+ flight pots when flights are
//   on); points basis = most Stableford points wins, one field pot (+ flight
//   pots when flights are on) plus a team pot when teams are on. Field and
//   flight ties are ALWAYS dead; the team pot follows the setup's tie
//   switch (dead default, or carry to the next hole).
// - Team score per hole = sum of the best balls-to-count Stableford scores.
//   No cumulative team race: daily standings only.
// - Scores, CTP entries save on this device per setup. Database saving and
//   per-team links come next.

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function pointsForDiff(diff, pts) {
  if (diff <= -3) return pts.albatross;
  if (diff === -2) return pts.eagle;
  if (diff === -1) return pts.birdie;
  if (diff === 0) return pts.par;
  if (diff === 1) return pts.bogey;
  if (diff === 2) return pts.double;
  return pts.worse;
}

function strokesOnHole(hdcp, holeObj, holes) {
  if (!hdcp || hdcp <= 0) return 0;
  const sorted = [...holes].sort((a, b) => (a.hdcp ?? 99) - (b.hdcp ?? 99));
  const rank = sorted.findIndex(h => h.hole === holeObj.hole) + 1;
  if (rank < 1) return 0;
  const full = Math.floor(hdcp / 18);
  const rem = hdcp % 18;
  return full + (rank <= rem ? 1 : 0);
}

export default function StablefordPlay({ setup, onBack }) {
  const days = setup.dayList || [];
  const [dayIdx, setDayIdx] = useState(0);
  const [hole, setHole] = useState(1);
  const [tab, setTab] = useState("scores");
  const [scores, setScores] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pg-stableford-scores-" + setup.id) || "{}"); }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("pg-stableford-scores-" + setup.id, JSON.stringify(scores)); }
    catch { /* storage blocked */ }
  }, [scores, setup.id]);

  const [ctp, setCtp] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pg-stableford-ctp-" + setup.id) || "{}"); }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("pg-stableford-ctp-" + setup.id, JSON.stringify(ctp)); }
    catch { /* storage blocked */ }
  }, [ctp, setup.id]);
  const [ctpPlayer, setCtpPlayer] = useState(null);
  const [ctpFt, setCtpFt] = useState(0);
  const [ctpIn, setCtpIn] = useState(0);
  const [ctpMsg, setCtpMsg] = useState("");
  const [ctpModalOpen, setCtpModalOpen] = useState(false);
  const [ctpModalAdvance, setCtpModalAdvance] = useState(false);
  const [ctpPromptOpen, setCtpPromptOpen] = useState(false);
  const ctpAnsweredRef = useRef(new Set()); // "day-hole" keys, per session

  const day = days[dayIdx] || { courseId:"south-toledo" };
  const course = COURSES[day.courseId] || COURSES["south-toledo"];
  const holes = course?.holes || [];
  const holeData = holes[hole - 1] || { par: 4, hole };
  const par = holeData.par;
  const ctpHolesForDay = setup.ctpHoles !== undefined ? setup.ctpHoles : holes.filter(h => h.par === 3).map(h => h.hole);
  const isCtpHole = setup.ctpOn && ctpHolesForDay.includes(hole);
  const ctpEntry = (ctp[dayIdx] || {})[hole];
  const answeredKey = dayIdx + "-" + hole;

  function grossOf(playerId, d, h) {
    const v = (scores[d] || {})?.[playerId]?.[h];
    return v === undefined || v === null || v === "" ? null : parseInt(v, 10);
  }

  function courseHoles(d) {
    const c = COURSES[(days[d] || {}).courseId] || course;
    return c?.holes || [];
  }

  function hdcpOnDay(player, d) {
    let hdcp = player.hdcp || 0;
    if (!setup.movementOn) return hdcp;
    for (let i = 0; i < d; i++) {
      const pts = dayTablePoints(player, i);
      if (pts === null) continue;
      const diff = pts - 36;
      if (diff > 0) hdcp -= Math.min(setup.adjDownCap || 3, Math.floor(diff / (setup.adjStep || 3)));
      else if (diff < 0) hdcp += Math.min(setup.adjUpCap || 2, Math.floor(-diff / (setup.adjStep || 3)));
      if (hdcp < 0) hdcp = 0;
    }
    return hdcp;
  }

  function dayTablePoints(player, d) {
    const hs = courseHoles(d);
    if (hs.length < 18) return null;
    const hdcp = hdcpOnDay(player, d);
    let sum = 0;
    for (const h of hs) {
      const g = grossOf(player.id, d, h.hole);
      if (g === null || isNaN(g)) return null;
      const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, h, hs) : 0;
      sum += pointsForDiff(g - strokes - h.par, setup.points);
    }
    return sum;
  }

  // Stableford points for one hole on a given day (net mode: net points;
  // count-up mode: gross points — the day total adds the handicap separately).
  function holePointsOnDay(player, d, h, g) {
    if (g === null || isNaN(g)) return null;
    const hs = courseHoles(d);
    const hdcp = hdcpOnDay(player, d);
    const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, h, hs) : 0;
    return pointsForDiff(g - strokes - h.par, setup.points);
  }

  function dayTotal(player, d) {
    const hs = courseHoles(d);
    let sum = 0, played = 0;
    const hdcp = hdcpOnDay(player, d);
    for (const h of hs) {
      const g = grossOf(player.id, d, h.hole);
      if (g === null || isNaN(g)) continue;
      sum += holePointsOnDay(player, d, h, g);
      played++;
    }
    if (setup.countingMode === "countup" && played > 0) sum += hdcp;
    return sum;
  }

  function tourneyTotal(player) {
    let sum = 0;
    for (let d = 0; d < days.length; d++) sum += dayTotal(player, d);
    return sum;
  }

  function playerDayComplete(p, d) {
    for (let h = 1; h <= 18; h++) if (grossOf(p.id, d, h) === null) return false;
    return true;
  }

  function setScore(playerId, h, value) {
    setScores(prev => ({
      ...prev,
      [dayIdx]: { ...(prev[dayIdx] || {}), [playerId]: { ...((prev[dayIdx] || {})[playerId] || {}), [h]: value } },
    }));
  }

  function playerName(id) { return (setup.players || []).find(p => p.id === id)?.name || "—"; }
  function fmtDist(inches) { return Math.floor(inches / 12) + " ft " + (inches % 12) + " in"; }

  // ── CTP: gold button + Next prompt, same behavior as the main app ─────────
  function openCtp(advance) {
    const e = (ctp[dayIdx] || {})[hole];
    if (e) { setCtpPlayer(e.playerId); setCtpFt(Math.floor(e.inches / 12)); setCtpIn(e.inches % 12); }
    else { setCtpPlayer(null); setCtpFt(0); setCtpIn(0); }
    setCtpMsg("");
    setCtpModalAdvance(advance);
    setCtpModalOpen(true);
  }

  function advanceHole() {
    if (hole < 18) setHole(hole + 1);
  }

  function onNext() {
    if (hole >= 18) return;
    // On a CTP hole, Next asks first — once per hole per session.
    if (isCtpHole && !ctpAnsweredRef.current.has(answeredKey)) { setCtpPromptOpen(true); return; }
    advanceHole();
  }

  function saveCtp() {
    if (!ctpPlayer) return;
    const inches = ctpFt * 12 + ctpIn;
    const cur = (ctp[dayIdx] || {})[hole];
    if (cur && inches >= cur.inches) { setCtpMsg("That's farther than the current leader — not saved."); return; }
    setCtp(prev => ({ ...prev, [dayIdx]: { ...(prev[dayIdx] || {}), [hole]: { playerId: ctpPlayer, inches } } }));
    setCtpModalOpen(false);
    ctpAnsweredRef.current.add(answeredKey); // gold-button save silences the prompt
    if (ctpModalAdvance) advanceHole();
  }

  function removeCtp() {
    setCtp(prev => {
      const next = { ...prev, [dayIdx]: { ...(prev[dayIdx] || {}) } };
      delete next[dayIdx][hole];
      return next;
    });
    setCtpModalOpen(false);
    ctpAnsweredRef.current.delete(answeredKey); // Remove re-arms the prompt
  }

  // ── Teams ──────────────────────────────────────────────────────────────────
  function teamHoleTotal(team, d, h) {
    const vals = (setup.players || [])
      .filter(p => team.playerIds.includes(p.id))
      .map(p => holePointsOnDay(p, d, h, grossOf(p.id, d, h.hole)))
      .filter(v => v !== null)
      .sort((a, b) => b - a);
    return vals.slice(0, setup.ballsToCount || 2).reduce((a, b) => a + b, 0);
  }

  function teamDayTotal(team, d) {
    return courseHoles(d).reduce((sum, h) => sum + teamHoleTotal(team, d, h), 0);
  }

  // ── Skins ──────────────────────────────────────────────────────────────────
  function skinsEligible(p, pot) { return !p.skins || p.skins[pot] !== false; }
  function scoreForSkin(p, d, h, net) {
    const g = grossOf(p.id, d, h.hole);
    if (g === null || isNaN(g)) return null;
    if (!net) return g;
    return g - strokesOnHole(hdcpOnDay(p, d), h, courseHoles(d));
  }
  function fieldWinner(vals) {
    if (!vals.length) return null;
    const best = Math.min(...vals.map(x => x.s));
    const win = vals.filter(x => x.s === best);
    return win.length === 1 ? win[0].id : null; // tie = dead, never carried
  }
  function skinsWinnersStrokes(d, h) {
    const players = setup.players || [];
    const out = {
      grossField: fieldWinner(players.filter(p => skinsEligible(p, "grossField")).map(p => ({ id: p.id, s: scoreForSkin(p, d, h, false) })).filter(x => x.s !== null)),
      netField: fieldWinner(players.filter(p => skinsEligible(p, "netField")).map(p => ({ id: p.id, s: scoreForSkin(p, d, h, true) })).filter(x => x.s !== null)),
      grossFlight: {}, netFlight: {},
    };
    if (setup.flightsOn) {
      ["A", "B", "C"].forEach(fl => {
        out.grossFlight[fl] = fieldWinner(players.filter(p => p.flight === fl && skinsEligible(p, "grossFlight")).map(p => ({ id: p.id, s: scoreForSkin(p, d, h, false) })).filter(x => x.s !== null));
        out.netFlight[fl] = fieldWinner(players.filter(p => p.flight === fl && skinsEligible(p, "netFlight")).map(p => ({ id: p.id, s: scoreForSkin(p, d, h, true) })).filter(x => x.s !== null));
      });
    }
    return out;
  }
  function skinsWinnersPoints(d, h) {
    const players = setup.players || [];
    const out = {
      pointsField: fieldWinner(players.filter(p => skinsEligible(p, "grossField")).map(p => ({ id: p.id, s: holePointsOnDay(p, d, h, grossOf(p.id, d, h.hole)) })).filter(x => x.s !== null)),
      pointsFlight: {},
      team: null,
    };
    if (setup.flightsOn) {
      ["A", "B", "C"].forEach(fl => {
        out.pointsFlight[fl] = fieldWinner(players.filter(p => p.flight === fl && skinsEligible(p, "grossFlight")).map(p => ({ id: p.id, s: holePointsOnDay(p, d, h, grossOf(p.id, d, h.hole)) })).filter(x => x.s !== null));
      });
    }
    if (setup.teamsOn) {
      const totals = (setup.teams || []).map(t => ({ id: t.id, s: teamHoleTotal(t, d, h), has: t.playerIds.some(pid => grossOf(pid, d, h.hole) !== null) })).filter(x => x.has);
      if (totals.length) {
        const best = Math.max(...totals.map(x => x.s));
        const win = totals.filter(x => x.s === best);
        out.team = win.length === 1 ? win[0].id : "tie";
      }
    }
    return out;
  }
  function skinsTotals(d) {
    const hs = courseHoles(d);
    const totals = { grossField:{}, netField:{}, grossFlight:{}, netFlight:{}, pointsField:{}, pointsFlight:{}, team:{}, teamCarry:{} };
    let carryPot = 1;
    for (const h of hs) {
      if (setup.skinsBasis === "points") {
        const w = skinsWinnersPoints(d, h);
        if (w.pointsField) totals.pointsField[w.pointsField] = (totals.pointsField[w.pointsField] || 0) + 1;
        Object.values(w.pointsFlight).forEach(id => { if (id) totals.pointsFlight[id] = (totals.pointsFlight[id] || 0) + 1; });
      } else {
        const w = skinsWinnersStrokes(d, h);
        if (w.grossField) totals.grossField[w.grossField] = (totals.grossField[w.grossField] || 0) + 1;
        if (w.netField) totals.netField[w.netField] = (totals.netField[w.netField] || 0) + 1;
        Object.values(w.grossFlight).forEach(id => { if (id) totals.grossFlight[id] = (totals.grossFlight[id] || 0) + 1; });
        Object.values(w.netFlight).forEach(id => { if (id) totals.netFlight[id] = (totals.netFlight[id] || 0) + 1; });
      }
      // Team pot (both bases): counted Stableford total, tie per the switch.
      if (setup.teamsOn) {
        const w = skinsWinnersPoints(d, h);
        if (w.team && w.team !== "tie") { totals.team[w.team] = (totals.team[w.team] || 0) + carryPot; totals.teamCarry[w.team] = carryPot; carryPot = 1; }
        else if (w.team === "tie") { if (setup.teamTieCarry) carryPot++; else carryPot = 1; }
      }
    }
    return totals;
  }

  const leaderboard = useMemo(() => {
    return [...(setup.players || [])].sort((a, b) => tourneyTotal(b) - tourneyTotal(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, setup, dayIdx]);

  const teamStandings = useMemo(() => {
    return [...(setup.teams || [])].sort((a, b) => teamDayTotal(b, dayIdx) - teamDayTotal(a, dayIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, setup, dayIdx]);

  const tabs = [["scores","Scores"],["individual","Individual"]]
    .concat(setup.teamsOn ? [["teams","Teams"]] : [])
    .concat(setup.skinsOn ? [["skins","Skins"]] : [])
    .concat(setup.ctpOn ? [["ctp","CTP"]] : []);

  return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.green,fontSize:14,fontWeight:700,cursor:"pointer",padding:0,marginBottom:16}}>‹ Back to Home</button>
        <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>{setup.name}</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
          {setup.days > 1 ? "Multiday tournament" : "Stableford"} · {setup.countingMode === "net" ? "Per-hole net" : "Count-up from HDCP"}
        </div>

        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {days.map((_, i) => (
            <button key={i} onClick={()=>{setDayIdx(i);setHole(1);}}
              style={{flex:1,padding:"10px 4px",borderRadius:8,background:dayIdx===i?C.gold:C.surface,color:dayIdx===i?"#0a1a0f":C.muted,border:"1px solid "+(dayIdx===i?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:dayIdx===i?700:500}}>
              Day {i+1}
            </button>
          ))}
        </div>

        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {tabs.map(([key, label]) => (
            <button key={key} onClick={()=>setTab(key)}
              style={{flex:1,padding:"10px 4px",borderRadius:8,background:tab===key?C.green:C.surface,color:tab===key?"#0a1a0f":C.muted,border:"1px solid "+(tab===key?C.green:C.border),cursor:"pointer",fontSize:13,fontWeight:tab===key?700:500,whiteSpace:"nowrap"}}>
              {label}
            </button>
          ))}
        </div>

        {tab === "scores" && (<>
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:16,fontWeight:800}}>{course.name}</div>
            <div style={{fontSize:12,color:C.muted}}>Day {dayIdx+1} · Hole {hole} · Par {par}</div>
          </div>

          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center",marginBottom:16}}>
            {holes.slice(0, 18).map(h => {
              const scored = (setup.players || []).some(p => grossOf(p.id, dayIdx, h.hole) !== null);
              return (
                <button key={h.hole} onClick={()=>setHole(h.hole)}
                  style={{width:36,height:36,borderRadius:8,background:hole===h.hole?C.gold:scored?"rgba(123,180,80,0.15)":C.dim,color:hole===h.hole?"#0a1a0f":scored?C.green:C.muted,border:"1px solid "+(hole===h.hole?C.gold:scored?C.green:C.border),cursor:"pointer",fontSize:13,fontWeight:hole===h.hole?800:500}}>
                  {h.hole}
                </button>
              );
            })}
          </div>

          {isCtpHole && (
            <button onClick={()=>openCtp(false)}
              style={{width:"100%",padding:"14px",background:C.gold,border:"none",borderRadius:12,color:"#0a1a0f",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:12}}>
              📍 Closest to the Pin{ctpEntry ? " · " + playerName(ctpEntry.playerId) + " — " + fmtDist(ctpEntry.inches) : ""}
            </button>
          )}

          {(setup.players || []).map(p => {
            const g = grossOf(p.id, dayIdx, hole);
            const hdcp = hdcpOnDay(p, dayIdx);
            const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, holeData, holes) : 0;
            const pts = holePointsOnDay(p, dayIdx, holeData, g);
            return (
              <div key={p.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15}}>{p.name}{setup.flightsOn && <span style={{fontSize:11,color:C.muted}}> · Flight {p.flight}</span>}{p.tee && <span style={{fontSize:11,color:C.muted}}> · {p.tee}</span>}</div>
                  <div style={{fontSize:12,color:C.muted}}>
                    HDCP {hdcp}{setup.countingMode === "net" && strokes > 0 ? " · " + strokes + (strokes === 1 ? " stroke" : " strokes") + " this hole" : ""}
                    {pts !== null && <span style={{color:C.gold,fontWeight:700}}> · {pts} pts</span>}
                  </div>
                </div>
                <button onClick={()=>setScore(p.id, hole, g === null ? par - 1 : Math.max(1, g - 1))}
                  style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
                <div style={{width:44,textAlign:"center",fontSize:20,fontWeight:800}}>{g === null ? "–" : g}</div>
                <button onClick={()=>setScore(p.id, hole, g === null ? par : g + 1)}
                  style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
              </div>
            );
          })}

          <button onClick={onNext}
            style={{width:"100%",padding:"16px",background:hole < 18 ? C.green : C.dim,color:hole < 18 ? "#0a1a0f" : C.muted,border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:hole < 18 ? "pointer" : "default",marginTop:4}}>
            {hole < 18 ? "Next — Hole " + (hole + 1) : "Day " + (dayIdx + 1) + " complete"}
          </button>
        </>)}

        {tab === "individual" && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:4}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Individual leaderboard</div>
            {leaderboard.map((p, i) => {
              const dt = dayTotal(p, dayIdx);
              const tt = tourneyTotal(p);
              const nextHdcp = hdcpOnDay(p, dayIdx + 1);
              const showAdj = setup.movementOn && playerDayComplete(p, dayIdx) && dayIdx + 1 < days.length;
              return (
                <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.dim}}>
                  <span style={{fontSize:14}}><b>{i + 1}.</b> {p.name}{setup.flightsOn && <span style={{color:C.muted,fontSize:12}}> · {p.flight}</span>}</span>
                  <span style={{fontSize:14,fontWeight:700}}>Day {dt} · Total {tt}
                    {showAdj && <span style={{color:C.gold,fontSize:12}}> · Next HDCP {nextHdcp}</span>}
                  </span>
                </div>
              );
            })}
            {setup.countingMode === "countup" && <div style={{fontSize:11,color:C.muted,marginTop:8}}>Count-up totals include each player's handicap for that day.</div>}
            {setup.days > 1 && <div style={{fontSize:11,color:C.muted,marginTop:8}}>Overall 1st is the trophy; money is paid by flight when flights are on.</div>}
          </div>
        )}

        {tab === "teams" && setup.teamsOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:4}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Team standings — Day {dayIdx + 1}</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Best {setup.ballsToCount || 2} balls to count per hole. Daily standings only — no cumulative team race.</div>
            {teamStandings.map((t, i) => (
              <div key={t.id} style={{padding:"10px 0",borderBottom:"1px solid "+C.dim}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:14}}>
                  <span><b>{i + 1}.</b> {t.name}</span>
                  <span style={{fontWeight:800}}>{teamDayTotal(t, dayIdx)} pts</span>
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>{t.playerIds.map(playerName).join(" · ")}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "skins" && setup.skinsOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:4}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>
              Skins — Day {dayIdx + 1} · {setup.skinsBasis === "points" ? "point based" : "stroke based"} · ties dead{setup.teamsOn && setup.teamTieCarry ? " (team ties carry)" : ""}
            </div>
            {(() => {
              const totals = skinsTotals(dayIdx);
              const potRows = (title, obj) => {
                const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
                return (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{title}</div>
                    {entries.length === 0
                      ? <div style={{fontSize:13,color:C.muted}}>No skins yet — every hole tied, or no one is in this pot.</div>
                      : entries.map(([id, n]) => (
                        <div key={id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:14}}>
                          <span>{id.startsWith("t_") || (setup.teams || []).some(t => t.id === id) ? (setup.teams || []).find(t => t.id === id)?.name || id : playerName(id)}</span>
                          <span style={{fontWeight:700}}>{n}</span>
                        </div>
                      ))}
                  </div>
                );
              };
              const flightLine = (obj) => Object.entries(obj).map(([fl, id]) => fl + ": " + (id ? playerName(id) : "tie")).join(" · ");
              return (
                <div>
                  {setup.skinsBasis === "points" ? (
                    <>
                      {potRows("Points — Field", totals.pointsField)}
                      {setup.flightsOn && potRows("Points — Flight", totals.pointsFlight)}
                    </>
                  ) : (
                    <>
                      {potRows("Gross — Field", totals.grossField)}
                      {potRows("Net — Field", totals.netField)}
                      {setup.flightsOn && potRows("Gross — Flight", totals.grossFlight)}
                      {setup.flightsOn && potRows("Net — Flight", totals.netFlight)}
                    </>
                  )}
                  {setup.teamsOn && potRows("Team skins", totals.team)}
                  <div style={{fontSize:11,color:C.muted,marginTop:4,marginBottom:10}}>Hole by hole, for settling arguments:</div>
                  {holes.slice(0, 18).map(h => {
                    const anyScore = (setup.players || []).some(p => grossOf(p.id, dayIdx, h.hole) !== null);
                    if (!anyScore) return null;
                    if (setup.skinsBasis === "points") {
                      const w = skinsWinnersPoints(dayIdx, h);
                      return (
                        <div key={h.hole} style={{padding:"6px 0",borderBottom:"1px solid "+C.dim,fontSize:12,lineHeight:1.5}}>
                          <b>H{h.hole}</b> · Field: {w.pointsField ? playerName(w.pointsField) : "tie"}
                          {setup.flightsOn && <><br /><span style={{color:C.muted}}>Flight — {flightLine(w.pointsFlight)}</span></>}
                          {setup.teamsOn && <><br /><span style={{color:C.muted}}>Team: {w.team && w.team !== "tie" ? ((setup.teams || []).find(t => t.id === w.team)?.name || w.team) : "tie"}</span></>}
                        </div>
                      );
                    }
                    const w = skinsWinnersStrokes(dayIdx, h);
                    return (
                      <div key={h.hole} style={{padding:"6px 0",borderBottom:"1px solid "+C.dim,fontSize:12,lineHeight:1.5}}>
                        <b>H{h.hole}</b> · Gross field: {w.grossField ? playerName(w.grossField) : "tie"} · Net field: {w.netField ? playerName(w.netField) : "tie"}
                        {setup.flightsOn && <><br /><span style={{color:C.muted}}>Gross flight — {flightLine(w.grossFlight)} · Net flight — {flightLine(w.netFlight)}</span></>}
                      </div>
                    );
                  })}
                  <div style={{fontSize:11,color:C.muted,marginTop:10}}>Skins are counted here, not dollarized — setup has no $ per skin yet.</div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "ctp" && setup.ctpOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:4}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>📍 Closest to the Pin — Day {dayIdx + 1}</div>
            {holes.slice(0, 18).filter(h => (ctp[dayIdx] || {})[h.hole]).length === 0 && (
              <div style={{fontSize:13,color:C.muted}}>No closest-to-the-pin entries yet — tap the gold button on a CTP hole.</div>
            )}
            {holes.slice(0, 18).filter(h => (ctp[dayIdx] || {})[h.hole]).map(h => {
              const e = (ctp[dayIdx] || {})[h.hole];
              return (
                <div key={h.hole} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.dim}}>
                  <span style={{fontSize:14}}>Hole {h.hole}</span>
                  <span style={{fontSize:14,fontWeight:700}}>{playerName(e.playerId)} · {fmtDist(e.inches)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
            Still to come: saving this tournament to the database with per-team links, and extra-9 scoring. Scores, skins, and closest-to-the-pin entries here save on this device for now.
          </div>
        </div>

        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:20}}>
          ‹ Back to Home
        </button>
      </div>

      {/* CTP prompt on Next — same as the main app */}
      {ctpPromptOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}}>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:360,width:"100%",fontFamily:"Georgia,serif"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>📍 Closest to the Pin?</div>
            {ctpEntry
              ? <div style={{fontSize:14,color:C.muted,marginBottom:16}}>Did anyone beat it? Current leader: <b style={{color:C.text}}>{playerName(ctpEntry.playerId)} — {fmtDist(ctpEntry.inches)}</b></div>
              : <div style={{fontSize:14,color:C.muted,marginBottom:16}}>No entry yet on this hole.</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setCtpPromptOpen(false);openCtp(true);}}
                style={{flex:1,padding:"14px",background:C.gold,border:"none",borderRadius:10,color:"#0a1a0f",fontSize:15,fontWeight:800,cursor:"pointer"}}>Yes</button>
              <button onClick={()=>{setCtpPromptOpen(false);ctpAnsweredRef.current.add(answeredKey);advanceHole();}}
                style={{flex:1,padding:"14px",background:C.dim,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,fontWeight:700,cursor:"pointer"}}>No</button>
            </div>
          </div>
        </div>
      )}

      {/* CTP entry popup — same shape as the main app's gold-button entry */}
      {ctpModalOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}}>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,padding:24,maxWidth:360,width:"100%",fontFamily:"Georgia,serif"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>📍 Closest to the Pin — Hole {hole}</div>
            {ctpEntry && <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Leader: <b style={{color:C.text}}>{playerName(ctpEntry.playerId)} — {fmtDist(ctpEntry.inches)}</b></div>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {(setup.players || []).map(p => (
                <button key={p.id} onClick={()=>setCtpPlayer(p.id)}
                  style={{padding:"8px 12px",borderRadius:20,background:ctpPlayer===p.id?C.gold:C.surface,color:ctpPlayer===p.id?"#0a1a0f":C.muted,border:"1px solid "+(ctpPlayer===p.id?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:ctpPlayer===p.id?700:500}}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <button onClick={()=>setCtpFt(Math.max(0, ctpFt - 1))} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
              <span style={{fontSize:16,fontWeight:700}}>{ctpFt} ft</span>
              <button onClick={()=>setCtpFt(ctpFt + 1)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
              <button onClick={()=>setCtpIn((ctpIn + 11) % 12)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
              <span style={{fontSize:16,fontWeight:700}}>{ctpIn} in</span>
              <button onClick={()=>setCtpIn((ctpIn + 1) % 12)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
            </div>
            {ctpMsg && <div style={{fontSize:12,color:C.red,marginBottom:10}}>{ctpMsg}</div>}
            <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Only a closer distance replaces the leader.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={saveCtp} disabled={!ctpPlayer}
                style={{flex:1,padding:"14px",background:ctpPlayer?C.gold:C.dim,color:ctpPlayer?"#0a1a0f":C.muted,border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:ctpPlayer?"pointer":"default"}}>Save</button>
              <button onClick={()=>setCtpModalOpen(false)}
                style={{flex:1,padding:"14px",background:C.dim,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,fontWeight:700,cursor:"pointer"}}>Cancel</button>
              {ctpEntry && (
                <button onClick={removeCtp}
                  style={{padding:"14px",background:"transparent",border:"1px solid "+C.red,borderRadius:10,color:C.red,fontSize:14,fontWeight:700,cursor:"pointer"}}>Remove</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
