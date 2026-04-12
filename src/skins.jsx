import React from "react";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}

// ── SKINS CALCULATOR ──────────────────────────────────────────────────────────
// Returns per-hole results for regular skins and (optionally) Big Boy skins.
// Regular rule: lowest score in field wins. Tied by non-teammate = dead.
//   Teammate exception: if ALL tied low scorers are on same team → each wins.
// Big Boy rule: only BB-enrolled players compete. No teammate exception in BB.
export function calcSkins(teams, holeData, holePars, bigBoyEnabled) {
  const results = [];
  for (const h of holeData) {
    const hpar = holePars?.[h.hole] ?? h.par;

    // Collect all individual scores for this hole
    const allScores = [];
    teams.forEach((team, ti) => {
      for (let pi = 0; pi < (team.size || 2); pi++) {
        const s = team.scores?.[pi]?.[h.hole];
        if (s !== undefined && s !== null) {
          allScores.push({
            name: team.players?.[pi]?.trim() || "Player " + (pi + 1),
            teamName: team.name || "Team " + (ti + 1),
            teamIdx: ti,
            pi,
            score: safeInt(s),
            bigBoy: team.bigBoy?.[pi] === true,
          });
        }
      }
    });

    const totalPlayers = teams.reduce((s, t) => s + (t.size || 2), 0);
    const live = allScores.length > 0 && allScores.length < totalPlayers;

    // ── Regular skins ──────────────────────────────────────────────────────
    let regResult = { winner: null, tied: false, live, score: null, hpar, notPlayed: allScores.length === 0 };
    if (allScores.length > 0) {
      const minScore = Math.min(...allScores.map(x => x.score));
      const lowPlayers = allScores.filter(x => x.score === minScore);
      if (lowPlayers.length === 1) {
        regResult = { winner: lowPlayers[0], tied: false, live, score: minScore, hpar };
      } else {
        const teamsWithLow = [...new Set(lowPlayers.map(x => x.teamIdx))];
        if (teamsWithLow.length === 1) {
          // All tied on same team → each teammate wins
          regResult = { winner: lowPlayers, tied: false, live, score: minScore, hpar, teammateWin: true };
        } else {
          // Two or more teams tied → dead
          regResult = { winner: null, tied: true, live, score: minScore, hpar, tiers: lowPlayers };
        }
      }
    }

    // ── Big Boy skins ──────────────────────────────────────────────────────
    let bbResult = null;
    if (bigBoyEnabled) {
      const bbScores = allScores.filter(x => x.bigBoy);
      const bbEnrolled = teams.reduce((s, t) => {
        for (let pi = 0; pi < (t.size || 2); pi++) if (t.bigBoy?.[pi]) s++;
        return s;
      }, 0);
      const bbLive = bbScores.length > 0 && bbScores.length < bbEnrolled;
      if (bbScores.length === 0) {
        bbResult = { winner: null, tied: false, live: false, score: null, hpar, notPlayed: true };
      } else {
        const bbMin = Math.min(...bbScores.map(x => x.score));
        const bbLow = bbScores.filter(x => x.score === bbMin);
        if (bbLow.length === 1) {
          bbResult = { winner: bbLow[0], tied: false, live: bbLive, score: bbMin, hpar };
        } else {
          // In BB, teammates CAN tie each other — no teammate exception
          bbResult = { winner: null, tied: true, live: bbLive, score: bbMin, hpar, tiers: bbLow };
        }
      }
    }

    results.push({ hole: h.hole, par: hpar, reg: regResult, bb: bbResult });
  }
  return results;
}

// ── SKINS TAB COMPONENT ───────────────────────────────────────────────────────
export function SkinsTab({ teams, course, holePars, skinsEnabled, bigBoyEnabled }) {
  if (!skinsEnabled) return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>$</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Skins not enabled</div>
      <div style={{ fontSize: 13 }}>Turn on Skins in tournament settings to track them here.</div>
    </div>
  );

  const skins = calcSkins(teams, course.holes, holePars, bigBoyEnabled);

  // Build tally of winners
  const tally = {};
  skins.forEach(({ reg, bb }) => {
    const addW = (w, type) => {
      if (!w) return;
      (Array.isArray(w) ? w : [w]).forEach(p => {
        const k = p.teamIdx + "-" + p.pi;
        if (!tally[k]) tally[k] = { name: p.name, teamName: p.teamName, reg: 0, bb: 0 };
        tally[k][type]++;
      });
    };
    if (!reg.tied && !reg.notPlayed) addW(reg.winner, "reg");
    if (bb && !bb.tied && !bb.notPlayed) addW(bb.winner, "bb");
  });

  const leaders = Object.values(tally).sort((a, b) => (b.reg + b.bb) - (a.reg + a.bb));
  const regWon = skins.filter(s => !s.reg.tied && !s.reg.notPlayed && s.reg.winner).length;
  const regDead = skins.filter(s => s.reg.tied).length;
  const regLive = skins.filter(s => s.reg.live && !s.reg.tied && !s.reg.winner).length;
  const bbWon = bigBoyEnabled ? skins.filter(s => s.bb && !s.bb.tied && !s.bb.notPlayed && s.bb.winner).length : 0;
  const bbEnrolled = bigBoyEnabled ? teams.reduce((s, t) => {
    for (let pi = 0; pi < (t.size || 2); pi++) if (t.bigBoy?.[pi]) s++;
    return s;
  }, 0) : 0;

  const wLabel = (res, isBB) => {
    if (!res || res.notPlayed) return { text: "—", sub: "not played", color: C.dim };
    if (res.live && !res.tied && !res.winner) return { text: "—", sub: "waiting…", color: C.muted };
    if (res.tied) return { text: "Tied — dead", sub: (res.tiers || []).map(p => p.name).join(" & "), color: C.red };
    if (!res.winner) return { text: "—", sub: "—", color: C.dim };
    if (res.teammateWin && Array.isArray(res.winner)) {
      return { text: "Teammates win", sub: res.winner.map(p => p.name).join(" & "), color: C.green };
    }
    const w = Array.isArray(res.winner) ? res.winner[0] : res.winner;
    const sc = res.score; const hp = res.hpar;
    const lbl = sc === null ? "" : sc <= hp - 2 ? "Eagle" : sc === hp - 1 ? "Birdie" : sc === hp ? "Par" : "+" + (sc - hp);
    return { text: w.name + (lbl ? " · " + lbl : ""), sub: w.teamName, color: isBB ? C.gold : C.green };
  };

  const rowStyle = (reg, bb) => {
    if (reg.notPlayed) return { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" };
    if (reg.live || (bb && bb.live)) return { bg: "rgba(232,184,75,0.06)", border: "rgba(232,184,75,0.2)" };
    if (reg.tied && (!bb || bb.tied)) return { bg: "rgba(224,80,80,0.06)", border: "rgba(224,80,80,0.15)" };
    return { bg: "rgba(123,180,80,0.07)", border: "rgba(123,180,80,0.2)" };
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: bigBoyEnabled ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "rgba(123,180,80,0.1)", border: "1px solid rgba(123,180,80,0.3)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "rgba(123,180,80,0.8)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Regular skins</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{regWon} won</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{regDead} dead · {regLive} live</div>
        </div>
        {bigBoyEnabled && (
          <div style={{ background: "rgba(232,184,75,0.1)", border: "1px solid rgba(232,184,75,0.3)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(232,184,75,0.8)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Big Boy</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.gold }}>{bbWon} won</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{bbEnrolled} enrolled</div>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: bigBoyEnabled ? "40px 1fr 1fr" : "40px 1fr", gap: 0, marginBottom: 6, padding: "0 4px" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>HOLE</div>
        <div style={{ fontSize: 10, color: "rgba(123,180,80,0.7)", letterSpacing: 1, textAlign: "center" }}>REGULAR</div>
        {bigBoyEnabled && <div style={{ fontSize: 10, color: "rgba(232,184,75,0.7)", letterSpacing: 1, textAlign: "center" }}>BIG BOY</div>}
      </div>

      {/* Hole rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        {skins.map(({ hole, par, reg, bb }) => {
          const { bg, border } = rowStyle(reg, bb);
          const rw = wLabel(reg, false);
          const bw = bigBoyEnabled ? wLabel(bb, true) : null;
          return (
            <div key={hole} style={{ display: "grid", gridTemplateColumns: bigBoyEnabled ? "40px 1fr 1fr" : "40px 1fr", gap: 0, background: bg, border: "1px solid " + border, borderRadius: 9, padding: "8px 10px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: reg.live ? C.gold : reg.notPlayed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)" }}>{hole}</div>
                <div style={{ fontSize: 9, color: C.dim }}>P{par}</div>
              </div>
              <div style={{ textAlign: "center", paddingRight: bigBoyEnabled ? 4 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: rw.color, lineHeight: 1.2 }}>{rw.text}</div>
                {rw.sub && rw.sub !== "—" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{rw.sub}</div>}
              </div>
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
