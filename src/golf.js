// ── SOUTH TOLEDO GOLF CLUB SCORECARD ─────────────────────────────────────────
export const COURSES = {
  "south-toledo": {
    name: "South Toledo Golf Club",
    city: "Toledo, OH",
    par: 70,
    holes: [
      // Front 9 — odd hdcp
      { hole:1,  par:4, hdcp:7,  side:"front" },
      { hole:2,  par:4, hdcp:5,  side:"front" },
      { hole:3,  par:4, hdcp:1,  side:"front" },
      { hole:4,  par:3, hdcp:15, side:"front" },
      { hole:5,  par:4, hdcp:11, side:"front" },
      { hole:6,  par:4, hdcp:13, side:"front" },
      { hole:7,  par:3, hdcp:17, side:"front" },
      { hole:8,  par:5, hdcp:9,  side:"front" },
      { hole:9,  par:4, hdcp:3,  side:"front" },
      // Back 9 — even hdcp
      { hole:10, par:4, hdcp:12, side:"back" },
      { hole:11, par:4, hdcp:14, side:"back" },
      { hole:12, par:3, hdcp:18, side:"back" },
      { hole:13, par:4, hdcp:8,  side:"back" },
      { hole:14, par:4, hdcp:6,  side:"back" },
      { hole:15, par:5, hdcp:10, side:"back" },
      { hole:16, par:3, hdcp:16, side:"back" },
      { hole:17, par:4, hdcp:4,  side:"back" },
      { hole:18, par:4, hdcp:2,  side:"back" },
    ]
  }
};

// ── STROKE CALCULATOR ─────────────────────────────────────────────────────────
// strokes = total strokes given to opponent
// Returns array of hole numbers where opponent gets a stroke
export function getStrokeHoles(courseId, totalStrokes) {
  const course = COURSES[courseId];
  if (!course || totalStrokes === 0) return [];

  const strokesPerSide = Math.floor(totalStrokes / 2);
  const extraStroke = totalStrokes % 2; // front gets extra if odd

  const frontHoles = course.holes.filter(h => h.side === "front");
  const backHoles  = course.holes.filter(h => h.side === "back");

  // Sort front by hdcp ascending (1,3,5,7... = hardest first)
  const frontSorted = [...frontHoles].sort((a,b) => a.hdcp - b.hdcp);
  // Sort back by hdcp ascending (2,4,6,8... = hardest first)
  const backSorted  = [...backHoles].sort((a,b) => a.hdcp - b.hdcp);

  const strokeHoles = [];

  // Front strokes
  const frontCount = strokesPerSide + extraStroke;
  for (let i = 0; i < Math.min(frontCount, frontSorted.length); i++) {
    strokeHoles.push(frontSorted[i].hole);
  }

  // Back strokes
  for (let i = 0; i < Math.min(strokesPerSide, backSorted.length); i++) {
    strokeHoles.push(backSorted[i].hole);
  }

  return strokeHoles;
}

// ── BET CALCULATOR ────────────────────────────────────────────────────────────
// Returns running tally for each bet type
export function calcMatchPlay(scores, holeData, strokeHoles, betPerHole) {
  let result = { holesWon: 0, holesLost: 0, holesHalved: 0, runningTotal: 0, holes: [] };

  for (const hole of holeData) {
    const myScore = scores.me[hole.hole];
    const oppScore = scores.opp[hole.hole];
    if (myScore === undefined || oppScore === undefined) continue;

    const oppGetsStroke = strokeHoles.includes(hole.hole);
    const oppNet = oppGetsStroke ? oppScore - 1 : oppScore;

    let outcome = "halved";
    let delta = 0;
    if (myScore < oppNet) { outcome = "won"; delta = betPerHole; result.holesWon++; }
    else if (myScore > oppNet) { outcome = "lost"; delta = -betPerHole; result.holesLost++; }
    else { result.holesHalved++; }

    result.runningTotal += delta;
    result.holes.push({ hole: hole.hole, myScore, oppScore, oppNet, oppGetsStroke, outcome, delta });
  }

  return result;
}

export function calcNassau(scores, holeData, strokeHoles, betAmount) {
  const frontHoles = holeData.filter(h => h.side === "front");
  const backHoles  = holeData.filter(h => h.side === "back");

  function calcSide(holes) {
    let myTotal = 0, oppTotal = 0;
    let complete = true;
    for (const hole of holes) {
      const myScore = scores.me[hole.hole];
      const oppScore = scores.opp[hole.hole];
      if (myScore === undefined || oppScore === undefined) { complete = false; continue; }
      const oppNet = strokeHoles.includes(hole.hole) ? oppScore - 1 : oppScore;
      myTotal += myScore;
      oppTotal += oppNet;
    }
    if (!complete && myTotal === 0) return { result: "incomplete", amount: 0 };
    if (myTotal < oppTotal) return { result: "won", amount: betAmount };
    if (myTotal > oppTotal) return { result: "lost", amount: -betAmount };
    return { result: "tied", amount: 0 };
  }

  const front = calcSide(frontHoles);
  const back  = calcSide(backHoles);
  const total = calcSide(holeData);

  return {
    front,
    back,
    total,
    net: front.amount + back.amount + total.amount
  };
}

export function calcSkins(scores, holeData, strokeHoles, betPerSkin) {
  let skins = { me: 0, opp: 0, carries: 0, net: 0, holes: [] };
  let carryover = 0;

  for (const hole of holeData) {
    const myScore = scores.me[hole.hole];
    const oppScore = scores.opp[hole.hole];
    if (myScore === undefined || oppScore === undefined) continue;

    const oppNet = strokeHoles.includes(hole.hole) ? oppScore - 1 : oppScore;
    const pot = betPerSkin + carryover;

    if (myScore < oppNet) {
      skins.me++;
      skins.net += pot;
      skins.holes.push({ hole: hole.hole, winner: "me", pot });
      carryover = 0;
    } else if (myScore > oppNet) {
      skins.opp++;
      skins.net -= pot;
      skins.holes.push({ hole: hole.hole, winner: "opp", pot });
      carryover = 0;
    } else {
      carryover += betPerSkin;
      skins.holes.push({ hole: hole.hole, winner: "carry", pot: carryover });
    }
  }

  skins.carries = carryover;
  return skins;
}
