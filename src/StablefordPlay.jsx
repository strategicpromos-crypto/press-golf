import React, { useState, useEffect, useMemo } from "react";
import { COURSES } from "./golf.js";

// ── STABLEFORD PLAY — v1 (Oct 25, 2026) ──────────────────────────────────────
// First scoring screen for a saved Stableford setup. Scope, honestly stated:
// - Score entry for the main 18 of each day, hole by hole, per player.
// - Live Stableford points (both counting modes) + day and tournament totals.
// - Individual leaderboard (overall, with flight shown) + next-day handicap
//   adjustment preview when a day's 18 is complete.
// - Scores save on this device (localStorage) per tournament setup.
// NOT yet in v1: daily team setup and team totals, skins pots, CTP entry,
// Supabase persistence, or links for other players. Those come next.
//
// Scoring rules used here (locked design):
// - Points table comes from the setup (albatross/eagle/birdie/par/bogey/
//   double/worse), keyed by net score vs par in net mode, gross score vs par
//   in count-up mode. In count-up mode the day total adds the player's
//   starting handicap for that day on top of gross points.
// - Net mode strokes: holes ranked by course handicap, hardest first. A
//   handicap of N gets a stroke on the N hardest holes (over 18, a second
//   stroke on the hardest holes first: a 20 gets 2 on the 2 hardest + 1
//   everywhere else).
// - Adjustment (movement on): after a completed main 18, points vs 36 par
//   points, every `adjStep` points = 1 stroke, capped `adjDownCap` down /
//   `adjUpCap` up per day, applied to the NEXT day. Adjustment points are
//   the per-hole table points only (count-up starting points excluded).
//   A missed day (no scores) = 0 points, handicap unchanged.

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

// Strokes on a hole for a handicap, by course-handicap rank (1 = hardest).
function strokesOnHole(hdcp, holeHdcp, holes) {
  if (!hdcp || hdcp <= 0) return 0;
  const sorted = [...holes].sort((a, b) => (a.hdcp ?? 99) - (b.hdcp ?? 99));
  const rank = sorted.findIndex(h => h.hole === holeHdcp.hole) + 1;
  if (rank < 1) return 0;
  const full = Math.floor(hdcp / 18);
  const rem = hdcp % 18;
  return full + (rank <= rem ? 1 : 0);
}

export default function StablefordPlay({ setup, onBack }) {
  const days = setup.dayList || [];
  const [dayIdx, setDayIdx] = useState(0);
  const [hole, setHole] = useState(1);
  const [scores, setScores] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pg-stableford-scores-" + setup.id) || "{}"); }
    catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem("pg-stableford-scores-" + setup.id, JSON.stringify(scores)); }
    catch { /* storage blocked — scores still live in memory this session */ }
  }, [scores, setup.id]);

  const day = days[dayIdx] || { courseId:"south-toledo" };
  const course = COURSES[day.courseId] || COURSES["south-toledo"];
  const holes = course?.holes || [];
  const holeData = holes[hole - 1] || { par: 4, hole };
  const par = holeData.par;

  function dayScores(d) { return scores[d] || {}; }
  function grossOf(playerId, d, h) {
    const v = dayScores(d)?.[playerId]?.[h];
    return v === undefined || v === null || v === "" ? null : parseInt(v, 10);
  }

  // Handicap for a player on a given day: start, then one adjustment per
  // completed earlier main-18 day (movement on only).
  function hdcpOnDay(player, d) {
    let hdcp = player.hdcp || 0;
    if (!setup.movementOn) return hdcp;
    for (let i = 0; i < d; i++) {
      const pts = dayTablePoints(player, i);
      if (pts === null) continue; // day not fully scored — no adjustment
      const diff = pts - 36;
      if (diff > 0) hdcp -= Math.min(setup.adjDownCap || 3, Math.floor(diff / (setup.adjStep || 3)));
      else if (diff < 0) hdcp += Math.min(setup.adjUpCap || 2, Math.floor(-diff / (setup.adjStep || 3)));
      if (hdcp < 0) hdcp = 0;
    }
    return hdcp;
  }

  // Sum of per-hole table points for a player's main 18 on a day.
  // Returns null unless all 18 holes are scored. Strokes use THAT day's
  // handicap (hdcpOnDay), so a moved handicap changes later days' points
  // exactly as it should — the recursion terminates because each day only
  // looks at earlier days.
  function dayTablePoints(player, d) {
    const dc = days[d];
    if (!dc) return null;
    const c = COURSES[dc.courseId] || course;
    const hs = c?.holes || [];
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

  // Points for one hole on the CURRENT day, with the correct that-day hdcp.
  function holePoints(player, h, g) {
    if (g === null || isNaN(g)) return null;
    const hdcp = hdcpOnDay(player, dayIdx);
    const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, h, holes) : 0;
    return pointsForDiff(g - strokes - h.par, setup.points);
  }

  function dayTotal(player, d) {
    const dc = days[d];
    if (!dc) return 0;
    const c = COURSES[dc.courseId] || course;
    const hs = c?.holes || [];
    let sum = 0, played = 0;
    const hdcp = hdcpOnDay(player, d);
    for (const h of hs) {
      const g = grossOf(player.id, d, h.hole);
      if (g === null || isNaN(g)) continue;
      const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, h, hs) : 0;
      sum += pointsForDiff(g - strokes - h.par, setup.points);
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

  function setScore(playerId, h, value) {
    setScores(prev => ({
      ...prev,
      [dayIdx]: { ...(prev[dayIdx] || {}), [playerId]: { ...((prev[dayIdx] || {})[playerId] || {}), [h]: value } },
    }));
  }

  const leaderboard = useMemo(() => {
    const list = (setup.players || []).filter(p => setup.individualOn ? p.individual !== false : false);
    return [...list].sort((a, b) => tourneyTotal(b) - tourneyTotal(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, setup, dayIdx]);

  // Per-player completion: one missing player must not block the others'
  // adjustment previews (a missed day is 0 points, handicap unchanged).
  function playerDayComplete(p) {
    for (let h = 1; h <= 18; h++) if (grossOf(p.id, dayIdx, h) === null) return false;
    return true;
  }

  return (
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.green,fontSize:14,fontWeight:700,cursor:"pointer",padding:0,marginBottom:16}}>‹ Back to Setup</button>
        <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>{setup.name}</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
          {setup.countingMode === "net" ? "Per-hole net" : "Count-up from HDCP"} · Points {setup.points.albatross}/{setup.points.eagle}/{setup.points.birdie}/{setup.points.par}/{setup.points.bogey}/{setup.points.double}/{setup.points.worse}
        </div>

        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
          {days.map((_, i) => (
            <button key={i} onClick={()=>{setDayIdx(i);setHole(1);}}
              style={{flex:1,padding:"10px 4px",borderRadius:8,background:dayIdx===i?C.gold:C.surface,color:dayIdx===i?"#0a1a0f":C.muted,border:"1px solid "+(dayIdx===i?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:dayIdx===i?700:500}}>
              Day {i+1}
            </button>
          ))}
        </div>

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

        {(setup.players || []).map(p => {
          const g = grossOf(p.id, dayIdx, hole);
          const hdcp = hdcpOnDay(p, dayIdx);
          const strokes = setup.countingMode === "net" ? strokesOnHole(hdcp, holeData, holes) : 0;
          const pts = holePoints(p, holeData, g);
          return (
            <div key={p.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15}}>{p.name} <span style={{fontSize:11,color:C.muted}}>· Flight {p.flight}{p.tee ? " · " + p.tee : ""}</span></div>
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

        <button onClick={()=>{ if (hole < 18) setHole(hole + 1); }}
          style={{width:"100%",padding:"16px",background:hole < 18 ? C.green : C.dim,color:hole < 18 ? "#0a1a0f" : C.muted,border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:hole < 18 ? "pointer" : "default",marginTop:4}}>
          {hole < 18 ? "Next — Hole " + (hole + 1) : "Day " + (dayIdx + 1) + " complete"}
        </button>

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:20}}>
          <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Individual leaderboard</div>
          {leaderboard.length === 0 && <div style={{fontSize:13,color:C.muted}}>No players in the individual tournament — check the individual switches in setup.</div>}
          {leaderboard.map((p, i) => {
            const dt = dayTotal(p, dayIdx);
            const tt = tourneyTotal(p);
            const nextHdcp = hdcpOnDay(p, dayIdx + 1);
            const showAdj = setup.movementOn && playerDayComplete(p) && dayIdx + 1 < days.length;
            return (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.dim}}>
                <span style={{fontSize:14}}><b>{i + 1}.</b> {p.name} <span style={{color:C.muted,fontSize:12}}>· {p.flight}</span></span>
                <span style={{fontSize:14,fontWeight:700}}>Day {dt} · Total {tt}
                  {showAdj && <span style={{color:C.gold,fontSize:12}}> · Next HDCP {nextHdcp}</span>}
                </span>
              </div>
            );
          })}
          {setup.countingMode === "countup" && <div style={{fontSize:11,color:C.muted,marginTop:8}}>Count-up totals include each player's handicap for that day.</div>}
        </div>

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
            Still to come: daily team setup and team totals, skins pots, CTP entry, and saving this tournament to the database so other players can open it. Scores entered here save on this device for now.
          </div>
        </div>

        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:20}}>
          ‹ Back to Setup
        </button>
      </div>
    </div>
  );
}
