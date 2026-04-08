import React, { useState, useEffect } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";

// ── Colors (match Press app) ──────────────────────────────────────────────────
const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

// ── Team colors for leaderboard ───────────────────────────────────────────────
const TEAM_COLORS = [
  "#e8b84b","#7bb450","#5b9bd5","#e05050",
  "#b07dd5","#50c8c8","#e88a3a","#c8c850",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeInt(v, f=0) { const n=parseInt(v,10); return isNaN(n)?f:n; }

function BigBtn({children, onClick, color=C.green, disabled=false, style={}}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%", padding:"18px", background:disabled?"#222":color,
      color:disabled?C.muted:"#0a1a0f", border:"none", borderRadius:14,
      fontSize:17, fontWeight:800, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.5:1, fontFamily:"Georgia,serif", ...style
    }}>{children}</button>
  );
}

function GhostBtn({children, onClick, color=C.green}) {
  return (
    <button onClick={onClick} style={{
      width:"100%", padding:"14px", background:"transparent",
      color, border:`1.5px solid ${color}`, borderRadius:12,
      fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Georgia,serif"
    }}>{children}</button>
  );
}

// ── 2 Best Ball calculation ───────────────────────────────────────────────────
function calcTwoBestBall(teamScores, holeData) {
  // teamScores: { p1: {1:4, 2:5,...}, p2: {...}, p3: {...}, p4: {...} }
  // Returns { front, back, total, byHole: {hole: score} }
  const result = { front:0, back:0, total:0, byHole:{} };

  for (const h of holeData) {
    const scores = Object.values(teamScores)
      .map(ps => safeInt(ps?.[h.hole], null))
      .filter(s => s !== null)
      .sort((a,b) => a-b);

    if (scores.length < 1) { result.byHole[h.hole] = null; continue; }

    // Take 2 best (lowest); if only 1 score entered use it
    const best2 = scores.slice(0, 2);
    const holeTotal = best2.reduce((s,v) => s+v, 0);
    result.byHole[h.hole] = holeTotal;

    if (h.side === "front") result.front += holeTotal;
    else result.back += holeTotal;
    result.total += holeTotal;
  }

  return result;
}

// ── Score pill ────────────────────────────────────────────────────────────────
function ScorePill({score, par}) {
  if (score === null) return <span style={{color:C.dim}}>—</span>;
  const diff = score - (par*2); // vs 2x par (since it's 2 best ball)
  const color = diff < 0 ? C.green : diff > 0 ? C.red : C.muted;
  return <span style={{fontWeight:700, color}}>{score}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function TeamTournament({ user, onBack }) {
  const [screen,      setScreen]      = useState("home");      // home | setup | scoring | leaderboard
  const [courseId,    setCourseId]    = useState("south-toledo");
  const [teams,       setTeams]       = useState([]);           // [{id, name, color, players:[str,str,str,str], scores:{p0:{},p1:{}...}}]
  const [activeTeam,  setActiveTeam]  = useState(null);        // index of team being scored
  const [currentHole, setCurrentHole] = useState(1);
  const [tourneyId,   setTourneyId]   = useState(null);
  const [saving,      setSaving]      = useState(false);

  // Setup state
  const [numTeams,    setNumTeams]    = useState(8);
  const [teamNames,   setTeamNames]   = useState(Array(8).fill("").map((_,i)=>`Team ${i+1}`));
  const [playerNames, setPlayerNames] = useState(Array(8).fill(null).map(()=>["","","",""]));

  const course = COURSES[courseId];

  // ── Start tournament ───────────────────────────────────────────────────────
  function startTournament() {
    const built = teamNames.slice(0,numTeams).map((name,i) => ({
      id: i,
      name: name || `Team ${i+1}`,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      players: playerNames[i].map((p,j) => p || `Player ${j+1}`),
      scores: { 0:{}, 1:{}, 2:{}, 3:{} },
    }));
    setTeams(built);
    setScreen("scoring");
    setActiveTeam(0);
    setCurrentHole(1);
  }

  // ── Update a player score ──────────────────────────────────────────────────
  function setScore(teamIdx, playerIdx, hole, val) {
    setTeams(prev => prev.map((t,i) => {
      if (i !== teamIdx) return t;
      return {
        ...t,
        scores: {
          ...t.scores,
          [playerIdx]: { ...t.scores[playerIdx], [hole]: val }
        }
      };
    }));
  }

  // ── Get score ─────────────────────────────────────────────────────────────
  function getScore(team, playerIdx, hole) {
    const v = team.scores?.[playerIdx]?.[hole];
    return (v === undefined || v === null) ? null : safeInt(v);
  }

  // ── Leaderboard data ──────────────────────────────────────────────────────
  function getLeaderboard() {
    return teams.map(team => {
      const bb = calcTwoBestBall(team.scores, course.holes);
      return { ...team, bb };
    }).sort((a,b) => a.bb.total - b.bb.total);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HOME SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "home") {
    return (
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 24px 30px"}}>
          <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:24}}>‹ Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48}}>🏆</div>
            <div style={{fontSize:28,fontWeight:800,marginTop:8}}>Team Tournament</div>
            <div style={{fontSize:14,color:C.muted,marginTop:6}}>2 Best Ball · Front / Back / Total</div>
          </div>
        </div>

        <div style={{padding:"0 24px",flex:1,display:"flex",flexDirection:"column",gap:14,justifyContent:"center"}}>
          <BigBtn onClick={()=>setScreen("setup")} color={C.green}>
            ⛳ Start New Tournament
          </BigBtn>
          <BigBtn onClick={()=>setScreen("leaderboard")} color={C.gold} disabled={teams.length===0}>
            📊 Live Leaderboard
          </BigBtn>
          <GhostBtn onClick={onBack}>← Back to Press</GhostBtn>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "setup") {
    return (
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 20px 20px"}}>
          <button onClick={()=>setScreen("home")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16}}>‹ Back</button>
          <div style={{fontSize:22,fontWeight:800,textAlign:"center"}}>Tournament Setup</div>
        </div>

        <div style={{padding:"0 20px"}}>

          {/* Course picker */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Course</div>
            <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={{width:"100%",padding:"14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:15,outline:"none",WebkitAppearance:"none"}}>
              {Object.entries(COURSES).map(([id,c])=>(
                <option key={id} value={id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Number of teams */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Number of Teams (2–20)</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>{const n=Math.max(2,numTeams-1);setNumTeams(n);setTeamNames(Array(n).fill("").map((_,i)=>teamNames[i]||`Team ${i+1}`));setPlayerNames(Array(n).fill(null).map((_,i)=>playerNames[i]||["","","",""]));}}
                style={{width:48,height:48,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:28,fontWeight:700,cursor:"pointer",flexShrink:0}}>−</button>
              <input
                type="number" min="2" max="20"
                value={numTeams}
                onChange={e=>{
                  const n=Math.min(20,Math.max(2,parseInt(e.target.value)||2));
                  setNumTeams(n);
                  setTeamNames(Array(n).fill("").map((_,i)=>teamNames[i]||`Team ${i+1}`));
                  setPlayerNames(Array(n).fill(null).map((_,i)=>playerNames[i]||["","","",""]));
                }}
                style={{flex:1,padding:"14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:28,fontWeight:800,outline:"none",textAlign:"center"}}
                inputMode="numeric"
              />
              <button onClick={()=>{const n=Math.min(20,numTeams+1);setNumTeams(n);setTeamNames(Array(n).fill("").map((_,i)=>teamNames[i]||`Team ${i+1}`));setPlayerNames(Array(n).fill(null).map((_,i)=>playerNames[i]||["","","",""]));}}
                style={{width:48,height:48,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:28,fontWeight:700,cursor:"pointer",flexShrink:0}}>+</button>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"center"}}>{numTeams} teams · {numTeams*4} players total</div>
          </div>

          {/* Team setup */}
          {Array.from({length:numTeams},(_,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:12}}>
              {/* Team name */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:TEAM_COLORS[i%TEAM_COLORS.length],flexShrink:0}}/>
                <input
                  value={teamNames[i]||""}
                  onChange={e=>setTeamNames(prev=>{const n=[...prev];n[i]=e.target.value;return n;})}
                  placeholder={`Team ${i+1}`}
                  style={{flex:1,padding:"10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:15,outline:"none",fontWeight:700}}
                />
              </div>
              {/* Player names */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[0,1,2,3].map(j=>(
                  <input key={j}
                    value={playerNames[i]?.[j]||""}
                    onChange={e=>setPlayerNames(prev=>{const n=prev.map(r=>[...r]);n[i][j]=e.target.value;return n;})}
                    placeholder={`Player ${j+1}`}
                    style={{padding:"10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none"}}
                  />
                ))}
              </div>
            </div>
          ))}

          <div style={{height:20}}/>
          <BigBtn onClick={startTournament} color={C.green}>
            Tee It Up! ⛳
          </BigBtn>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCORING SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "scoring") {
    const team      = teams[activeTeam];
    const holeData  = course.holes[currentHole - 1];
    const isLastHole = currentHole === course.holes.length;
    const bb        = calcTwoBestBall(team.scores, course.holes);

    // Which 2 players have the best score this hole
    const holeScores = [0,1,2,3].map(j => ({ j, s: getScore(team, j, currentHole) })).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
    const best2Idx  = new Set(holeScores.slice(0,2).map(x=>x.j));

    return (
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>

        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 16px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):null} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            </div>
            <button onClick={()=>setScreen("leaderboard")} style={{background:"rgba(232,184,75,0.15)",border:`1px solid ${C.gold}`,color:C.gold,fontSize:11,cursor:"pointer",padding:"6px 12px",borderRadius:12,fontWeight:700}}>📊 Board</button>
          </div>

          {/* Progress bar */}
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        {/* Team selector tabs */}
        <div style={{display:"flex",overflowX:"auto",padding:"8px 16px",gap:8,borderBottom:`1px solid ${C.border}`}}>
          {teams.map((t,i)=>(
            <button key={i} onClick={()=>setActiveTeam(i)} style={{
              flexShrink:0, padding:"8px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
              background: activeTeam===i ? t.color : C.surface,
              color: activeTeam===i ? "#0a1a0f" : C.muted,
              border: `1.5px solid ${activeTeam===i ? t.color : C.border}`,
            }}>
              {t.name}
            </button>
          ))}
        </div>

        <div style={{padding:"14px 16px"}}>

          {/* Team header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:team.color}}/>
              <div style={{fontWeight:800,fontSize:18}}>{team.name}</div>
            </div>
            <div style={{fontSize:12,color:C.muted}}>
              F: <span style={{color:C.text,fontWeight:700}}>{bb.front||"—"}</span>
              {"  "}B: <span style={{color:C.text,fontWeight:700}}>{bb.back||"—"}</span>
              {"  "}Tot: <span style={{color:C.gold,fontWeight:700}}>{bb.total||"—"}</span>
            </div>
          </div>

          {/* Player score entries */}
          {[0,1,2,3].map(j => {
            const score    = getScore(team, j, currentHole);
            const isBest   = best2Idx.has(j) && score !== null;
            return (
              <div key={j} style={{
                background: isBest ? "rgba(123,180,80,0.08)" : C.card,
                border: `1px solid ${isBest ? C.green : C.border}`,
                borderRadius:14, padding:"12px 14px", marginBottom:10,
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{team.players[j]}</div>
                    {isBest && <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:1}}>✓ COUNTS</div>}
                  </div>
                  {score !== null && (
                    <div style={{fontSize:13,color:score<holeData.par?C.green:score>holeData.par?C.red:C.muted,fontWeight:700}}>
                      {score < holeData.par ? "Birdie 🐦" : score === holeData.par ? "Par" : score === holeData.par+1 ? "Bogey" : `+${score-holeData.par}`}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <button onClick={()=>score!==null&&setScore(activeTeam,j,currentHole,Math.max(1,score-1))} style={{width:52,height:52,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:28,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:52,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1}}>
                      {score !== null ? score : "—"}
                    </div>
                  </div>
                  <button onClick={()=>setScore(activeTeam,j,currentHole,score!==null?score+1:holeData.par)} style={{width:52,height:52,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:28,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              </div>
            );
          })}

          {/* 2 best ball this hole */}
          {holeScores.length >= 2 && (
            <div style={{background:"rgba(123,180,80,0.06)",border:`1px solid ${C.green}33`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,color:C.muted}}>2 Best Ball this hole</div>
              <div style={{fontSize:18,fontWeight:800,color:C.green}}>
                {holeScores.slice(0,2).reduce((s,x)=>s+x.s,0)}
              </div>
            </div>
          )}

          {/* Next hole button */}
          <BigBtn
            onClick={()=>isLastHole?setScreen("leaderboard"):setCurrentHole(h=>h+1)}
            color={isLastHole?C.gold:C.green}
          >
            {isLastHole?"See Final Results 🏆":"Next — Hole "+(currentHole+1)}
          </BigBtn>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEADERBOARD SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "leaderboard") {
    const board = getLeaderboard();
    const holesPlayed = course.holes.filter(h => {
      return teams.some(t => Object.values(t.scores).some(ps => ps?.[h.hole] !== undefined));
    }).length;

    return (
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>

        {/* Header */}
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 20px 20px",textAlign:"center"}}>
          <button onClick={()=>setScreen("scoring")} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16,display:"block"}}>‹ Back to Scoring</button>
          <div style={{fontSize:28,fontWeight:800}}>🏆 Leaderboard</div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>{course.name} · {holesPlayed} holes played · 2 Best Ball</div>
        </div>

        <div style={{padding:"0 16px"}}>

          {/* Column headers */}
          <div style={{display:"flex",justifyContent:"space-between",padding:"6px 14px",marginBottom:4}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",flex:1}}>Team</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",width:36,textAlign:"center"}}>F9</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",width:36,textAlign:"center"}}>B9</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",width:48,textAlign:"center"}}>TOT</div>
          </div>

          {/* Team rows */}
          {board.map((team, rank) => (
            <div key={team.id} style={{
              background: rank===0 ? `rgba(232,184,75,0.08)` : C.card,
              border: `1px solid ${rank===0 ? C.gold+"44" : C.border}`,
              borderRadius:14, padding:"14px", marginBottom:8,
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {/* Rank */}
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted,flexShrink:0
                }}>
                  {rank+1}
                </div>

                {/* Color dot + name + players */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                    <div style={{fontWeight:800,fontSize:16,color:rank===0?C.gold:C.text}}>{team.name}</div>
                  </div>
                  <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {team.players.join(" · ")}
                  </div>
                </div>

                {/* Scores */}
                <div style={{width:36,textAlign:"center",fontWeight:700,fontSize:15,color:C.text}}>{team.bb.front||"—"}</div>
                <div style={{width:36,textAlign:"center",fontWeight:700,fontSize:15,color:C.text}}>{team.bb.back||"—"}</div>
                <div style={{width:48,textAlign:"center",fontWeight:800,fontSize:18,color:rank===0?C.gold:C.green}}>{team.bb.total||"—"}</div>
              </div>
            </div>
          ))}

          {/* Hole by hole scorecard */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",marginTop:8,overflowX:"auto"}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hole by Hole · 2 Best Ball</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:400}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  <th style={{textAlign:"left",padding:"4px 6px",color:C.muted,fontWeight:600}}>Team</th>
                  {course.holes.filter(h=>h.side==="front").map(h=>(
                    <th key={h.hole} style={{padding:"4px 3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>
                  ))}
                  <th style={{padding:"4px 4px",textAlign:"center",color:C.green,fontWeight:700}}>F</th>
                  {course.holes.filter(h=>h.side==="back").map(h=>(
                    <th key={h.hole} style={{padding:"4px 3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>
                  ))}
                  <th style={{padding:"4px 4px",textAlign:"center",color:C.green,fontWeight:700}}>B</th>
                  <th style={{padding:"4px 4px",textAlign:"center",color:C.gold,fontWeight:700}}>TOT</th>
                </tr>
                <tr>
                  <td style={{padding:"3px 6px",color:C.dim,fontSize:10}}>Par</td>
                  {course.holes.filter(h=>h.side==="front").map(h=>(
                    <td key={h.hole} style={{padding:"3px",textAlign:"center",color:C.dim}}>{h.par}</td>
                  ))}
                  <td style={{padding:"3px",textAlign:"center",color:C.dim}}>{course.holes.filter(h=>h.side==="front").reduce((s,h)=>s+h.par,0)}</td>
                  {course.holes.filter(h=>h.side==="back").map(h=>(
                    <td key={h.hole} style={{padding:"3px",textAlign:"center",color:C.dim}}>{h.par}</td>
                  ))}
                  <td style={{padding:"3px",textAlign:"center",color:C.dim}}>{course.holes.filter(h=>h.side==="back").reduce((s,h)=>s+h.par,0)}</td>
                  <td style={{padding:"3px",textAlign:"center",color:C.dim}}>{course.par}</td>
                </tr>
              </thead>
              <tbody>
                {board.map((team,rank) => {
                  const frontHoles = course.holes.filter(h=>h.side==="front");
                  const backHoles  = course.holes.filter(h=>h.side==="back");
                  return (
                    <tr key={team.id} style={{borderTop:`1px solid ${C.dim}`}}>
                      <td style={{padding:"4px 6px",fontWeight:700,color:team.color,whiteSpace:"nowrap",fontSize:11}}>{team.name}</td>
                      {frontHoles.map(h=>(
                        <td key={h.hole} style={{padding:"4px 3px",textAlign:"center",color:team.bb.byHole[h.hole]!==null?C.text:C.dim}}>
                          {team.bb.byHole[h.hole] ?? "—"}
                        </td>
                      ))}
                      <td style={{padding:"4px",textAlign:"center",fontWeight:700,color:C.green}}>{team.bb.front||"—"}</td>
                      {backHoles.map(h=>(
                        <td key={h.hole} style={{padding:"4px 3px",textAlign:"center",color:team.bb.byHole[h.hole]!==null?C.text:C.dim}}>
                          {team.bb.byHole[h.hole] ?? "—"}
                        </td>
                      ))}
                      <td style={{padding:"4px",textAlign:"center",fontWeight:700,color:C.green}}>{team.bb.back||"—"}</td>
                      <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:rank===0?C.gold:C.text}}>{team.bb.total||"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{height:20}}/>
          <BigBtn onClick={()=>setScreen("scoring")} color={C.green}>← Back to Scoring</BigBtn>
          <div style={{height:10}}/>
          <GhostBtn onClick={onBack}>Exit Tournament</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}
