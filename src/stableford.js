// ── STABLEFORD MATH — shared by the Outing fold-in (1-day) ───────────────────
// The Outing tournament object already carries teams, scores, course, hole
// pars, skins, Big Boy, CTP, and captain links. Stableford adds only this:
// a handicap per player (team.hdcp[], parallel to players[], like bigBoy[]),
// a points table, a skins basis, and a counting mode — everything else is
// derived from gross scores, so no score is ever stored twice and switching
// format mid-round (director-only, setup) cannot corrupt a score.
//
// Points: net mode = gross minus strokes by course-handicap rank, then the
// table. Count-up mode = gross points per hole, and the day total adds that
// day's handicap on top. Team total per hole = best balls-to-count points,
// where the count comes from the Outing's existing per-par "Scores That
// Count" setting (ballsByPar). Birdie Bonus never applies to Stableford.

export const SF_DEFAULT_POINTS = { albatross:5, eagle:4, birdie:3, par:2, bogey:1, double:0, worse:0 };

export function sfConfigOrDefaults(row) {
  const cfg = row?.sf_config || {};
  return {
    points: { ...SF_DEFAULT_POINTS, ...(cfg.points || {}) },
    skinsBasis: cfg.skinsBasis || "strokes", // "strokes" | "points"
    counting: cfg.counting || "net", // "net" | "countup"
  };
}

export function sfIsField(teams) {
  return Array.isArray(teams) && teams.length === 1 && teams[0]?.isField === true;
}

export function sfPointsForDiff(diff, pts) {
  if (diff <= -3) return pts.albatross;
  if (diff === -2) return pts.eagle;
  if (diff === -1) return pts.birdie;
  if (diff === 0) return pts.par;
  if (diff === 1) return pts.bogey;
  if (diff === 2) return pts.double;
  return pts.worse;
}

// Strokes on a hole for a handicap, by course-handicap rank (1 = hardest).
// Over 18, a second stroke lands on the hardest holes first.
export function sfStrokesOnHole(hdcp, holeObj, holes) {
  if (!hdcp || hdcp <= 0) return 0;
  const sorted = [...(holes || [])].sort((a, b) => (a.hdcp ?? 99) - (b.hdcp ?? 99));
  const rank = sorted.findIndex(h => h.hole === holeObj.hole) + 1;
  if (rank < 1) return 0;
  const full = Math.floor(hdcp / 18);
  const rem = hdcp % 18;
  return full + (rank <= rem ? 1 : 0);
}

function safeInt(v, f = 0) { const n = parseInt(v, 10); return isNaN(n) ? f : n; }

// Stableford points for one hole. Returns null when no gross score exists.
export function sfHolePoints(gross, hdcp, holeObj, holes, effPar, points, counting) {
  if (gross === undefined || gross === null) return null;
  const g = safeInt(gross);
  if (counting === "countup") return sfPointsForDiff(g - effPar, points);
  const strokes = sfStrokesOnHole(hdcp || 0, holeObj, holes);
  return sfPointsForDiff(g - strokes - effPar, points);
}

function ballsFor(par, ballsByPar) {
  if (ballsByPar && typeof ballsByPar === "object") return parseInt(ballsByPar[par]) || parseInt(ballsByPar[4]) || 2;
  return parseInt(ballsByPar) || 2;
}

// Team Stableford totals for a round: {front, back, total, byHole:{hole:pts}}.
export function sfTeamPoints(team, holes, holePars, ballsByPar, cfg) {
  const byHole = {};
  let front = 0, back = 0, total = 0;
  for (const h of holes || []) {
    const effPar = holePars?.[h.hole] ?? h.par;
    const vals = [];
    for (let pi = 0; pi < (team.size || 1); pi++) {
      const pts = sfHolePoints(team.scores?.[pi]?.[h.hole], team.hdcp?.[pi] ?? 12, h, holes, effPar, cfg.points, cfg.counting);
      if (pts !== null) vals.push(pts);
    }
    vals.sort((a, b) => b - a);
    const pts = vals.slice(0, ballsFor(effPar, ballsByPar)).reduce((a, b) => a + b, 0);
    byHole[h.hole] = pts;
    if (h.side === "front") front += pts; else back += pts;
    total += pts;
  }
  return { front, back, total, byHole };
}

// Individual Stableford leaderboard, sorted highest first. Count-up totals
// add the player's handicap, but only once at least one hole is scored.
export function sfIndividualPoints(teams, holes, holePars, cfg) {
  const out = [];
  (teams || []).forEach((team, ti) => {
    for (let pi = 0; pi < (team.size || 1); pi++) {
      const name = (team.players?.[pi] || "").trim() || ("Player " + (pi + 1));
      const hdcp = team.hdcp?.[pi] ?? 12;
      const byHole = {};
      let sum = 0, front = 0, back = 0, holesPlayed = 0;
      for (const h of holes || []) {
        const effPar = holePars?.[h.hole] ?? h.par;
        const pts = sfHolePoints(team.scores?.[pi]?.[h.hole], hdcp, h, holes, effPar, cfg.points, cfg.counting);
        if (pts !== null) {
          byHole[h.hole] = pts;
          sum += pts;
          if (h.side === "front") front += pts; else back += pts;
          holesPlayed++;
        }
      }
      const total = cfg.counting === "countup" && holesPlayed > 0 ? sum + hdcp : sum;
      out.push({ name, teamName: team.name || ("Team " + (ti + 1)), teamColor: team.color, teamIdx: ti, pi, hdcp, total, front, back, holesPlayed, byHole });
    }
  });
  out.sort((a, b) => b.total !== a.total ? b.total - a.total : b.holesPlayed - a.holesPlayed);
  return out;
}
