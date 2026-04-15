import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";
import { SkinsTab } from "./skins.jsx";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const TEAM_COLORS=["#e8b84b","#7bb450","#5b9bd5","#e05050","#b07dd5","#50c8c8","#e88a3a","#c8c850","#d570a0","#70d5a0","#a0a0e8","#e8a070"];

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"—";if(d===0)return"E";return d>0?"+"+d:String(d);}
function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus,ballsByPar,holePars){
  const getBalls=(par)=>{
    if(typeof ballsByPar==="object"&&ballsByPar!==null&&!Array.isArray(ballsByPar)){
      return parseInt(ballsByPar[par])||parseInt(ballsByPar[4])||2;
    }
    return parseInt(ballsByPar)||Math.min(teamSize,2);
  };
  const byHole={};
  let front=0,back=0,total=0;
  let frontPar=0,backPar=0;
  const hpar=(h)=>(holePars?.[h.hole]??h.par);
  for(const h of holeData){
    const balls=getBalls(hpar(h));
    const scores=[];
    for(let p=0;p<teamSize;p++){const s=teamScores?.[p]?.[h.hole];if(s!==undefined&&s!==null)scores.push(safeInt(s));}
    if(scores.length===0){byHole[h.hole]=null;continue;}
    scores.sort((a,b)=>a-b);
    const bestN=scores.slice(0,balls);
    let raw=bestN.reduce((s,v)=>s+v,0);
    if(birdieBonus){const eb=scores.slice(balls).filter(s=>s<=hpar(h)-1);if(eb.length>0)raw-=eb.reduce((sum,s)=>sum+(hpar(h)-s),0);}
    byHole[h.hole]={raw,diff:raw-(hpar(h)*balls),scored:true};
    if(h.side==="front"){front+=raw;frontPar+=hpar(h)*balls;}
    else{back+=raw;backPar+=hpar(h)*balls;}
    total+=raw;
  }
  const totalPar=frontPar+backPar;
  return{byHole,front,frontDiff:front-frontPar,back,backDiff:back-backPar,total,totalDiff:total-totalPar};
}

export default function TourneySpectator({ tourney: initialTourney, onBack }) {
  const [tourney,   setTourney]   = useState(initialTourney);
  const [liveLabel, setLiveLabel] = useState("● Live");
  const [tab,       setTab]       = useState("board");
  const subRef = useRef(null);

  const course      = COURSES[tourney?.course_id || "south-toledo"];
  const birdieBonus = tourney?.birdie_bonus !== false;
  const ballsByPar  = tourney?.ball_count_by_par||(tourney?.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2});

  useEffect(()=>{
    // Real-time subscription — updates instantly when director or captains enter scores
    subRef.current = sb
      .channel("spectator_"+tourney.id)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourney.id},
        payload => {
          if(payload.new) {
            setTourney(payload.new);
            setLiveLabel("● Updated just now");
            setTimeout(()=>setLiveLabel("● Live"),3000);
          }
        })
      .subscribe();
    return()=>{ if(subRef.current) sb.removeChannel(subRef.current); };
  },[tourney.id]);

  const board = (tourney?.teams || []).map((t,i) => ({
    ...t,
    color: t.color || TEAM_COLORS[i%TEAM_COLORS.length],
    sc: calcTeamScore(t.scores||{}, t.size||4, course.holes, birdieBonus, ballsByPar, tourney.hole_pars||{})
  })).sort((a,b) => a.sc.totalDiff - b.sc.totalDiff);

  const holesPlayed = course.holes.filter(h =>
    board.some(t => t.sc.byHole[h.hole]?.scored)
  ).length;

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"50px 20px 16px" }}>
        {onBack && <button onClick={onBack} style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"8px 16px", borderRadius:20, fontWeight:700, marginBottom:16, display:"block" }}>‹ Back</button>}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:24, fontWeight:800 }}>🏆 {tourney.name}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{course.name} · {holesPlayed} holes played</div>
          <div style={{ fontSize:11, color:C.green, marginTop:4 }}>{liveLabel}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"rgba(0,0,0,0.2)" }}>
        {[["board","🏆 Standings"],["scorecard","📋 Scorecard"],["top10","⭐ Top 10"],["skins","💰 Skins"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"10px 2px", fontSize:11, fontWeight:tab===id?700:500, background:"transparent", color:tab===id?C.green:C.muted, border:"none", borderBottom:tab===id?`2px solid ${C.green}`:"2px solid transparent", cursor:"pointer" }}>{lbl}</button>
        ))}
      </div>

      <div style={{ padding:"16px" }}>

        {tab==="board"&&(
          <>
            {/* Column headers */}
            <div style={{ display:"flex", padding:"4px 14px", marginBottom:6 }}>
              <div style={{ flex:1, fontSize:10, color:C.muted, letterSpacing:1.5, textTransform:"uppercase" }}>Team</div>
              {["F9","B9","TOT"].map(l=><div key={l} style={{ width:44, textAlign:"center", fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>{l}</div>)}
            </div>

            {board.map((team,rank)=>(
              <div key={team.id??rank} style={{ background:rank===0?"rgba(232,184,75,0.08)":C.card, border:`1px solid ${rank===0?C.gold+"44":C.border}`, borderRadius:14, padding:"14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:30,height:30,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted }}>{rank+1}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div style={{ width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0 }}/>
                      <div style={{ fontWeight:800,fontSize:15,color:rank===0?C.gold:C.text }}>{team.name}</div>
                    </div>
                    <div style={{ fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2 }}>
                      {team.players?.filter(Boolean).join(" · ")||"—"}
                    </div>
                  </div>
                  {[team.sc.frontDiff,team.sc.backDiff,team.sc.totalDiff].map((d,i)=>(
                    <div key={i} style={{ width:44,textAlign:"center",fontWeight:800,fontSize:16,color:team.sc.total===0?C.muted:relColor(d) }}>{team.sc.total===0?"—":relLabel(d)}</div>
                  ))}
                </div>
              </div>
            ))}

          </>
        )}

        {tab==="scorecard"&&(
          <div style={{ overflowX:"auto" }}>
            <div style={{ fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10 }}>Hole by Hole · vs Par</div>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  <th style={{ textAlign:"left",padding:"4px 6px",color:C.muted }}>Team</th>
                  {course.holes.filter(h=>h.side==="front").map(h=><th key={h.hole} style={{ padding:"3px",textAlign:"center",color:C.muted,fontWeight:500 }}>{h.hole}</th>)}
                  <th style={{ padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700 }}>F</th>
                  {course.holes.filter(h=>h.side==="back").map(h=><th key={h.hole} style={{ padding:"3px",textAlign:"center",color:C.muted,fontWeight:500 }}>{h.hole}</th>)}
                  <th style={{ padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700 }}>B</th>
                  <th style={{ padding:"3px 5px",textAlign:"center",color:C.gold,fontWeight:700 }}>T</th>
                </tr>
              </thead>
              <tbody>
                {board.map(team=>{
                  const fH=course.holes.filter(h=>h.side==="front");
                  const bH=course.holes.filter(h=>h.side==="back");
                  return(
                    <tr key={team.id??team.name} style={{ borderTop:`1px solid ${C.dim}` }}>
                      <td style={{ padding:"4px 6px",fontWeight:700,color:team.color,whiteSpace:"nowrap" }}>{team.name}</td>
                      {fH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{ padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim }}>{hd?relLabel(hd.diff):"—"}</td>;})}
                      <td style={{ padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.front?relColor(team.sc.frontDiff):C.muted }}>{team.sc.front?relLabel(team.sc.frontDiff):"—"}</td>
                      {bH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{ padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim }}>{hd?relLabel(hd.diff):"—"}</td>;})}
                      <td style={{ padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.back?relColor(team.sc.backDiff):C.muted }}>{team.sc.back?relLabel(team.sc.backDiff):"—"}</td>
                      <td style={{ padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.total?relColor(team.sc.totalDiff):C.muted }}>{team.sc.total?relLabel(team.sc.totalDiff):"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab==="top10"&&(()=>{
          const medals=["🥇","🥈","🥉"];
          const players=[];
          (tourney.teams||[]).forEach((team,ti)=>{
            for(let pi=0;pi<(team.size||1);pi++){
              const name=team.players?.[pi]?.trim()?team.players[pi].trim():`Player ${pi+1}`;
              const teamName=team.name||`Team ${ti+1}`;
              const teamColor=team.color||TEAM_COLORS[ti%TEAM_COLORS.length];
              let total=0,holesPlayed=0;
              for(const h of course.holes){
                const s=team.scores?.[pi]?.[h.hole];
                if(s!==undefined&&s!==null){total+=safeInt(s)-h.par;holesPlayed++;}
              }
              if(holesPlayed>0)players.push({name,teamName,teamColor,total,holesPlayed,ti,pi});
            }
          });
          players.sort((a,b)=>a.total!==b.total?a.total-b.total:b.holesPlayed-a.holesPlayed);
          const top=players.slice(0,10);
          if(top.length===0)return(
            <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>⭐</div>
              <div style={{fontSize:14}}>Individual scores appear here as players enter their scores.</div>
            </div>
          );
          return(
            <div>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12,textAlign:"center"}}>Individual scores · all players · updates live</div>
              {top.map((p,i)=>(
                <div key={`${p.ti}-${p.pi}`} style={{background:i===0?"rgba(232,184,75,0.08)":C.card,border:`1px solid ${i===0?C.gold+"44":C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:32,textAlign:"center",fontSize:i<3?20:14,fontWeight:800,color:i<3?C.gold:C.muted,flexShrink:0}}>{i<3?medals[i]:i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:15,color:i===0?C.gold:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:p.teamColor,flexShrink:0}}/>
                      <div style={{fontSize:11,color:C.muted}}>{p.teamName}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:22,fontWeight:800,color:relColor(p.total)}}>{relLabel(p.total)}</div>
                    <div style={{fontSize:10,color:C.dim}}>thru {p.holesPlayed}</div>
                  </div>
                </div>
              ))}
              <div style={{fontSize:10,color:C.dim,textAlign:"center",marginTop:12}}>Not counting balls — true individual gross score</div>
            </div>
          );
        })()}
        {tab==="skins"&&<SkinsTab teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} skinsEnabled={tourney.skins_enabled===true} bigBoyEnabled={tourney.big_boy_enabled===true}/>}
      </div>
    </div>
  );
}
