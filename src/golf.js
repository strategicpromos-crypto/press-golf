// ── PRESS GOLF — COURSE DATABASE ──────────────────────────────────────────────
// All courses verified from 18Birdies / official scorecards
// Hdcp = hole handicap index (1-18 across all holes)
// Stroke logic: front gets odd hdcp holes, back gets even hdcp holes

export const COURSES = {

  // ── SOUTH TOLEDO GOLF CLUB ─────────────────────────────────────────────────
  "south-toledo": {
    name: "South Toledo Golf Club",
    city: "Toledo, OH",
    par: 70,
    holes: [
      { hole:1,  par:4, hdcp:7,  side:"front" },
      { hole:2,  par:4, hdcp:5,  side:"front" },
      { hole:3,  par:4, hdcp:1,  side:"front" },
      { hole:4,  par:3, hdcp:15, side:"front" },
      { hole:5,  par:4, hdcp:11, side:"front" },
      { hole:6,  par:4, hdcp:13, side:"front" },
      { hole:7,  par:3, hdcp:17, side:"front" },
      { hole:8,  par:5, hdcp:9,  side:"front" },
      { hole:9,  par:4, hdcp:3,  side:"front" },
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
  },

  // ── WHITE PINES GOLF COURSE — Swanton, OH ──────────────────────────────────
  "white-pines": {
    name: "White Pines Golf Course",
    city: "Swanton, OH",
    par: 72,
    holes: [
      { hole:1,  par:4, hdcp:3,  side:"front" },
      { hole:2,  par:4, hdcp:17, side:"front" },
      { hole:3,  par:3, hdcp:13, side:"front" },
      { hole:4,  par:5, hdcp:9,  side:"front" },
      { hole:5,  par:4, hdcp:5,  side:"front" },
      { hole:6,  par:4, hdcp:7,  side:"front" },
      { hole:7,  par:5, hdcp:11, side:"front" },
      { hole:8,  par:3, hdcp:15, side:"front" },
      { hole:9,  par:4, hdcp:1,  side:"front" },
      { hole:10, par:4, hdcp:4,  side:"back" },
      { hole:11, par:5, hdcp:6,  side:"back" },
      { hole:12, par:4, hdcp:10, side:"back" },
      { hole:13, par:3, hdcp:18, side:"back" },
      { hole:14, par:4, hdcp:2,  side:"back" },
      { hole:15, par:5, hdcp:14, side:"back" },
      { hole:16, par:4, hdcp:12, side:"back" },
      { hole:17, par:3, hdcp:16, side:"back" },
      { hole:18, par:4, hdcp:8,  side:"back" },
    ]
  },

  // ── MAUMEE BAY STATE PARK GOLF COURSE — Oregon, OH ────────────────────────
  "maumee-bay": {
    name: "Maumee Bay Golf Course",
    city: "Oregon, OH",
    par: 72,
    holes: [
      { hole:1,  par:4, hdcp:9,  side:"front" },
      { hole:2,  par:4, hdcp:13, side:"front" },
      { hole:3,  par:4, hdcp:7,  side:"front" },
      { hole:4,  par:3, hdcp:17, side:"front" },
      { hole:5,  par:5, hdcp:1,  side:"front" },
      { hole:6,  par:4, hdcp:11, side:"front" },
      { hole:7,  par:5, hdcp:5,  side:"front" },
      { hole:8,  par:3, hdcp:15, side:"front" },
      { hole:9,  par:4, hdcp:3,  side:"front" },
      { hole:10, par:4, hdcp:12, side:"back" },
      { hole:11, par:3, hdcp:18, side:"back" },
      { hole:12, par:4, hdcp:4,  side:"back" },
      { hole:13, par:4, hdcp:16, side:"back" },
      { hole:14, par:5, hdcp:2,  side:"back" },
      { hole:15, par:3, hdcp:14, side:"back" },
      { hole:16, par:4, hdcp:6,  side:"back" },
      { hole:17, par:4, hdcp:10, side:"back" },
      { hole:18, par:5, hdcp:8,  side:"back" },
    ]
  },

  // ── EAGLE'S LANDING — Berlin, MD (Ocean City) ─────────────────────────────
  "eagles-landing": {
    name: "Eagle's Landing Golf Course",
    city: "Berlin, MD",
    par: 72,
    holes: [
      { hole:1,  par:4, hdcp:14, side:"front" },
      { hole:2,  par:4, hdcp:12, side:"front" },
      { hole:3,  par:3, hdcp:16, side:"front" },
      { hole:4,  par:5, hdcp:6,  side:"front" },
      { hole:5,  par:4, hdcp:2,  side:"front" },
      { hole:6,  par:4, hdcp:10, side:"front" },
      { hole:7,  par:5, hdcp:4,  side:"front" },
      { hole:8,  par:3, hdcp:18, side:"front" },
      { hole:9,  par:4, hdcp:8,  side:"front" },
      { hole:10, par:4, hdcp:5,  side:"back" },
      { hole:11, par:3, hdcp:17, side:"back" },
      { hole:12, par:4, hdcp:11, side:"back" },
      { hole:13, par:4, hdcp:3,  side:"back" },
      { hole:14, par:5, hdcp:7,  side:"back" },
      { hole:15, par:4, hdcp:13, side:"back" },
      { hole:16, par:4, hdcp:1,  side:"back" },
      { hole:17, par:3, hdcp:15, side:"back" },
      { hole:18, par:5, hdcp:9,  side:"back" },
    ]
  },

  // ── GLENRIDDLE — War Admiral — Berlin, MD ─────────────────────────────────
  "glenriddle-war-admiral": {
    name: "GlenRiddle — War Admiral",
    city: "Berlin, MD",
    par: 72,
    holes: [
      { hole:1,  par:5, hdcp:1,  side:"front" },
      { hole:2,  par:4, hdcp:11, side:"front" },
      { hole:3,  par:5, hdcp:9,  side:"front" },
      { hole:4,  par:3, hdcp:15, side:"front" },
      { hole:5,  par:4, hdcp:5,  side:"front" },
      { hole:6,  par:4, hdcp:13, side:"front" },
      { hole:7,  par:3, hdcp:17, side:"front" },
      { hole:8,  par:4, hdcp:7,  side:"front" },
      { hole:9,  par:4, hdcp:3,  side:"front" },
      { hole:10, par:3, hdcp:10, side:"back" },
      { hole:11, par:4, hdcp:16, side:"back" },
      { hole:12, par:5, hdcp:8,  side:"back" },
      { hole:13, par:4, hdcp:4,  side:"back" },
      { hole:14, par:4, hdcp:14, side:"back" },
      { hole:15, par:4, hdcp:12, side:"back" },
      { hole:16, par:5, hdcp:6,  side:"back" },
      { hole:17, par:3, hdcp:18, side:"back" },
      { hole:18, par:4, hdcp:2,  side:"back" },
    ]
  },

  // ── RUM POINTE SEASIDE GOLF LINKS — Berlin, MD ────────────────────────────
  "rum-pointe": {
    name: "Rum Pointe Seaside Golf Links",
    city: "Berlin, MD",
    par: 72,
    holes: [
      { hole:1,  par:4, hdcp:7,  side:"front" },
      { hole:2,  par:3, hdcp:13, side:"front" },
      { hole:3,  par:5, hdcp:5,  side:"front" },
      { hole:4,  par:4, hdcp:17, side:"front" },
      { hole:5,  par:3, hdcp:15, side:"front" },
      { hole:6,  par:4, hdcp:11, side:"front" },
      { hole:7,  par:4, hdcp:1,  side:"front" },
      { hole:8,  par:5, hdcp:3,  side:"front" },
      { hole:9,  par:4, hdcp:9,  side:"front" },
      { hole:10, par:5, hdcp:4,  side:"back" },
      { hole:11, par:4, hdcp:18, side:"back" },
      { hole:12, par:4, hdcp:14, side:"back" },
      { hole:13, par:5, hdcp:10, side:"back" },
      { hole:14, par:3, hdcp:6,  side:"back" },
      { hole:15, par:4, hdcp:12, side:"back" },
      { hole:16, par:4, hdcp:2,  side:"back" },
      { hole:17, par:3, hdcp:16, side:"back" },
      { hole:18, par:4, hdcp:8,  side:"back" },
    ]
  },

  // ── OCEAN CITY GOLF CLUB — Seaside — Berlin, MD ───────────────────────────
  // Note: Hole-by-hole hdcp not publicly available — using estimated values
  // Please verify against physical scorecard and update as needed
  "oc-golf-seaside": {
    name: "Ocean City Golf Club — Seaside",
    city: "Berlin, MD",
    par: 72,
    note: "⚠️ Hdcp estimated — verify with scorecard",
    holes: [
      { hole:1,  par:4, hdcp:9,  side:"front" },
      { hole:2,  par:4, hdcp:1,  side:"front" },
      { hole:3,  par:3, hdcp:17, side:"front" },
      { hole:4,  par:5, hdcp:5,  side:"front" },
      { hole:5,  par:4, hdcp:13, side:"front" },
      { hole:6,  par:4, hdcp:3,  side:"front" },
      { hole:7,  par:3, hdcp:15, side:"front" },
      { hole:8,  par:5, hdcp:7,  side:"front" },
      { hole:9,  par:4, hdcp:11, side:"front" },
      { hole:10, par:4, hdcp:4,  side:"back" },
      { hole:11, par:4, hdcp:16, side:"back" },
      { hole:12, par:3, hdcp:12, side:"back" },
      { hole:13, par:5, hdcp:2,  side:"back" },
      { hole:14, par:4, hdcp:10, side:"back" },
      { hole:15, par:4, hdcp:6,  side:"back" },
      { hole:16, par:3, hdcp:18, side:"back" },
      { hole:17, par:5, hdcp:8,  side:"back" },
      { hole:18, par:4, hdcp:14, side:"back" },
    ]
  },
};

// ── STROKE CALCULATOR ─────────────────────────────────────────────────────────
// totalStrokes = strokes given to opponent (positive number)
// Returns array of hole numbers where opponent gets a stroke
export function getStrokeHoles(courseId, totalStrokes) {
  const course = COURSES[courseId];
  if (!course || totalStrokes === 0) return [];

  const strokesPerSide = Math.floor(totalStrokes / 2);
  const extraStroke    = totalStrokes % 2; // front gets extra if odd

  const frontHoles = course.holes.filter(h => h.side === "front");
  const backHoles  = course.holes.filter(h => h.side === "back");

  // Sort by hdcp ascending = hardest holes first
  const frontSorted = [...frontHoles].sort((a,b) => a.hdcp - b.hdcp);
  const backSorted  = [...backHoles].sort((a,b)  => a.hdcp - b.hdcp);

  const strokeHoles = [];

  // Front — extra stroke goes here if odd total
  const frontCount = strokesPerSide + extraStroke;
  for (let i = 0; i < Math.min(frontCount, frontSorted.length); i++) {
    strokeHoles.push(frontSorted[i].hole);
  }

  // Back
  for (let i = 0; i < Math.min(strokesPerSide, backSorted.length); i++) {
    strokeHoles.push(backSorted[i].hole);
  }

  return strokeHoles;
}

// ── BET CALCULATORS ───────────────────────────────────────────────────────────

export function calcMatchPlay(scores, holeData, myStrokeHoles, oppStrokeHoles, betPerHole) {
  let total = 0;
  let holesPlayed = 0;
  const holes = [];

  for (const h of holeData) {
    const myScore  = scores.me[h.hole];
    const oppScore = scores.opp[h.hole];
    if (myScore === undefined || oppScore === undefined) continue;

    holesPlayed++;
    const myNet  = myStrokeHoles.includes(h.hole)  ? myScore  - 1 : myScore;
    const oppNet = oppStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;

    let outcome = "halved";
    let delta   = 0;
    if (myNet < oppNet)       { outcome = "won";  delta =  betPerHole; }
    else if (myNet > oppNet)  { outcome = "lost"; delta = -betPerHole; }

    total += delta;
    holes.push({ hole:h.hole, myScore, oppScore, myNet, oppNet, outcome, delta });
  }

  return { total, holesPlayed, holes };
}

export function calcNassau(scores, holeData, myStrokeHoles, oppStrokeHoles, betAmount) {
  function calcSide(holes) {
    let myTotal = 0, oppTotal = 0, complete = true;
    for (const h of holes) {
      const myScore  = scores.me[h.hole];
      const oppScore = scores.opp[h.hole];
      if (myScore === undefined || oppScore === undefined) { complete = false; continue; }
      myTotal  += myStrokeHoles.includes(h.hole)  ? myScore  - 1 : myScore;
      oppTotal += oppStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;
    }
    if (!complete && myTotal === 0) return { result:"incomplete", amount:0 };
    if (myTotal < oppTotal)  return { result:"won",  amount: betAmount };
    if (myTotal > oppTotal)  return { result:"lost", amount:-betAmount };
    return { result:"tied", amount:0 };
  }

  const front = calcSide(holeData.filter(h => h.side === "front"));
  const back  = calcSide(holeData.filter(h => h.side === "back"));
  const total = calcSide(holeData);

  return { front, back, total, net: front.amount + back.amount + total.amount };
}

export function calcSkins(scores, holeData, myStrokeHoles, oppStrokeHoles, betPerSkin) {
  let me = 0, opp = 0, net = 0, carry = 0;
  const holes = [];

  for (const h of holeData) {
    const myScore  = scores.me[h.hole];
    const oppScore = scores.opp[h.hole];
    if (myScore === undefined || oppScore === undefined) continue;

    const myNet  = myStrokeHoles.includes(h.hole)  ? myScore  - 1 : myScore;
    const oppNet = oppStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;
    const pot    = betPerSkin + carry;

    if (myNet < oppNet)      { me++;  net += pot;  holes.push({hole:h.hole, winner:"me",  pot}); carry = 0; }
    else if (myNet > oppNet) { opp++; net -= pot;  holes.push({hole:h.hole, winner:"opp", pot}); carry = 0; }
    else                     {        carry += betPerSkin; holes.push({hole:h.hole, winner:"carry", pot:carry}); }
  }

  return { me, opp, net, carries:carry, holes };
}
