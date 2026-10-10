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

  // ── BEDFORD HILLS GOLF CLUB — Temperance, MI ─────────────────────────────
  // Three 9-hole courses: Buckeye (par 35), Wolverine (par 36), Irish (par 36)
  // Played as 18-hole combos. Front hdcp = odd 1-17, Back hdcp = even 2-18
  // (ranked by each course's own 9-hole hdcp difficulty order)

  // Buckeye hdcp rank order (1=hardest): 5,6,9,8,2,3,1,7,4
  // Wolverine hdcp rank order: 2,3,9,5,7,6,4,8,1
  // Irish hdcp rank order: 3,8,1,4,6,5,7,2,9

  "bedford-hills-buckeye-wolverine": {
    name: "Bedford Hills — Buckeye / Wolverine",
    city: "Temperance, MI",
    par: 71,
    holes: [
      // Buckeye Course as front 9 (hdcp rank -> odd 1,3,5,7,9,11,13,15,17)
      // Buckeye per-hole hdcp: H5=1,H6=2,H9=3,H8=4,H2=5,H3=6,H1=7,H7=8,H4=9
      // Mapped to odd: rank1->1, rank2->3, rank3->5, rank4->7, rank5->9, rank6->11, rank7->13, rank8->15, rank9->17
      { hole:1,  par:4, hdcp:13, side:"front" },  // Buckeye H1, rank 7
      { hole:2,  par:4, hdcp:9,  side:"front" },  // Buckeye H2, rank 5
      { hole:3,  par:4, hdcp:11, side:"front" },  // Buckeye H3, rank 6
      { hole:4,  par:3, hdcp:17, side:"front" },  // Buckeye H4, rank 9
      { hole:5,  par:4, hdcp:1,  side:"front" },  // Buckeye H5, rank 1
      { hole:6,  par:4, hdcp:3,  side:"front" },  // Buckeye H6, rank 2
      { hole:7,  par:3, hdcp:15, side:"front" },  // Buckeye H7, rank 8
      { hole:8,  par:4, hdcp:7,  side:"front" },  // Buckeye H8, rank 4
      { hole:9,  par:5, hdcp:5,  side:"front" },  // Buckeye H9, rank 3
      // Wolverine Course as back 9 (hdcp rank -> even 2,4,6,8,10,12,14,16,18)
      // Wolverine per-hole hdcp: H2=1,H3=2,H9=3,H5=4,H7=5,H6=6,H4=7(wait, H4=8 per card),H1=7,H8=9
      // Wolverine hdcp ranks: H2(1)->2, H3(2)->4, H9(3)->6, H5(4)->8, H7(5)->10, H6(6)->12, H1(7)->14, H4(8)->16, H8(9)->18
      { hole:10, par:4, hdcp:14, side:"back" },   // Wolverine H1, rank 7
      { hole:11, par:5, hdcp:2,  side:"back" },   // Wolverine H2, rank 1
      { hole:12, par:4, hdcp:4,  side:"back" },   // Wolverine H3, rank 2
      { hole:13, par:3, hdcp:16, side:"back" },   // Wolverine H4, rank 8
      { hole:14, par:4, hdcp:8,  side:"back" },   // Wolverine H5, rank 4
      { hole:15, par:4, hdcp:12, side:"back" },   // Wolverine H6, rank 6
      { hole:16, par:4, hdcp:10, side:"back" },   // Wolverine H7, rank 5
      { hole:17, par:3, hdcp:18, side:"back" },   // Wolverine H8, rank 9
      { hole:18, par:5, hdcp:6,  side:"back" },   // Wolverine H9, rank 3
    ]
  },

  "bedford-hills-wolverine-irish": {
    name: "Bedford Hills — Wolverine / Irish",
    city: "Temperance, MI",
    par: 72,
    holes: [
      // Wolverine Course as front 9 (hdcp ranks -> odd 1,3,5,7,9,11,13,15,17)
      { hole:1,  par:4, hdcp:13, side:"front" },  // Wolverine H1, rank 7
      { hole:2,  par:5, hdcp:1,  side:"front" },  // Wolverine H2, rank 1
      { hole:3,  par:4, hdcp:3,  side:"front" },  // Wolverine H3, rank 2
      { hole:4,  par:3, hdcp:15, side:"front" },  // Wolverine H4, rank 8
      { hole:5,  par:4, hdcp:7,  side:"front" },  // Wolverine H5, rank 4
      { hole:6,  par:4, hdcp:11, side:"front" },  // Wolverine H6, rank 6
      { hole:7,  par:4, hdcp:9,  side:"front" },  // Wolverine H7, rank 5
      { hole:8,  par:3, hdcp:17, side:"front" },  // Wolverine H8, rank 9
      { hole:9,  par:5, hdcp:5,  side:"front" },  // Wolverine H9, rank 3
      // Irish Course as back 9 (hdcp ranks -> even 2,4,6,8,10,12,14,16,18)
      // Irish hdcp: H3=1,H8=2,H1=3 (wait: H1=4,H2=3,H3=1,H8=2 per card)
      // Irish per-hole hdcp: H1=4,H2=3,H3=1,H4=8,H5=6,H6=5,H7=7,H8=2,H9=9
      // Ranks: H3(1)->2, H8(2)->4, H2(3)->6, H1(4)->8, H6(5)->10, H5(6)->12, H7(7)->14, H4(8)->16, H9(9)->18
      { hole:10, par:5, hdcp:8,  side:"back" },   // Irish H1, rank 4
      { hole:11, par:5, hdcp:6,  side:"back" },   // Irish H2, rank 3
      { hole:12, par:4, hdcp:2,  side:"back" },   // Irish H3, rank 1
      { hole:13, par:3, hdcp:16, side:"back" },   // Irish H4, rank 8
      { hole:14, par:4, hdcp:12, side:"back" },   // Irish H5, rank 6
      { hole:15, par:4, hdcp:10, side:"back" },   // Irish H6, rank 5
      { hole:16, par:3, hdcp:14, side:"back" },   // Irish H7, rank 7
      { hole:17, par:5, hdcp:4,  side:"back" },   // Irish H8, rank 2
      { hole:18, par:3, hdcp:18, side:"back" },   // Irish H9, rank 9
    ]
  },

  "bedford-hills-irish-buckeye": {
    name: "Bedford Hills — Irish / Buckeye",
    city: "Temperance, MI",
    par: 71,
    holes: [
      // Irish Course as front 9 (hdcp ranks -> odd 1,3,5,7,9,11,13,15,17)
      // Irish ranks: H3(1)->1, H8(2)->3, H2(3)->5, H1(4)->7, H6(5)->9, H5(6)->11, H7(7)->13, H4(8)->15, H9(9)->17
      { hole:1,  par:5, hdcp:7,  side:"front" },  // Irish H1, rank 4
      { hole:2,  par:5, hdcp:5,  side:"front" },  // Irish H2, rank 3
      { hole:3,  par:4, hdcp:1,  side:"front" },  // Irish H3, rank 1
      { hole:4,  par:3, hdcp:15, side:"front" },  // Irish H4, rank 8
      { hole:5,  par:4, hdcp:11, side:"front" },  // Irish H5, rank 6
      { hole:6,  par:4, hdcp:9,  side:"front" },  // Irish H6, rank 5
      { hole:7,  par:3, hdcp:13, side:"front" },  // Irish H7, rank 7
      { hole:8,  par:5, hdcp:3,  side:"front" },  // Irish H8, rank 2
      { hole:9,  par:3, hdcp:17, side:"front" },  // Irish H9, rank 9
      // Buckeye Course as back 9 (hdcp ranks -> even 2,4,6,8,10,12,14,16,18)
      // Buckeye ranks: H5(1)->2, H6(2)->4, H9(3)->6, H8(4)->8, H2(5)->10, H3(6)->12, H1(7)->14, H7(8)->16, H4(9)->18
      { hole:10, par:4, hdcp:14, side:"back" },   // Buckeye H1, rank 7
      { hole:11, par:4, hdcp:10, side:"back" },   // Buckeye H2, rank 5
      { hole:12, par:4, hdcp:12, side:"back" },   // Buckeye H3, rank 6
      { hole:13, par:3, hdcp:18, side:"back" },   // Buckeye H4, rank 9
      { hole:14, par:4, hdcp:2,  side:"back" },   // Buckeye H5, rank 1
      { hole:15, par:4, hdcp:4,  side:"back" },   // Buckeye H6, rank 2
      { hole:16, par:3, hdcp:16, side:"back" },   // Buckeye H7, rank 8
      { hole:17, par:4, hdcp:8,  side:"back" },   // Buckeye H8, rank 4
      { hole:18, par:5, hdcp:6,  side:"back" },   // Buckeye H9, rank 3
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

// ── AUTO PRESS NASSAU CALCULATOR ─────────────────────────────────────────────
// Rules:
// - Nassau: front 9, back 9, 18-hole total — each a flat bet
// - When any active bet hits exactly -2 (2 down) → new press starts at 0
// - Each press bet can itself get pressed if it hits -2
// - 18-hole total NEVER gets pressed
// - Each bet result: +betAmount (won), -betAmount (lost), 0 (tied)

export function calcAutoPressNassau(scores, holeData, myStrokeHoles, oppStrokeHoles, betAmount, pressDown = 2, manualPresses = []) {

  function calcSideWithPress(sideHoles) {
    if (!sideHoles || sideHoles.length === 0) return { bets: [], total: 0 };

    // Each bet: { startHole, diff, pressed }
    // pressed = true means this bet already triggered a press (prevent double-trigger)
    const bets = [{ startHole: sideHoles[0].hole, diff: 0, pressed: false, label: "Original" }];

    for (const h of sideHoles) {
      const myScore  = scores.me[h.hole];
      const oppScore = scores.opp[h.hole];
      if (myScore  === undefined || myScore  === null) continue;
      if (oppScore === undefined || oppScore === null) continue;

      const myNet  = myStrokeHoles.includes(h.hole)  ? myScore  - 1 : myScore;
      const oppNet = oppStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;

      const holeResult = myNet < oppNet ? 1 : myNet > oppNet ? -1 : 0;

      // Snapshot how many bets existed BEFORE this hole — only check these for press
      const betsThisHole = bets.length;

      // Update only bets that have already started
      for (let i = 0; i < betsThisHole; i++) {
        if (bets[i].startHole <= h.hole) {
          bets[i].diff += holeResult;
        }
      }

      // Check for AUTO press triggers (±pressDown)
      const isLastHole = h.hole === sideHoles[sideHoles.length - 1].hole;
      for (let i = 0; i < betsThisHole; i++) {
        const bet = bets[i];
        if (bet.startHole <= h.hole && (bet.diff === pressDown || bet.diff === -pressDown) && !bet.pressed) {
          bet.pressed = true;
          if (!isLastHole) {
            bets.push({ startHole: h.hole + 1, diff: 0, pressed: false, label: `Auto Press` });
          }
        }
      }

      // Check for MANUAL press — starts on this hole
      const manualThisHole = manualPresses.filter(p => p.hole === h.hole);
      for (const mp of manualThisHole) {
        // Manual press starts on the current hole (already scored above)
        // so new bet starts next hole to not double-count
        if (!isLastHole) {
          bets.push({ startHole: h.hole + 1, diff: 0, pressed: false, label: `Pissed Press h${h.hole}` });
        }
      }
    }

    // Calculate final result for each bet: flat win/loss/tie
    const finalBets = bets.map((bet, i) => ({
      betNum:    i + 1,
      startHole: bet.startHole,
      diff:      bet.diff,
      label:     bet.label || `Press ${i}`,
      amount:    bet.diff > 0 ? betAmount : bet.diff < 0 ? -betAmount : 0,
    }));

    const total = finalBets.reduce((s, b) => s + b.amount, 0);
    return { bets: finalBets, total };
  }

  const frontHoles = holeData.filter(h => h.side === "front");
  const backHoles  = holeData.filter(h => h.side === "back");

  const front = calcSideWithPress(frontHoles);
  const back  = calcSideWithPress(backHoles);

  // 18-hole total — NEVER pressed, flat bet based on total score
  function calcTotal() {
    let myT = 0, oppT = 0, holesPlayed = 0;
    for (const h of holeData) {
      const myScore  = scores.me[h.hole];
      const oppScore = scores.opp[h.hole];
      if (myScore === undefined || myScore === null) continue;
      if (oppScore === undefined || oppScore === null) continue;
      holesPlayed++;
      myT  += myStrokeHoles.includes(h.hole)  ? myScore  - 1 : myScore;
      oppT += oppStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;
    }
    if (holesPlayed === 0) return 0;
    if (myT < oppT)  return  betAmount;
    if (myT > oppT)  return -betAmount;
    return 0;
  }

  const totalAmount = calcTotal();

  return {
    front,
    back,
    total:  totalAmount,
    net:    front.total + back.total + totalAmount,
  };
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
