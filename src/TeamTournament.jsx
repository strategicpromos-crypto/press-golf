import React, { useState } from "react";
import { COURSES } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const TEAM_COLORS = [
  "#e8b84b","#7bb450","#5b9bd5","#e05050",
  "#b07dd5","#50c8c8","#e88a3a","#c8c850",
  "#d570a0","#70d5a0","#a0a0e8","#e8a070",
];

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"—";if(d===0)return"E";return d>0?"+"+d:String(d);}
function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus){
  const byHole={};
  let front=0,back=0,total=0;
  const frontPar2=holeData.filter(h=>h.side==="front").reduce((s,h)=>s+h.par*2,0);
  const backPar2=holeData.filter(h=>h.side==="back").reduce((s,h)=>s+h.par*2,0);
  const totalPar2=frontPar2+backPar2;
  for(const h of holeData){
    const scores=[];
    for(let p=0;p<teamSize;p++){const s=teamScores?.[p]?.[h.hole];if(s!==undefined&&s!==null)scores.push(safeInt(s));}
    if(scores.length===0){byHole[h.hole]=null;continue;}
    scores.sort((a,b)=>a-b);
    const best2=scores.slice(0,2);
    let raw=best2.reduce((s,v)=>s+v,0);
    let bonusApplied=0;
    if(birdieBonus){
      // Players beyond the top 2 who made birdie or better
      // Each contributes their actual vs-par score as a bonus (e.g. eagle = -2, birdie = -1)
      const extraBirdies=scores.slice(2).filter(s=>s<=h.par-1);
      if(extraBirdies.length>0){
        // bonus = sum of (par - score) for each extra birdie/eagle player
        bonusApplied=extraBirdies.reduce((sum,s)=>sum+(h.par-s),0);
        raw-=bonusApplied;
      }
    }
    const diff=raw-(h.par*2);
    byHole[h.hole]={raw,diff,bonusApplied,scored:true};
    if(h.side==="front")front+=raw;else back+=raw;
    total+=raw;
  }
  return{byHole,front,frontDiff:front-frontPar2,back,backDiff:back-backPar2,total,totalDiff:total-totalPar2,frontPar2,backPar2,totalPar2};
}

function BigBtn({children,onClick,color=C.green,disabled=false,style={}}){
  return(<button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"18px",background:disabled?"#1a2a1a":color,color:disabled?C.muted:"#0a1a0f",border:"none",borderRadius:14,fontSize:17,fontWeight:800,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,fontFamily:"Georgia,serif",...style}}>{children}</button>);
}
function GhostBtn({children,onClick,color=C.green}){
  return(<button onClick={onClick} style={{width:"100%",padding:"14px",background:"transparent",color,border:"1.5px solid "+color,borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"Georgia,serif"}}>{children}</button>);
}
function Lbl({children}){return<div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{children}</div>;}

function NumStepper({value,onChange,min=0,max=99,label}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
      {label&&<div style={{fontSize:13,color:C.muted,flex:1}}>{label}</div>}
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
        <div style={{width:32,textAlign:"center",fontSize:18,fontWeight:800,color:C.text}}>{value}</div>
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
      </div>
    </div>
  );
}

export default function TeamTournament({onBack}){
  const[screen,setScreen]=useState("home");
  const[courseId,setCourseId]=useState("south-toledo");
  const[birdieBonus,setBirdieBonus]=useState(true);
  const[numTeams,setNumTeams]=useState(8);
  const[activeTeam,setActiveTeam]=useState(0);
  const[currentHole,setCurrentHole]=useState(1);
  const[teams,setTeams]=useState([]);
  const course=COURSES[courseId];

  function buildTeams(n,existing=[]){
    return Array.from({length:n},(_,i)=>existing[i]||{
      id:i,name:"Team "+(i+1),color:TEAM_COLORS[i%TEAM_COLORS.length],
      size:4,players:["","","",""],strokesPerSide:0,scores:{}
    });
  }

  function updateTeam(idx,patch){setTeams(prev=>prev.map((t,i)=>i===idx?{...t,...patch}:t));}

  function setPlayerScore(ti,pi,hole,val){
    setTeams(prev=>prev.map((t,i)=>{
      if(i!==ti)return t;
      return{...t,scores:{...t.scores,[pi]:{...(t.scores[pi]||{}),[hole]:val}}};
    }));
  }

  function getPlayerScore(team,pi,hole){
    const v=team.scores?.[pi]?.[hole];
    return(v===undefined||v===null)?null:safeInt(v);
  }

  function getLeaderboard(){
    return teams.map(t=>({...t,sc:calcTeamScore(t.scores,t.size,course.holes,birdieBonus)}))
      .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff);
  }

  const holeData=course?.holes[currentHole-1];
  const isLastHole=currentHole===(course?.holes?.length||18);

  // HOME
  if(screen==="home"){
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 24px 30px"}}>
          <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:24}}>‹ Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:52}}>🏆</div>
            <div style={{fontSize:28,fontWeight:800,marginTop:8}}>Team Tournament</div>
            <div style={{fontSize:14,color:C.muted,marginTop:6}}>2 Best Ball · Front / Back / Total</div>
          </div>
        </div>
        <div style={{padding:"24px",display:"flex",flexDirection:"column",gap:12}}>
          <BigBtn onClick={()=>{setTeams(buildTeams(numTeams));setCurrentHole(1);setActiveTeam(0);setScreen("setup");}}>⛳ New Tournament Setup</BigBtn>
          {teams.length>0&&<BigBtn onClick={()=>setScreen("scoring")} color={C.gold}>▶ Continue Tournament</BigBtn>}
          {teams.length>0&&<BigBtn onClick={()=>setScreen("leaderboard")} color={C.surface} style={{border:"1px solid "+C.border,color:C.text}}>📊 Leaderboard</BigBtn>}
          <GhostBtn onClick={onBack}>← Back to Press</GhostBtn>
        </div>
      </div>
    );
  }

  // SETUP
  if(screen==="setup"){
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 20px"}}>
          <button onClick={()=>setScreen("home")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16}}>‹ Back</button>
          <div style={{fontSize:22,fontWeight:800,textAlign:"center"}}>Tournament Setup</div>
        </div>
        <div style={{padding:"0 20px"}}>

          {/* Course */}
          <div style={{marginBottom:16}}>
            <Lbl>Course</Lbl>
            <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",WebkitAppearance:"none"}}>
              {Object.entries(COURSES).map(([id,c])=>(
                <option key={id} value={id}>{c.name} — Par {c.par}</option>
              ))}
            </select>
          </div>

          {/* Birdie Bonus */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>Birdie Bonus</div>
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{birdieBonus?"3+ birdies on a hole = extra −1 per additional birdie":"Off for this tournament"}</div>
              </div>
              <button onClick={()=>setBirdieBonus(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:birdieBonus?C.green:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:4,left:birdieBonus?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>

          {/* Num teams */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <Lbl>Number of Teams</Lbl>
            <NumStepper value={numTeams} min={2} max={20} onChange={n=>{
              setNumTeams(n);
              setTeams(prev=>buildTeams(n,prev));
            }}/>
            <div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"center"}}>{numTeams} teams</div>
          </div>

          {/* Per-team */}
          {teams.map((team,i)=>(
            <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                <input value={team.name} onChange={e=>updateTeam(i,{name:e.target.value})} placeholder={"Team "+(i+1)}
                  style={{flex:1,padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:15,outline:"none",fontWeight:700}}/>
              </div>
              <div style={{marginBottom:10}}>
                <NumStepper label="Players on team" value={team.size} min={2} max={6} onChange={size=>{
                  const players=Array.from({length:size},(_,j)=>team.players[j]||"");
                  updateTeam(i,{size,players});
                }}/>
              </div>
              <div style={{marginBottom:12}}>
                <NumStepper label="Strokes received per side" value={team.strokesPerSide} min={0} max={9} onChange={v=>updateTeam(i,{strokesPerSide:v})}/>
                {team.strokesPerSide>0&&<div style={{fontSize:11,color:C.gold,marginTop:4,paddingLeft:4}}>Starts {team.strokesPerSide*2} under par for the round</div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {Array.from({length:team.size},(_,j)=>(
                  <input key={j} value={team.players[j]||""} onChange={e=>{const p=[...team.players];p[j]=e.target.value;updateTeam(i,{players:p});}}
                    placeholder={"Player "+(j+1)} style={{padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,outline:"none"}}/>
                ))}
              </div>
            </div>
          ))}

          <div style={{height:20}}/>
          <BigBtn onClick={()=>{setCurrentHole(1);setActiveTeam(0);setScreen("scoring");}}>Tee It Up! ⛳</BigBtn>
        </div>
      </div>
    );
  }

  // SCORING
  if(screen==="scoring"&&holeData){
    const team=teams[activeTeam];
    const sc=calcTeamScore(team.scores,team.size,course.holes,birdieBonus);
    const thisHoleScores=Array.from({length:team.size},(_,j)=>({j,s:getPlayerScore(team,j,currentHole)})).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
    const best2Set=new Set(thisHoleScores.slice(0,2).map(x=>x.j));
    const birdieCount=thisHoleScores.filter(x=>x.s<=holeData.par-1).length;
    const bonusThisHole=birdieBonus&&birdieCount>=3?birdieCount-2:0;

    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:120}}>
        {/* Header */}
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 16px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):setScreen("setup")}
              style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            </div>
            <button onClick={()=>setScreen("leaderboard")}
              style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"6px 12px",borderRadius:12,fontWeight:700}}>📊 Board</button>
          </div>
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        {/* Team tabs */}
        <div style={{display:"flex",overflowX:"auto",padding:"8px 12px",gap:8,borderBottom:"1px solid "+C.border}}>
          {teams.map((t,i)=>(
            <button key={i} onClick={()=>setActiveTeam(i)} style={{flexShrink:0,padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",background:activeTeam===i?t.color:C.surface,color:activeTeam===i?"#0a1a0f":C.muted,border:"1.5px solid "+(activeTeam===i?t.color:C.border)}}>{t.name}</button>
          ))}
        </div>

        <div style={{padding:"14px 16px"}}>
          {/* Running score */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:team.color}}/>
                <div style={{fontWeight:800,fontSize:16}}>{team.name}</div>
                {team.strokesPerSide>0&&<div style={{fontSize:10,color:C.gold,background:"rgba(232,184,75,0.1)",padding:"2px 6px",borderRadius:6}}>+{team.strokesPerSide}/side</div>}
              </div>
              <div style={{display:"flex",gap:16}}>
                {[["F9",sc.frontDiff,sc.front],["B9",sc.backDiff,sc.back],["Tot",sc.totalDiff,sc.total]].map(([lbl,diff,raw])=>(
                  <div key={lbl} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.muted}}>{lbl}</div>
                    <div style={{fontSize:15,fontWeight:800,color:raw===0?C.muted:relColor(diff)}}>{raw===0?"—":relLabel(diff)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Birdie bonus alert */}
          {bonusThisHole>0&&(
            <div style={{background:"rgba(123,180,80,0.12)",border:"1px solid "+C.green,borderRadius:10,padding:"10px 14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>🐦 {birdieCount} Birdies! Bonus −{bonusThisHole} applied this hole</div>
            </div>
          )}

          {/* Player entries */}
          {Array.from({length:team.size},(_,j)=>{
            const score=getPlayerScore(team,j,currentHole);
            const isBest=best2Set.has(j)&&score!==null;
            const diff=score!==null?score-holeData.par:null;
            return(
              <div key={j} style={{background:isBest?"rgba(123,180,80,0.08)":C.card,border:"1px solid "+(isBest?C.green:C.border),borderRadius:14,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:15}}>{team.players[j]||"Player "+(j+1)}</span>
                    {isBest&&<span style={{fontSize:10,color:C.green,fontWeight:700,marginLeft:8}}>✓ COUNTS</span>}
                  </div>
                  {diff!==null&&<div style={{fontSize:14,fontWeight:800,color:relColor(diff)}}>{relLabel(diff)}{diff<=-1?" 🐦":""}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?Math.max(1,score-1):holeData.par-1)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1}}>{score!==null?score:"—"}</div>
                    {score===null&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>tap + to enter</div>}
                  </div>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?score+1:holeData.par)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              </div>
            );
          })}

          {/* This hole total */}
          {thisHoleScores.length>=1&&(()=>{
            const best2scores=thisHoleScores.slice(0,2).map(x=>x.s);
            const raw=best2scores.reduce((s,v)=>s+v,0)-bonusThisHole;
            const d=raw-(holeData.par*2);
            return(
              <div style={{background:"rgba(123,180,80,0.06)",border:"1px solid rgba(123,180,80,0.2)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,color:C.muted}}>2 Best Ball this hole</div>
                    {bonusThisHole>0&&<div style={{fontSize:11,color:C.green}}>+ birdie bonus −{bonusThisHole}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:22,fontWeight:800,color:relColor(d)}}>{relLabel(d)}</div>
                    <div style={{fontSize:11,color:C.muted}}>raw: {raw}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <BigBtn onClick={()=>isLastHole?setScreen("leaderboard"):setCurrentHole(h=>h+1)} color={isLastHole?C.gold:C.green}>
            {isLastHole?"See Final Results 🏆":"Next — Hole "+(currentHole+1)}
          </BigBtn>

          {/* Mini standings */}
          <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {getLeaderboard().slice(0,5).map((t,rank)=>(
              <div key={t.id} style={{background:C.card,border:"1px solid "+t.color+"44",borderRadius:20,padding:"5px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:C.muted}}>{rank+1}.</span>
                <span style={{fontWeight:700,color:t.color}}>{t.name}</span>
                <span style={{fontWeight:800,color:relColor(t.sc.totalDiff)}}>{t.sc.total?relLabel(t.sc.totalDiff):"—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if(screen==="leaderboard"){
    const board=getLeaderboard();
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 20px",textAlign:"center"}}>
          <button onClick={()=>setScreen("scoring")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16,display:"block"}}>‹ Back to Scoring</button>
          <div style={{fontSize:28,fontWeight:800}}>🏆 Leaderboard</div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>{course.name} · 2 Best Ball{birdieBonus?" · Birdie Bonus ✓":""}</div>
        </div>
        <div style={{padding:"0 16px"}}>
          <div style={{display:"flex",padding:"4px 14px",marginBottom:4}}>
            <div style={{flex:1,fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Team</div>
            {["F9","B9","TOT"].map(l=><div key={l} style={{width:44,textAlign:"center",fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>)}
          </div>
          {board.map((team,rank)=>(
            <div key={team.id} style={{background:rank===0?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(rank===0?C.gold+"44":C.border),borderRadius:14,padding:"14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted}}>{rank+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                    <div style={{fontWeight:800,fontSize:15,color:rank===0?C.gold:C.text}}>{team.name}</div>
                    {team.strokesPerSide>0&&<div style={{fontSize:9,color:C.gold}}>+{team.strokesPerSide}/side</div>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{team.players.filter(Boolean).join(" · ")||"No players"}</div>
                </div>
                {[team.sc.frontDiff,team.sc.backDiff,team.sc.totalDiff].map((d,idx)=>(
                  <div key={idx} style={{width:44,textAlign:"center",fontWeight:800,fontSize:16,color:team.sc.total===0?C.muted:relColor(d)}}>{team.sc.total===0?"—":relLabel(d)}</div>
                ))}
              </div>
            </div>
          ))}

          {/* Scorecard */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginTop:8,overflowX:"auto"}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hole by Hole · vs Par</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
              <thead>
                <tr style={{borderBottom:"1px solid "+C.border}}>
                  <th style={{textAlign:"left",padding:"4px 6px",color:C.muted}}>Team</th>
                  {course.holes.filter(h=>h.side==="front").map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>)}
                  <th style={{padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700}}>F</th>
                  {course.holes.filter(h=>h.side==="back").map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>)}
                  <th style={{padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700}}>B</th>
                  <th style={{padding:"3px 5px",textAlign:"center",color:C.gold,fontWeight:700}}>T</th>
                </tr>
              </thead>
              <tbody>
                {board.map(team=>{
                  const fH=course.holes.filter(h=>h.side==="front");
                  const bH=course.holes.filter(h=>h.side==="back");
                  return(
                    <tr key={team.id} style={{borderTop:"1px solid "+C.dim}}>
                      <td style={{padding:"4px 6px",fontWeight:700,color:team.color,whiteSpace:"nowrap"}}>{team.name}</td>
                      {fH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"—"}</td>;})}
                      <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.front?relColor(team.sc.frontDiff):C.muted}}>{team.sc.front?relLabel(team.sc.frontDiff):"—"}</td>
                      {bH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"—"}</td>;})}
                      <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.back?relColor(team.sc.backDiff):C.muted}}>{team.sc.back?relLabel(team.sc.backDiff):"—"}</td>
                      <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.total?relColor(team.sc.totalDiff):C.muted}}>{team.sc.total?relLabel(team.sc.totalDiff):"—"}</td>
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
