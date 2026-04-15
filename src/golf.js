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
