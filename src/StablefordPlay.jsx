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

  // Closest to the pin, per day per hole: { [day]: { [hole]: {playerId, inches} } }.
  // Any hole can take an entry; the leader is simply the closest distance.
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
  const ctpEntry = (ctp[dayIdx] || {})[hole];
  // When the hole changes, load that hole's entry into the form (or clear it).
  useEffect(() => {
    const e = (ctp[dayIdx] || {})[hole];
    if (e) { setCtpPlayer(e.playerId); setCtpFt(Math.floor(e.inches / 12)); setCtpIn(e.inches % 12); }
    else { setCtpPlayer(null); setCtpFt(0); setCtpIn(0); }
    setCtpMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIdx, hole]);

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

  // ── Skins (locked design: FOUR independent pots, ties ALWAYS dead) ─────────
  // Gross field / gross flight / net field / net flight. A player's four
  // skins switches from setup decide which pots they are in; old setups
  // without a skins object count as in everywhere. Net = gross minus that
  // day's strokes on the hole. No stakes live in setup yet, so skins are
  // counted, not dollarized.
  function skinsEligible(p, pot) { return !p.skins || p.skins[pot] !== false; }
  function playerName(id) { return (setup.players || []).find(p => p.id === id)?.name || "—"; }
  function scoreForSkin(p, d, h, net) {
    const g = grossOf(p.id, d, h.hole);
    if (g === null || isNaN(g)) return null;
    if (!net) return g;
    const c = COURSES[(days[d] || {}).courseId] || course;
    return g - strokesOnHole(hdcpOnDay(p, d), h, c?.holes || []);
  }
  function skinsWinners(d, h) {
    const players = setup.players || [];
    function fieldWinner(net) {
      const cand = players
        .filter(p => skinsEligible(p, net ? "netField" : "grossField"))
        .map(p => ({ id: p.id, s: scoreForSkin(p, d, h, net) }))
        .filter(x => x.s !== null);
      if (!cand.length) return null;
      const best = Math.min(...cand.map(x => x.s));
      const win = cand.filter(x => x.s === best);
      return win.length === 1 ? win[0].id : null; // tie = dead, never carried
    }
    function flightWinners(net) {
      const out = {};
      ["A", "B", "C"].forEach(fl => {
        const cand = players
          .filter(p => p.flight === fl && skinsEligible(p, net ? "netFlight" : "grossFlight"))
          .map(p => ({ id: p.id, s: scoreForSkin(p, d, h, net) }))
          .filter(x => x.s !== null);
        if (!cand.length) return;
        const best = Math.min(...cand.map(x => x.s));
        const win = cand.filter(x => x.s === best);
        out[fl] = win.length === 1 ? win[0].id : null;
      });
      return out;
    }
    return { grossField: fieldWinner(false), netField: fieldWinner(true), grossFlight: flightWinners(false), netFlight: flightWinners(true) };
  }
  function skinsTotals(d) {
    const totals = { grossField: {}, netField: {}, grossFlight: {}, netFlight: {} };
    const c = COURSES[(days[d] || {}).courseId] || course;
    for (const h of (c?.holes || [])) {
      const w = skinsWinners(d, h);
      if (w.grossField) totals.grossField[w.grossField] = (totals.grossField[w.grossField] || 0) + 1;
      if (w.netField) totals.netField[w.netField] = (totals.netField[w.netField] || 0) + 1;
      Object.values(w.grossFlight).forEach(id => { if (id) totals.grossFlight[id] = (totals.grossFlight[id] || 0) + 1; });
      Object.values(w.netFlight).forEach(id => { if (id) totals.netFlight[id] = (totals.netFlight[id] || 0) + 1; });
    }
    return totals;
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

        {setup.ctpOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>📍 Closest to the Pin — Hole {hole}</div>
            {ctpEntry && (
              <div style={{fontSize:14,marginBottom:10}}>
                Leader: <b>{playerName(ctpEntry.playerId)}</b> — {Math.floor(ctpEntry.inches / 12)} ft {ctpEntry.inches % 12} in
                <button onClick={() => setCtp(prev => {
                  const next = { ...prev, [dayIdx]: { ...(prev[dayIdx] || {}) } };
                  delete next[dayIdx][hole];
                  return next;
                })}
                  style={{marginLeft:10,padding:"6px 12px",background:"transparent",border:"1px solid "+C.red,borderRadius:8,color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}}>Remove</button>
              </div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {(setup.players || []).map(p => (
                <button key={p.id} onClick={()=>setCtpPlayer(p.id)}
                  style={{padding:"8px 12px",borderRadius:20,background:ctpPlayer===p.id?C.gold:C.surface,color:ctpPlayer===p.id?"#0a1a0f":C.muted,border:"1px solid "+(ctpPlayer===p.id?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:ctpPlayer===p.id?700:500}}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={()=>setCtpFt(Math.max(0, ctpFt - 1))} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
              <span style={{fontSize:16,fontWeight:700}}>{ctpFt} ft</span>
              <button onClick={()=>setCtpFt(ctpFt + 1)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
              <button onClick={()=>setCtpIn((ctpIn + 11) % 12)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
              <span style={{fontSize:16,fontWeight:700}}>{ctpIn} in</span>
              <button onClick={()=>setCtpIn((ctpIn + 1) % 12)} style={{width:40,height:40,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
              <button onClick={() => {
                if (!ctpPlayer) return;
                const inches = ctpFt * 12 + ctpIn;
                const cur = (ctp[dayIdx] || {})[hole];
                if (cur && inches >= cur.inches) { setCtpMsg("That's farther than the current leader — not saved."); return; }
                setCtp(prev => ({ ...prev, [dayIdx]: { ...(prev[dayIdx] || {}), [hole]: { playerId: ctpPlayer, inches } } }));
                setCtpMsg("");
              }}
                disabled={!ctpPlayer}
                style={{marginLeft:"auto",padding:"12px 18px",background:ctpPlayer?C.gold:C.dim,color:ctpPlayer?"#0a1a0f":C.muted,border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:ctpPlayer?"pointer":"default"}}>
                Save
              </button>
            </div>
            {ctpMsg && <div style={{fontSize:12,color:C.red,marginTop:8}}>{ctpMsg}</div>}
            <div style={{fontSize:11,color:C.muted,marginTop:8}}>Only a closer distance replaces the leader. Pick the player, set feet and inches, save.</div>
          </div>
        )}

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

        {setup.ctpOn && (
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>📍 Closest to the Pin — Day {dayIdx + 1}</div>
            {holes.slice(0, 18).filter(h => (ctp[dayIdx] || {})[h.hole]).length === 0 && (
              <div style={{fontSize:13,color:C.muted}}>No closest-to-the-pin entries yet — enter one on a hole above.</div>
            )}
            {holes.slice(0, 18).filter(h => (ctp[dayIdx] || {})[h.hole]).map(h => {
              const e = (ctp[dayIdx] || {})[h.hole];
              return (
                <div key={h.hole} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.dim}}>
                  <span style={{fontSize:14}}>Hole {h.hole}</span>
                  <span style={{fontSize:14,fontWeight:700}}>{playerName(e.playerId)} · {Math.floor(e.inches / 12)} ft {e.inches % 12} in</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Skins — Day {dayIdx + 1} · ties dead, no carryovers</div>
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
                        <span>{playerName(id)}</span><span style={{fontWeight:700}}>{n}</span>
                      </div>
                    ))}
                </div>
              );
            };
            const c = course;
            return (
              <div>
                {potRows("Gross — Field", totals.grossField)}
                {potRows("Gross — Flight", totals.grossFlight)}
                {potRows("Net — Field", totals.netField)}
                {potRows("Net — Flight", totals.netFlight)}
                <div style={{fontSize:11,color:C.muted,marginTop:4,marginBottom:10}}>Hole by hole, for settling arguments:</div>
                {holes.slice(0, 18).map(h => {
                  const anyScore = (setup.players || []).some(p => grossOf(p.id, dayIdx, h.hole) !== null);
                  if (!anyScore) return null;
                  const w = skinsWinners(dayIdx, h);
                  const flightLine = (obj) => Object.entries(obj).map(([fl, id]) => fl + ": " + (id ? playerName(id) : "tie")).join(" · ");
                  return (
                    <div key={h.hole} style={{padding:"6px 0",borderBottom:"1px solid "+C.dim,fontSize:12,lineHeight:1.5}}>
                      <b>H{h.hole}</b> · Gross field: {w.grossField ? playerName(w.grossField) : "tie"} · Net field: {w.netField ? playerName(w.netField) : "tie"}
                      <br /><span style={{color:C.muted}}>Gross flight — {flightLine(w.grossFlight)} · Net flight — {flightLine(w.netFlight)}</span>
                    </div>
                  );
                })}
                <div style={{fontSize:11,color:C.muted,marginTop:10}}>Skins are counted here, not dollarized — setup has no $ per skin yet. Say the word and stakes go on the setup screen next.</div>
              </div>
            );
          })()}
        </div>

        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
            Still to come: daily team setup and team totals, and saving this tournament to the database so other players can open it. Scores, skins, and closest-to-the-pin entries here save on this device for now.
          </div>
        </div>

        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:20}}>
          ‹ Back to Setup
        </button>
      </div>
    </div>
  );
}
