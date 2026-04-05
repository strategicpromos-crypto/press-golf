import { useState, useEffect } from "react";
import { sb } from "./supabase.js";
import { COURSES, getStrokeHoles, calcMatchPlay, calcNassau, calcSkins } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const inp = {
  width:"100%", padding:"12px", background:C.surface,
  border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
  fontSize:20, outline:"none", boxSizing:"border-box",
  WebkitAppearance:"none", textAlign:"center", fontWeight:700,
};

function BigBtn({ children, onClick, color=C.green, textColor="#0a1a0f", style={}, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"16px",background:disabled?"#333":color,color:disabled?C.muted:textColor,border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1,...style}}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, color=C.green, style={} }) {
  return (
    <button onClick={onClick} style={{width:"100%",padding:"14px",background:"transparent",color,border:`1.5px solid ${color}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",...style}}>
      {children}
    </button>
  );
}

function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:400}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,borderBottom:"none",padding:"0 0 44px",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}><div style={{width:40,height:4,background:C.dim,borderRadius:2}}/></div>
        {title && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 16px"}}><div style={{fontWeight:700,fontSize:20,color:C.text}}>{title}</div><button onClick={onClose} style={{background:C.dim,border:"none",color:C.muted,width:32,height:32,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button></div>}
        <div style={{padding:"0 20px"}}>{children}</div>
      </div>
    </div>
  );
}

// ── MAIN LIVE ROUND TRACKER ───────────────────────────────────────────────────
export default function LiveRound({ user, players, onBack, onPostToLedger }) {
  const [step, setStep] = useState("setup"); // setup | playing | summary
  const [courseId, setCourseId] = useState("south-toledo");
  const [opponents, setOpponents] = useState([]); // [{playerId, name, strokes, betType, betAmount, linkedUserId}]
  const [scores, setScores] = useState({}); // {playerId: {hole: score}, me: {hole: score}}
  const [currentHole, setCurrentHole] = useState(1);
  const [sheet, setSheet] = useState(null);
  const [addOppId, setAddOppId] = useState("");
  const [addStrokes, setAddStrokes] = useState(0);
  const [addStrokesDir, setAddStrokesDir] = useState("igive"); // igive or iget
  const [addBetType, setAddBetType] = useState("match");
  const [addBetAmt, setAddBetAmt] = useState("5");
  const [posting, setPosting] = useState(false);

  const course = COURSES[courseId];
  const holeData = course.holes[currentHole - 1];
  const totalHoles = course.holes.length;

  // Get stroke holes per opponent
  function getOppStrokeHoles(opp) {
    // strokes: positive = I give them strokes, negative = I get strokes
    const absStrokes = Math.abs(opp.strokes);
    return getStrokeHoles(courseId, absStrokes);
  }

  // Check if opponent gets stroke on current hole
  function oppGetsStroke(opp) {
    if (opp.strokes === 0) return false;
    const strokeHoles = getOppStrokeHoles(opp);
    return strokeHoles.includes(currentHole);
  }

  // I get stroke on this hole (opponent gives me strokes)
  function iGetStroke(opp) {
    if (opp.strokes >= 0) return false;
    const strokeHoles = getStrokeHoles(courseId, Math.abs(opp.strokes));
    return strokeHoles.includes(currentHole);
  }

  function setScore(playerId, hole, score) {
    setScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [hole]: score }
    }));
  }

  function getScore(playerId, hole) {
    return scores[playerId]?.[hole];
  }

  function addOpponent() {
    const player = players.find(p => p.id === addOppId);
    if (!player) return;
    if (opponents.find(o => o.playerId === addOppId)) return;
    const rawStrokes = parseInt(addStrokes) || 0;
    const finalStrokes = addStrokesDir === "igive" ? rawStrokes : -rawStrokes;
    setOpponents(prev => [...prev, {
      playerId: player.id,
      name: player.name,
      strokes: finalStrokes,
      betType: addBetType,
      betAmount: parseFloat(addBetAmt) || 5,
      linkedUserId: player.linked_user_id,
    }]);
    setAddOppId(""); setAddStrokes(0); setAddBetAmt("5");
    setSheet(null);
  }

  function removeOpponent(id) {
    setOpponents(prev => prev.filter(o => o.playerId !== id));
  }

  // Calculate running tally for an opponent through holes played so far
  function getRunningTally(opp) {
    const scoresObj = {
      me: scores["me"] || {},
      opp: scores[opp.playerId] || {},
    };
    const strokeHoles = getOppStrokeHoles(opp);
    // Flip stroke holes if I'm the one getting strokes
    const effectiveStrokeHoles = opp.strokes < 0 ? [] : strokeHoles;
    const myEffectiveStrokeHoles = opp.strokes < 0 ? strokeHoles : [];
    const holesPlayed = course.holes.filter(h => scoresObj.me[h.hole] !== undefined && scoresObj.opp[h.hole] !== undefined);

    if (opp.betType === "match") {
      let total = 0;
      for (const h of holesPlayed) {
        const myScore = scoresObj.me[h.hole];
        const oppScore = scoresObj.opp[h.hole];
        const oppNet = effectiveStrokeHoles.includes(h.hole) ? oppScore - 1 : oppScore;
        const myNet = myEffectiveStrokeHoles.includes(h.hole) ? myScore - 1 : myScore;
        if (myNet < oppNet) total += opp.betAmount;
        else if (myNet > oppNet) total -= opp.betAmount;
      }
      return { type: "match", total, holesPlayed: holesPlayed.length };
    }

    if (opp.betType === "nassau") {
      const nassau = calcNassau(scoresObj, holesPlayed, effectiveStrokeHoles, opp.betAmount);
      return { type: "nassau", nassau, total: nassau.net };
    }

    if (opp.betType === "skins") {
      const skins = calcSkins(scoresObj, holesPlayed, effectiveStrokeHoles, opp.betAmount);
      return { type: "skins", skins, total: skins.net };
    }

    return { total: 0 };
  }

  // Final results for summary
  function getFinalResults() {
    return opponents.map(opp => {
      const tally = getRunningTally(opp);
      return { ...opp, finalAmount: tally.total };
    });
  }

  async function postToLedger() {
    setPosting(true);
    const results = getFinalResults();
    const today = new Date().toISOString().slice(0, 10);

    for (const result of results) {
      const player = players.find(p => p.id === result.playerId);
      if (!player) continue;

      // Post round to ledger
      const { data: rd } = await sb.from("rounds").insert({
        owner_id: user.id,
        player_id: result.playerId,
        player_name: result.name,
        date: today,
        strokes: result.strokes,
        money: result.finalAmount,
        notes: `Live round at ${course.name} · ${result.betType} $${result.betAmount}`,
        season: new Date().getFullYear(),
      }).select().single();

      // Update player bank
      await sb.from("players").update({
        round_money: (player.round_money || 0) + result.finalAmount,
        bank: (player.bank || 0) + result.finalAmount,
      }).eq("id", result.playerId);

      // Notify linked player
      if (result.linkedUserId) {
        await sb.from("notifications").insert({
          user_id: result.linkedUserId,
          type: "round_logged",
          title: `Round posted — ${course.name}`,
          body: `${result.betType} · ${result.finalAmount >= 0 ? "You owe" : "You collect"} $${Math.abs(result.finalAmount).toFixed(2)}`,
          data: { player_id: result.playerId },
        });
      }
    }

    setPosting(false);
    onPostToLedger();
  }

  // ── SETUP SCREEN ──────────────────────────────────────────────────────────────
  if (step === "setup") return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,padding:"0 0 60px"}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:36}}>⛳</div>
          <div style={{fontSize:24,fontWeight:800,color:C.text,marginBottom:4}}>Start Round</div>
          <div style={{fontSize:14,color:C.green,fontWeight:600}}>{course.name}</div>
          <div style={{fontSize:12,color:C.muted}}>{course.city} · Par {course.par}</div>
        </div>
      </div>

      <div style={{padding:"0 20px"}}>
        {/* Course Picker */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Select Course</div>
          <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={{width:"100%",padding:"14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:15,outline:"none",WebkitAppearance:"none",cursor:"pointer"}}>
            {Object.entries(COURSES).map(([id,c])=>(
              <option key={id} value={id}>{c.name} — {c.city}</option>
            ))}
          </select>
          {COURSES[courseId]?.note && (
            <div style={{fontSize:11,color:C.gold,marginTop:6}}>{COURSES[courseId].note}</div>
          )}
        </div>

        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>
          Your Opponents ({opponents.length})
        </div>

        {opponents.length === 0 && (
          <div style={{textAlign:"center",padding:"24px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:14,color:C.muted,fontSize:13}}>
            Add at least one opponent to start
          </div>
        )}

        {opponents.map(opp => {
          const strokeHoles = getOppStrokeHoles(opp);
          const strokeLabel = opp.strokes === 0 ? "Even" : opp.strokes > 0 ? `You give ${opp.strokes}` : `You get ${Math.abs(opp.strokes)}`;
          return (
            <div key={opp.playerId} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:18,marginBottom:4}}>{opp.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:2}}>
                    {strokeLabel} · {opp.betType === "match" ? `$${opp.betAmount}/hole` : opp.betType === "nassau" ? `Nassau $${opp.betAmount}` : `Skins $${opp.betAmount}`}
                  </div>
                  {opp.strokes !== 0 && (
                    <div style={{fontSize:11,color:C.gold}}>
                      Stroke holes: {strokeHoles.sort((a,b)=>a-b).join(", ")}
                    </div>
                  )}
                </div>
                <button onClick={() => removeOpponent(opp.playerId)} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer",padding:"0 0 0 12px"}}>✕</button>
              </div>
            </div>
          );
        })}

        <button onClick={() => setSheet("addOpp")} style={{width:"100%",padding:"14px",background:"transparent",border:`1.5px dashed ${C.border}`,borderRadius:12,color:C.green,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:20}}>
          + Add Opponent
        </button>

        <BigBtn onClick={() => { if(opponents.length > 0) setStep("playing"); }} disabled={opponents.length === 0}>
          Tee It Up! ⛳
        </BigBtn>
      </div>

      {/* Add Opponent Sheet */}
      <Sheet open={sheet === "addOpp"} onClose={() => setSheet(null)} title="Add Opponent">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Select Player</div>
            <select value={addOppId} onChange={e => setAddOppId(e.target.value)} style={{...inp, textAlign:"left", fontSize:16, padding:"14px"}}>
              <option value="">— Choose opponent —</option>
              {players.filter(p => !opponents.find(o => o.playerId === p.id)).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Strokes</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {["even","igive","iget"].map(d => (
                <button key={d} onClick={() => setAddStrokesDir(d)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addStrokesDir===d?700:500,background:addStrokesDir===d?C.green:C.surface,color:addStrokesDir===d?"#0a1a0f":C.muted,border:`1px solid ${addStrokesDir===d?C.green:C.border}`,cursor:"pointer",borderRadius:8}}>
                  {d === "even" ? "Even" : d === "igive" ? "I Give" : "I Get"}
                </button>
              ))}
            </div>
            {addStrokesDir !== "even" && (
              <input type="number" min="1" max="18" value={addStrokes||""} onChange={e => setAddStrokes(e.target.value)} placeholder="# strokes" style={{...inp, fontSize:20}} inputMode="numeric"/>
            )}
          </div>

          <div>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Bet Type</div>
            <div style={{display:"flex",gap:8}}>
              {[{id:"match",label:"Match Play"},{id:"nassau",label:"Nassau"},{id:"skins",label:"Skins"}].map(bt => (
                <button key={bt.id} onClick={() => setAddBetType(bt.id)} style={{flex:1,padding:"10px 4px",fontSize:11,fontWeight:addBetType===bt.id?700:500,background:addBetType===bt.id?C.green:C.surface,color:addBetType===bt.id?"#0a1a0f":C.muted,border:`1px solid ${addBetType===bt.id?C.green:C.border}`,cursor:"pointer",borderRadius:8}}>
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>
              {addBetType === "match" ? "$ Per Hole" : addBetType === "nassau" ? "$ Per Side/Total" : "$ Per Skin"}
            </div>
            <input type="number" min="1" value={addBetAmt} onChange={e => setAddBetAmt(e.target.value)} placeholder="e.g. 5" style={{...inp, fontSize:20}} inputMode="decimal"/>
          </div>

          <BigBtn onClick={addOpponent} disabled={!addOppId}>Add to Round</BigBtn>
          <GhostBtn onClick={() => setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>
    </div>
  );

  // ── PLAYING SCREEN ────────────────────────────────────────────────────────────
  if (step === "playing") {
    const myScore = getScore("me", currentHole);
    // Only require MY score to advance — opponent scores are optional
    const canAdvance = myScore !== undefined;
    const isLastHole = currentHole === totalHoles;

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={() => currentHole > 1 ? setCurrentHole(h => h-1) : setStep("setup")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹ Back</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:44,fontWeight:800,color:C.text,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            </div>
            <button onClick={() => setStep("summary")} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,fontSize:12,cursor:"pointer",padding:"6px 12px",borderRadius:16}}>Summary</button>
          </div>

          {/* Hole progress bar */}
          <div style={{display:"flex",gap:2,marginBottom:4}}>
            {course.holes.map(h => (
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole < currentHole ? C.green : h.hole === currentHole ? C.gold : C.dim}}/>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dim}}>
            <span>1</span><span>OUT</span><span>IN</span><span>18</span>
          </div>
        </div>

        <div style={{padding:"16px 20px"}}>
          {/* MY score — always shown first and clearly labeled */}
          <div style={{background:C.card,border:`2px solid ${C.green}`,borderRadius:14,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>
              ⛳ Your Score — Hole {currentHole}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button
                onClick={() => {
                  const current = myScore ?? holeData.par;
                  setScore("me", currentHole, Math.max(1, current - 1));
                }}
                style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:32,fontWeight:700,cursor:"pointer",flexShrink:0}}
              >−</button>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:64,fontWeight:800,color:C.text,lineHeight:1}}>
                  {myScore !== undefined ? myScore : "—"}
                </div>
                {myScore !== undefined && (
                  <div style={{fontSize:13,color:myScore < holeData.par ? C.green : myScore > holeData.par ? C.red : C.muted,marginTop:4,fontWeight:600}}>
                    {myScore === holeData.par - 2 ? "Eagle 🦅" :
                     myScore === holeData.par - 1 ? "Birdie 🐦" :
                     myScore === holeData.par     ? "Par ✓" :
                     myScore === holeData.par + 1 ? "Bogey" :
                     myScore === holeData.par + 2 ? "Double 😬" :
                     `+${myScore - holeData.par}`}
                  </div>
                )}
                {myScore === undefined && (
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>Tap + to enter score</div>
                )}
              </div>
              <button
                onClick={() => {
                  const current = myScore ?? holeData.par - 1;
                  setScore("me", currentHole, current + 1);
                }}
                style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:32,fontWeight:700,cursor:"pointer",flexShrink:0}}
              >+</button>
            </div>
          </div>

          {/* Opponent scores — optional, clearly labeled */}
          {opponents.map(opp => {
            const oppScore  = getScore(opp.playerId, currentHole);
            const getsStroke = oppGetsStroke(opp);
            const givesStroke = iGetStroke(opp);
            const tally = getRunningTally(opp);

            return (
              <div key={opp.playerId} style={{background:C.card,border:`1px solid ${getsStroke||givesStroke?"rgba(232,184,75,0.5)":C.border}`,borderRadius:14,padding:"14px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:16}}>{opp.name}</span>
                    {getsStroke  && <span style={{fontSize:11,color:C.gold, marginLeft:8,background:"rgba(232,184,75,0.12)",padding:"2px 8px",borderRadius:8}}>⭐ Gets stroke</span>}
                    {givesStroke && <span style={{fontSize:11,color:C.green,marginLeft:8,background:"rgba(123,180,80,0.12)",padding:"2px 8px",borderRadius:8}}>⭐ You get stroke</span>}
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>optional — enter if in same group</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:tally.total >= 0 ? C.green : C.red}}>
                      {tally.total >= 0 ? "+" : ""}${tally.total.toFixed(2)}
                    </div>
                    <div style={{fontSize:10,color:C.muted}}>thru {tally.holesPlayed||0}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <button
                    onClick={() => {
                      const current = oppScore ?? holeData.par;
                      setScore(opp.playerId, currentHole, Math.max(1, current - 1));
                    }}
                    style={{width:48,height:48,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:24,fontWeight:700,cursor:"pointer",flexShrink:0}}
                  >−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:44,fontWeight:800,color:oppScore !== undefined ? C.text : C.dim,lineHeight:1}}>
                      {oppScore !== undefined ? oppScore : "—"}
                    </div>
                    {oppScore !== undefined && getsStroke  && <div style={{fontSize:11,color:C.gold, marginTop:2}}>Net: {oppScore - 1}</div>}
                    {oppScore !== undefined && givesStroke && <div style={{fontSize:11,color:C.green,marginTop:2}}>Your net: {(myScore||0) - 1}</div>}
                    {oppScore === undefined && <div style={{fontSize:11,color:C.dim,marginTop:2}}>not entered</div>}
                  </div>
                  <button
                    onClick={() => {
                      const current = oppScore ?? holeData.par - 1;
                      setScore(opp.playerId, currentHole, current + 1);
                    }}
                    style={{width:48,height:48,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:24,fontWeight:700,cursor:"pointer",flexShrink:0}}
                  >+</button>
                </div>
              </div>
            );
          })}

          {/* Next hole — only requires MY score */}
          <BigBtn
            onClick={() => {
              if (isLastHole) setStep("summary");
              else setCurrentHole(h => h + 1);
            }}
            disabled={!canAdvance}
            color={isLastHole ? C.gold : C.green}
            textColor="#0a1a0f"
            style={{marginTop:8}}
          >
            {!canAdvance
              ? "Enter your score first"
              : isLastHole
              ? "Finish Round 🏆"
              : `Next → Hole ${currentHole + 1}`}
          </BigBtn>

          {/* Skip hint */}
          {canAdvance && opponents.some(o => getScore(o.playerId, currentHole) === undefined) && (
            <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:8}}>
              Opponent scores are optional — you can enter them later
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SUMMARY SCREEN ────────────────────────────────────────────────────────────
  if (step === "summary") {
    const results = getFinalResults();
    const totalWinLoss = results.reduce((s, r) => s + r.finalAmount, 0);

    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,padding:"0 0 60px"}}>
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 20px"}}>
          <button onClick={() => setStep("playing")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back to Round</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:6}}>🏆</div>
            <div style={{fontSize:24,fontWeight:800}}>Round Complete</div>
            <div style={{fontSize:13,color:C.muted}}>{course.name}</div>
          </div>
        </div>

        <div style={{padding:"0 20px"}}>
          {/* Total */}
          <div style={{background:C.card,border:`2px solid ${totalWinLoss >= 0 ? C.green : C.red}`,borderRadius:16,padding:"20px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Overall Result</div>
            <div style={{fontSize:48,fontWeight:800,color:totalWinLoss >= 0 ? C.green : C.red,letterSpacing:-2}}>
              {totalWinLoss >= 0 ? "+" : "−"}${Math.abs(totalWinLoss).toFixed(2)}
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{totalWinLoss >= 0 ? "You collect" : "You owe"}</div>
          </div>

          {/* Per opponent breakdown */}
          {results.map(result => {
            const holesPlayed = course.holes.filter(h => scores["me"]?.[h.hole] !== undefined);
            const myTotal = holesPlayed.reduce((s,h) => s + (scores["me"]?.[h.hole]||0), 0);
            const oppTotal = holesPlayed.reduce((s,h) => s + (scores[result.playerId]?.[h.hole]||0), 0);

            return (
              <div key={result.playerId} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:18}}>{result.name}</div>
                  <div style={{fontSize:22,fontWeight:800,color:result.finalAmount >= 0 ? C.green : C.red}}>
                    {result.finalAmount >= 0 ? "+" : "−"}${Math.abs(result.finalAmount).toFixed(2)}
                  </div>
                </div>
                <div style={{display:"flex",gap:12,fontSize:12,color:C.muted,marginBottom:8}}>
                  <span>Bet: {result.betType === "match" ? `$${result.betAmount}/hole` : result.betType === "nassau" ? `Nassau $${result.betAmount}` : `Skins $${result.betAmount}`}</span>
                  <span>Strokes: {result.strokes === 0 ? "Even" : result.strokes > 0 ? `You gave ${result.strokes}` : `You got ${Math.abs(result.strokes)}`}</span>
                </div>
                <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                  <div style={{flex:1,textAlign:"center",padding:"8px",background:"rgba(0,0,0,0.2)"}}>
                    <div style={{fontSize:18,fontWeight:700,color:C.green}}>{myTotal}</div>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>You</div>
                  </div>
                  <div style={{flex:1,textAlign:"center",padding:"8px",borderLeft:`1px solid ${C.border}`}}>
                    <div style={{fontSize:18,fontWeight:700,color:C.muted}}>{oppTotal}</div>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>{result.name}</div>
                  </div>
                </div>

                {/* Hole by hole for match play */}
                {result.betType === "match" && (
                  <div style={{marginTop:10,display:"flex",gap:4,flexWrap:"wrap"}}>
                    {course.holes.map(h => {
                      const myS = scores["me"]?.[h.hole];
                      const oppS = scores[result.playerId]?.[h.hole];
                      if (!myS || !oppS) return null;
                      const strokeHoles = getOppStrokeHoles(result);
                      const iGetStrokeHoles = result.strokes < 0 ? strokeHoles : [];
                      const oppGetsStrokeHoles = result.strokes > 0 ? strokeHoles : [];
                      const myNet = iGetStrokeHoles.includes(h.hole) ? myS - 1 : myS;
                      const oppNet = oppGetsStrokeHoles.includes(h.hole) ? oppS - 1 : oppS;
                      const won = myNet < oppNet;
                      const lost = myNet > oppNet;
                      return (
                        <div key={h.hole} style={{width:28,height:28,borderRadius:6,background:won?C.green:lost?C.red:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:won||lost?"#fff":C.muted}}>
                          {h.hole}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Scorecard summary */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",marginBottom:20,overflowX:"auto"}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Full Scorecard</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{color:C.muted}}>
                  <th style={{textAlign:"left",padding:"4px 6px"}}>Hole</th>
                  <th style={{padding:"4px 6px"}}>Par</th>
                  <th style={{padding:"4px 6px",color:C.green}}>You</th>
                  {opponents.map(opp => <th key={opp.playerId} style={{padding:"4px 6px",color:C.gold}}>{opp.name.split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {["front","back"].map(side => (
                  <>
                    {course.holes.filter(h => h.side === side).map(h => {
                      const myS = scores["me"]?.[h.hole];
                      return (
                        <tr key={h.hole} style={{borderTop:`1px solid ${C.dim}`}}>
                          <td style={{padding:"4px 6px",color:C.muted,fontSize:11}}>{h.hole}</td>
                          <td style={{padding:"4px 6px",textAlign:"center",color:C.muted}}>{h.par}</td>
                          <td style={{padding:"4px 6px",textAlign:"center",color:myS?myS<h.par?C.green:myS>h.par?C.red:C.text:C.dim,fontWeight:700}}>
                            {myS ?? "—"}
                          </td>
                          {opponents.map(opp => {
                            const oppS = scores[opp.playerId]?.[h.hole];
                            const sh = getOppStrokeHoles(opp).includes(h.hole);
                            return <td key={opp.playerId} style={{padding:"4px 6px",textAlign:"center",color:C.text,fontWeight:600}}>
                              {oppS ?? "—"}{sh ? "⭐" : ""}
                            </td>;
                          })}
                        </tr>
                      );
                    })}
                    <tr style={{borderTop:`2px solid ${C.border}`,background:"rgba(0,0,0,0.2)"}}>
                      <td style={{padding:"6px",color:C.green,fontWeight:700,fontSize:11}}>{side === "front" ? "OUT" : "IN"}</td>
                      <td style={{padding:"6px",textAlign:"center",color:C.muted,fontWeight:700}}>{course.holes.filter(h=>h.side===side).reduce((s,h)=>s+h.par,0)}</td>
                      <td style={{padding:"6px",textAlign:"center",color:C.green,fontWeight:700}}>
                        {course.holes.filter(h=>h.side===side).reduce((s,h)=>s+(scores["me"]?.[h.hole]||0),0)||"—"}
                      </td>
                      {opponents.map(opp => (
                        <td key={opp.playerId} style={{padding:"6px",textAlign:"center",color:C.gold,fontWeight:700}}>
                          {course.holes.filter(h=>h.side===side).reduce((s,h)=>s+(scores[opp.playerId]?.[h.hole]||0),0)||"—"}
                        </td>
                      ))}
                    </tr>
                  </>
                ))}
                <tr style={{borderTop:`2px solid ${C.green}`,background:"rgba(123,180,80,0.05)"}}>
                  <td style={{padding:"6px",color:C.green,fontWeight:800,fontSize:12}}>TOT</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.muted,fontWeight:700}}>{course.par}</td>
                  <td style={{padding:"6px",textAlign:"center",color:C.green,fontWeight:800}}>
                    {Object.values(scores["me"]||{}).reduce((s,v)=>s+v,0)||"—"}
                  </td>
                  {opponents.map(opp => (
                    <td key={opp.playerId} style={{padding:"6px",textAlign:"center",color:C.gold,fontWeight:800}}>
                      {Object.values(scores[opp.playerId]||{}).reduce((s,v)=>s+v,0)||"—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <BigBtn onClick={postToLedger} disabled={posting} color={C.gold} textColor="#0a1a0f">
            {posting ? "Posting..." : "✅ Post Results to Ledger"}
          </BigBtn>
          <GhostBtn onClick={() => setStep("playing")} style={{marginTop:10}}>Back to Round</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}
