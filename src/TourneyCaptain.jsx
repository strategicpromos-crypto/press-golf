import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"—";if(d===0)return"E";return d>0?"+"+d:String(d);}
function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus){
  const byHole={};
  let front=0,back=0,total=0;
  const frontPar2=holeData.filter(h=>h.side==="front").reduce((s,h)=>s+h.par*2,0);
  const backPar2=holeData.filter(h=>h.side==="back").reduce((s,h)=>s+h.par*2,0);
  for(const h of holeData){
    const scores=[];
    for(let p=0;p<teamSize;p++){const s=teamScores?.[p]?.[h.hole];if(s!==undefined&&s!==null)scores.push(safeInt(s));}
    if(scores.length===0){byHole[h.hole]=null;continue;}
    scores.sort((a,b)=>a-b);
    const countBalls=teamSize<=2?1:2;const bestN=scores.slice(0,countBalls);
    let raw=bestN.reduce((s,v)=>s+v,0);
    let bonusApplied=0;
    if(birdieBonus){
      const extraBirdies=scores.slice(countBalls).filter(s=>s<=h.par-1);
      if(extraBirdies.length>0){bonusApplied=extraBirdies.reduce((sum,s)=>sum+(h.par-s),0);raw-=bonusApplied;}
    }
    const diff=raw-(h.par*countBalls);
    byHole[h.hole]={raw,diff,bonusApplied,scored:true};
    if(h.side==="front")front+=raw;else back+=raw;
    total+=raw;
  }
  return{byHole,front,frontDiff:front-frontPar2,back,backDiff:back-backPar2,total,totalDiff:total-(frontPar2+backPar2)};
}

export default function TourneyCaptain({ tourney: initialTourney, teamIdx, onBack }) {
  const [tourney,      setTourney]      = useState(initialTourney);
  const [currentHole,  setCurrentHole]  = useState(initialTourney.current_hole||1);
  const [tab,          setTab]          = useState("scores");
  const [saveStatus,   setSaveStatus]   = useState("");
  const [showSummary,  setShowSummary]  = useState(false);
  const [bTab,         setBTab]         = useState("standings");
  const saveTimer = useRef(null);
  const subRef    = useRef(null);

  const team      = (tourney.teams || [])[teamIdx];
  const course    = COURSES[tourney.course_id || "south-toledo"];
  const holeData  = course?.holes[currentHole - 1];
  const isLastHole= currentHole === (course?.holes?.length || 18);
  const birdieBonus = tourney.birdie_bonus !== false;

  // Real-time — captain sees tournament updates (hole advances, roster changes)
  useEffect(()=>{
    subRef.current = sb
      .channel("captain_"+tourney.id+"_"+teamIdx)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourney.id},
        payload=>{
          if(payload.new){
            // Merge incoming — keep our team's scores local, update everything else
            setTourney(prev=>{
              const incoming = payload.new;
              const mergedTeams = (incoming.teams||[]).map((t,i)=>
                i===teamIdx ? {...t, scores:(prev.teams||[])[i]?.scores||t.scores} : t
              );
              return {...incoming, teams:mergedTeams};
            });
          }
        })
      .subscribe();
    return()=>{ if(subRef.current) sb.removeChannel(subRef.current); };
  },[tourney.id, teamIdx]);

  function scheduleSync(updatedTeams) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      await sb.from("team_tournaments")
        .update({ teams: updatedTeams, updated_at: new Date().toISOString() })
        .eq("id", tourney.id);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    }, 800);
  }

  function setPlayerScore(pi, hole, val) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      return { ...t, scores: { ...t.scores, [pi]: { ...(t.scores[pi] || {}), [hole]: val } } };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function updatePlayerName(pi, name) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      const players = [...(t.players || [])];
      players[pi] = name;
      return { ...t, players };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function updateTeamSize(size) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      const players = Array.from({ length: size }, (_, j) => (t.players||[])[j] || "");
      return { ...t, size, players };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function getPlayerScore(pi, hole) {
    const v = team?.scores?.[pi]?.[hole];
    return (v === undefined || v === null) ? null : safeInt(v);
  }

  if (!team || !holeData) return <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted }}>Loading...</div>;

  const sc = calcTeamScore(team.scores || {}, team.size || 4, course.holes, birdieBonus);
  const thisHoleScores = Array.from({length:team.size||4},(_,j)=>({j,s:getPlayerScore(j,currentHole)})).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
  const best2Set = new Set(thisHoleScores.slice(0,2).map(x=>x.j));
  const extraBirdies = thisHoleScores.slice(2).filter(x=>x.s<=holeData.par-1);
  const bonusThisHole = birdieBonus&&extraBirdies.length>0?extraBirdies.reduce((sum,x)=>sum+(holeData.par-x.s),0):0;

  // ── ROSTER TAB ─────────────────────────────────────────────────────────────
  if (tab === "roster") {
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:60 }}>
        <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"44px 16px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <button onClick={()=>setTab("scores")} style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>‹ Scores</button>
            <div style={{ fontSize:13, color:saveStatus==="saving"?C.gold:C.green, fontWeight:600 }}>{saveStatus==="saving"?"💾 Saving...":saveStatus==="saved"?"✓ Saved":""}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12 }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:team.color }}/>
            <div style={{ fontWeight:800, fontSize:20 }}>{team.name}</div>
          </div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Edit your roster — updates the leaderboard instantly</div>
        </div>
        <div style={{ padding:"0 16px" }}>
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>Team Name</div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
            <input
              value={team.name || ""}
              onChange={e => {
                const updatedTeams = (tourney.teams || []).map((t, i) =>
                  i === teamIdx ? { ...t, name: e.target.value } : t
                );
                setTourney(prev => ({ ...prev, teams: updatedTeams }));
                scheduleSync(updatedTeams);
              }}
              placeholder="e.g. The Hackers, Dream Team..."
              style={{ width:"100%", padding:"12px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:18, fontWeight:800, outline:"none", boxSizing:"border-box" }}
            />
            <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Shows on the leaderboard for everyone to see</div>
          </div>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:C.muted }}>Players on team</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={()=>updateTeamSize(Math.max(2,(team.size||4)-1))} style={{ width:34,height:34,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer" }}>−</button>
                <div style={{ width:28,textAlign:"center",fontSize:18,fontWeight:800,color:C.text }}>{team.size||4}</div>
                <button onClick={()=>updateTeamSize(Math.min(6,(team.size||4)+1))} style={{ width:34,height:34,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer" }}>+</button>
              </div>
            </div>
          </div>
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>Player Names</div>
          {Array.from({ length: team.size || 4 }, (_, j) => (
            <div key={j} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>Player {j + 1}</div>
              <input
                value={team.players?.[j] || ""}
                onChange={e => updatePlayerName(j, e.target.value)}
                placeholder={`Player ${j + 1} name`}
                style={{ width:"100%", padding:"12px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:16, fontWeight:600, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          ))}
          <div style={{ height:20 }}/>
          <button onClick={()=>setTab("scores")} style={{ width:"100%", padding:"16px", background:C.green, color:"#0a1a0f", border:"none", borderRadius:12, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            ✓ Done — Go to Scoring
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:120 }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"44px 16px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):null}
            style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:currentHole>1?C.green:C.dim, fontSize:13, cursor:currentHole>1?"pointer":"default", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>Hole</div>
            <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{currentHole}</div>
            <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            {saveStatus && <div style={{ fontSize:10, color:saveStatus==="saving"?C.gold:C.green, marginTop:2 }}>{saveStatus==="saving"?"💾 Saving...":"✓ Saved"}</div>}
          </div>
          <button onClick={()=>setShowSummary(true)}
            style={{ background:"rgba(232,184,75,0.15)", border:`1px solid ${C.gold}`, color:C.gold, fontSize:11, cursor:"pointer", padding:"6px 12px", borderRadius:12, fontWeight:700 }}>📊 Board</button>
        </div>
        {/* Progress */}
        <div style={{ display:"flex", gap:2 }}>
          {course.holes.map(h=>(
            <div key={h.hole} style={{ flex:1, height:4, borderRadius:2, background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim }}/>
          ))}
        </div>
      </div>

      {/* Tournament summary overlay */}
      {showSummary&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, overflowY:"auto", fontFamily:"Georgia,serif" }}>
          <div style={{ padding:"50px 16px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.text }}>🏆 {tourney.name}</div>
              <button onClick={()=>setShowSummary(false)} style={{ background:C.dim, border:"none", color:C.muted, width:34, height:34, borderRadius:"50%", fontSize:16, cursor:"pointer" }}>✕</button>
            </div>

            {/* Board tabs */}
            {(()=>{
              const medals=["🥇","🥈","🥉"];
              return(<>
                <div style={{display:"flex",gap:0,marginBottom:16,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden"}}>
                  {[["standings","🏆 Standings"],["top10","⭐ Top 10"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setBTab(id)} style={{flex:1,padding:"11px",fontSize:12,fontWeight:bTab===id?700:500,background:bTab===id?C.green:"transparent",color:bTab===id?"#0a1a0f":C.muted,border:"none",cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>

                {bTab==="standings"&&(<>
                  <div style={{ display:"flex", padding:"4px 12px", marginBottom:6 }}>
                    <div style={{ flex:1, fontSize:10, color:C.muted, letterSpacing:1.5, textTransform:"uppercase" }}>Team</div>
                    {["F9","B9","TOT"].map(l=><div key={l} style={{ width:44, textAlign:"center", fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>{l}</div>)}
                  </div>
                  {(tourney.teams||[])
                    .map((t,i)=>{
                      const sc=calcTeamScore(t.scores||{},t.size||4,course.holes,tourney.birdie_bonus!==false,tourney.count_balls||2);
                      return{...t,i,sc};
                    })
                    .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff)
                    .map((t,rank)=>{
                      const isMyTeam=t.i===teamIdx;
                      return(
                        <div key={t.i} style={{ background:isMyTeam?"rgba(123,180,80,0.1)":rank===0?"rgba(232,184,75,0.08)":C.card, border:`1px solid ${isMyTeam?C.green+"66":rank===0?C.gold+"44":C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:26,height:26,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:rank<3?"#0a1a0f":C.muted }}>{rank+1}</div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                              <div style={{ width:10,height:10,borderRadius:"50%",background:t.color,flexShrink:0 }}/>
                              <div style={{ fontWeight:800,fontSize:14,color:isMyTeam?C.green:rank===0?C.gold:C.text }}>{t.name}{isMyTeam?" ★":""}</div>
                            </div>
                          </div>
                          {[t.sc.frontDiff,t.sc.backDiff,t.sc.totalDiff].map((diff,idx)=>{
                            const raw=idx===0?t.sc.front:idx===1?t.sc.back:t.sc.total;
                            return<div key={idx} style={{ width:44,textAlign:"center",fontWeight:800,fontSize:15,color:raw===0?C.muted:relColor(diff) }}>{raw===0?"—":relLabel(diff)}</div>;
                          })}
                        </div>
                      );
                    })
                  }
                </>)}

                {bTab==="top10"&&(()=>{
                  const players=[];
                  (tourney.teams||[]).forEach((t,ti)=>{
                    for(let pi=0;pi<(t.size||2);pi++){
                      const name=t.players?.[pi]?.trim()?t.players[pi].trim():`Player ${pi+1}`;
                      let total=0,holesPlayed=0;
                      for(const h of course.holes){
                        const s=t.scores?.[pi]?.[h.hole];
                        if(s!==undefined&&s!==null){total+=parseInt(s)-h.par;holesPlayed++;}
                      }
                      if(holesPlayed>0)players.push({name,teamName:t.name||`Team ${ti+1}`,teamColor:t.color,total,holesPlayed,ti,pi,isMe:ti===teamIdx});
                    }
                  });
                  players.sort((a,b)=>a.total!==b.total?a.total-b.total:b.holesPlayed-a.holesPlayed);
                  return players.slice(0,10).map((p,i)=>(
                    <div key={`${p.ti}-${p.pi}`} style={{background:p.isMe?"rgba(123,180,80,0.08)":i===0?"rgba(232,184,75,0.08)":C.card,border:`1px solid ${p.isMe?C.green+"44":i===0?C.gold+"44":C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:32,textAlign:"center",fontSize:i<3?20:14,fontWeight:800,color:i<3?C.gold:C.muted,flexShrink:0}}>{i<3?medals[i]:i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:15,color:p.isMe?C.green:i===0?C.gold:C.text}}>{p.name}{p.isMe?" ★":""}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:p.teamColor}}/>
                          <div style={{fontSize:11,color:C.muted}}>{p.teamName}</div>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:22,fontWeight:800,color:relColor(p.total)}}>{relLabel(p.total)}</div>
                        <div style={{fontSize:10,color:C.dim}}>thru {p.holesPlayed}</div>
                      </div>
                    </div>
                  ));
                })()}
              </>);
            })()}

            <div style={{ height:20 }}/>
            <button onClick={()=>setShowSummary(false)} style={{ width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer" }}>
              ← Back to Scoring
            </button>
          </div>
        </div>
      )}

      {/* Team header */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"12px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:team.color }}/>
            <div style={{ fontWeight:800, fontSize:16 }}>{team.name}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ display:"flex", gap:14 }}>
              {[["F",sc.frontDiff,sc.front],["B",sc.backDiff,sc.back],["T",sc.totalDiff,sc.total]].map(([l,d,raw])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:9, color:C.muted }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:raw===0?C.muted:relColor(d) }}>{raw===0?"—":relLabel(d)}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setTab("roster")} style={{ background:"rgba(123,180,80,0.12)", border:`1px solid ${C.green}33`, color:C.green, fontSize:11, fontWeight:700, padding:"6px 10px", borderRadius:8, cursor:"pointer" }}>
              👥 Roster
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:"14px 16px" }}>
        {/* Birdie bonus alert */}
        {bonusThisHole>0&&(
          <div style={{ background:"rgba(123,180,80,0.12)", border:`1px solid ${C.green}`, borderRadius:10, padding:"10px 14px", marginBottom:12, textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.green }}>🐦 Birdie Bonus −{bonusThisHole} this hole!</div>
          </div>
        )}

        {/* Hole selector - scroll to any hole */}
        <div style={{ display:"flex", overflowX:"auto", gap:6, marginBottom:14, paddingBottom:4 }}>
          {course.holes.map(h=>{
            const scored=Object.values(team.scores||{}).some(ps=>ps?.[h.hole]!==undefined);
            return(
              <button key={h.hole} onClick={()=>setCurrentHole(h.hole)} style={{
                flexShrink:0,width:36,height:36,borderRadius:"50%",fontSize:12,fontWeight:700,cursor:"pointer",
                background:h.hole===currentHole?C.gold:scored?"rgba(123,180,80,0.15)":C.dim,
                color:h.hole===currentHole?"#0a1a0f":scored?C.green:C.muted,
                border:`1px solid ${h.hole===currentHole?C.gold:scored?C.green:C.border}`
              }}>{h.hole}</button>
            );
          })}
        </div>

        {/* Player scores */}
        {Array.from({length:team.size||4},(_,j)=>{
          const score=getPlayerScore(j,currentHole);
          const isBest=best2Set.has(j)&&score!==null;
          const diff=score!==null?score-holeData.par:null;
          return(
            <div key={j} style={{ background:isBest?"rgba(123,180,80,0.08)":C.card, border:`1px solid ${isBest?C.green:C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:15 }}>{team.players?.[j]||"Player "+(j+1)}</span>
                  {isBest&&<span style={{ fontSize:10, color:C.green, fontWeight:700, marginLeft:8 }}>✓ COUNTS</span>}
                </div>
                {diff!==null&&<div style={{ fontSize:14, fontWeight:800, color:relColor(diff) }}>{relLabel(diff)}{diff<=-1?" 🐦":""}</div>}
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <button onClick={()=>setPlayerScore(j,currentHole,score!==null?Math.max(1,score-1):holeData.par-1)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer" }}>−</button>
                <div style={{ flex:1,textAlign:"center" }}>
                  <div style={{ fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1 }}>{score!==null?score:"—"}</div>
                  {score===null&&<div style={{ fontSize:11,color:C.muted,marginTop:4 }}>tap + to enter</div>}
                </div>
                <button onClick={()=>setPlayerScore(j,currentHole,score!==null?score+1:holeData.par)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer" }}>+</button>
              </div>
            </div>
          );
        })}

        {/* This hole total */}
        {thisHoleScores.length>=1&&(()=>{
          const raw=thisHoleScores.slice(0,2).reduce((s,x)=>s+x.s,0)-bonusThisHole;
          const d=raw-(holeData.par*2);
          return(
            <div style={{ background:"rgba(123,180,80,0.06)",border:`1px solid rgba(123,180,80,0.2)`,borderRadius:10,padding:"12px 16px",marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:12,color:C.muted }}>2 Best Ball this hole</div>
                  {bonusThisHole>0&&<div style={{ fontSize:11,color:C.green }}>incl. birdie bonus −{bonusThisHole}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22,fontWeight:800,color:relColor(d) }}>{relLabel(d)}</div>
                  <div style={{ fontSize:11,color:C.muted }}>raw: {raw}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Next hole */}
        <button onClick={()=>!isLastHole&&setCurrentHole(h=>h+1)} disabled={isLastHole} style={{
          width:"100%",padding:"18px",background:isLastHole?"#1a2a1a":C.green,
          color:isLastHole?C.muted:"#0a1a0f",border:"none",borderRadius:14,
          fontSize:17,fontWeight:800,cursor:isLastHole?"not-allowed":"pointer",marginBottom:12
        }}>
          {isLastHole?"Round Complete! ⛳":"Next — Hole "+(currentHole+1)}
        </button>

        <button onClick={onBack} style={{ width:"100%",padding:"14px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer" }}>
          ← Back to Tournament
        </button>
      </div>
    </div>
  );
}
