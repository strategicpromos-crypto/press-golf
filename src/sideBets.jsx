import React, { useState } from "react";
import { getStrokeHoles, calcAutoPressNassau, calcSkins, courseHasHdcp } from "./golf.js";
// PG-BANKPOST-2026-11-06: one-tap "Post to Bank" for director side bets.
// SideBetsTab takes an optional onPostToBank prop (director only). When it
// is absent (captains / spectators) no button renders at all. The confirm
// uses PgDialog pgConfirm (this file did NOT use PgDialog before — its
// delete used its own inline modal); pgAlert reports a failed post.
import { pgConfirm, pgAlert } from "./PgDialog.js";
// PG-BANKPOST-PICKER-2026-11-06: nickname -> bank playerId map, remembered
// on the DIRECTOR's phone only (localStorage, never Supabase and never the
// tournament row). Bet names are nicknames from the teams ("KP"); bank
// names are roster names ("Ken Pratt"). The first time a nickname is
// posted, the director picks who it is; after that it auto-matches.
export const BANK_NAME_MAP_KEY = "pg-bank-name-map";
export function loadBankNameMap(){ try{ return JSON.parse(localStorage.getItem(BANK_NAME_MAP_KEY)||"{}")||{}; }catch(e){ return {}; } }
export function saveBankNameMap(map){ try{ localStorage.setItem(BANK_NAME_MAP_KEY, JSON.stringify(map||{})); }catch(e){} }
export const BANK_ME = "__ME__";
// PG-BANKPOST-ME-2026-11-06: "Me" — the director (Michael) is one side of a
// side bet. The bank tracker is the DIRECTOR's money vs each opponent, so
// there is no bank row for the director himself: a "Me" side gets no bets
// row and no players update — only the OTHER side's bank moves by the full
// amount. Stored in the same nickname map as a playerId, with this distinct
// marker value, so it is remembered the same way ("KP" -> "__ME__").

// ── TOURNAMENT SIDE BETS ─────────────────────────────────────────────────────
// A side bet is a buddy-game calculation that runs on TOP of tournament
// scores. It is stored on the team_tournaments row as side_bets:
//   { id, a:{team,pi}, b:{team,pi}, betType, betAmount, strokes, pressDown, carryOver }
//   carryOver (skins only): true = tied holes roll forward (default, and
//     the behavior of every bet saved before this field existed);
//     false = a tied hole is dead, each hole is worth exactly one skin.
//   betType: "skins" | "match" | "nassau" | "nassau-press"
//   betAmount: $ per skin / per hole / per side+total
//   strokes: SIGNED — >0 means player B receives that many, <0 means player A
//     receives. Strokes split per side (getStrokeHoles): 2 = 1 front + 1 back.
//   pressDown: auto-press trigger for nassau-press (default 2).
//
// Rules this module encodes (agreed with the director, Oct 25 2026):
// - Strokes belong to the BET, never to the tournament. A player can be
//   scratch in the event and still get strokes in a side bet.
// - NO manual presses on tournament side bets. A manual press is a call made
//   in person, and side-bet opponents may be in different groups. Nassau
//   presses here are AUTO only, computed from the scores (same rule the
//   buddy-game tracker already uses: manual presses are same-group only).
// - The bet math is the buddy-game math (golf.js) pointed at tournament
//   scorecards. Enter scores once; every bet calculates itself.

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}

function cleanMap(scores){
  const out={};
  for(const k of Object.keys(scores||{})){
    const v=scores[k];
    if(v===undefined||v===null||v==="")continue;
    const n=parseInt(v,10);
    if(!isNaN(n))out[k]=n;
  }
  return out;
}

export function sideBetPlayerName(teams, ref){
  if(!ref)return "?";
  const t=teams?.[ref.team];
  const name=t?.players?.[ref.pi]?.trim();
  return name || ("Player "+((ref.pi||0)+1));
}

function sideBetScores(teams, ref){
  return cleanMap(teams?.[ref.team]?.scores?.[ref.pi] || {});
}

export function sideBetStrokeLabel(bet, aName, bName){
  const n=Math.abs(bet.strokes||0);
  if(n===0)return "No strokes";
  const who=(bet.strokes||0)>0?bName:aName;
  const perSide=Math.floor(n/2), front=perSide+(n%2);
  return who+" gets "+n+" stroke"+(n>1?"s":"")+" ("+front+" front + "+perSide+" back)";
}

// Totals are always from player A's perspective: total > 0 means B owes A.
export function calcSideBet(bet, teams, course, courseId){
  const aName=sideBetPlayerName(teams, bet.a);
  const bName=sideBetPlayerName(teams, bet.b);
  const aScores=sideBetScores(teams, bet.a);
  const bScores=sideBetScores(teams, bet.b);
  const holes=course?.holes||[];
  const strokeHoles=getStrokeHoles(courseId, Math.abs(bet.strokes||0));
  const aStrokeHoles=(bet.strokes||0)<0?strokeHoles:[];
  const bStrokeHoles=(bet.strokes||0)>0?strokeHoles:[];
  let holesPlayed=0;
  for(const h of holes){
    if(aScores[h.hole]!==undefined&&bScores[h.hole]!==undefined)holesPlayed++;
  }

  if(bet.betType==="skins"){
    const carryOver=bet.carryOver!==false;
    const r=calcSkins({me:aScores,opp:bScores}, holes, aStrokeHoles, bStrokeHoles, bet.betAmount, carryOver);
    return {type:"skins",aName,bName,total:r.net,aWon:r.me,bWon:r.opp,carry:r.carries,carryOver,
      holes:r.holes,holesPlayed,aStrokeHoles,bStrokeHoles};
  }

  if(bet.betType==="match"){
    let upDown=0;
    const perHole=[];
    for(const h of holes){
      const a=safeInt(aScores[h.hole],-1), b=safeInt(bScores[h.hole],-1);
      if(a<0||b<0)continue;
      const aNet=aStrokeHoles.includes(h.hole)?a-1:a;
      const bNet=bStrokeHoles.includes(h.hole)?b-1:b;
      const res=aNet<bNet?"A":aNet>bNet?"B":"tie";
      if(res==="A")upDown++; else if(res==="B")upDown--;
      perHole.push({hole:h.hole,result:res,upDown});
    }
    return {type:"match",aName,bName,total:upDown*(bet.betAmount||0),upDown,
      holes:perHole,holesPlayed,aStrokeHoles,bStrokeHoles};
  }

  // nassau / nassau-press — auto presses only (manualPresses: [])
  const r=calcAutoPressNassau({me:aScores,opp:bScores}, holes, aStrokeHoles, bStrokeHoles,
    bet.betAmount, bet.betType==="nassau-press"?(bet.pressDown||2):99, []);
  return {type:bet.betType,aName,bName,total:r.net,front:r.front,back:r.back,totalBet:r.total,
    holesPlayed,aStrokeHoles,bStrokeHoles};
}

export function betTypeLabel(bet){
  if(bet.betType==="skins")return "Skins · $"+bet.betAmount+" / skin";
  if(bet.betType==="match")return "Match Play · $"+bet.betAmount+" / hole";
  if(bet.betType==="nassau")return "Nassau · $"+bet.betAmount+" front / back / total";
  return "Nassau + Auto Press · $"+bet.betAmount+" · press at "+(bet.pressDown||2)+" down";
}

function settleLine(calc){
  if(calc.total>0)return calc.bName+" owes "+calc.aName+" $"+calc.total;
  if(calc.total<0)return calc.aName+" owes "+calc.bName+" $"+(-calc.total);
  return "Even";
}

function diffLabel(diff, aName, bName){
  if(diff>0)return aName+" "+diff+" up";
  if(diff<0)return bName+" "+(-diff)+" up";
  return "Even";
}

function amtColor(amt, C){
  if(amt>0)return C.green;
  if(amt<0)return C.red;
  return C.muted;
}

// Pass onDelete to show Remove buttons (director and captains both run bets);
// spectators omit it (read-only). canSetup swaps the empty-state hint so the
// captain view doesn't tell captains to wait for the director.
// PG-BANKPOST-2026-11-06: pass onPostToBank (director only) to show the
// "Post to Bank" button under a finished bet's settle line.
export function SideBetsTab({bets, teams, course, courseId, C, onDelete, canSetup, onPostToBank, onResolveBankNames}){
  // PG-BANKPOST-2026-11-06: onPostToBank is director-only. Captains and
  // spectators never pass it, so they never see the button.
  // PG-PGDIALOG-2026-10-31: in-app Press Golf confirm, not the browser's
  // window.confirm (Android titles that with the site address).
  const [pendingDelete, setPendingDelete] = useState(null);
  const [postingId, setPostingId] = useState(null); // PG-BANKPOST-2026-11-06: bet id mid-post (double-tap guard)
  // PG-BANKPOST-PICKER-2026-11-06: {bet, calc, roster, unmatched:[{side, betName, reason, suggestedId}], matched:{a,b}, choices:{side: playerId|"__NEW__"|""}, newNames:{side: string}}
  const [bankPicker, setBankPicker] = useState(null);

  // PG-BANKPOST-PICKER-2026-11-06: shared error reporting for a failed post.
  async function showPostError(res){
    let msg="Couldn't post to the bank: "+(res.error||"Unknown error.");
    if(res.posted&&res.posted.length)msg+=" Posted so far: "+res.posted.join(", ")+".";
    if(res.inserted&&res.inserted.length)msg+=" Bank rows are still in the bank for: "+res.inserted.join(", ")+".";
    if(res.rolledBack===false)msg+=" The bank rows could not be rolled back.";
    msg+=" Check the bank before retrying.";
    await pgAlert(msg);
  }

  // PG-BANKPOST-ME-2026-11-06: confirm text that tells the truth when one
  // side is Me. Only the other side posts, so only that side's amount is
  // named; the Me side is called out as getting no row.
  function bankConfirmText(calc, isMeA, isMeB){
    const amt=Math.abs(calc.total);
    if(isMeA&&!isMeB){
      const bAmt=-calc.total;
      return "Post "+calc.bName+" "+(bAmt>0?"+$":"-$")+amt+" to the bank? ("+calc.aName+" is you — no row for you.)";
    }
    if(isMeB&&!isMeA){
      const aAmt=calc.total;
      return "Post "+calc.aName+" "+(aAmt>0?"+$":"-$")+amt+" to the bank? ("+calc.bName+" is you — no row for you.)";
    }
    const winner=calc.total>0?calc.aName:calc.bName;
    const loser=calc.total>0?calc.bName:calc.aName;
    return "Post "+loser+" -$"+amt+" / "+winner+" +$"+amt+" to the bank?";
  }

  // PG-BANKPOST-PICKER-2026-11-06: Post to Bank flow. Confirm first, then
  // resolve bet nicknames to bank players. If every name matches (exact or
  // remembered) the post goes straight through; if a name doesn't match,
  // the picker opens instead of the post aborting.
  // PG-BANKPOST-ME-2026-11-06: a picker choice is only pre-selected
  // when it is a real roster id or "__ME__". Anything else (including a
  // stale id) stays unselected — the picker must never default to
  // "+ Add new player…" with a stray text field, as it did before.
  function validChoice(suggestedId, roster){
    if(!suggestedId) return "";
    if(suggestedId===BANK_ME) return BANK_ME;
    return (roster||[]).some(p=>p.id===suggestedId)?suggestedId:"";
  }
  async function handlePostToBank(bet, calc){
    // PG-BANKPOST-ME-2026-11-06: resolve FIRST, so the confirm text can
    // say the truth when one side is Me (only the other side posts).
    // Unmatched names open the picker — the picker's own Post button is
    // the confirmation there, so no pgConfirm runs first in that case.
    if(onResolveBankNames){
      const r=await onResolveBankNames(bet,calc);
      if(!r||r.ok===false){
        if(r&&r.needsMapping){
          const choices={}, newNames={};
          for(const u of (r.unmatched||[])){ choices[u.side]=validChoice(u.suggestedId, r.roster); newNames[u.side]=u.betName; }
          setBankPicker({bet, calc, roster:r.roster||[], unmatched:r.unmatched||[], matched:r.matched||{a:null,b:null}, isMe:r.isMe||{a:false,b:false}, choices, newNames});
          return;
        }
        await pgAlert("Couldn't check the bank roster: "+(r&&r.error||"Unknown error."));
        return;
      }
      const matched=r.matched||{};
      const isMe=r.isMe||{a:false,b:false};
      if(isMe.a&&isMe.b){ await pgAlert("Both sides can't be you — pick a bank player for one side."); return; }
      if(!r.unmatched||r.unmatched.length===0){
        const ok=await pgConfirm(bankConfirmText(calc, isMe.a, isMe.b),"Post to Bank");
        if(!ok) return;
        setPostingId(bet.id);
        try{
          const mapping={a:isMe.a?{isMe:true}:{playerId:matched.a&&matched.a.id}, b:isMe.b?{isMe:true}:{playerId:matched.b&&matched.b.id}};
          const res=await onPostToBank(bet,calc,mapping);
          if(res&&res.ok===false) await showPostError(res);
        } finally { setPostingId(null); }
        return;
      }
      const choices={}, newNames={};
      for(const u of r.unmatched){ choices[u.side]=validChoice(u.suggestedId, r.roster); newNames[u.side]=u.betName; }
      setBankPicker({bet, calc, roster:r.roster||[], unmatched:r.unmatched, matched, isMe, choices, newNames});
      return;
    }
    // No resolver (should not happen from the director files): old
    // confirm-first flow, unchanged.
    const amt=Math.abs(calc.total);
    const winner=calc.total>0?calc.aName:calc.bName;
    const loser=calc.total>0?calc.bName:calc.aName;
    const ok=await pgConfirm("Post "+loser+" -$"+amt+" / "+winner+" +$"+amt+" to the bank?","Post to Bank");
    if(!ok) return;
    setPostingId(bet.id);
    try{
      const res=await onPostToBank(bet,calc);
      if(res&&res.ok===false){
        if(res.needsMapping){
          const choices={}, newNames={};
          for(const u of (res.unmatched||[])){ choices[u.side]=validChoice(u.suggestedId, res.roster); newNames[u.side]=u.betName; }
          setBankPicker({bet, calc, roster:res.roster||[], unmatched:res.unmatched||[], matched:res.matched||{a:null,b:null}, isMe:res.isMe||{a:false,b:false}, choices, newNames});
          return;
        }
        await showPostError(res);
      }
    } finally { setPostingId(null); }
  }

  // PG-BANKPOST-PICKER-2026-11-06: the director confirmed the picker.
  // Build the mapping, remember nickname -> playerId for picked players,
  // then post. A new player is created by the director file during the
  // post; its id is remembered afterwards from res.created.
  async function confirmBankPicker(){
    const pk=bankPicker; if(!pk) return;
    for(const u of pk.unmatched){
      if(!pk.choices[u.side]){ await pgAlert("Pick a bank player for \""+u.betName+"\" (or choose Add new player)."); return; }
      if(pk.choices[u.side]==="__NEW__"&&!(pk.newNames[u.side]||"").trim()){ await pgAlert("Enter a name for the new bank player for \""+u.betName+"\"."); return; }
    }
    // PG-BANKPOST-ME-2026-11-06: both sides can't be you. The dialog
    // stays open so the director can fix one side.
    const meSides=["a","b"].filter(s=>{
      if(pk.isMe&&pk.isMe[s]) return true;
      return pk.unmatched.some(u=>u.side===s&&pk.choices[s]===BANK_ME);
    });
    if(meSides.length>=2){ await pgAlert("Both sides can't be you — pick a bank player for one side."); return; }
    const mapping={a:{}, b:{}};
    for(const side of ["a","b"]){
      if(pk.isMe&&pk.isMe[side]){ mapping[side]={isMe:true}; continue; }
      const m=pk.matched[side];
      if(m&&m.id) mapping[side]={playerId:m.id};
    }
    for(const u of pk.unmatched){
      if(pk.choices[u.side]===BANK_ME) mapping[u.side]={isMe:true};
      else if(pk.choices[u.side]==="__NEW__") mapping[u.side]={newName:(pk.newNames[u.side]||"").trim()};
      else mapping[u.side]={playerId:pk.choices[u.side]};
    }
    const map=loadBankNameMap(); let changed=false;
    for(const u of pk.unmatched){
      // PG-BANKPOST-ME-2026-11-06: "Me" is remembered in the same map,
      // as the "__ME__" marker — so the next KP bet auto-resolves to Me.
      if(pk.choices[u.side]&&pk.choices[u.side]!=="__NEW__"){
        const k=(u.betName||"").trim().toLowerCase();
        if(map[k]!==pk.choices[u.side]){ map[k]=pk.choices[u.side]; changed=true; }
      }
    }
    if(changed) saveBankNameMap(map);
    const bet=pk.bet, calc=pk.calc;
    setBankPicker(null);
    setPostingId(bet.id);
    try{
      const res=await onPostToBank(bet, calc, mapping);
      if(res&&res.ok===false){ await showPostError(res); return; }
      if(res&&res.created&&res.created.length){
        const m2=loadBankNameMap(); let c2=false;
        for(const cr of res.created){
          const k=(cr.betName||"").trim().toLowerCase();
          if(cr.playerId&&m2[k]!==cr.playerId){ m2[k]=cr.playerId; c2=true; }
        }
        if(c2) saveBankNameMap(m2);
      }
    } finally { setPostingId(null); }
  }
  if(!bets||bets.length===0){
    return(
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"20px",textAlign:"center"}}>
        <div style={{fontSize:14,color:C.muted}}>No side bets yet.</div>
        <div style={{fontSize:12,color:C.muted,marginTop:6}}>{canSetup?"Tap ＋ Set up Bet above, pick two players, and the bet tracks live from the scores already being entered.":"The director taps ＋ Set up Bet, picks two players, and the bet tracks live from the scores already being entered."}</div>
      </div>
    );
  }
  return(
    <div>
      {bets.map(bet=>{
        const calc=calcSideBet(bet, teams, course, courseId);
        const strokeHoles=(bet.strokes||0)>0?calc.bStrokeHoles:calc.aStrokeHoles;
        return(
          <div key={bet.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:16}}>{calc.aName} <span style={{color:C.muted,fontWeight:500}}>vs</span> {calc.bName}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>{betTypeLabel(bet)}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  {sideBetStrokeLabel(bet, calc.aName, calc.bName)}
                  {strokeHoles.length>0&&<span style={{color:C.gold}}> · holes {strokeHoles.join(", ")}</span>}
                </div>
                {calc.type==="skins"&&!calc.carryOver&&(
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>Tied holes don't carry — each hole is worth one skin.</div>
                )}
                {bet.strokes!==0&&!courseHasHdcp(courseId)&&(
                  <div style={{fontSize:12,color:C.gold,marginTop:2}}>⚠ This course has no handicap data — this bet is playing scratch until handicaps are added.</div>
                )}
              </div>
              {onDelete&&(
                <button onClick={()=>setPendingDelete(bet.id)}
                  style={{background:"transparent",border:"1px solid "+C.red,color:C.red,fontSize:11,cursor:"pointer",padding:"6px 10px",borderRadius:8,flexShrink:0}}>✕ Remove</button>
              )}
            </div>

            {calc.holesPlayed===0?(
              <div style={{fontSize:13,color:C.muted,marginTop:12}}>No scores yet — the bet starts counting once both players have a score.</div>
            ):calc.type==="skins"?(
              <>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
                  {calc.holes.map(h=>(
                    <div key={h.hole} title={"Hole "+h.hole+(h.winner==="carry"?" — tied, $"+h.pot+" carries":h.winner==="tie"?" — tied, no carry":" — $"+h.pot)}
                      style={{minWidth:30,textAlign:"center",borderRadius:8,padding:"6px 0 4px",
                        background:h.winner==="me"?"rgba(123,180,80,0.22)":h.winner==="opp"?"rgba(224,80,80,0.16)":C.dim,
                        outline:strokeHoles.includes(h.hole)?"1.5px solid "+C.gold:"none"}}>
                      <div style={{fontSize:10,color:C.muted}}>{h.hole}{strokeHoles.includes(h.hole)?" ★":""}</div>
                      <div style={{fontSize:14,fontWeight:800,color:h.winner==="me"?C.green:h.winner==="opp"?C.red:C.muted}}>
                        {h.winner==="me"?"A":h.winner==="opp"?"B":"–"}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:8}}>
                  Skins: {calc.aName} {calc.aWon} – {calc.bName} {calc.bWon}
                  {calc.carry>0&&<span> · ${calc.carry} carrying</span>}
                  <span> · ★ = stroke hole</span>
                </div>
              </>
            ):calc.type==="match"?(
              <>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
                  {calc.holes.map(h=>(
                    <div key={h.hole} title={"Hole "+h.hole}
                      style={{minWidth:30,textAlign:"center",borderRadius:8,padding:"6px 0 4px",
                        background:h.result==="A"?"rgba(123,180,80,0.22)":h.result==="B"?"rgba(224,80,80,0.16)":C.dim,
                        outline:strokeHoles.includes(h.hole)?"1.5px solid "+C.gold:"none"}}>
                      <div style={{fontSize:10,color:C.muted}}>{h.hole}{strokeHoles.includes(h.hole)?" ★":""}</div>
                      <div style={{fontSize:14,fontWeight:800,color:h.result==="A"?C.green:h.result==="B"?C.red:C.muted}}>
                        {h.result==="A"?"A":h.result==="B"?"B":"–"}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:8}}>
                  {calc.upDown>0?calc.aName+" "+calc.upDown+" up":calc.upDown<0?calc.bName+" "+(-calc.upDown)+" up":"All square"}
                  <span> · ★ = stroke hole</span>
                </div>
              </>
            ):(
              <>
                {[["Front",calc.front],["Back",calc.back]].map(([side,s])=>(
                  <div key={side} style={{marginTop:12}}>
                    <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{side}</div>
                    {s.bets.map((b,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid "+C.dim}}>
                        <span style={{color:C.muted}}>{i===0?"Original bet":(b.label||"Press")+(b.startHole?" · from hole "+b.startHole:"")}</span>
                        <span style={{fontWeight:700,color:amtColor(b.amount,C)}}>{diffLabel(b.diff, calc.aName, calc.bName)} · {b.amount===0?"$0":(b.amount>0?"+$":"-$")+Math.abs(b.amount)}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",fontWeight:700}}>
                      <span>{side} total</span>
                      <span style={{color:amtColor(s.total,C)}}>{s.total===0?"$0":(s.total>0?"+$":"-$")+Math.abs(s.total)}</span>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",fontWeight:700,borderTop:"1px solid "+C.border,marginTop:6}}>
                  <span>Total (18 holes)</span>
                  <span style={{color:amtColor(calc.totalBet,C)}}>{calc.totalBet===0?"$0":(calc.totalBet>0?"+$":"-$")+Math.abs(calc.totalBet)}</span>
                </div>
                {bet.betType==="nassau-press"&&(
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>Auto presses only — no manual presses on tournament side bets.</div>
                )}
              </>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.surface,borderRadius:10,padding:"11px 13px",marginTop:12}}>
              <span style={{fontSize:13,color:C.muted}}>Settle up · {calc.holesPlayed} holes · net for {calc.aName}</span>
              <span style={{fontSize:18,fontWeight:800,color:amtColor(calc.total,C)}}>
                {calc.total===0?"Even":(calc.total>0?"+$"+calc.total:"−$"+(-calc.total))}
              </span>
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:6}}>{settleLine(calc)}</div>
            {/* PG-BANKPOST-2026-11-06: director-only Post to Bank. Renders
                only when onPostToBank is passed, only on a finished round
                (18 holes, both players scored) and only on a non-zero total.
                After posting, bankPosted on the saved bet makes this a
                disabled "Posted to Bank ✓" line that survives reload. */}
            {onPostToBank&&bet.bankPosted?(
              <button disabled style={{width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:10,fontSize:14,fontWeight:700,marginTop:10,cursor:"default"}}>Posted to Bank ✓ ${bet.bankPosted.amount}</button>
            ):onPostToBank&&calc.holesPlayed>=18&&calc.total!==0?(
              <button disabled={postingId===bet.id} onClick={()=>handlePostToBank(bet,calc)} style={{width:"100%",padding:"12px",background:C.gold,border:"none",color:"#0a1a0f",borderRadius:10,fontSize:14,fontWeight:800,marginTop:10,cursor:postingId===bet.id?"default":"pointer",opacity:postingId===bet.id?0.6:1}}>
                {postingId===bet.id?"Posting…":"Post to Bank · $"+Math.abs(calc.total)}
              </button>
            ):null}
          </div>
        );
      })}
      {/* PG-BANKPOST-PICKER-2026-11-06: who-is-who picker. Opens only
          when a bet nickname doesn't match a bank roster name. Same
          fixed-modal style as the delete confirm above. */}
      {bankPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setBankPicker(null)}>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,padding:22,width:"100%",maxWidth:380,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>⛳ Press Golf</div>
            <div style={{fontSize:14,lineHeight:1.4,marginBottom:14}}>Who is who in the bank? The bet uses nicknames — pick the bank player for each name below. We&apos;ll remember it next time.</div>
            {bankPicker.unmatched.map(u=>(
              <div key={u.side} style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>&quot;{u.betName}&quot; is…</div>
                <select value={bankPicker.choices[u.side]||""} onChange={e=>setBankPicker(prev=>({...prev, choices:{...prev.choices,[u.side]:e.target.value}}))}
                  style={{width:"100%",padding:"10px",background:C.surface,border:"1px solid "+C.border,color:C.text,borderRadius:10,fontSize:14}}>
                  <option value="">— Pick a bank player —</option>
                  {/* PG-BANKPOST-ME-2026-11-06: "Me" first — the director is
                      one side of the bet, and there is no bank row for him.
                      Picking Me posts only the other side. */}
                  <option value={BANK_ME}>★ Me — this is me (the director)</option>
                  {bankPicker.roster.map(pl=>(<option key={pl.id} value={pl.id}>{pl.name}</option>))}
                  <option value="__NEW__">＋ Add new player…</option>
                </select>
                {bankPicker.choices[u.side]==="__NEW__"&&(
                  <input value={bankPicker.newNames[u.side]||""} onChange={e=>setBankPicker(prev=>({...prev, newNames:{...prev.newNames,[u.side]:e.target.value}}))}
                    placeholder="Full name for the bank"
                    style={{width:"100%",padding:"10px",background:C.surface,border:"1px solid "+C.border,color:C.text,borderRadius:10,fontSize:14,marginTop:8}} />
                )}
                {u.reason&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{u.reason}</div>}
              </div>
            ))}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setBankPicker(null)}
                style={{background:C.surface,border:"1px solid "+C.border,color:C.text,fontSize:15,fontWeight:700,padding:"10px 20px",borderRadius:10,cursor:"pointer"}}>Cancel</button>
              <button onClick={confirmBankPicker}
                style={{background:C.gold,border:"none",color:"#0a1a0f",fontSize:15,fontWeight:700,padding:"10px 20px",borderRadius:10,cursor:"pointer"}}>Post to Bank</button>
            </div>
          </div>
        </div>
      )}
      {pendingDelete!==null&&onDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setPendingDelete(null)}>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,padding:22,width:"100%",maxWidth:340}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:18,marginBottom:10}}>⛳ Press Golf</div>
            <div style={{fontSize:15,lineHeight:1.4,marginBottom:20}}>Remove this side bet? Scores are not affected.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setPendingDelete(null)}
                style={{background:C.surface,border:"1px solid "+C.border,color:C.text,fontSize:15,fontWeight:700,padding:"10px 20px",borderRadius:10,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>{onDelete(pendingDelete); setPendingDelete(null);}}
                style={{background:C.red,border:"1px solid "+C.red,color:"#fff",fontSize:15,fontWeight:700,padding:"10px 20px",borderRadius:10,cursor:"pointer"}}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SideBetsTab;
