// ── COURSE DATA ───────────────────────────────────────────────────────────────
// All hole data verified against official scorecards
// South Toledo Golf Club — verified April 2026 via 18Birdies/official scorecard

export const COURSES = {
  "south-toledo": {
    id: "south-toledo",
    name: "South Toledo Golf Club",
    city: "Toledo, OH",
    par: 70,
    note: "Hole #4 plays as par 3 (248 yds). Some groups play it as par 4 — use the override in settings.",
    holes: [
      // ── FRONT 9 ──────────────────────────────────────────────────────────────
      { hole:1,  par:4, hdcp:7,  side:"front", yards:386 },
      { hole:2,  par:4, hdcp:5,  side:"front", yards:408 },
      { hole:3,  par:4, hdcp:1,  side:"front", yards:414 },
      { hole:4,  par:3, hdcp:15, side:"front", yards:248 },
      { hole:5,  par:4, hdcp:11, side:"front", yards:352 },
      { hole:6,  par:4, hdcp:13, side:"front", yards:350 },
      { hole:7,  par:3, hdcp:17, side:"front", yards:140 },
      { hole:8,  par:5, hdcp:9,  side:"front", yards:483 },
      { hole:9,  par:4, hdcp:3,  side:"front", yards:401 },
      // ── BACK 9 ───────────────────────────────────────────────────────────────
      { hole:10, par:4, hdcp:12, side:"back",  yards:392 },
      { hole:11, par:4, hdcp:14, side:"back",  yards:314 },
      { hole:12, par:3, hdcp:18, side:"back",  yards:161 },
      { hole:13, par:4, hdcp:8,  side:"back",  yards:453 },
      { hole:14, par:4, hdcp:6,  side:"back",  yards:419 },
      { hole:15, par:5, hdcp:10, side:"back",  yards:517 },
      { hole:16, par:3, hdcp:16, side:"back",  yards:214 },
      { hole:17, par:4, hdcp:4,  side:"back",  yards:437 },
      { hole:18, par:4, hdcp:2,  side:"back",  yards:419 },
    ]
  },

  "iron-valley": {
    id: "iron-valley",
    name: "Iron Valley Golf Club",
    city: "Lebanon, PA",
    par: 72,
    note: "P.B. Dye design. Ranked top 10 in PA by Golf Magazine. 7,026 yards from tips.",
    holes: [
      // ── FRONT 9 ──────────────────────────────────────────────────────────────
      { hole:1,  par:4, hdcp:1,  side:"front", yards:435 },
      { hole:2,  par:4, hdcp:17, side:"front", yards:373 },
      { hole:3,  par:5, hdcp:15, side:"front", yards:511 },
      { hole:4,  par:4, hdcp:5,  side:"front", yards:448 },
      { hole:5,  par:3, hdcp:11, side:"front", yards:124 },
      { hole:6,  par:4, hdcp:3,  side:"front", yards:473 },
      { hole:7,  par:5, hdcp:9,  side:"front", yards:535 },
      { hole:8,  par:3, hdcp:7,  side:"front", yards:201 },
      { hole:9,  par:4, hdcp:13, side:"front", yards:395 },
      // ── BACK 9 ───────────────────────────────────────────────────────────────
      { hole:10, par:4, hdcp:4,  side:"back",  yards:469 },
      { hole:11, par:4, hdcp:14, side:"back",  yards:356 },
      { hole:12, par:3, hdcp:16, side:"back",  yards:177 },
      { hole:13, par:5, hdcp:10, side:"back",  yards:588 },
      { hole:14, par:4, hdcp:8,  side:"back",  yards:383 },
      { hole:15, par:4, hdcp:6,  side:"back",  yards:456 },
      { hole:16, par:5, hdcp:18, side:"back",  yards:494 },
      { hole:17, par:3, hdcp:12, side:"back",  yards:181 },
      { hole:18, par:4, hdcp:2,  side:"back",  yards:427 },
    ]
  }
};

// ── STROKE HOLE CALCULATOR ────────────────────────────────────────────────────
// Returns which holes a player receives strokes on given their handicap per side.
// Strokes are allocated by hole handicap (hdcp), lowest hdcp = first stroke.
// With N strokes per side: holes with hdcp <= N on front, hdcp <= N on back.
export function getStrokeHoles(courseId, strokesPerSide) {
  const course = COURSES[courseId];
  if (!course || !strokesPerSide) return [];
  const result = [];
  const front = course.holes.filter(h => h.side === "front").sort((a,b) => a.hdcp - b.hdcp);
  const back  = course.holes.filter(h => h.side === "back").sort((a,b) => a.hdcp - b.hdcp);
  front.slice(0, strokesPerSide).forEach(h => result.push(h.hole));
  back.slice(0,  strokesPerSide).forEach(h => result.push(h.hole));
  return result;
}

// ── AUTO-PRESS NASSAU CALCULATOR ──────────────────────────────────────────────
// Calculates Nassau bet results with optional auto-press and manual presses.
// Parameters:
//   scores      — { me: {hole: score}, opp: {hole: score} }
//   holes       — course hole array
//   myStrokes   — array of hole numbers where I get a stroke
//   oppStrokes  — array of hole numbers where opponent gets a stroke
//   betAmount   — base bet per leg ($)
//   pressDown   — holes down to trigger auto-press (99 = never)
//   manualPresses — [{hole: N}] array of manually-triggered presses
//
// Returns:
//   { front: { bets: [{diff, amount}] }, back: { bets: [{diff, amount}] }, net: $ }
//
// Each "bet" in the array is one leg (original + any presses).
// diff > 0 = you are ahead, diff < 0 = opponent ahead.
export function calcAutoPressNassau(scores, holes, myStrokes, oppStrokes, betAmount, pressDown, manualPresses) {
  pressDown = pressDown || 99;
  manualPresses = manualPresses || [];

  function calcSide(sideHoles) {
    const bets = [{ startHole: sideHoles[0].hole, amount: betAmount, diffs: [] }];

    for (const h of sideHoles) {
      const my  = scores.me?.[h.hole];
      const op  = scores.opp?.[h.hole];
      if (my === undefined || my === null || op === undefined || op === null) continue;

      const myNet  = myStrokes.includes(h.hole)  ? my  - 1 : my;
      const oppNet = oppStrokes.includes(h.hole)  ? op  - 1 : op;

      // Update all active bets
      for (const bet of bets) {
        if (h.hole < bet.startHole) continue;
        if (myNet < oppNet)       bet.diffs.push(1);
        else if (myNet > oppNet)  bet.diffs.push(-1);
        else                      bet.diffs.push(0);
      }

      // Running diff for current (last) bet
      const curBet = bets[bets.length - 1];
      const runDiff = curBet.diffs.reduce((s, v) => s + v, 0);

      // Auto-press trigger: down by pressDown after this hole
      const nextHole = sideHoles[sideHoles.indexOf(h) + 1];
      if (nextHole && runDiff <= -pressDown) {
        bets.push({ startHole: nextHole.hole, amount: betAmount, diffs: [] });
      }

      // Manual press trigger
      if (nextHole && manualPresses.some(p => p.hole === nextHole.hole)) {
        // Don't double-add if auto-press already triggered
        if (!bets.some(b => b.startHole === nextHole.hole)) {
          bets.push({ startHole: nextHole.hole, amount: betAmount, diffs: [] });
        }
      }
    }

    // Calculate final diff and net for each bet
    const processedBets = bets.map(bet => {
      const diff = bet.diffs.reduce((s, v) => s + v, 0);
      const net  = diff > 0 ? bet.amount : diff < 0 ? -bet.amount : 0;
      return { diff, amount: bet.amount, net, startHole: bet.startHole };
    });

    const sideNet = processedBets.reduce((s, b) => s + b.net, 0);
    return { bets: processedBets, net: sideNet };
  }

  const frontHoles = holes.filter(h => h.side === "front");
  const backHoles  = holes.filter(h => h.side === "back");

  const front = calcSide(frontHoles);
  const back  = calcSide(backHoles);

  return { front, back, net: front.net + back.net };
}
