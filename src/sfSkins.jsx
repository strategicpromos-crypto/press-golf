// ── STABLEFORD SKINS — clone of skins.jsx, points-capable ───────────────
// Same engine as the Best Ball Skins tab, plus a points basis: pass valueFn
// returning Stableford points with highWins=true and the highest points win.
// The Best Ball skins.jsx file is untouched; this file serves only Sf* views.
// PG-NETSKINS-2026-10-29: net skins pot (see skins.jsx for the rule).
import React from "react";
import { sfStrokesOnHole } from "./stableford.js";
import { missingNetHdcp, skinsIn, skinsOutLists } from "./skins.jsx";
// PG-ENROLL-2026-10-29: per-pot enrollment, same rule as skins.jsx — grossIn/netIn missing = in, out players filtered out of that pot entirely.

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}

// ── SKINS CALCULATOR ──────────────────────────────────────────────────────────
// Returns per-hole results for regular skins and (optionally) Big Boy skins.
// teammatesTie=true  → teammates CAN tie each other, skin carries (stricter)
// teammatesTie=false → teammates DON'T tie, team wins skin if no OTHER team ties (default)
// Big Boy rule: only BB-enrolled players compete. No teammate exception in BB.
export function calcSfSkins(teams, holeData, holePars, bigBoyEnabled, teammatesTie = false, valueFn = null, highWins = false, netEnabled = false) {
  // valueFn(team, pi, hole) -> number|null: what a skin is played for. Default
  // is the gross score (lowest wins). Point-based Stableford skins pass a
  // function returning Stableford points for the hole, with highWins=true.
  const valOf = valueFn || ((team, pi, h) => {
    const s = team.scores?.[pi]?.[h.hole];
    return (s === undefined || s === null) ? null : safeInt(s);
  });
  const bestOf = (vals) => highWins ? Math.max(...vals) : Math.min(...vals);
  const results = [];
  for (const h of holeData) {
    const hpar = holePars?.[h.hole] ?? h.par;

    // Collect all individual values for this hole
    const allScores = [];
    teams.forEach((team, ti) => {
      for (let pi = 0; pi < (team.size || 1); pi++) {
        const v = valOf(team, pi, h);
        if (v !== null && v !== undefined) {
          allScores.push({
            name: team.players?.[pi]?.trim() || "Player " + (pi + 1),
            teamName: team.name || "Team " + (ti + 1),
            teamIdx: ti,
            pi,
            score: v,
            hdcp: team.hdcp?.[pi] ?? null,
            bigBoy: team.bigBoy?.[pi] === true,
          });
        }
      }
    });

    const totalPlayers = teams.reduce((s, t) => s + (t.size || 1), 0);
    const live = allScores.length > 0 && allScores.length < totalPlayers;
    const grossEntries = allScores.filter(x => skinsIn(teams[x.teamIdx], x.pi, "grossIn"));
    const grossEnrolled = teams.reduce((n, t) => { for (let pi = 0; pi < (t.size || 1); pi++) if (skinsIn(t, pi, "grossIn")) n++; return n; }, 0);
    const grossLive = grossEntries.length > 0 && grossEntries.length < grossEnrolled;

    // ── Regular skins (enrolled players only) ─────────────────────────────
    let regResult = { winner: null, tied: false, live: grossLive, score: null, hpar, notPlayed: grossEntries.length === 0 };
    if (grossEntries.length > 0) {
      const minScore = bestOf(grossEntries.map(x => x.score));
      const lowPlayers = grossEntries.filter(x => x.score === minScore);
      if (lowPlayers.length === 1) {
        // Solo low score — always wins
        regResult = { winner: lowPlayers[0], tied: false, live: grossLive, score: minScore, hpar };
      } else {
        const teamsWithLow = [...new Set(lowPlayers.map(x => x.teamIdx))];
        if (teamsWithLow.length === 1) {
          // All tied players are on same team
          if (teammatesTie) {
            // Stricter: teammates tie = skin carries (dead)
            regResult = { winner: null, tied: true, live: grossLive, score: minScore, hpar, tiers: lowPlayers, teammateCarry: true };
          } else {
            // Default: teammates don't cancel — team wins the skin
            regResult = { winner: lowPlayers, tied: false, live: grossLive, score: minScore, hpar, teammateWin: true };
          }
        } else {
          // Two or more different teams tied → always dead
          regResult = { winner: null, tied: true, live: grossLive, score: minScore, hpar, tiers: lowPlayers };
        }
      }
    }

    // ── Big Boy skins ──────────────────────────────────────────────────────
    let bbResult = null;
    if (bigBoyEnabled) {
      const bbScores = allScores.filter(x => x.bigBoy);
      const bbEnrolled = teams.reduce((s, t) => {
        for (let pi = 0; pi < (t.size || 1); pi++) if (t.bigBoy?.[pi]) s++;
        return s;
      }, 0);
      const bbLive = bbScores.length > 0 && bbScores.length < bbEnrolled;
      if (bbScores.length === 0) {
        bbResult = { winner: null, tied: false, live: false, score: null, hpar, notPlayed: true };
      } else {
        const bbMin = bestOf(bbScores.map(x => x.score));
        const bbLow = bbScores.filter(x => x.score === bbMin);
        if (bbLow.length === 1) {
          bbResult = { winner: bbLow[0], tied: false, live: bbLive, score: bbMin, hpar };
        } else {
          // In BB, teammates CAN tie each other — no teammate exception
          bbResult = { winner: null, tied: true, live: bbLive, score: bbMin, hpar, tiers: bbLow };
        }
      }
    }

    // ── Net skins: gross - strokes on this hole, always stroke-based even
    // when the regular pot is points-based. Big Boy stays gross (above).
    let netResult = null;
    if (netEnabled) {
      const courseHdcpOk = (holeData||[]).every(x=>x.hdcp!==null&&x.hdcp!==undefined);
      const netEntries = [];
      teams.forEach((team, ti) => {
        for (let pi = 0; pi < (team.size || 1); pi++) {
          const gv = team.scores?.[pi]?.[h.hole];
          if (gv === undefined || gv === null) continue;
          if (!skinsIn(team, pi, "netIn")) continue;
          const hd = team.hdcp?.[pi];
          if (hd === null || hd === undefined || hd === "") continue;
          netEntries.push({ name: team.players?.[pi]?.trim() || "Player " + (pi + 1), teamName: team.name || "Team " + (ti + 1), teamIdx: ti, pi, gross: safeInt(gv), score: safeInt(gv) - sfStrokesOnHole(hd, h, holeData), bigBoy: team.bigBoy?.[pi] === true });
        }
      });
      const netLive = netEntries.length > 0 && netEntries.length < teams.reduce((n, t) => { for (let pi = 0; pi < (t.size || 1); pi++) if (skinsIn(t, pi, "netIn")) n++; return n; }, 0);
      if (!courseHdcpOk) netResult = { winner: null, tied: false, live: false, score: null, hpar, notPlayed: false, courseHdcpMissing: true };
      else if (netEntries.length === 0) netResult = { winner: null, tied: false, live: false, score: null, hpar, notPlayed: true };
      else {
        const minScore = Math.min(...netEntries.map(x => x.score));
        const low = netEntries.filter(x => x.score === minScore);
        if (low.length === 1) netResult = { winner: low[0], tied: false, live: netLive, score: minScore, hpar };
        else {
          const teamsWithLow = [...new Set(low.map(x => x.teamIdx))];
          if (teamsWithLow.length === 1 && !teammatesTie) netResult = { winner: low, tied: false, live: netLive, score: minScore, hpar, teammateWin: true };
          else netResult = { winner: null, tied: true, live: netLive, score: minScore, hpar, tiers: low, teammateCarry: teamsWithLow.length === 1 && teammatesTie };
        }
      }
    }
    results.push({ hole: h.hole, par: hpar, reg: regResult, net: netResult, bb: bbResult });
  }
  return results;
}

// ── SKINS TAB COMPONENT ───────────────────────────────────────────────────────
export function SfSkinsTab({ teams, course, holePars, skinsEnabled, bigBoyEnabled, teammatesTie, valueFn = null, highWins = false, pointsMode = false, netEnabled = false }) {
  if (!skinsEnabled) return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>$</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Skins not enabled</div>
      <div style={{ fontSize: 13 }}>Turn on Skins in tournament settings to track them here.</div>
    </div>
  );

  const skins = calcSfSkins(teams, course.holes, holePars, bigBoyEnabled, teammatesTie, valueFn, highWins, netEnabled);
  const netInfo = netEnabled ? missingNetHdcp(teams, course) : { missing: [], courseHdcpMissing: false };
  const netOnHold = netEnabled && (netInfo.missing.length > 0 || netInfo.courseHdcpMissing);
  const outLists = skinsOutLists(teams);

  // Build tally of winners
  const tally = {};
  skins.forEach(({ reg, net, bb }) => {
    const addW = (w, type) => {
      if (!w) return;
      (Array.isArray(w) ? w : [w]).forEach(p => {
        const k = p.teamIdx + "-" + p.pi;
        if (!tally[k]) tally[k] = { name: p.name, teamName: p.teamName, reg: 0, net: 0, bb: 0 };
        tally[k][type]++;
      });
    };
    if (!reg.tied && !reg.notPlayed) addW(reg.winner, "reg");
    if (netEnabled && !netOnHold && net && !net.tied && !net.notPlayed) addW(net.winner, "net");
    if (bb && !bb.tied && !bb.notPlayed) addW(bb.winner, "bb");
  });

  const leaders = Object.values(tally).sort((a, b) => ((b.reg||0) + (b.net||0) + (b.bb||0)) - ((a.reg||0) + (a.net||0) + (a.bb||0)));
  const regWon = skins.filter(s => !s.reg.tied && !s.reg.notPlayed && s.reg.winner).length;
  const regDead = skins.filter(s => s.reg.tied).length;
  const regLive = skins.filter(s => s.reg.live && !s.reg.tied && !s.reg.winner).length;
  const netWon = netEnabled && !netOnHold ? skins.filter(s => s.net && !s.net.tied && !s.net.notPlayed && s.net.winner).length : 0;
  const netDead = netEnabled && !netOnHold ? skins.filter(s => s.net && s.net.tied).length : 0;
  const bbWon = bigBoyEnabled ? skins.filter(s => s.bb && !s.bb.tied && !s.bb.notPlayed && s.bb.winner).length : 0;
  const bbEnrolled = bigBoyEnabled ? teams.reduce((s, t) => {
    for (let pi = 0; pi < (t.size || 1); pi++) if (t.bigBoy?.[pi]) s++;
    return s;
  }, 0) : 0;

  const wLabel = (res, isBB) => {
    if (!res || res.notPlayed) return { text: "—", sub: "not played", color: C.dim };
    if (res.live && !res.tied && !res.winner) return { text: "—", sub: "waiting…", color: C.muted };
    if (res.tied) {
      if (res.teammateCarry) return { text: "Tied — dead", sub: "Teammates tied · carries", color: C.red };
      return { text: "Tied — dead", sub: (res.tiers || []).map(p => p.name).join(" & "), color: C.red };
    }
    if (!res.winner) return { text: "—", sub: "—", color: C.dim };
    if (res.teammateWin && Array.isArray(res.winner)) {
      return { text: "Teammates win", sub: res.winner.map(p => p.name).join(" & "), color: C.green };
    }
    const w = Array.isArray(res.winner) ? res.winner[0] : res.winner;
    const sc = res.score; const hp = res.hpar;
    const lbl = sc === null ? "" : pointsMode ? sc + " pts" : sc <= hp - 2 ? "Eagle" : sc === hp - 1 ? "Birdie" : sc === hp ? "Par" : "+" + (sc - hp);
    return { text: w.name + (lbl ? " · " + lbl : ""), sub: w.teamName, color: isBB ? C.gold : C.green };
  };

  const wLabelNet = (res) => {
    if (!res) return { text: "—", sub: "—", color: C.dim };
    if (netOnHold) return { text: "On hold", sub: "HDCP needed", color: C.red };
    if (res.courseHdcpMissing) return { text: "On hold", sub: "Course handicaps missing", color: C.red };
    const base = wLabel(res, false);
    if (res.tied || res.notPlayed || !res.winner || res.live) return base;
    if (res.teammateWin && Array.isArray(res.winner)) return { text: "Teammates win", sub: res.winner.map(p2 => p2.name).join(" & ") + " · Net " + res.score, color: C.green };
    const w = Array.isArray(res.winner) ? res.winner[0] : res.winner;
    return { text: w.name, sub: "Net " + res.score + " · gross " + (w.gross ?? w.score) + " · " + w.teamName, color: C.green };
  };

  const rowStyle = (reg, bb, net) => {
    if (reg.notPlayed) return { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" };
    if (reg.live || (bb && bb.live) || (net && net.live)) return { bg: "rgba(232,184,75,0.06)", border: "rgba(232,184,75,0.2)" };
    if (reg.tied && (!bb || bb.tied)) return { bg: "rgba(224,80,80,0.06)", border: "rgba(224,80,80,0.15)" };
    return { bg: "rgba(123,180,80,0.07)", border: "rgba(123,180,80,0.2)" };
  };

  return (
    <div>
      {netEnabled && netOnHold && (
        <div style={{ background: "rgba(224,80,80,0.12)", border: "1px solid rgba(224,80,80,0.5)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 700, color: "#ff8a8a", lineHeight: 1.5 }}>
          ⚠️ HDCP needed for Net Skins{netInfo.missing.length > 0 ? ": " + netInfo.missing.join(", ") : ""}
          {netInfo.courseHdcpMissing && <div style={{ fontWeight: 600, color: C.muted, marginTop: 4 }}>Course handicaps missing — net skins can't be calculated until course handicaps are added.</div>}
          <div style={{ fontWeight: 600, color: C.muted, marginTop: 4 }}>Net skins are on hold — no net winners counted. Gross and Big Boy keep running.</div>
        </div>
      )}
      {(outLists.grossOut.length > 0 || (netEnabled && outLists.netOut.length > 0)) && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
          {outLists.grossOut.length > 0 && <div>Out of Gross skins: {outLists.grossOut.join(", ")} — their scores don't count or tie in Gross.</div>}
          {netEnabled && outLists.netOut.length > 0 && <div>Out of Net skins: {outLists.netOut.join(", ")} — their scores don't count or tie in Net.</div>}
        </div>
      )}
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + (1 + (netEnabled ? 1 : 0) + (bigBoyEnabled ? 1 : 0)) + ", 1fr)", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "rgba(123,180,80,0.1)", border: "1px solid rgba(123,180,80,0.3)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "rgba(123,180,80,0.8)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Regular skins</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{regWon} won</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{regDead} dead · {regLive} live</div>
        </div>
        {netEnabled && (
          <div style={{ background: netOnHold ? "rgba(224,80,80,0.1)" : "rgba(123,180,80,0.1)", border: "1px solid " + (netOnHold ? "rgba(224,80,80,0.3)" : "rgba(123,180,80,0.3)"), borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(123,180,80,0.8)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Net skins</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: netOnHold ? C.red : C.green }}>{netOnHold ? "On hold" : netWon + " won"}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{netOnHold ? (netInfo.missing.length > 0 ? "HDCP needed: " + netInfo.missing.join(", ") : "Course handicaps missing") : netDead + " dead"}</div>
          </div>
        )}
        {bigBoyEnabled && (
          <div style={{ background: "rgba(232,184,75,0.1)", border: "1px solid rgba(232,184,75,0.3)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(232,184,75,0.8)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Big Boy</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.gold }}>{bbWon} won</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{bbEnrolled} enrolled</div>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "40px repeat(" + (1 + (netEnabled ? 1 : 0) + (bigBoyEnabled ? 1 : 0)) + ", 1fr)", gap: 0, marginBottom: 6, padding: "0 4px" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>HOLE</div>
        <div style={{ fontSize: 10, color: "rgba(123,180,80,0.7)", letterSpacing: 1, textAlign: "center" }}>{pointsMode ? "POINTS" : "REGULAR"}</div>
        {netEnabled && <div style={{ fontSize: 10, color: "rgba(123,180,80,0.7)", letterSpacing: 1, textAlign: "center" }}>NET</div>}
        {bigBoyEnabled && <div style={{ fontSize: 10, color: "rgba(232,184,75,0.7)", letterSpacing: 1, textAlign: "center" }}>BIG BOY</div>}
      </div>

      {/* Hole rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        {skins.map(({ hole, par, reg, net, bb }) => {
          const { bg, border } = rowStyle(reg, bb, net);
          const rw = wLabel(reg, false);
          const nw = netEnabled ? wLabelNet(net) : null;
          const bw = bigBoyEnabled ? wLabel(bb, true) : null;
          return (
            <div key={hole} style={{ display: "grid", gridTemplateColumns: "40px repeat(" + (1 + (netEnabled ? 1 : 0) + (bigBoyEnabled ? 1 : 0)) + ", 1fr)", gap: 0, background: bg, border: "1px solid " + border, borderRadius: 9, padding: "8px 10px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: reg.live ? C.gold : reg.notPlayed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)" }}>{hole}</div>
                <div style={{ fontSize: 9, color: C.dim }}>P{par}</div>
              </div>
              <div style={{ textAlign: "center", paddingRight: bigBoyEnabled ? 4 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: rw.color, lineHeight: 1.2 }}>{rw.text}</div>
                {rw.sub && rw.sub !== "—" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{rw.sub}</div>}
              </div>
              {netEnabled && nw && (
                <div style={{ textAlign: "center", paddingLeft: 4, paddingRight: bigBoyEnabled ? 4 : 0, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: nw.color, lineHeight: 1.2 }}>{nw.text}</div>
                  {nw.sub && nw.sub !== "—" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{nw.sub}</div>}
                </div>
              )}
              {bigBoyEnabled && bw && (
                <div style={{ textAlign: "center", paddingLeft: 4, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: bw.color, lineHeight: 1.2 }}>{bw.text}</div>
                  {bw.sub && bw.sub !== "—" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{bw.sub}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Leaders */}
      {leaders.length > 0 && (<>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Leaders</div>
        {leaders.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: i === 0 ? "rgba(123,180,80,0.08)" : "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", marginBottom: 5 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{p.teamName}</div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(123,180,80,0.7)" }}>Reg</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: p.reg > 0 ? C.green : C.dim }}>{p.reg || "—"}</div>
              </div>
              {netEnabled && !netOnHold && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(123,180,80,0.7)" }}>Net</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: p.net > 0 ? C.green : C.dim }}>{p.net || "—"}</div>
                </div>
              )}
              {bigBoyEnabled && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(232,184,75,0.7)" }}>BB</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: p.bb > 0 ? C.gold : C.dim }}>{p.bb || "—"}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </>)}
      <div style={{ fontSize: 10, color: C.dim, textAlign: "center", marginTop: 10 }}>Updates live · confirm with hand scorecards at end</div>
    </div>
  );
}
