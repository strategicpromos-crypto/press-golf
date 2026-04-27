import React, { useState, useEffect, useCallback } from "react";
import { sb } from "./supabase.js";
import { loadStripe } from "https://esm.sh/@stripe/stripe-js@2";
import LiveRound from "./LiveRound.jsx";
import TeamTournament from "./TeamTournament.jsx";
import TourneyJoin, { TourneyLoader } from "./TourneyJoin.jsx";
import TourneyCaptain from "./TourneyCaptain.jsx";
import TourneySpectator from "./TourneySpectator.jsx";
import OpponentScoreEntry from "./OpponentScoreEntry.jsx";

const STRIPE_PK = "pk_test_51TIp2h2LCsgE9lxhGjdLujrI8YsZTGOtj1mC8fqHFupIOonwdYHqZRf2uImMvdoXCOclEH0ll3zxzOpfs0Jdo1Fh00nFj1I8GW";
const PRICE_ID  = "price_1Tip7m2LCsgE9Ikh0yUEVgE8";
const APP_URL   = "https://press-golf.vercel.app";
const FREE_PLAYER_LIMIT = 2;

// ── BETA FLAG ──────────────────────────────────────────────────────────────────
// Set to true during beta to auto-sign-in after account creation.
// Users skip the "check your email" step entirely.
// Flip to false before public launch.
const BETA_AUTO_LOGIN = true;

const BET_TYPES = ["Skins","Nassau","Wolf","Birdies","Closest to Pin","Long Drive","Greenie","Press","Custom"];
const CURRENT_SEASON = new Date().getFullYear();

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const inp = {
  width:"100%", padding:"14px", background:C.surface,
  border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
  fontSize:16, outline:"none", boxSizing:"border-box", WebkitAppearance:"none",
};

const pill = (active, color=C.green) => ({
  flex:1, padding:"12px 6px", fontSize:12, fontWeight:active?700:500,
  background:active?color:C.surface, color:active?"#0a1a0f":C.muted,
  border:`1px solid ${active?color:C.border}`,
  cursor:"pointer", borderRadius:8, textAlign:"center", transition:"all 0.15s",
});

function genCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

function openDeepLink(appUrl, webUrl) {
  // Create hidden link and click it — works correctly on Android
  const a = document.createElement("a");
  a.href = appUrl;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Fall back to web if app not installed after 2s
  setTimeout(() => { window.open(webUrl, "_blank"); }, 2000);
}

function openVenmo(name, amount) {
  const amt = Math.abs(amount).toFixed(2);
  const note = encodeURIComponent("Press Golf");
  const recipient = encodeURIComponent(name);
  openDeepLink(
    `venmo://paycharge?txn=pay&recipients=${recipient}&amount=${amt}&note=${note}`,
    `https://venmo.com/u/${recipient}?txn=pay&amount=${amt}&note=${note}`
  );
}

function openCashApp(name, amount) {
  const amt = Math.abs(amount).toFixed(2);
  const handle = encodeURIComponent(name.replace(/\s+/g, ""));
  openDeepLink(
    `cashapp://cash.app/pay/${handle}/${amt}`,
    `https://cash.app/$${handle}/${amt}`
  );
}

function openZelle(phone) {
  openDeepLink(
    `zellepay://pay${phone ? `?contact=${encodeURIComponent(phone)}` : ""}`,
    "https://www.zellepay.com/"
  );
}

// ── UI ────────────────────────────────────────────────────────────────────────
function Lbl({children,note}){return(<div style={{marginBottom:6}}><span style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:C.green,fontWeight:600}}>{children}</span>{note&&<span style={{fontSize:11,color:C.muted,marginLeft:8}}>{note}</span>}</div>);}
function Money({value,size=15}){const color=value>0?C.green:value<0?C.red:C.muted;return <span style={{fontSize:size,fontWeight:700,color,fontVariantNumeric:"tabular-nums"}}>{value>=0?"+":"−"}${Math.abs(value).toFixed(2)}</span>;}
function Spinner(){return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.dim}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);}
function Toast({msg,error}){if(!msg)return null;return(<div style={{position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:error?C.red:C.green,color:"#fff",padding:"12px 24px",borderRadius:24,fontWeight:700,fontSize:13,zIndex:999,boxShadow:"0 4px 24px rgba(0,0,0,0.6)",whiteSpace:"nowrap",pointerEvents:"none"}}>{msg}</div>);}
function Empty({msg}){return <div style={{textAlign:"center",color:C.dim,padding:"44px 0",fontSize:13}}>⛳ {msg}</div>;}
function NotifBadge({count}){if(!count)return null;return <span style={{background:C.red,color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",marginLeft:4}}>{count}</span>;}

function Sheet({open,onClose,title,children}){
  if(!open)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:400}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,borderBottom:"none",padding:"0 0 44px",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}><div style={{width:40,height:4,background:C.dim,borderRadius:2}}/></div>
        {title&&(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 16px"}}><div style={{fontWeight:700,fontSize:20,color:C.text}}>{title}</div><button onClick={onClose} style={{background:C.dim,border:"none",color:C.muted,width:32,height:32,borderRadius:"50%",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button></div>)}
        <div style={{padding:"0 20px"}}>{children}</div>
      </div>
    </div>
  );
}

function BigBtn({children,onClick,color=C.green,textColor="#0a1a0f",style={},disabled=false}){return(<button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"16px",background:disabled?"#333":color,color:disabled?C.muted:textColor,border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1,...style}}>{children}</button>);}
function GhostBtn({children,onClick,color=C.green,style={}}){return(<button onClick={onClick} style={{width:"100%",padding:"14px",background:"transparent",color,border:`1.5px solid ${color}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",...style}}>{children}</button>);}

function SwipeRow({children,onDelete,accent=C.green,disabled=false}){
  const [p,setP]=useState(false);
  return(
    <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${accent}22`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flex:1,padding:"14px"}}>{children}</div>
      {disabled?(
        <div style={{flexShrink:0,padding:"14px",borderLeft:`1px solid ${C.border}`,color:C.muted,fontSize:12}}>✅</div>
      ):(
        <button onClick={onDelete} onTouchStart={()=>setP(true)} onTouchEnd={()=>setP(false)} onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)}
          style={{flexShrink:0,padding:"14px",background:p?"rgba(224,80,80,0.2)":"transparent",border:"none",color:C.red,fontSize:18,cursor:"pointer",borderLeft:"1px solid rgba(224,80,80,0.12)",transition:"background 0.1s"}}>✕</button>
      )}
    </div>
  );
}

function SettingsCard({title,sub,subExtra,children,danger}){
  return(<div style={{background:C.card,border:`1px solid ${danger?"rgba(224,80,80,0.2)":C.border}`,borderRadius:12,padding:"16px",marginBottom:10}}><div style={{fontWeight:600,fontSize:15,marginBottom:4,color:danger?C.red:C.text}}>{title}</div><div style={{fontSize:12,color:C.muted,marginBottom:12}}>{sub}{subExtra}</div>{children}</div>);
}

// ── PRO PAYWALL SCREEN ────────────────────────────────────────────────────────
function ProInfo({onBack, isPro, onUpgrade}) {
  const features = [
    { icon:"👥", title:"Unlimited Players", desc:"Free tier is limited to 2 players. Pro gives you unlimited opponents to track." },
    { icon:"🏆", title:"Team Tournaments — Unlimited Teams", desc:"Free tier allows up to 2 teams of 4. Pro unlocks unlimited teams (up to 20), all team sizes, and full captain/spectator sharing with PIN codes." },
    { icon:"⛳", title:"Live Round Tracker", desc:"Track scores hole by hole with automatic bet calculations for Nassau, Match Play, Skins, and Auto Press." },
    { icon:"🤜", title:"Nassau Auto Press", desc:"Set 1, 2, or 3 down as your press trigger. New bets start automatically. Manual 'Pissed Press' anytime." },
    { icon:"🔗", title:"Player Linking & Invites", desc:"Link accounts with your golf buddies. They see their side of every bet, round, and settlement in real time." },
    { icon:"🔔", title:"Notifications", desc:"Get notified when rounds are posted, settlements are requested, strokes are adjusted, or disputes come in." },
    { icon:"✅", title:"Mutual Cancel & Disputes", desc:"Linked players can request to cancel a round or dispute an amount. Both sides must agree before changes are made." },
    { icon:"⭐", title:"Stroke Approval", desc:"When accounts are linked, stroke adjustments require approval from both players." },
    { icon:"💳", title:"Venmo / Cash App / Zelle", desc:"One tap to open your payment app with the amount pre-filled. Settle up without leaving Press." },
    { icon:"📊", title:"Export History", desc:"View and export your full round history, side bets, and settlements." },
    { icon:"🔄", title:"Season Reset", desc:"Archive your season and start fresh while keeping your history." },
  ];

  return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 20px 24px"}}>
        <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>⭐</div>
          <div style={{fontSize:28,fontWeight:800,color:C.gold,marginBottom:4}}>Press Pro</div>
          <div style={{fontSize:14,color:C.muted,marginBottom:4}}>$1.99 / month</div>
          {isPro
            ? <div style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,padding:"6px 20px",borderRadius:20,fontSize:13,fontWeight:700,display:"inline-block"}}>✅ You're a Pro member</div>
            : <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",padding:"12px 28px",borderRadius:20,fontSize:14,fontWeight:800,cursor:"pointer"}}>⭐ Upgrade to Pro</button>
          }
        </div>
      </div>

      <div style={{padding:"0 20px"}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16,textAlign:"center"}}>
          Everything included with Pro
        </div>

        {features.map((f,i) => (
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:10,display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{fontSize:26,flexShrink:0,marginTop:2}}>{f.icon}</div>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:3}}>{f.title}</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{f.desc}</div>
            </div>
          </div>
        ))}

        {!isPro && (
          <div style={{marginTop:20}}>
            <button onClick={onUpgrade} style={{width:"100%",padding:"16px",background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer"}}>
              ⭐ Upgrade to Press Pro — $1.99/mo
            </button>
            <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:8}}>Cancel anytime. No commitment.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProPaywall({onBack,onUpgrade,saving}){
  return(
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,padding:"44px 20px 60px"}}>
      <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:24}}>‹ Back</button>

      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,background:`linear-gradient(135deg,${C.gold},#b8860b)`,borderRadius:20,marginBottom:14,boxShadow:`0 4px 24px ${C.gold}44`,fontSize:36}}>⛳</div>
        <div style={{fontSize:32,fontWeight:800,letterSpacing:-1,color:"#f0f7ec"}}>Press Pro</div>
        <div style={{fontSize:14,color:C.muted,marginTop:6}}>Upgrade to track unlimited players</div>
      </div>

      {/* Price card */}
      <div style={{background:`linear-gradient(135deg,rgba(232,184,75,0.12),rgba(123,180,80,0.08))`,border:`1px solid ${C.gold}44`,borderRadius:16,padding:"24px",marginBottom:24,textAlign:"center"}}>
        <div style={{fontSize:48,fontWeight:800,color:C.gold,letterSpacing:-2}}>$1.99</div>
        <div style={{fontSize:14,color:C.muted,marginTop:4}}>per month · cancel anytime</div>
      </div>

      {/* Feature comparison */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",marginBottom:24}}>
        {/* Header */}
        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
          <div style={{flex:2,padding:"12px 16px",fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Feature</div>
          <div style={{flex:1,padding:"12px 8px",textAlign:"center",fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",borderLeft:`1px solid ${C.border}`}}>Free</div>
          <div style={{flex:1,padding:"12px 8px",textAlign:"center",fontSize:11,color:C.gold,letterSpacing:1,textTransform:"uppercase",fontWeight:700,borderLeft:`1px solid ${C.border}`}}>Pro</div>
        </div>
        {[
          {feature:"Players",free:"2 max",pro:"Unlimited"},
          {feature:"Rounds & Bets",free:"✅",pro:"✅"},
          {feature:"Settle Up",free:"✅",pro:"✅"},
          {feature:"Invite & Link Players",free:"❌",pro:"✅"},
          {feature:"Email Notifications",free:"❌",pro:"✅"},
          {feature:"Mutual Cancel",free:"❌",pro:"✅"},
          {feature:"Stroke Approval",free:"❌",pro:"✅"},
          {feature:"Amount Disputes",free:"❌",pro:"✅"},
          {feature:"Season Reset",free:"❌",pro:"✅"},
          {feature:"Export History",free:"❌",pro:"✅"},
          {feature:"Venmo / Cash App",free:"❌",pro:"✅"},
        ].map((row,i)=>(
          <div key={i} style={{display:"flex",borderBottom:i<10?`1px solid ${C.border}`:"none",background:i%2===0?"rgba(0,0,0,0.1)":"transparent"}}>
            <div style={{flex:2,padding:"11px 16px",fontSize:13,color:C.text}}>{row.feature}</div>
            <div style={{flex:1,padding:"11px 8px",textAlign:"center",fontSize:12,color:row.free==="✅"?C.green:row.free==="❌"?C.red:C.muted,borderLeft:`1px solid ${C.border}`}}>{row.free}</div>
            <div style={{flex:1,padding:"11px 8px",textAlign:"center",fontSize:12,color:row.pro==="✅"?C.green:C.gold,fontWeight:600,borderLeft:`1px solid ${C.border}`}}>{row.pro}</div>
          </div>
        ))}
      </div>

      <BigBtn onClick={onUpgrade} disabled={saving} color={C.gold} textColor="#0a1a0f" style={{marginBottom:10,fontSize:16,padding:"18px"}}>
        {saving?"Redirecting to Stripe...":"⛳ Upgrade to Press Pro — $1.99/mo"}
      </BigBtn>
      <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:20}}>
        Secure payment via Stripe · Cancel anytime · No hidden fees
      </div>
      <GhostBtn onClick={onBack}>Maybe Later</GhostBtn>
    </div>
  );
}

// ── PRIVACY POLICY ────────────────────────────────────────────────────────────
function PrivacyPolicy({onBack}){
  return(
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,padding:"44px 20px 60px"}}>
      <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:24}}>‹ Back</button>
      <div style={{textAlign:"center",marginBottom:30}}>
        <div style={{fontSize:32,fontWeight:800,color:C.green,letterSpacing:-1}}>Press</div>
        <div style={{fontSize:16,fontWeight:700,marginTop:6}}>Privacy Policy & Terms of Service</div>
        <div style={{fontSize:12,color:C.muted,marginTop:4}}>Last updated: April 2026</div>
      </div>
      {[
        {title:"1. What We Collect",body:"Press collects your email address, display name, and golf data you enter (rounds, bets, settlements). We do not collect your location, contacts, or financial account information."},
        {title:"2. How We Use Your Data",body:"Your data is used solely to provide the Press service. We do not sell, rent, or share your personal data with third parties for marketing purposes."},
        {title:"3. Subscriptions & Billing",body:"Press Pro is $1.99/month billed through Stripe. You can cancel anytime from your account settings. Refunds are handled on a case-by-case basis by contacting strategicpromos@gmail.com."},
        {title:"4. Data Storage & Security",body:"Your data is stored securely using Supabase. All data is encrypted in transit using HTTPS. Each user can only access their own data."},
        {title:"5. Text Messages & Invites",body:"Press opens your phone's native texting app with a pre-written message. Press does not send text messages on your behalf and does not store phone numbers."},
        {title:"6. Golf Betting Disclaimer",body:"Press is a record-keeping tool only. It does not process, hold, or transfer money. Users are solely responsible for ensuring their use complies with all applicable local, state, and federal laws regarding wagering."},
        {title:"7. Payments",body:"Press provides convenience links to Venmo, Cash App, and Zelle. Press does not process payments and is not responsible for transactions conducted through these services."},
        {title:"8. Mutual Cancellation",body:"Rounds and bets can only be cancelled by mutual agreement of both linked players. All cancellations are permanently archived and visible to both parties."},
        {title:"9. Account Deletion",body:"You may delete your account at any time by emailing strategicpromos@gmail.com. We will permanently delete your data within 30 days."},
        {title:"10. Contact Us",body:"Press · strategicpromos@gmail.com · Maumee, Ohio"},
      ].map((s,i)=>(
        <div key={i} style={{marginBottom:12,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontWeight:700,fontSize:14,color:C.green,marginBottom:6}}>{s.title}</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.7}}>{s.body}</div>
        </div>
      ))}
      <div style={{textAlign:"center",fontSize:11,color:C.dim,marginTop:10}}>© {CURRENT_SEASON} Press · Put Me In Your Phone</div>
    </div>
  );
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function AuthScreen({onAuth,onPrivacy}){
  const [screen,  setScreen]  = useState("create"); // create | signin | forgot
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  function friendlyError(e){
    if(!e) return "Something went wrong. Try again.";
    const m = e.toLowerCase();
    if(m.includes("invalid login")||m.includes("invalid credentials")||m.includes("invalid email or password"))
      return "Wrong email or password. Double-check and try again.";
    if(m.includes("already registered")||m.includes("already exists"))
      return "That email already has an account — tap Sign In below.";
    if(m.includes("password"))
      return "Password must be at least 6 characters.";
    if(m.includes("email"))
      return "Please enter a valid email address.";
    if(m.includes("rate limit")||m.includes("too many"))
      return "Too many attempts. Wait a minute and try again.";
    if(m.includes("network")||m.includes("fetch"))
      return "No internet connection. Check your signal and try again.";
    return "Something went wrong. Please try again.";
  }

  // Smart create: signs up and immediately signs in — no email confirmation needed
  async function handleCreate(){
    setErr(""); setMsg("");
    if(!name.trim()){ setErr("Please enter your name."); return; }
    if(!email.trim()){ setErr("Please enter your email address."); return; }
    if(pass.length < 6){ setErr("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { display_name: name.trim() } }
    });

    if(error){ setLoading(false); setErr(friendlyError(error.message)); return; }

    // BETA: auto sign-in immediately after signup — no email confirmation step
    if(BETA_AUTO_LOGIN){
      const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });
      setLoading(false);
      if(signInError){ setErr(friendlyError(signInError.message)); return; }
      if(signInData?.user){ onAuth(signInData.user); return; }
    }

    setLoading(false);
    // Non-beta fallback: user is signed in if email confirmation is off
    if(data?.user){ onAuth(data.user); return; }
    setErr("Almost there! Check your email for a confirmation link, then come back and sign in.");
    setScreen("signin");
  }

  async function handleSignIn(){
    setErr(""); setMsg("");
    if(!email.trim()){ setErr("Please enter your email address."); return; }
    if(!pass){ setErr("Please enter your password."); return; }
    setLoading(true);
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
    setLoading(false);
    if(error){
      // If wrong password, offer reset right in the error message
      const msg = friendlyError(error.message);
      setErr(msg);
      return;
    }
    onAuth(data.user);
  }

  async function handleForgot(){
    setErr(""); setMsg("");
    if(!email.trim()){ setErr("Enter your email address above first."); return; }
    setLoading(true);
    await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    // Show helpful instructions including spam folder tip
    setMsg("Reset link sent to " + email.trim() + ". Check your inbox — and your spam/junk folder if you don't see it within 2 minutes.");
  }

  // Apple Sign In — zero friction for iOS users
  async function handleApple(){
    setErr("");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin }
    });
    if(error) setErr("Apple Sign In unavailable. Please use email instead.");
  }

  const field = {
    width:"100%", padding:"16px",
    background:"#0a1500",
    border:"1px solid rgba(123,180,80,0.25)",
    borderRadius:12, color:"#e8f0e9", fontSize:16,
    outline:"none", boxSizing:"border-box", fontFamily:"Georgia,serif"
  };

  const isApple = /iphone|ipad|ipod|mac/i.test(navigator.userAgent);

  return(
    <div style={{fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 24px 60px"}}>

      {/* Logo */}
      <div style={{textAlign:"center", marginBottom:32}}>
        <div style={{display:"inline-flex", alignItems:"center", justifyContent:"center", width:72, height:72, background:`linear-gradient(135deg,${C.green},#4a8030)`, borderRadius:20, marginBottom:14}}>
          <span style={{fontSize:36}}>⛳</span>
        </div>
        <div style={{fontSize:46, fontWeight:800, letterSpacing:-2, color:"#f0f7ec", lineHeight:1}}>Press</div>
        <div style={{fontSize:10, color:C.green, letterSpacing:4, textTransform:"uppercase", marginTop:6}}>Put Me In Your Phone</div>
      </div>

      <div style={{width:"100%", maxWidth:380}}>

        {/* ── CREATE ACCOUNT ── */}
        {screen==="create"&&(
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:"28px 24px"}}>
            <div style={{fontSize:20, fontWeight:800, marginBottom:4}}>Create your free account</div>
            <div style={{fontSize:13, color:C.muted, marginBottom:12}}>Track golf bets, rounds, and season stats.</div>

            {/* Beta notice */}
            {BETA_AUTO_LOGIN&&(
              <div style={{background:"rgba(232,184,75,0.1)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:10,padding:"8px 12px",marginBottom:16,fontSize:12,color:C.gold}}>
                ⭐ Beta — you'll be signed in automatically after creating your account.
              </div>
            )}

            {/* Apple Sign In — shown on Apple devices */}
            {isApple&&(
              <>
                <button onClick={handleApple} style={{width:"100%", padding:"16px", background:"#fff", color:"#000", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:12}}>
                  <span style={{fontSize:20}}>🍎</span> Continue with Apple
                </button>
                <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
                  <div style={{flex:1, height:1, background:C.border}}/>
                  <div style={{fontSize:12, color:C.muted}}>or use email</div>
                  <div style={{flex:1, height:1, background:C.border}}/>
                </div>
              </>
            )}

            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"
                autoComplete="name" style={field}/>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="Email address" autoCapitalize="none" autoCorrect="off"
                autoComplete="email" style={field}/>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
                placeholder="Password (6+ characters)"
                autoComplete="new-password" style={field}/>

              {err&&<div style={{background:"rgba(224,80,80,0.1)", border:"1px solid rgba(224,80,80,0.3)", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.red, lineHeight:1.5}}>{err}</div>}

              <button onClick={handleCreate} disabled={loading} style={{width:"100%", padding:"18px", background:loading?"#1a2a1a":C.green, color:loading?C.muted:"#0a1a0f", border:"none", borderRadius:12, fontSize:17, fontWeight:800, cursor:loading?"wait":"pointer", marginTop:4}}>
                {loading?"Creating account...":"Create Account →"}
              </button>
            </div>

            <div style={{textAlign:"center", marginTop:20, paddingTop:16, borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:14, color:C.muted}}>Already have an account? </span>
              <button onClick={()=>{setScreen("signin");setErr("");setMsg("");}} style={{background:"none", border:"none", color:C.green, fontSize:14, fontWeight:700, cursor:"pointer", textDecoration:"underline"}}>Sign In</button>
            </div>
          </div>
        )}

        {/* ── SIGN IN ── */}
        {screen==="signin"&&(
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:"28px 24px"}}>
            <div style={{fontSize:20, fontWeight:800, marginBottom:4}}>Welcome back</div>
            <div style={{fontSize:13, color:C.muted, marginBottom:20}}>Sign in to your Press account.</div>

            {/* Apple Sign In */}
            {isApple&&(
              <>
                <button onClick={handleApple} style={{width:"100%", padding:"16px", background:"#fff", color:"#000", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:12}}>
                  <span style={{fontSize:20}}>🍎</span> Sign in with Apple
                </button>
                <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
                  <div style={{flex:1, height:1, background:C.border}}/>
                  <div style={{fontSize:12, color:C.muted}}>or use email</div>
                  <div style={{flex:1, height:1, background:C.border}}/>
                </div>
              </>
            )}

            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="Email address" autoCapitalize="none" autoCorrect="off"
                autoComplete="email" style={field}/>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
                placeholder="Password" autoComplete="current-password" style={field}
                onKeyDown={e=>e.key==="Enter"&&handleSignIn()}/>

              {err&&(
                <div style={{background:"rgba(224,80,80,0.1)", border:"1px solid rgba(224,80,80,0.3)", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.red, lineHeight:1.5}}>
                  {err}
                  {err.includes("Wrong email or password")&&(
                    <button onClick={()=>{setScreen("forgot");setErr("");}} style={{display:"block", marginTop:8, background:"none", border:"none", color:C.gold, fontSize:13, fontWeight:700, cursor:"pointer", padding:0}}>
                      → Forgot your password?
                    </button>
                  )}
                </div>
              )}
              {msg&&<div style={{background:"rgba(123,180,80,0.1)", border:"1px solid rgba(123,180,80,0.3)", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.green, lineHeight:1.5}}>{msg}</div>}

              <button onClick={handleSignIn} disabled={loading} style={{width:"100%", padding:"18px", background:loading?"#1a2a1a":C.green, color:loading?C.muted:"#0a1a0f", border:"none", borderRadius:12, fontSize:17, fontWeight:800, cursor:loading?"wait":"pointer", marginTop:4}}>
                {loading?"Signing in...":"Sign In →"}
              </button>

              <button onClick={()=>{setScreen("forgot");setErr("");setMsg("");}} style={{background:"none", border:"none", color:C.muted, fontSize:13, cursor:"pointer", textAlign:"center"}}>
                Forgot your password?
              </button>
            </div>

            <div style={{textAlign:"center", marginTop:20, paddingTop:16, borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:14, color:C.muted}}>New to Press? </span>
              <button onClick={()=>{setScreen("create");setErr("");setMsg("");}} style={{background:"none", border:"none", color:C.green, fontSize:14, fontWeight:700, cursor:"pointer", textDecoration:"underline"}}>Create Account</button>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {screen==="forgot"&&(
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:"28px 24px"}}>
            <div style={{fontSize:20, fontWeight:800, marginBottom:4}}>Reset your password</div>
            <div style={{fontSize:13, color:C.muted, marginBottom:20}}>
              We'll email you a link to set a new password.
            </div>

            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="Your email address" autoCapitalize="none" autoCorrect="off"
                style={field}/>

              {err&&<div style={{background:"rgba(224,80,80,0.1)", border:"1px solid rgba(224,80,80,0.3)", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.red, lineHeight:1.5}}>{err}</div>}
              {msg&&(
                <div style={{background:"rgba(123,180,80,0.1)", border:"1px solid rgba(123,180,80,0.3)", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.green, lineHeight:1.6}}>
                  {msg}
                  <div style={{marginTop:10, paddingTop:10, borderTop:"1px solid rgba(123,180,80,0.2)", fontSize:12, color:C.muted}}>
                    📱 On iPhone: check your Mail app Junk folder or VIP inbox.<br/>
                    📧 On Gmail: check Spam or Promotions tab.
                  </div>
                </div>
              )}

              <button onClick={handleForgot} disabled={loading||!!msg} style={{width:"100%", padding:"18px", background:loading||msg?"#1a2a1a":C.green, color:loading||msg?C.muted:"#0a1a0f", border:"none", borderRadius:12, fontSize:17, fontWeight:800, cursor:loading||msg?"default":"pointer", marginTop:4}}>
                {loading?"Sending...":msg?"Link Sent ✓":"Send Reset Link →"}
              </button>
            </div>

            <div style={{textAlign:"center", marginTop:20, paddingTop:16, borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>{setScreen("signin");setErr("");setMsg("");}} style={{background:"none", border:"none", color:C.green, fontSize:14, fontWeight:700, cursor:"pointer", textDecoration:"underline"}}>← Back to Sign In</button>
            </div>
          </div>
        )}

        <div style={{marginTop:16, fontSize:11, color:C.dim, textAlign:"center"}}>
          Your data is private and secure.<br/>
          <button onClick={onPrivacy} style={{background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", textDecoration:"underline", marginTop:4}}>Privacy Policy & Terms</button>
        </div>
      </div>
    </div>
  );
}

// ── ACCEPT INVITE ─────────────────────────────────────────────────────────────
function AcceptInviteScreen({code,user}){
  const [status,setStatus]=useState("loading");
  const [invite,setInvite]=useState(null);
  useEffect(()=>{
    async function check(){
      const{data}=await sb.from("invites").select("*").eq("code",code).single();
      if(!data){setStatus("invalid");return;}
      if(data.accepted){setStatus("used");return;}
      if(data.owner_id===user.id){setStatus("own");return;}
      setInvite(data);setStatus("ready");
    }
    check();
  },[code,user.id]);

  async function accept(){
    setStatus("accepting");
    await sb.from("invites").update({accepted:true,invitee_id:user.id,invitee_email:user.email}).eq("code",code);
    await sb.from("players").update({linked_user_id:user.id,linked_email:user.email}).eq("id",invite.player_id);
    await sb.from("notifications").insert({user_id:invite.owner_id,type:"invite_accepted",title:"Invite Accepted! 🔗",body:`${user.user_metadata?.display_name||user.email} accepted your invite.`,data:{player_id:invite.player_id}});
    setStatus("done");
  }

  return(
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>⛳</div>
      <div style={{fontSize:32,fontWeight:800,color:C.green,marginBottom:20}}>Press</div>
      {status==="loading"&&<Spinner/>}
      {status==="invalid"&&<div style={{color:C.red,fontSize:16}}>Invalid invite link.</div>}
      {status==="used"&&<div style={{color:C.muted,fontSize:16}}>This invite has already been used.</div>}
      {status==="own"&&<div style={{color:C.muted,fontSize:16}}>You can't accept your own invite!</div>}
      {status==="ready"&&invite&&(<div style={{textAlign:"center",maxWidth:320,width:"100%"}}><div style={{fontSize:18,fontWeight:600,marginBottom:8}}>You've been invited!</div><div style={{color:C.muted,fontSize:14,marginBottom:24}}>Accept to share your golf ledger and track bets together.</div><BigBtn onClick={accept}>Accept Invite ✓</BigBtn></div>)}
      {status==="accepting"&&<Spinner/>}
      {status==="done"&&(<div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:600,color:C.green,marginBottom:8}}>You're linked! ✅</div><div style={{color:C.muted,fontSize:14,marginBottom:24}}>Your golf ledger is now shared.</div><BigBtn onClick={()=>window.location.href="/"}>Open Press</BigBtn></div>)}
    </div>
  );
}

// ── SET NEW PASSWORD (after clicking reset link) ──────────────────────────────
function SetNewPasswordScreen({onDone}){
  const[pass,setPass]=useState("");
  const[confirm,setConfirm]=useState("");
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");
  const[done,setDone]=useState(false);

  async function handleSet(){
    setErr("");
    if(pass.length<6){setErr("Password must be at least 6 characters.");return;}
    if(pass!==confirm){setErr("Passwords don't match.");return;}
    setLoading(true);
    const{error}=await sb.auth.updateUser({password:pass});
    setLoading(false);
    if(error){setErr("Something went wrong: "+error.message);return;}
    setDone(true);
    setTimeout(()=>onDone(),1800);
  }

  const field={width:"100%",padding:"16px",background:"#0a1500",border:"1px solid rgba(123,180,80,0.25)",borderRadius:12,color:"#e8f0e9",fontSize:16,outline:"none",boxSizing:"border-box",fontFamily:"Georgia,serif"};

  return(
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,background:`linear-gradient(135deg,${C.green},#4a8030)`,borderRadius:20,marginBottom:14,boxShadow:`0 4px 24px ${C.green}44`}}>
          <span style={{fontSize:36}}>⛳</span>
        </div>
        <div style={{fontSize:36,fontWeight:800,letterSpacing:-2,color:"#f0f7ec",lineHeight:1}}>Press</div>
      </div>

      <div style={{width:"100%",maxWidth:380,background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"28px 24px"}}>
        {done?(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>✅</div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Password updated!</div>
            <div style={{fontSize:14,color:C.muted}}>Taking you to Press...</div>
          </div>
        ):(
          <>
            <div style={{fontSize:20,fontWeight:800,marginBottom:6}}>Set New Password</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:24}}>Choose a password you'll use to sign in to Press.</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <input
                type="password" value={pass} onChange={e=>setPass(e.target.value)}
                placeholder="New password (6+ characters)"
                autoComplete="new-password" style={field}
              />
              <input
                type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password" style={field}
                onKeyDown={e=>e.key==="Enter"&&handleSet()}
              />
              {err&&<div style={{background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.3)",borderRadius:10,padding:"12px 14px",fontSize:14,color:C.red,lineHeight:1.5}}>{err}</div>}
              <button
                onClick={handleSet} disabled={loading}
                style={{width:"100%",padding:"16px",background:loading?"#1a2a1a":C.green,color:loading?C.muted:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:loading?"not-allowed":"pointer",fontFamily:"Georgia,serif"}}>
                {loading?"Saving...":"Set Password & Sign In"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [showPaywall,setShowPaywall]=useState(false);
  const [isPro,setIsPro]=useState(false);
  const [showProInfo,setShowProInfo]=useState(false);
  const [stripeSaving,setStripeSaving]=useState(false);
  const [needsNewPassword,setNeedsNewPassword]=useState(false);

  const urlParams   = new URLSearchParams(window.location.search);
  const inviteCode  = urlParams.get("invite");
  const roundParam  = urlParams.get("round");
  const playerParam = urlParams.get("player");

  // Read tourney params — check URL first, then localStorage fallback for iOS PWA
  // iOS strips URL params when launching a PWA from a link; index.html saves them first
  const _urlTourney = urlParams.get("tourney");
  const _urlTeam    = urlParams.get("team");
  const _urlSpec    = urlParams.get("spectate");
  const _linkParams = (()=>{ try{ const s=localStorage.getItem("press_link_params"); if(s){ const p=JSON.parse(s); const age=Date.now()-p.savedAt; if(age<24*60*60*1000) return p; } }catch(e){} return null; })();
  const tourneyId   = _urlTourney || _linkParams?.tourney || null;
  const tourneyTeam = _urlTeam    || _linkParams?.team    || null;
  const spectate    = _urlSpec    || _linkParams?.spectate|| null;

  // Initialize from URL directly so captain links work on first render
  const [tourneyView,       setTourneyView]       = useState(()=>tourneyId?"join":null);
  const [tourneyData,       setTourneyData]       = useState(null);
  const [tourneyCaptainIdx, setTourneyCaptainIdx] = useState(null);
  const [captainLoading,    setCaptainLoading]    = useState(false);

  // Watch for captain link params — set tourneyView="join" whenever tourneyId present
  // This handles: fresh load, PWA foreground, and Android link interception
  useEffect(()=>{
    if(tourneyId) {
      setTourneyView("join");
      return;
    }
    // Check if captain has a saved session
    try {
      const saved = localStorage.getItem("press_captain_session");
      if(saved){
        const {tid, tidx, savedAt} = JSON.parse(saved);
        // Sessions expire after 24 hours
        const age = Date.now() - savedAt;
        if(tid && tidx !== undefined && age < 24*60*60*1000){
          setCaptainLoading(true);
          sb.from("team_tournaments").select("*").eq("id",tid).single().then(({data})=>{
            setCaptainLoading(false);
            if(data && data.status !== "deleted"){
              setTourneyData(data);
              setTourneyCaptainIdx(tidx);
              setTourneyView("captain_resume"); // show resume prompt, not auto-jump
            } else {
              localStorage.removeItem("press_captain_session");
            }
          });
        }
      }
    } catch(e){ localStorage.removeItem("press_captain_session"); }
  },[tourneyId]);
  const stripeSuccess=urlParams.get("stripe")==="success";

  useEffect(()=>{
    sb.auth.getSession().then(({data})=>{
      setUser(data.session?.user??null);
      setLoading(false);
    });
    const{data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"){
        // User clicked the reset link — they're temporarily signed in
        // but need to set a new password before proceeding
        setUser(session?.user??null);
        setNeedsNewPassword(true);
        setLoading(false);
      } else {
        setUser(session?.user??null);
      }
    });
    return()=>subscription.unsubscribe();
  },[]);

  // Check Pro status
  useEffect(()=>{
    if(!user)return;
    async function checkPro(){
      const{data}=await sb.from("profiles").select("is_pro,stripe_customer_id").eq("id",user.id).single();
      if(data?.is_pro)setIsPro(true);
      // If returning from Stripe success
      if(stripeSuccess&&!data?.is_pro){
        await sb.from("profiles").update({is_pro:true}).eq("id",user.id);
        setIsPro(true);
        window.history.replaceState({},"","/");
      }
    }
    checkPro();
  },[user,stripeSuccess]);

  async function handleUpgrade(){
    setStripeSaving(true);
    try{
      const stripe=await loadStripe(STRIPE_PK);
      await stripe.redirectToCheckout({
        lineItems:[{price:PRICE_ID,quantity:1}],
        mode:"subscription",
        successUrl:`${APP_URL}?stripe=success`,
        cancelUrl:`${APP_URL}?stripe=cancelled`,
        customerEmail:user?.email,
      });
    }catch(e){
      console.error(e);
      setStripeSaving(false);
    }
  }

  // Captain/Spectator links -- NO LOGIN REQUIRED (no account needed)
  // Must be above the auth wall so captains don't need a Press account
  if(tourneyView==="join"){
    return <TourneyLoader
      tourneyId={tourneyId}
      teamIdx={tourneyTeam!==null&&tourneyTeam!==undefined?parseInt(tourneyTeam):null}
      isSpectator={spectate==="1"}
      onBack={()=>{
        // If URL has tourney params, we have nowhere to go back to — just reload clean
        window.location.href="/";
      }}
      onCaptain={(t,idx)=>{
        // Save captain session and clear the link params (consumed)
        try{
          localStorage.setItem("press_captain_session",JSON.stringify({tid:t.id,tidx:idx,savedAt:Date.now()}));
          localStorage.removeItem("press_link_params");
        }catch(e){}
        setTourneyData(t);setTourneyCaptainIdx(idx);setTourneyView("captain");
      }}
      onSpectator={(t)=>{setTourneyData(t);setTourneyView("spectator");}}
    />;
  }
  if(tourneyView==="captain"){
    return <TourneyCaptain tourney={tourneyData} teamIdx={tourneyCaptainIdx}
      onBack={()=>{
        // Go to resume prompt rather than wiping state — captain may want to return
        setTourneyView("captain_resume");
      }}/>;
  }
  if(tourneyView==="spectator"){
    return <TourneySpectator tourney={tourneyData}
      onBack={()=>{setTourneyView(null);window.history.replaceState({},"","/");}}/>;
  }


  // Captain loading from localStorage restore
  if(captainLoading) return(
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:"#080f0a",color:"#e8f0e9",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"3px solid #1e2f20",borderTop:"3px solid #7bb450",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{color:"#6b7f6d",fontSize:14}}>Restoring your tournament...</div>
    </div>
  );

  // Captain resume prompt — shown when app opens and saved session found
  if(tourneyView==="captain_resume"&&tourneyData){
    const team=(tourneyData.teams||[])[tourneyCaptainIdx];
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:"#080f0a",color:"#e8f0e9",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{fontSize:48,marginBottom:16}}>⛳</div>
        <div style={{fontSize:22,fontWeight:800,marginBottom:6,textAlign:"center"}}>Tournament In Progress</div>
        <div style={{fontSize:14,color:"#6b7f6d",marginBottom:4,textAlign:"center"}}>{tourneyData.name}</div>
        <div style={{fontSize:13,color:"#e8b84b",marginBottom:32,textAlign:"center"}}>{team?.name||"Your Team"} · Hole {tourneyData.current_hole||1}</div>
        <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>setTourneyView("captain")} style={{width:"100%",padding:"18px",background:"#7bb450",color:"#0a1a0f",border:"none",borderRadius:14,fontSize:17,fontWeight:800,cursor:"pointer"}}>
            ▶ Resume Scoring
          </button>
          <button onClick={()=>{localStorage.removeItem("press_captain_session");window.location.href="/";}} style={{width:"100%",padding:"14px",background:"transparent",color:"#6b7f6d",border:"1px solid rgba(123,180,80,0.2)",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            Not my tournament
          </button>
        </div>
      </div>
    );
  }

    if(loading)return(<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}><div style={{fontSize:46,fontWeight:800,color:C.green,letterSpacing:-2}}>Press</div><Spinner/></div>);
  if(showPrivacy)return <PrivacyPolicy onBack={()=>setShowPrivacy(false)}/>;
  if(showPaywall)return <ProPaywall onBack={()=>setShowPaywall(false)} onUpgrade={handleUpgrade} saving={stripeSaving}/>;
  if(showProInfo)return <ProInfo onBack={()=>setShowProInfo(false)} isPro={isPro} onUpgrade={()=>{setShowProInfo(false);setShowPaywall(true);}}/>;

  // Opponent score entry — no login required, anyone with the link can score
  if(roundParam && playerParam) return <OpponentScoreEntry roundId={roundParam} playerId={playerParam} onBack={()=>window.location.href="/"}/>;

  if(!user)return <AuthScreen onAuth={setUser} onPrivacy={()=>setShowPrivacy(true)}/>;

  // PASSWORD RECOVERY -- user clicked reset link, needs to set a new password
  if(needsNewPassword) return <SetNewPasswordScreen onDone={()=>setNeedsNewPassword(false)}/>;


  // [tourney views moved above auth wall — see below]

  if(inviteCode)return <AcceptInviteScreen code={inviteCode} user={user}/>;
  return <Press user={user} onSignOut={()=>sb.auth.signOut()} onPrivacy={()=>setShowPrivacy(true)} onUpgrade={()=>setShowPaywall(true)} onShowProInfo={()=>setShowProInfo(true)} isPro={isPro} setIsPro={setIsPro}/>;
}

// ── PRESS APP ─────────────────────────────────────────────────────────────────
function Press({user,onSignOut,onPrivacy,onUpgrade,onShowProInfo,isPro,setIsPro}){
  const today=new Date().toISOString().slice(0,10);
  const [players,setPlayers]=useState([]);
  const [rounds,setRounds]=useState([]);
  const [bets,setBets]=useState([]);
  const [settlements,setSettlements]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [activeTab,setActiveTab]=useState("home"); // home | alerts | profile
  const [archivedRounds,setArchivedRounds]=useState([]);
  const [archivedBets,setArchivedBets]=useState([]);
  const [cancelRequests,setCancelRequests]=useState([]);
  const [strokeRequests,setStrokeRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState({msg:"",error:false});
  const [view,setView]=useState("roster"); // roster | profile | liveround | tournament
  const [activeRound,   setActiveRound]   = useState(null);
  const [opponentRound, setOpponentRound] = useState(null); // rounds where user is a linked opponent
  const [activeTourney, setActiveTourney]=useState(null); // active team tournament
  const [pid,setPid]=useState(null);
  const [ptab,setPtab]=useState("overview");
  const [sheet,setSheet]=useState(null);
  const [inviteLink,setInviteLink]=useState("");
  const [invitePhone,setInvitePhone]=useState("");
  const [partialAmt,setPartialAmt]=useState("");
  const [strokeSuggest,setStrokeSuggest]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [deleteInput,setDeleteInput]=useState("");
  const [confirmDeleteSettle,setConfirmDeleteSettle]=useState(null);
  const [confirmReset,setConfirmReset]=useState(false);
  const [disputeItem,setDisputeItem]=useState(null);
  const [disputeAmt,setDisputeAmt]=useState("");
  const [disputeReason,setDisputeReason]=useState("");
  const [showNotifs,setShowNotifs]=useState(false);
  const [nName,setNName]=useState(""); const [nDir,setNDir]=useState("even"); const [nStr,setNStr]=useState("1");
  const [fDate,setFDate]=useState(today); const [fDir,setFDir]=useState("received"); const [fStr,setFStr]=useState("1"); const [fMoney,setFMoney]=useState(""); const [fNotes,setFNotes]=useState(""); const [fWon,setFWon]=useState(true);
  const [bDate,setBDate]=useState(today); const [bType,setBType]=useState(BET_TYPES[0]); const [bAmt,setBAmt]=useState(""); const [bNotes,setBNotes]=useState(""); const [bWon,setBWon]=useState(true);
  const [eDir,setEDir]=useState("even"); const [eStr,setEStr]=useState("1");
  const [installPrompt,setInstallPrompt]=useState(null);
  const [showInstall,setShowInstall]=useState(false);
  const [isIOS]=useState(()=>/iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isInstalled]=useState(()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true);

  useEffect(()=>{
    const handler=(e)=>{e.preventDefault();setInstallPrompt(e);if(!isInstalled)setShowInstall(true);};
    window.addEventListener("beforeinstallprompt",handler);
    if(isIOS&&!isInstalled)setShowInstall(true);
    return()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);

  async function handleInstall(){
    if(installPrompt){
      installPrompt.prompt();
      const r=await installPrompt.userChoice;
      if(r.outcome==="accepted"){setShowInstall(false);setInstallPrompt(null);}
    }
  }

  function t2(msg,error=false){setToast({msg,error});setTimeout(()=>setToast({msg:"",error:false}),2400);}

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const[p,r,b,s,n,ar,ab,cr,sr]=await Promise.all([
      sb.from("players").select("*").eq("owner_id",user.id).order("created_at"),
      sb.from("rounds").select("*").eq("owner_id",user.id).eq("cancelled",false).order("date",{ascending:false}),
      sb.from("bets").select("*").eq("owner_id",user.id).eq("cancelled",false).order("date",{ascending:false}),
      sb.from("settlements").select("*").eq("owner_id",user.id).order("date",{ascending:false}),
      sb.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50),
      sb.from("archived_rounds").select("*").eq("owner_id",user.id).order("archived_at",{ascending:false}),
      sb.from("archived_bets").select("*").eq("owner_id",user.id).order("archived_at",{ascending:false}),
      sb.from("cancel_requests").select("*").or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`).eq("status","pending"),
      sb.from("stroke_requests").select("*").or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`).eq("status","pending"),
    ]);
    if(p.data)setPlayers(p.data); if(r.data)setRounds(r.data);
    if(b.data)setBets(b.data); if(s.data)setSettlements(s.data);
    if(n.data)setNotifications(n.data);
    if(ar.data)setArchivedRounds(ar.data); if(ab.data)setArchivedBets(ab.data);
    if(cr.data)setCancelRequests(cr.data);
    if(sr.data)setStrokeRequests(sr.data);

    // Fetch active team tournament — include recent setup ones that may have scores
    // (guards against status corruption bug where leaderboard visit reset status to "setup")
    const{data:atData}=await sb.from("team_tournaments")
      .select("id,name,course_id,current_hole,teams,director_code,status")
      .eq("owner_id",user.id)
      .in("status",["active","setup"])
      .order("updated_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    // Only show in banner if it has scores OR is already active
    const hasScores=(atData?.teams||[]).some(t=>Object.keys(t?.scores||{}).length>0);
    setActiveTourney((atData?.status==="active"||hasScores)?atData:null);
    setLoading(false);
  },[user.id]);

  useEffect(()=>{loadAll();},[loadAll]);

  // Check for active live round
  useEffect(()=>{
    async function checkActiveRound(){
      // Rounds I created
      const{data}=await sb.from("live_rounds")
        .select("id,course_name,opponents,current_hole,updated_at")
        .eq("owner_id",user.id)
        .eq("status","active")
        .order("updated_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(data)setActiveRound(data);
      else setActiveRound(null);

      // Rounds I'm a linked opponent in (Ken's view after creating account)
      try {
        const{data:oppData}=await sb.from("live_rounds")
          .select("id,course_name,opponents,current_hole,updated_at")
          .eq("status","active")
          .neq("owner_id",user.id)          // never show rounds I created
          .contains("opponent_user_ids",[user.id])
          .order("updated_at",{ascending:false})
          .limit(1)
          .maybeSingle();
        setOpponentRound(oppData||null);
      } catch(e) {
        // Column may not exist yet — silent fail
        setOpponentRound(null);
      }
    }
    checkActiveRound();
  },[user.id,view]);

  const player=players.find(p=>p.id===pid);
  const pRounds=rounds.filter(r=>r.player_id===pid);
  const pBets=bets.filter(b=>b.player_id===pid);
  const pSettle=settlements.filter(s=>s.player_id===pid);
  const pArchR=archivedRounds.filter(r=>r.player_id===pid);
  const pArchB=archivedBets.filter(b=>b.player_id===pid);
  const pHistory=[...pRounds.map(r=>({...r,kind:"round"})),...pBets.map(b=>({...b,kind:"bet"})),...pArchR.map(r=>({...r,kind:"archived_round"})),...pArchB.map(b=>({...b,kind:"archived_bet"}))].sort((a,b)=>(b.date||b.archived_at||"").localeCompare(a.date||a.archived_at||""));

  const unreadNotifs=notifications.filter(n=>!n.read).length;
  const pendingActions=cancelRequests.filter(r=>r.responder_id===user.id).length+strokeRequests.filter(s=>s.responder_id===user.id).length;
  const sRound=players.reduce((s,p)=>s+(p.round_money||0),0);
  const sBet=players.reduce((s,p)=>s+(p.bet_money||0),0);
  const sBank=players.reduce((s,p)=>s+(p.bank||0),0);

  // Pro gate check
  function requirePro(action){
    if(isPro){action();return;}
    onUpgrade();
  }

  function goProfile(id){setPid(id);setPtab("overview");setView("profile");}
  function goRoster(){setView("roster");setPid(null);}

  async function addPlayer(){
    const name=nName.trim();
    if(!name){t2("Enter a name.",true);return;}
    if(players.find(p=>p.name.toLowerCase()===name.toLowerCase())){t2("Already exists.",true);return;}
    // Free tier limit
    if(!isPro&&players.length>=FREE_PLAYER_LIMIT){
      setSheet(null);
      onUpgrade();
      return;
    }
    const st=nDir==="even"?0:nDir==="received"?-Math.abs(Number(nStr)):Math.abs(Number(nStr));
    setSaving(true);
    const{data,error}=await sb.from("players").insert({owner_id:user.id,name,strokes:st,round_money:0,bet_money:0,bank:0,season:CURRENT_SEASON}).select().single();
    setSaving(false);
    if(error){t2("Error saving.",true);return;}
    setPlayers(prev=>[...prev,data]);
    setNName("");setNDir("even");setNStr("1");
    setSheet(null);t2(`${name} added!`);
  }

  async function logRound(){
    if(!player)return;
    const st=fDir==="received"?-Math.abs(Number(fStr)):Math.abs(Number(fStr));
    const rawAmt=Math.abs(Number(fMoney)||0);
    const amt=fWon?rawAmt:-rawAmt;
    setSaving(true);
    const{data:rd,error:re}=await sb.from("rounds").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:fDate,strokes:st,money:amt,notes:fNotes,season:CURRENT_SEASON}).select().single();
    if(re){setSaving(false);t2("Error saving.",true);return;}
    const{data:pd}=await sb.from("players").update({round_money:(player.round_money||0)+amt,bank:(player.bank||0)+amt}).eq("id",player.id).select().single();
    setSaving(false);
    setRounds(prev=>[rd,...prev]);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setFDate(today);setFDir("received");setFStr("1");setFMoney("");setFNotes("");setFWon(true);
    setSheet(null);t2("Round logged!");
    if(amt!==0){
      const currentStrokes=player.strokes||0;
      const iWon=amt>0;
      const suggested=iWon?currentStrokes+1:currentStrokes-1;
      const currentLabel=currentStrokes===0?"Even":currentStrokes<0?`You receive ${Math.abs(currentStrokes)}`:`You give ${currentStrokes}`;
      const suggestedLabel=suggested===0?"Even":suggested<0?`You receive ${Math.abs(suggested)}`:`You give ${suggested}`;
      setStrokeSuggest({current:currentStrokes,suggested,currentLabel,suggestedLabel,playerId:player.id,playerName:player.name,iWon,linked:!!player.linked_user_id,linkedUserId:player.linked_user_id});
    }
  }

  async function logBet(){
    if(!player)return;
    const rawAmt=Math.abs(Number(bAmt)||0);
    const amt=bWon?rawAmt:-rawAmt;
    if(rawAmt===0){t2("Enter an amount.",true);return;}
    setSaving(true);
    const{data:bd,error:be}=await sb.from("bets").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:bDate,type:bType,amount:amt,notes:bNotes,season:CURRENT_SEASON}).select().single();
    if(be){setSaving(false);t2("Error saving.",true);return;}
    const{data:pd}=await sb.from("players").update({bet_money:(player.bet_money||0)+amt,bank:(player.bank||0)+amt}).eq("id",player.id).select().single();
    setSaving(false);
    setBets(prev=>[bd,...prev]);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setBDate(today);setBType(BET_TYPES[0]);setBAmt("");setBNotes("");setBWon(true);
    setSheet(null);t2("Side bet logged!");
  }

  function handleDeleteTap(item){
    setDeleteInput("");
    if(player?.linked_user_id){requestCancel(item);}
    else{setConfirmDelete(item);}
  }

  async function requestCancel(item){
    if(!player)return;
    const isRound=item.kind==="round";
    if(player.linked_user_id){
      const paidSoFar=pSettle.reduce((s,x)=>s+(x.amount||0),0);
      setSaving(true);
      await sb.from(isRound?"rounds":"bets").update({cancel_requested:true}).eq("id",item.id);
      await sb.from("cancel_requests").insert({requester_id:user.id,responder_id:player.linked_user_id,player_id:player.id,item_type:isRound?"round":"bet",item_id:item.id,item_date:item.date,item_amount:isRound?item.money:item.amount,item_notes:item.notes,paid_so_far:paidSoFar});
      await sb.from("notifications").insert({user_id:player.linked_user_id,type:"cancel_request",title:`Cancel request from ${user.user_metadata?.display_name||user.email}`,body:`Wants to cancel ${isRound?"round":"bet"} on ${item.date}`,data:{player_id:player.id,item_id:item.id}});
      setSaving(false);
      t2("Cancel request sent.");await loadAll();
    } else {
      const adjustBalance=(player.bank||0)!==0;
      await archiveAndDelete(item,adjustBalance);
    }
  }

  async function archiveAndDelete(item,adjustBalance=true){
    const isRound=item.kind==="round"||item.kind==="archived_round";
    if(isRound){
      await sb.from("archived_rounds").insert({original_id:item.id,owner_id:user.id,player_id:item.player_id,player_name:item.player_name,date:item.date,strokes:item.strokes,money:item.money,notes:item.notes,archive_reason:"cancelled",archived_by:user.id});
      await sb.from("rounds").delete().eq("id",item.id);
      if(adjustBalance){
        const{data:pd}=await sb.from("players").update({round_money:(player.round_money||0)-item.money,bank:(player.bank||0)-item.money}).eq("id",player.id).select().single();
        if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
      }
      setRounds(prev=>prev.filter(x=>x.id!==item.id));
    } else {
      await sb.from("archived_bets").insert({original_id:item.id,owner_id:user.id,player_id:item.player_id,player_name:item.player_name,date:item.date,type:item.type,amount:item.amount,notes:item.notes,archive_reason:"cancelled",archived_by:user.id});
      await sb.from("bets").delete().eq("id",item.id);
      if(adjustBalance){
        const{data:pd}=await sb.from("players").update({bet_money:(player.bet_money||0)-item.amount,bank:(player.bank||0)-item.amount}).eq("id",player.id).select().single();
        if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
      }
      setBets(prev=>prev.filter(x=>x.id!==item.id));
    }
    t2("Entry archived.");await loadAll();
  }

  async function respondToCancel(req,approve){
    setSaving(true);
    await sb.from("cancel_requests").update({status:approve?"approved":"denied",resolved_at:new Date().toISOString()}).eq("id",req.id);
    if(approve){
      await sb.from(req.item_type==="round"?"rounds":"bets").update({cancelled:true,cancel_requested:false}).eq("id",req.item_id);
      if(req.item_type==="round"){await sb.from("archived_rounds").insert({original_id:req.item_id,owner_id:user.id,player_id:req.player_id,player_name:player?.name||"",date:req.item_date,money:req.item_amount,notes:req.item_notes,archive_reason:"cancelled",archived_by:user.id});}
      else{await sb.from("archived_bets").insert({original_id:req.item_id,owner_id:user.id,player_id:req.player_id,player_name:player?.name||"",date:req.item_date,amount:req.item_amount,notes:req.item_notes,archive_reason:"cancelled",archived_by:user.id});}
      const adj=-(req.item_amount||0);
      await sb.from("players").update({bank:(player?.bank||0)+adj}).eq("id",req.player_id);
    }
    await sb.from("notifications").insert({user_id:req.requester_id,type:approve?"cancel_approved":"cancel_denied",title:approve?"Cancel Approved ✅":"Cancel Denied ❌",body:`Your cancel request for ${req.item_date} was ${approve?"approved":"denied"}.`,data:{player_id:req.player_id}});
    setSaving(false);t2(approve?"Cancelled.":"Denied.");await loadAll();
  }

  async function submitDispute(){
    if(!disputeItem||!player)return;
    const isRound=disputeItem.kind==="round";
    const original=isRound?disputeItem.money:disputeItem.amount;
    const proposed=Number(disputeAmt);
    if(!proposed||proposed===Math.abs(original)){t2("Enter a different amount.",true);return;}
    setSaving(true);
    await sb.from("disputes").insert({requester_id:user.id,responder_id:player.linked_user_id,player_id:player.id,item_type:isRound?"round":"bet",item_id:disputeItem.id,original_amount:original,proposed_amount:original>0?proposed:-proposed,reason:disputeReason});
    await sb.from("notifications").insert({user_id:player.linked_user_id,type:"dispute",title:`Amount disputed`,body:`${disputeItem.date} · Original: $${Math.abs(original).toFixed(2)} → Proposed: $${proposed.toFixed(2)}`,data:{player_id:player.id}});
    setSaving(false);setSheet(null);setDisputeItem(null);setDisputeAmt("");setDisputeReason("");
    t2("Dispute submitted.");await loadAll();
  }

  async function openEditStrokes(){
    if(!player)return;
    if(player.strokes===0){setEDir("even");setEStr("1");}
    else if(player.strokes<0){setEDir("received");setEStr(String(Math.abs(player.strokes)));}
    else{setEDir("gave");setEStr(String(player.strokes));}
    setSheet("editStrokes");
  }

  async function saveStrokes(){
    const st=eDir==="even"?0:eDir==="received"?-Math.abs(Number(eStr)):Math.abs(Number(eStr));
    if(player.linked_user_id){
      setSaving(true);
      await sb.from("stroke_requests").insert({requester_id:user.id,responder_id:player.linked_user_id,player_id:player.id,current_strokes:player.strokes,proposed_strokes:st});
      await sb.from("notifications").insert({user_id:player.linked_user_id,type:"stroke_change_request",title:"Stroke change requested",body:`From ${player.strokes===0?"Even":Math.abs(player.strokes)+" strokes"} → ${st===0?"Even":Math.abs(st)+" strokes"}`,data:{player_id:player.id}});
      setSaving(false);setSheet(null);t2("Request sent.");
    } else {
      setSaving(true);
      const{data:pd}=await sb.from("players").update({strokes:st}).eq("id",pid).select().single();
      setSaving(false);
      if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
      setSheet(null);t2("Strokes updated.");
    }
  }

  async function applyStrokeChange(){
    if(!strokeSuggest)return;
    if(strokeSuggest.linked&&strokeSuggest.linkedUserId){
      await sb.from("stroke_requests").insert({requester_id:user.id,responder_id:strokeSuggest.linkedUserId,player_id:strokeSuggest.playerId,current_strokes:strokeSuggest.current,proposed_strokes:strokeSuggest.suggested});
      await sb.from("notifications").insert({user_id:strokeSuggest.linkedUserId,type:"stroke_change_request",title:"Stroke adjustment after round",body:`Proposed: ${strokeSuggest.suggestedLabel}`,data:{player_id:strokeSuggest.playerId}});
      setStrokeSuggest(null);t2("Request sent!");
    } else {
      await sb.from("players").update({strokes:strokeSuggest.suggested}).eq("id",strokeSuggest.playerId);
      setPlayers(prev=>prev.map(p=>p.id===strokeSuggest.playerId?{...p,strokes:strokeSuggest.suggested}:p));
      setStrokeSuggest(null);t2("Strokes updated!");
    }
  }

  async function respondToStrokeRequest(req,approve){
    setSaving(true);
    await sb.from("stroke_requests").update({status:approve?"approved":"denied",resolved_at:new Date().toISOString()}).eq("id",req.id);
    if(approve){
      await sb.from("players").update({strokes:req.proposed_strokes}).eq("id",req.player_id);
      setPlayers(prev=>prev.map(p=>p.id===req.player_id?{...p,strokes:req.proposed_strokes}:p));
    }
    await sb.from("notifications").insert({user_id:req.requester_id,type:approve?"stroke_approved":"stroke_denied",title:approve?"Stroke Change Approved ✅":"Stroke Change Denied ❌",body:approve?"Handicap updated.":"Change denied.",data:{player_id:req.player_id}});
    setSaving(false);t2(approve?"Strokes updated!":"Denied.");await loadAll();
  }

  async function settleUp(customAmt){
    if(!player||player.bank===0){t2("Already even!");setSheet(null);return;}
    const fullAmt=player.bank;
    const payAmt=customAmt!==undefined?customAmt:fullAmt;
    if(payAmt===0){t2("Enter an amount.");return;}
    const remaining=parseFloat((fullAmt-payAmt).toFixed(2));
    setSaving(true);
    await sb.from("settlements").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:today,amount:payAmt,round_snapshot:player.round_money,bet_snapshot:player.bet_money});
    const{data:pd}=await sb.from("players").update({bank:remaining,round_money:remaining<=0?0:player.round_money,bet_money:remaining<=0?0:player.bet_money}).eq("id",player.id).select().single();
    if(player.linked_user_id){
      await sb.from("notifications").insert({user_id:player.linked_user_id,type:"settlement",title:"Payment recorded 💰",body:`$${Math.abs(payAmt).toFixed(2)} settled. ${remaining!==0?`$${Math.abs(remaining).toFixed(2)} remaining.`:"All square!"}`,data:{player_id:player.id}});
    }
    setSaving(false);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setPartialAmt("");await loadAll();setSheet(null);
    t2(payAmt>0?`Collected $${Math.abs(payAmt).toFixed(2)}!`:`Paid $${Math.abs(payAmt).toFixed(2)}!`);
  }

  async function deleteSettlement(s){
    setSaving(true);
    await sb.from("settlements").delete().eq("id",s.id);
    setSettlements(prev=>prev.filter(x=>x.id!==s.id));
    setSaving(false);
    setConfirmDeleteSettle(null);
    setDeleteInput("");
    t2("Settlement deleted.");
    await loadAll();
  }

  async function generateInvite(){
    if(!player)return;
    requirePro(async()=>{
      setSaving(true);
      const code=genCode();
      await sb.from("invites").insert({owner_id:user.id,player_id:player.id,player_name:player.name,code});
      const link=`${APP_URL}?invite=${code}`;
      setInviteLink(link);setSaving(false);
      try{await navigator.clipboard.writeText(link);t2("Invite link copied!");}
      catch{t2("Invite link generated!");}
      setSheet("invite");
    });
  }

  async function removePlayer(){
    if((player?.bank||0)!==0){t2("Settle up before removing.",true);return;}
    setSaving(true);
    await sb.from("players").delete().eq("id",pid);
    setSaving(false);
    setPlayers(prev=>prev.filter(p=>p.id!==pid));
    setRounds(prev=>prev.filter(r=>r.player_id!==pid));
    setBets(prev=>prev.filter(b=>b.player_id!==pid));
    goRoster();t2("Player removed.");
  }

  async function seasonReset(){
    if(!player)return;
    if((player?.bank||0)!==0){t2("Settle up first.",true);return;}
    setSaving(true);
    for(const r of pRounds){
      await sb.from("archived_rounds").insert({original_id:r.id,owner_id:user.id,player_id:r.player_id,player_name:r.player_name,date:r.date,strokes:r.strokes,money:r.money,notes:r.notes,archive_reason:"season_reset",archived_by:user.id});
      await sb.from("rounds").delete().eq("id",r.id);
    }
    for(const b of pBets){
      await sb.from("archived_bets").insert({original_id:b.id,owner_id:user.id,player_id:b.player_id,player_name:b.player_name,date:b.date,type:b.type,amount:b.amount,notes:b.notes,archive_reason:"season_reset",archived_by:user.id});
      await sb.from("bets").delete().eq("id",b.id);
    }
    await sb.from("players").update({round_money:0,bet_money:0,bank:0,season:CURRENT_SEASON+1}).eq("id",player.id);
    setSaving(false);t2("New season started!");await loadAll();setSheet(null);
  }

  const [showExport, setShowExport] = useState(false);

  function exportHistory(){
    setShowExport(true);
  }

  async function markNotifsRead(){
    const unread=notifications.filter(n=>!n.read).map(n=>n.id);
    if(unread.length>0){await sb.from("notifications").update({read:true}).in("id",unread);setNotifications(prev=>prev.map(n=>({...n,read:true})));}
  }

  // ── EXPORT RECEIPT SCREEN ────────────────────────────────────────────────────
  if(showExport && player) {
    const totalRounds = pRounds.reduce((s,r)=>s+(r.money||0),0);
    const totalBets   = pBets.reduce((s,b)=>s+(b.amount||0),0);
    const totalSettled = pSettle.reduce((s,x)=>s+(x.amount||0),0);
    return (
      <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,padding:"0 0 60px"}}>
        <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 20px 20px"}}>
          <button onClick={()=>setShowExport(false)} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:20}}>‹ Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:28,fontWeight:800,color:C.green,letterSpacing:-1,marginBottom:4}}>Press ⛳</div>
            <div style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>{player.name}</div>
            <div style={{fontSize:13,color:C.muted}}>History as of {today}</div>
          </div>
        </div>
        <div style={{padding:"0 20px"}}>
          {/* Bank Summary */}
          <div style={{background:C.card,border:`2px solid ${(player.bank||0)>=0?C.green:C.red}`,borderRadius:16,padding:"20px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Current Balance</div>
            <div style={{fontSize:52,fontWeight:800,color:(player.bank||0)>0?C.green:(player.bank||0)<0?C.red:C.muted,letterSpacing:-2,marginBottom:8}}>
              {(player.bank||0)>=0?"+":"-"}${Math.abs(player.bank||0).toFixed(2)}
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:24,fontSize:13,color:C.muted}}>
              <span>Rounds: <span style={{color:totalRounds>=0?C.green:C.red,fontWeight:700}}>{totalRounds>=0?"+":"-"}${Math.abs(totalRounds).toFixed(2)}</span></span>
              <span>Bets: <span style={{color:totalBets>=0?C.green:C.red,fontWeight:700}}>{totalBets>=0?"+":"-"}${Math.abs(totalBets).toFixed(2)}</span></span>
            </div>
          </div>

          {/* Rounds */}
          {pRounds.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>🏌️ Rounds ({pRounds.length})</div>
              {pRounds.map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:C.card,borderRadius:12,marginBottom:8,border:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:600,marginBottom:3}}>{r.date}</div>
                    {r.notes&&<div style={{fontSize:13,color:C.muted,fontStyle:"italic"}}>{r.notes}</div>}
                    <div style={{fontSize:12,color:C.dim,marginTop:2}}>{r.strokes===0?"Even":r.strokes<0?`Got ${Math.abs(r.strokes)} stroke(s)`:`Gave ${r.strokes} stroke(s)`}</div>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:(r.money||0)>=0?C.green:C.red}}>{(r.money||0)>=0?"+":"-"}${Math.abs(r.money||0).toFixed(2)}</div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 4px",fontSize:14,color:C.muted}}>
                Total: <span style={{color:totalRounds>=0?C.green:C.red,fontWeight:700,marginLeft:6}}>{totalRounds>=0?"+":"-"}${Math.abs(totalRounds).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Bets */}
          {pBets.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>🎯 Side Bets ({pBets.length})</div>
              {pBets.map((b,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:C.card,borderRadius:12,marginBottom:8,border:"1px solid rgba(232,184,75,0.2)"}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,marginBottom:3}}>{b.type}</div>
                    <div style={{fontSize:13,color:C.muted}}>{b.date}{b.notes?` · ${b.notes}`:""}</div>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:(b.amount||0)>=0?C.green:C.red}}>{(b.amount||0)>=0?"+":"-"}${Math.abs(b.amount||0).toFixed(2)}</div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 4px",fontSize:14,color:C.muted}}>
                Total: <span style={{color:totalBets>=0?C.green:C.red,fontWeight:700,marginLeft:6}}>{totalBets>=0?"+":"-"}${Math.abs(totalBets).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Archived */}
          {(pArchR.length>0||pArchB.length>0)&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>🗑️ Archived ({pArchR.length+pArchB.length})</div>
              {[...pArchR,...pArchB].map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"rgba(100,100,100,0.05)",borderRadius:12,marginBottom:8,border:"1px solid rgba(150,150,150,0.15)",opacity:0.7}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:C.muted}}>{item.date||item.archived_at?.slice(0,10)} · {item.archive_reason}</div>
                    {item.notes&&<div style={{fontSize:12,color:C.dim,fontStyle:"italic"}}>{item.notes}</div>}
                  </div>
                  <div style={{fontSize:16,fontWeight:700,color:C.muted}}>${Math.abs(item.money||item.amount||0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Settlements */}
          {pSettle.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>🤝 Settlements ({pSettle.length})</div>
              {pSettle.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:C.card,borderRadius:12,marginBottom:8,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:16,fontWeight:600}}>{s.date}</div>
                  <div style={{fontSize:20,fontWeight:800,color:C.green}}>${Math.abs(s.amount||0).toFixed(2)} settled</div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 4px",fontSize:14,color:C.muted}}>
                Total settled: <span style={{color:C.green,fontWeight:700,marginLeft:6}}>${Math.abs(totalSettled).toFixed(2)}</span>
              </div>
            </div>
          )}

          {pRounds.length===0&&pBets.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.dim,fontSize:15}}>⛳ No activity yet.</div>}

          <div style={{textAlign:"center",padding:"20px 0",borderTop:`1px solid ${C.border}`,marginTop:10}}>
            <div style={{fontSize:12,color:C.dim,marginBottom:4}}>Generated by Press Golf</div>
            <div style={{fontSize:11,color:C.dim}}>press-golf.vercel.app</div>
          </div>
        </div>
      </div>
    );
  }

  // ── JOIN TOURNEY (spectator code entry with back button) ─────────────────
  if(view==="joinTourney") return(
    <TourneyCodeEntry
      onBack={()=>setView("roster")}
      onCaptain={(t,idx)=>{setTourneyData(t);setTourneyCaptainIdx(idx);setTourneyView("captain");}}
      onSpectator={(t)=>{setTourneyData(t);setTourneyView("spectator");}}
    />
  );

  if(view==="tournament") return(
    <TeamTournament user={user} onBack={()=>setView("roster")} onDelete={()=>setActiveTourney(null)}/>
  );

  if(view==="liveround") return(
    <LiveRound
      user={user}
      players={players}
      onBack={()=>setView("roster")}
      onPostToLedger={async()=>{await loadAll();setView("roster");t2("Results posted to ledger! ⛳");}}
    />
  );

  // ── ROSTER ──────────────────────────────────────────────────────────────────
  if(view==="roster") return(
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:80}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 20px 24px",textAlign:"center"}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:64,height:64,background:`linear-gradient(135deg,${C.green},#4a8030)`,borderRadius:18,marginBottom:14,boxShadow:`0 4px 20px ${C.green}44`}}><span style={{fontSize:32}}>⛳</span></div>
        <div style={{fontSize:42,fontWeight:800,letterSpacing:-2,color:"#f0f7ec",lineHeight:1}}>Press</div>
        <div style={{fontSize:10,color:C.green,letterSpacing:4,textTransform:"uppercase",marginTop:5,marginBottom:4}}>Put Me In Your Phone</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:6,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontWeight:600,color:C.text}}>{user.user_metadata?.display_name||user.email}</span>
          {isPro&&<span style={{background:`rgba(232,184,75,0.15)`,color:C.gold,fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700}}>⭐ Pro</span>}
        </div>
        {!isPro&&(
          <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:12,flexWrap:"wrap"}}>
            <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",padding:"8px 20px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer"}}>
              ⭐ Upgrade to Pro — $1.99/mo
            </button>
            <button onClick={onShowProInfo} style={{background:"transparent",border:`1px solid ${C.gold}`,color:C.gold,padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              What's included?
            </button>
          </div>
        )}
        {isPro&&(
          <button onClick={onShowProInfo} style={{background:"transparent",border:`1px solid ${C.gold}44`,color:C.gold,padding:"6px 16px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:12}}>
            ⭐ View Pro Features
          </button>
        )}
        {/* ── BUDDY GAME ── */}
        <button onClick={()=>setView("liveround")} style={{width:"100%",maxWidth:360,background:`linear-gradient(135deg,${C.green},#4a8030)`,border:"none",color:"#0a1a0f",padding:"0",borderRadius:16,cursor:"pointer",marginBottom:10,boxShadow:`0 4px 16px ${C.green}33`,textAlign:"left",overflow:"hidden"}}>
          <div style={{padding:"14px 18px"}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:0.3,marginBottom:3}}>⛳ Buddy Game</div>
            <div style={{fontSize:11,fontWeight:600,opacity:0.75}}>Nassau · Match Play · Skins</div>
            <div style={{fontSize:11,opacity:0.6,marginTop:2}}>You vs 1–3 players · quick setup</div>
          </div>
        </button>

        {/* ── OUTING / TOURNAMENT ── */}
        <button onClick={()=>setView("tournament")} style={{width:"100%",maxWidth:360,background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",padding:"0",borderRadius:16,cursor:"pointer",marginBottom:10,boxShadow:`0 4px 16px ${C.gold}33`,textAlign:"left",overflow:"hidden"}}>
          <div style={{padding:"14px 18px"}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:0.3,marginBottom:3}}>🏆 Outing / Tournament</div>
            <div style={{fontSize:11,fontWeight:600,opacity:0.75}}>Best Ball · Teams · Leaderboard</div>
            <div style={{fontSize:11,opacity:0.6,marginTop:2}}>Director sends links to captains</div>
          </div>
        </button>

        {/* ── JOIN ── */}
        <button onClick={()=>setView("joinTourney")} style={{width:"100%",maxWidth:360,background:"transparent",border:`1.5px solid ${C.green}55`,color:C.green,padding:"10px 18px",borderRadius:14,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12,textAlign:"left"}}>
          🔑 Join a Tournament &nbsp;<span style={{fontSize:11,fontWeight:400,opacity:0.6}}>— got a code or link?</span>
        </button>

        <div style={{display:"flex",background:"rgba(0,0,0,0.35)",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",maxWidth:360,margin:"0 auto"}}>
          {[{l:"Rounds",v:sRound},{l:"Side Bets",v:sBet},{l:"Season Bank",v:sBank}].map((item,i,arr)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"13px 4px",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}><Money value={item.v} size={15}/><div style={{fontSize:8,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginTop:3}}>{item.l}</div></div>))}
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        {/* PWA Install Banner */}
        {showInstall&&!isInstalled&&(
          <div style={{background:`linear-gradient(135deg,rgba(123,180,80,0.15),rgba(123,180,80,0.08))`,border:`1px solid ${C.green}44`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:C.green,marginBottom:2}}>⛳ Add Press to your home screen</div>
                {isIOS?(
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>
                    Tap <span style={{fontWeight:700,color:C.text}}>Share ↑</span> in Safari → <span style={{fontWeight:700,color:C.text}}>Add to Home Screen</span>
                  </div>
                ):(
                  <div style={{fontSize:12,color:C.muted}}>Works like a native app — free to install</div>
                )}
              </div>
              {!isIOS&&installPrompt?(
                <button onClick={handleInstall} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"10px 16px",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>Install</button>
              ):(
                <button onClick={()=>setShowInstall(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:"0 4px",flexShrink:0}}>✕</button>
              )}
            </div>
          </div>
        )}

        {/* Resume Round banner */}
        {activeRound&&(
          <div style={{background:`linear-gradient(135deg,rgba(123,180,80,0.15),rgba(123,180,80,0.05))`,border:`1px solid ${C.green}44`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:C.green,marginBottom:2}}>⛳ Round In Progress</div>
              <div style={{fontSize:12,color:C.muted}}>{activeRound.course_name} · Hole {activeRound.current_hole}</div>
              <div style={{fontSize:12,color:C.text,fontWeight:600,marginTop:2}}>{(activeRound.opponents||[]).map(o=>o.name).join(", ")}</div>
            </div>
            <button onClick={()=>setView("liveround")} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"10px 16px",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
              Resume →
            </button>
          </div>
        )}

        {/* Opponent round banner — shows when user has linked their account */}
        {opponentRound&&(()=>{
          // Find the correct playerId — the player record ID that matches this user
          // It's stored in opponents as linkedUserId
          const myOpp = (opponentRound.opponents||[]).find(o=>o.linkedUserId===user.id);
          const playerId = myOpp?.playerId;
          if(!playerId) return null; // can't resume without knowing which player
          return(
            <div style={{background:`linear-gradient(135deg,rgba(123,180,80,0.12),rgba(123,180,80,0.04))`,border:`1px solid ${C.green}33`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.green,marginBottom:2}}>⛳ Match In Progress</div>
                <div style={{fontSize:12,color:C.muted}}>{opponentRound.course_name} · Hole {opponentRound.current_hole}</div>
                <div style={{fontSize:11,color:C.dim,marginTop:1}}>vs {myOpp?.name||"Partner"}</div>
              </div>
              <button
                onClick={()=>window.location.href=`https://press-golf.vercel.app?round=${opponentRound.id}&player=${playerId}`}
                style={{background:C.green,border:"none",color:"#0a1a0f",padding:"10px 16px",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
                Resume →
              </button>
            </div>
          );
        })()}

        {/* Resume Tournament banner */}
        {activeTourney&&(
          <div style={{background:`linear-gradient(135deg,rgba(232,184,75,0.15),rgba(232,184,75,0.05))`,border:`1px solid ${C.gold}44`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:C.gold,marginBottom:2}}>🏆 Tournament In Progress</div>
              <div style={{fontSize:12,color:C.muted}}>{activeTourney.name} · Hole {activeTourney.current_hole}</div>
              <div style={{fontSize:11,color:C.dim,marginTop:1}}>{(activeTourney.teams||[]).length} teams · Code: {activeTourney.director_code?.split("#")[0]}</div>
            </div>
            <button onClick={()=>setView("tournament")} style={{background:C.gold,border:"none",color:"#0a1a0f",padding:"10px 16px",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
              Resume →
            </button>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:2,color:C.muted,textTransform:"uppercase"}}>
            Your Opponents {!isPro&&<span style={{color:C.gold}}>({players.length}/{FREE_PLAYER_LIMIT} free)</span>}
          </div>
          <button onClick={()=>setSheet("addPlayer")} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"9px 18px",borderRadius:20,fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Player</button>
        </div>

        {pendingActions>0&&(
          <div style={{background:"rgba(232,184,75,0.1)",border:`1px solid ${C.gold}44`,borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,color:C.gold,fontWeight:600}}>⚠️ {pendingActions} action{pendingActions>1?"s":""} need your response</div>
            <button onClick={()=>{setShowNotifs(true);markNotifsRead();}} style={{background:C.gold,border:"none",color:"#0a1a0f",padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>View</button>
          </div>
        )}

        {loading?<Spinner/>:players.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>⛳</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>No opponents yet</div>
            <div style={{fontSize:13}}>Tap "+ Add Player" to get started.</div>
            {!isPro&&<div style={{fontSize:12,color:C.gold,marginTop:8}}>Free plan: up to {FREE_PLAYER_LIMIT} players</div>}
          </div>
        ):[...players].sort((a,b)=>(b.bank||0)-(a.bank||0)).map((p,i)=>{
          const pr=rounds.filter(r=>r.player_id===p.id);
          const pb=bets.filter(b=>b.player_id===p.id);
          const sl=p.strokes===0?"Even":p.strokes<0?`You get ${Math.abs(p.strokes)}`:`You give ${p.strokes}`;
          return(
            <div key={p.id} onClick={()=>goProfile(p.id)} style={{display:"flex",alignItems:"center",gap:14,padding:"16px",marginBottom:10,background:C.card,border:`1px solid ${C.border}`,borderRadius:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:i===0?`linear-gradient(135deg,${C.green},#4a8030)`:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:22,color:i===0?"#0a1a0f":C.green,flexShrink:0}}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontWeight:700,fontSize:19}}>{p.name}</div>
                  {p.linked_user_id&&<span style={{fontSize:10,background:"rgba(123,180,80,0.15)",color:C.green,padding:"2px 6px",borderRadius:8}}>🔗</span>}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>{sl} · {pr.length} round{pr.length!==1?"s":""} · {pb.length} bet{pb.length!==1?"s":""}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}><Money value={p.bank||0} size={22}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Bank</div></div>
              <div style={{color:C.dim,fontSize:20}}>›</div>
            </div>
          );
        })}

        {/* Upgrade prompt when at limit */}
        {!isPro&&players.length>=FREE_PLAYER_LIMIT&&(
          <div style={{background:`linear-gradient(135deg,rgba(232,184,75,0.1),rgba(123,180,80,0.05))`,border:`1px solid ${C.gold}44`,borderRadius:14,padding:"20px",textAlign:"center",marginTop:8}}>
            <div style={{fontSize:20,marginBottom:6}}>⭐</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:6,color:C.gold}}>Unlock Unlimited Players</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>You've reached the free limit of {FREE_PLAYER_LIMIT} players. Upgrade to add more and unlock all Pro features.</div>
            <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",padding:"12px 24px",borderRadius:20,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              Upgrade to Pro — $1.99/mo
            </button>
          </div>
        )}
      </div>

      {/* Add Player Sheet */}
      <Sheet open={sheet==="addPlayer"} onClose={()=>setSheet(null)} title="Add Opponent">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {!isPro&&players.length>=FREE_PLAYER_LIMIT?(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:32,marginBottom:10}}>⭐</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:C.gold}}>Pro Required</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Upgrade to add unlimited players.</div>
              <BigBtn onClick={()=>{setSheet(null);onUpgrade();}} color={C.gold} textColor="#0a1a0f">Upgrade to Pro</BigBtn>
              <GhostBtn onClick={()=>setSheet(null)} style={{marginTop:10}}>Cancel</GhostBtn>
            </div>
          ):(
            <>
              <div><Lbl>Name</Lbl><input value={nName} onChange={e=>setNName(e.target.value)} placeholder="e.g. KP" style={inp}/></div>
              <div>
                <Lbl note="Starting handicap">Strokes</Lbl>
                <div style={{display:"flex",gap:8,marginBottom:nDir!=="even"?10:0}}>
                  {["even","received","gave"].map(d=>(<button key={d} onClick={()=>setNDir(d)} style={pill(nDir===d)}>{d==="even"?"Even":d==="received"?"I Get":"I Give"}</button>))}
                </div>
                {nDir!=="even"&&<input type="number" min="1" value={nStr} onChange={e=>setNStr(e.target.value)} placeholder="# strokes" style={inp}/>}
              </div>
              <BigBtn onClick={addPlayer} disabled={saving}>{saving?"Saving...":"Add Player"}</BigBtn>
              <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
            </>
          )}
        </div>
      </Sheet>

      {/* Notifications Sheet */}
      {/* ── BOTTOM NAVIGATION BAR ─────────────────────────────────────── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#0e1a10",borderTop:"1px solid #1e2f20",display:"flex",height:58,zIndex:200,maxWidth:"100vw"}}>

        {/* Home */}
        <button onClick={()=>setActiveTab("home")} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",borderTop:activeTab==="home"?"2px solid #7bb450":"2px solid transparent",cursor:"pointer",padding:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" fill={activeTab==="home"?"#7bb450":"#6b7f6d"}/>
          </svg>
          <span style={{fontSize:9,color:activeTab==="home"?"#7bb450":"#6b7f6d",fontWeight:activeTab==="home"?700:500,letterSpacing:"0.5px",fontFamily:"Georgia,serif"}}>HOME</span>
        </button>

        {/* Alerts */}
        <button onClick={()=>{setActiveTab("alerts");markNotifsRead();}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",borderTop:activeTab==="alerts"?"2px solid #7bb450":"2px solid transparent",cursor:"pointer",padding:0,position:"relative"}}>
          <div style={{position:"relative",display:"inline-block"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill={activeTab==="alerts"?"#7bb450":"#6b7f6d"}/>
            </svg>
            {(unreadNotifs+pendingActions)>0&&(
              <div style={{position:"absolute",top:-4,right:-6,background:"#e05050",borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:8,color:"#fff",fontWeight:"bold"}}>{unreadNotifs+pendingActions}</span>
              </div>
            )}
          </div>
          <span style={{fontSize:9,color:activeTab==="alerts"?"#7bb450":"#6b7f6d",fontWeight:activeTab==="alerts"?700:500,letterSpacing:"0.5px",fontFamily:"Georgia,serif"}}>ALERTS</span>
        </button>

        {/* Profile */}
        <button onClick={()=>setActiveTab("profile")} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",borderTop:activeTab==="profile"?"2px solid #7bb450":"2px solid transparent",cursor:"pointer",padding:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" fill={activeTab==="profile"?"#7bb450":"#6b7f6d"}/>
            <path d="M4 20C4 16.69 7.58 14 12 14C16.42 14 20 16.69 20 20" stroke={activeTab==="profile"?"#7bb450":"#6b7f6d"} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{fontSize:9,color:activeTab==="profile"?"#7bb450":"#6b7f6d",fontWeight:activeTab==="profile"?700:500,letterSpacing:"0.5px",fontFamily:"Georgia,serif"}}>PROFILE</span>
        </button>

      </div>

      {/* ── ALERTS PANEL ───────────────────────────────────────────────── */}
      {activeTab==="alerts"&&(
        <div style={{position:"fixed",inset:0,background:"#080f0a",zIndex:150,overflowY:"auto",paddingBottom:70,fontFamily:"Georgia,serif"}}>
          <div style={{padding:"50px 20px 20px"}}>
            <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>Notifications & Actions</div>
            <div style={{fontSize:13,color:"#6b7f6d",marginBottom:20}}>{user.user_metadata?.display_name||user.email}</div>
            {pendingActions>0&&(
              <div style={{background:"rgba(232,184,75,0.1)",border:"1px solid rgba(232,184,75,0.4)",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
                <div style={{fontSize:13,color:"#e8b84b",fontWeight:600}}>⚠️ {pendingActions} action{pendingActions>1?"s":""} need your response</div>
              </div>
            )}
            {notifications.length===0&&cancelRequests.filter(r=>r.responder_id===user.id).length===0&&<div style={{textAlign:"center",color:"#1e2f20",padding:"30px 0"}}>No notifications yet.</div>}
            {notifications.map(n=>(<div key={n.id} style={{padding:"12px 14px",background:n.read?"#121e14":"rgba(123,180,80,0.06)",border:`1px solid ${n.read?"rgba(123,180,80,0.18)":"rgba(123,180,80,0.33)"}`,borderRadius:10,marginBottom:8}}><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{n.title}</div>{n.body&&<div style={{fontSize:12,color:"#6b7f6d"}}>{n.body}</div>}<div style={{fontSize:10,color:"#1e2f20",marginTop:4}}>{new Date(n.created_at).toLocaleDateString()}</div></div>))}
            {cancelRequests.filter(r=>r.responder_id===user.id).map(req=>(
              <div key={req.id} style={{padding:"14px",background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:13,color:"#e8b84b",marginBottom:4}}>Cancel Request</div>
                <div style={{fontSize:12,color:"#6b7f6d",marginBottom:10}}>{req.item_date}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>handleCancelResponse(req,true)} style={{flex:1,padding:"10px",background:"#7bb450",color:"#0a1a0f",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Approve</button>
                  <button onClick={()=>handleCancelResponse(req,false)} style={{flex:1,padding:"10px",background:"transparent",color:"#e05050",border:"1px solid rgba(224,80,80,0.4)",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Deny</button>
                </div>
              </div>
            ))}
            {strokeRequests.filter(s=>s.responder_id===user.id).map(req=>(
              <div key={req.id} style={{padding:"14px",background:"rgba(52,152,219,0.06)",border:"1px solid rgba(52,152,219,0.25)",borderRadius:10,marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:13,color:"#5dade2",marginBottom:4}}>Stroke Change Request</div>
                <div style={{fontSize:12,color:"#6b7f6d",marginBottom:10}}>{req.proposed_label}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>handleStrokeResponse(req,true)} style={{flex:1,padding:"10px",background:"#7bb450",color:"#0a1a0f",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Approve</button>
                  <button onClick={()=>handleStrokeResponse(req,false)} style={{flex:1,padding:"10px",background:"transparent",color:"#e05050",border:"1px solid rgba(224,80,80,0.4)",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PROFILE PANEL ──────────────────────────────────────────────── */}
      {activeTab==="profile"&&(
        <div style={{position:"fixed",inset:0,background:"#080f0a",zIndex:150,overflowY:"auto",paddingBottom:70,fontFamily:"Georgia,serif"}}>
          <div style={{padding:"50px 20px 20px"}}>
            <div style={{fontSize:22,fontWeight:800,marginBottom:16}}>Profile</div>

            {/* Name + email */}
            <div style={{background:"#121e14",border:"1px solid rgba(123,180,80,0.18)",borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{fontSize:20,fontWeight:800,color:"#e8f0e9",marginBottom:4}}>{user.user_metadata?.display_name||"Player"}</div>
              <div style={{fontSize:13,color:"#6b7f6d"}}>{user.email}</div>
              {isPro&&<div style={{marginTop:8,display:"inline-block",background:"rgba(232,184,75,0.15)",color:"#e8b84b",fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:700}}>⭐ Pro Member</div>}
            </div>

            {/* Pro section */}
            {!isPro&&(
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <button onClick={onUpgrade} style={{flex:2,padding:"14px",background:"linear-gradient(135deg,#e8b84b,#b8860b)",border:"none",color:"#0a1a0f",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>⭐ Upgrade to Pro — $1.99/mo</button>
                <button onClick={onShowProInfo} style={{flex:1,padding:"14px",background:"transparent",border:"1px solid rgba(232,184,75,0.4)",color:"#e8b84b",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer"}}>What's included?</button>
              </div>
            )}
            {isPro&&(
              <button onClick={onShowProInfo} style={{width:"100%",padding:"12px",background:"transparent",border:"1px solid rgba(232,184,75,0.3)",color:"#e8b84b",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:12}}>⭐ View Pro Features</button>
            )}

            {/* Sign out — clearly labeled, safe location */}
            <button onClick={onSignOut} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid rgba(224,80,80,0.3)",color:"#e05050",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      <Sheet open={showNotifs} onClose={()=>setShowNotifs(false)} title="Notifications & Actions">
        <div>
          {cancelRequests.filter(r=>r.responder_id===user.id).map(req=>(
            <div key={req.id} style={{background:"rgba(232,184,75,0.08)",border:`1px solid ${C.gold}33`,borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>⚠️ Cancel Request</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:10}}>{req.item_date} · {req.item_type} · ${Math.abs(req.item_amount||0).toFixed(2)}{req.item_notes?` · ${req.item_notes}`:""}</div>
              {req.paid_so_far>0&&<div style={{fontSize:12,color:C.gold,marginBottom:10}}>Note: ${req.paid_so_far.toFixed(2)} already paid</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>respondToCancel(req,true)} style={{flex:1,padding:"10px",background:C.green,border:"none",borderRadius:8,color:"#0a1a0f",fontWeight:700,fontSize:13,cursor:"pointer"}}>Approve ✓</button>
                <button onClick={()=>respondToCancel(req,false)} style={{flex:1,padding:"10px",background:"transparent",border:`1px solid ${C.red}`,borderRadius:8,color:C.red,fontWeight:700,fontSize:13,cursor:"pointer"}}>Deny ✗</button>
              </div>
            </div>
          ))}
          {strokeRequests.filter(s=>s.responder_id===user.id).map(req=>(
            <div key={req.id} style={{background:"rgba(123,180,80,0.06)",border:`1px solid ${C.green}33`,borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>⛳ Stroke Change Request</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:10}}>{req.current_strokes===0?"Even":Math.abs(req.current_strokes)+" strokes"} → {req.proposed_strokes===0?"Even":Math.abs(req.proposed_strokes)+" strokes"}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>respondToStrokeRequest(req,true)} style={{flex:1,padding:"10px",background:C.green,border:"none",borderRadius:8,color:"#0a1a0f",fontWeight:700,fontSize:13,cursor:"pointer"}}>Approve ✓</button>
                <button onClick={()=>respondToStrokeRequest(req,false)} style={{flex:1,padding:"10px",background:"transparent",border:`1px solid ${C.red}`,borderRadius:8,color:C.red,fontWeight:700,fontSize:13,cursor:"pointer"}}>Deny ✗</button>
              </div>
            </div>
          ))}
          {notifications.length===0&&cancelRequests.filter(r=>r.responder_id===user.id).length===0&&<div style={{textAlign:"center",color:C.dim,padding:"30px 0"}}>No notifications yet.</div>}
          {notifications.map(n=>(<div key={n.id} style={{padding:"12px 14px",background:n.read?C.card:"rgba(123,180,80,0.06)",border:`1px solid ${n.read?C.border:C.green+"33"}`,borderRadius:10,marginBottom:8}}><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{n.title}</div>{n.body&&<div style={{fontSize:12,color:C.muted}}>{n.body}</div>}<div style={{fontSize:10,color:C.dim,marginTop:4}}>{new Date(n.created_at).toLocaleDateString()}</div></div>))}
        </div>
      </Sheet>

      <div style={{textAlign:"center",padding:"16px 0 6px",fontSize:11,color:C.dim}}>
        <button onClick={onPrivacy} style={{background:"none",border:"none",color:C.dim,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>Privacy Policy & Terms</button>
      </div>
      <Toast msg={toast.msg} error={toast.error}/>
    </div>
  );

  // ── PROFILE ──────────────────────────────────────────────────────────────────
  const PTABS=[{id:"overview",label:"Overview"},{id:"rounds",label:"Rounds"},{id:"bets",label:"Bets"},{id:"history",label:"History"},{id:"settings",label:"⚙️"}];

  return(
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 18px 0"}}>
        <button onClick={goRoster} style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:14,cursor:"pointer",padding:"8px 16px",borderRadius:20,display:"flex",alignItems:"center",gap:6,fontWeight:700,marginBottom:14,WebkitTapHighlightColor:"transparent"}}>‹ All Players</button>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
          <div style={{width:62,height:62,borderRadius:"50%",background:`linear-gradient(135deg,${C.green},#4a8030)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:28,color:"#0a1a0f",flexShrink:0}}>{player?.name.charAt(0).toUpperCase()}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontWeight:700,fontSize:26,lineHeight:1.1}}>{player?.name}</div>
              {player?.linked_user_id&&<span style={{fontSize:11,background:"rgba(123,180,80,0.15)",color:C.green,padding:"3px 8px",borderRadius:8}}>🔗 Linked</span>}
            </div>
            {player?.linked_email&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>Linked: {player.linked_email}</div>}
            <div style={{fontSize:12,color:C.green,marginTop:2}}>{player?.strokes===0?"Even":player?.strokes<0?`You receive ${Math.abs(player.strokes)} stroke(s)`:`You give ${player?.strokes} stroke(s)`}</div>
          </div>
          <div style={{textAlign:"right"}}><Money value={player?.bank??0} size={26}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Bank</div></div>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.3)",borderRadius:"12px 12px 0 0",overflow:"hidden"}}>
          {[{l:"Round $",v:player?.round_money??0,m:true},{l:"Bet $",v:player?.bet_money??0,m:true},{l:"Rounds",v:pRounds.length,m:false},{l:"Bets",v:pBets.length,m:false}].map((item,i,arr)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"11px 4px",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>{item.m?<Money value={item.v} size={13}/>:<div style={{fontSize:17,fontWeight:700,color:C.green}}>{item.v}</div>}<div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{item.l}</div></div>))}
        </div>
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)"}}>
        {PTABS.map(t=>(<button key={t.id} onClick={()=>setPtab(t.id)} style={{flex:1,padding:"13px 4px",fontSize:t.id==="settings"?18:11,fontWeight:ptab===t.id?700:500,background:"transparent",color:ptab===t.id?C.green:C.muted,border:"none",borderBottom:ptab===t.id?`2px solid ${C.green}`:"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap"}}>{t.label}</button>))}
      </div>

      <div style={{padding:"16px"}}>

        {ptab==="overview"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <button onClick={()=>setSheet("round")} style={{flex:1,padding:"14px 4px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🏌️ Round</button>
              <button onClick={()=>setSheet("bet")}   style={{flex:1,padding:"14px 4px",background:C.gold, color:"#0a1a0f",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🎯 Bet</button>
              <button onClick={()=>setSheet("settle")} style={{flex:1,padding:"14px 4px",background:"transparent",color:C.gold,border:`1.5px solid ${C.gold}`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🤝 Settle</button>
            </div>

            {/* Invite banner */}
            {!player?.linked_user_id&&(
              <div style={{background:"rgba(123,180,80,0.07)",border:`1px solid ${C.green}33`,borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:1}}>Invite {player?.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{isPro?"Link to share this ledger":"Pro feature — upgrade to invite"}</div>
                </div>
                <button onClick={generateInvite} disabled={saving} style={{background:isPro?C.green:C.gold,border:"none",color:"#0a1a0f",padding:"7px 14px",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                  {isPro?(saving?"...":"Invite 🔗"):"⭐ Pro"}
                </button>
              </div>
            )}

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Bank Breakdown</div>
              <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {[{l:"Rounds",v:player?.round_money??0},{l:"Side Bets",v:player?.bet_money??0},{l:"Total Bank",v:player?.bank??0}].map((item,i,arr)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"10px 4px",background:"rgba(0,0,0,0.2)",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}><Money value={item.v} size={13}/><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:3}}>{item.l}</div></div>))}
              </div>
            </div>

            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Recent Activity</div>
            {loading?<Spinner/>:pHistory.length===0?<div style={{textAlign:"center",color:C.dim,padding:"24px 0",fontSize:13}}>⛳ No activity yet!</div>:pHistory.slice(0,5).map((item,i)=>(<ActivityItem key={i} item={item}/>))}
            {pHistory.length>5&&<button onClick={()=>setPtab("history")} style={{width:"100%",padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.green,fontSize:13,cursor:"pointer",marginTop:6}}>View All ({pHistory.length})</button>}

            {pSettle.length>0&&(
              <div style={{marginTop:14}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Settlement History</div>
                {pSettle.map((s,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.card,borderRadius:8,marginBottom:6}}><span style={{fontSize:13,color:C.muted}}>🤝 {s.date}</span><Money value={s.amount} size={13}/></div>))}
              </div>
            )}
          </div>
        )}

        {ptab==="rounds"&&(()=>{
          const isSettled=(player?.bank||0)===0&&pSettle.length>0;
          return(
            <div>
              <BigBtn onClick={()=>setSheet("round")} style={{marginBottom:12}}>+ Log Round</BigBtn>
              {loading?<Spinner/>:pRounds.length===0?<Empty msg="No rounds logged yet."/>:pRounds.map(r=>(
                <SwipeRow key={r.id} onDelete={()=>handleDeleteTap({...r,kind:"round"})} disabled={r.cancel_requested||isSettled}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14}}>{r.date}{r.cancel_requested&&<span style={{fontSize:10,color:C.gold,marginLeft:8}}>⏳ Pending</span>}</div>
                    {r.notes&&<div style={{fontSize:12,color:C.muted,marginTop:2,fontStyle:"italic"}}>{r.notes}</div>}
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>{r.strokes===0?"Even":r.strokes<0?`Got ${Math.abs(r.strokes)} stroke(s)`:`Gave ${r.strokes} stroke(s)`}</div>
                    {isSettled&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>✅ Settled — locked</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <Money value={r.money} size={16}/>
                    {player?.linked_user_id&&<button onClick={e=>{e.stopPropagation();setDisputeItem({...r,kind:"round"});setSheet("dispute");}} style={{background:"none",border:"none",color:C.gold,fontSize:10,cursor:"pointer",padding:0}}>dispute</button>}
                  </div>
                </SwipeRow>
              ))}
            </div>
          );
        })()}

        {ptab==="bets"&&(()=>{
          const isSettled=(player?.bank||0)===0&&pSettle.length>0;
          return(
            <div>
              <BigBtn onClick={()=>setSheet("bet")} style={{marginBottom:12,background:C.gold}}>+ Log Side Bet</BigBtn>
              {loading?<Spinner/>:pBets.length===0?<Empty msg="No side bets logged yet."/>:pBets.map(b=>(
                <SwipeRow key={b.id} onDelete={()=>handleDeleteTap({...b,kind:"bet"})} accent={C.gold} disabled={b.cancel_requested||isSettled}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{b.type}{b.cancel_requested&&<span style={{fontSize:10,color:C.gold,marginLeft:8}}>⏳ Pending</span>}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>{b.date}{b.notes?` · ${b.notes}`:""}</div>
                    {isSettled&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>✅ Settled — locked</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <Money value={b.amount} size={16}/>
                    {player?.linked_user_id&&<button onClick={e=>{e.stopPropagation();setDisputeItem({...b,kind:"bet"});setSheet("dispute");}} style={{background:"none",border:"none",color:C.gold,fontSize:10,cursor:"pointer",padding:0}}>dispute</button>}
                  </div>
                </SwipeRow>
              ))}
            </div>
          );
        })()}

        {ptab==="history"&&(
          <div>
            {/* ── ANNUAL W/L TALLY ─────────────────────────────────────────── */}
            {(()=>{
              const resetDate = player?.tally_reset_date || null;
              const afterReset = item => !resetDate || (item.date||item.archived_at||"") >= resetDate;
              const tallyRounds = pRounds.filter(afterReset);
              const tallyBets   = pBets.filter(afterReset);
              const tallySettle = pSettle.filter(afterReset);
              const won     = [...tallyRounds,...tallyBets].reduce((s,x)=>s+Math.max(0,x.money||x.amount||0),0);
              const lost    = [...tallyRounds,...tallyBets].reduce((s,x)=>s+Math.min(0,x.money||x.amount||0),0);
              const net     = won + lost;
              const settled = tallySettle.reduce((s,x)=>s+(x.amount||0),0);
              const rounds  = tallyRounds.length + tallyBets.length;

              async function doReset(){
                const today2 = new Date().toISOString().slice(0,10);
                await sb.from("players").update({tally_reset_date:today2}).eq("id",player.id);
                setPlayers(prev=>prev.map(p=>p.id===player.id?{...p,tally_reset_date:today2}:p));
                setConfirmReset(false);
                t2("Tally reset ✓");
              }

              return(
                <div style={{background:C.card,border:`2px solid ${net>=0?C.green+"55":C.red+"55"}`,borderRadius:16,padding:"16px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>
                        {CURRENT_SEASON} Tally{resetDate?` · since ${resetDate}`:""}
                      </div>
                      <div style={{fontSize:11,color:C.dim,marginTop:1}}>{rounds} round{rounds!==1?"s":""} · {tallySettle.length} settlement{tallySettle.length!==1?"s":""}</div>
                    </div>
                    {!confirmReset?(
                      <button onClick={()=>setConfirmReset(true)}
                        style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,padding:"5px 10px",borderRadius:8,cursor:"pointer"}}>
                        Reset Tally
                      </button>
                    ):(
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={doReset}
                          style={{background:"rgba(224,80,80,0.15)",border:`1px solid ${C.red}44`,color:C.red,fontSize:11,padding:"5px 10px",borderRadius:8,cursor:"pointer",fontWeight:700}}>
                          Confirm
                        </button>
                        <button onClick={()=>setConfirmReset(false)}
                          style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,padding:"5px 10px",borderRadius:8,cursor:"pointer"}}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{textAlign:"center",padding:"8px 0 12px"}}>
                    <div style={{fontSize:48,fontWeight:800,letterSpacing:-2,color:net>0?C.green:net<0?C.red:C.muted,lineHeight:1}}>
                      {net>=0?"+":"-"}${Math.abs(net).toFixed(2)}
                    </div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>Net {net>=0?"won":"lost"} vs {player?.name}</div>
                  </div>
                  <div style={{display:"flex",borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                    {[
                      {label:"Won",    value:won,             color:C.green, sign:"+"},
                      {label:"Lost",   value:Math.abs(lost),  color:C.red,   sign:"-"},
                      {label:"Settled",value:Math.abs(settled),color:C.muted,sign:""},
                    ].map((item,i,arr)=>(
                      <div key={i} style={{flex:1,textAlign:"center",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                        <div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.sign}${item.value.toFixed(2)}</div>
                        <div style={{fontSize:9,color:C.dim,letterSpacing:1.5,textTransform:"uppercase",marginTop:2}}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── SETTLEMENT RUNNING TALLY ─────────────────────────────────── */}
            {pSettle.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Settlement History</div>
                {[...pSettle].reverse().reduce((acc,s,i,arr)=>{
                  const running = arr.slice(0,i+1).reduce((sum,x)=>sum+(x.amount||0),0);
                  acc.push(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.card,borderRadius:10,marginBottom:6,border:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700}}>🤝 {s.date}</div>
                        <div style={{fontSize:11,color:C.dim,marginTop:2}}>
                          Running total: <span style={{color:running>=0?C.green:C.red,fontWeight:700}}>{running>=0?"+":"-"}${Math.abs(running).toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:16,fontWeight:800,color:C.green}}>${Math.abs(s.amount||0).toFixed(2)}</div>
                          <div style={{fontSize:10,color:C.dim}}>settled</div>
                        </div>
                        <button onClick={()=>{setConfirmDeleteSettle(s);setDeleteInput("");}}
                          style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",padding:"0 2px",lineHeight:1}}
                          title="Delete settlement">✕</button>
                      </div>
                    </div>
                  );
                  return acc;
                },[])}
                <div style={{display:"flex",justifyContent:"flex-end",padding:"4px 4px",fontSize:12,color:C.muted}}>
                  All-time settled: <span style={{color:C.green,fontWeight:700,marginLeft:6}}>${Math.abs(pSettle.reduce((s,x)=>s+(x.amount||0),0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* ── FULL ACTIVITY LIST ────────────────────────────────────────── */}
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>All Activity</div>
            <button onClick={exportHistory} style={{width:"100%",padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:12,cursor:"pointer",marginBottom:12}}>📄 Export History</button>
            {loading?<Spinner/>:pHistory.length===0?<Empty msg="No activity yet."/>:pHistory.map((item,i)=>(
              <ActivityItem key={i} item={item} onDelete={()=>handleDeleteTap(item)}/>
            ))}
          </div>
        )}

        {ptab==="settings"&&(
          <div>
            {!isPro&&(
              <div style={{background:`linear-gradient(135deg,rgba(232,184,75,0.1),rgba(123,180,80,0.05))`,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"16px",marginBottom:10,textAlign:"center"}}>
                <div style={{fontWeight:700,fontSize:15,color:C.gold,marginBottom:4}}>⭐ Press Pro</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Unlock invites, notifications, disputes and more.</div>
                <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${C.gold},#b8860b)`,border:"none",color:"#0a1a0f",padding:"10px 20px",borderRadius:20,fontSize:13,fontWeight:700,cursor:"pointer"}}>Upgrade — $1.99/mo</button>
              </div>
            )}
            {/* LINK STATUS */}
            <LinkStatusPanel player={player} user={user} isPro={isPro} saving={saving}
              onGenerateInvite={generateInvite}
              onUnlink={async()=>{
                if(!window.confirm("Unlink "+player.name+"?"))return;
                await sb.from("players").update({linked_user_id:null,linked_email:null}).eq("id",player.id);
                await sb.from("invites").update({accepted:false,invitee_id:null}).eq("player_id",player.id);
                setPlayers(prev=>prev.map(p=>p.id===player.id?{...p,linked_user_id:null,linked_email:null}:p));
                t2("Unlinked");
              }}
            />


            <SettingsCard title="Stroke Handicap" sub={player?.strokes===0?"Even":player?.strokes<0?`You receive ${Math.abs(player.strokes)}`:`You give ${player?.strokes}`}>
              <GhostBtn onClick={openEditStrokes}>{player?.linked_user_id?"Request Stroke Change":"Edit Strokes"}</GhostBtn>
            </SettingsCard>
            <SettingsCard title="Settle Up" sub="Current bank: " subExtra={<Money value={player?.bank??0} size={13}/>}>
              <GhostBtn onClick={()=>setSheet("settle")} color={C.gold}>🤝 Settle Up with {player?.name}</GhostBtn>
            </SettingsCard>
            <SettingsCard title="New Season" sub="Archives all rounds and bets. Balance must be $0.">
              <GhostBtn onClick={()=>setSheet("seasonReset")} color={C.gold}>🏆 Start New Season</GhostBtn>
            </SettingsCard>
            <SettingsCard title="Export History" sub="Download a full record of all activity.">
              <GhostBtn onClick={exportHistory}>📄 Export</GhostBtn>
            </SettingsCard>
            <SettingsCard title="Remove Player" sub={(player?.bank||0)!==0?"Settle up before removing.":"Permanently deletes all data."} danger>
              <GhostBtn onClick={removePlayer} color={C.red} style={{opacity:(player?.bank||0)!==0?0.4:1}}>Remove {player?.name}</GhostBtn>
            </SettingsCard>
          </div>
        )}
      </div>

      {/* ROUND SHEET */}
      <Sheet open={sheet==="round"} onClose={()=>setSheet(null)} title={`Round vs ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Date</Lbl><input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} style={inp}/></div>
          <div><Lbl>Strokes</Lbl><div style={{display:"flex",gap:8,marginBottom:10}}><button onClick={()=>setFDir("received")} style={pill(fDir==="received")}>I Got</button><button onClick={()=>setFDir("gave")} style={pill(fDir==="gave")}>I Gave</button></div><input type="number" min="0" value={fStr} onChange={e=>setFStr(e.target.value)} style={inp} placeholder="# strokes"/></div>
          <div><Lbl>Result</Lbl><div style={{display:"flex",gap:8,marginBottom:10}}><button onClick={()=>setFWon(true)} style={pill(fWon,C.green)}>🏆 I Won</button><button onClick={()=>setFWon(false)} style={pill(!fWon,C.red)}>I Lost</button></div></div>
          <div><Lbl>Amount ($)</Lbl><input type="number" min="0" value={fMoney} onChange={e=>setFMoney(e.target.value)} style={{...inp,borderColor:fWon?"rgba(123,180,80,0.5)":"rgba(224,80,80,0.5)"}} placeholder="e.g. 20" inputMode="decimal"/></div>
          <div><Lbl>Notes (optional)</Lbl><input type="text" value={fNotes} onChange={e=>setFNotes(e.target.value)} style={inp} placeholder="e.g. Back 9 Nassau"/></div>
          <BigBtn onClick={logRound} disabled={saving}>{saving?"Saving...":"Log Round"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* BET SHEET */}
      <Sheet open={sheet==="bet"} onClose={()=>setSheet(null)} title={`Side Bet vs ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Date</Lbl><input type="date" value={bDate} onChange={e=>setBDate(e.target.value)} style={inp}/></div>
          <div><Lbl>Bet Type</Lbl><select value={bType} onChange={e=>setBType(e.target.value)} style={{...inp,cursor:"pointer"}}>{BET_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><Lbl>Result</Lbl><div style={{display:"flex",gap:8,marginBottom:10}}><button onClick={()=>setBWon(true)} style={pill(bWon,C.green)}>🏆 I Won</button><button onClick={()=>setBWon(false)} style={pill(!bWon,C.red)}>I Lost</button></div></div>
          <div><Lbl>Amount ($)</Lbl><input type="number" min="0" value={bAmt} onChange={e=>setBAmt(e.target.value)} style={{...inp,borderColor:bWon?"rgba(123,180,80,0.5)":"rgba(224,80,80,0.5)"}} placeholder="e.g. 10" inputMode="decimal"/></div>
          <div><Lbl>Notes (optional)</Lbl><input type="text" value={bNotes} onChange={e=>setBNotes(e.target.value)} style={inp} placeholder="e.g. Hole 7 CTP"/></div>
          <BigBtn onClick={logBet} disabled={saving} color={C.gold}>{saving?"Saving...":"Log Side Bet"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* EDIT STROKES SHEET */}
      <Sheet open={sheet==="editStrokes"} onClose={()=>setSheet(null)} title="Edit Strokes">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {player?.linked_user_id&&<div style={{background:"rgba(123,180,80,0.08)",border:`1px solid ${C.green}33`,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.muted}}>Since {player?.name} is linked, this sends a request for approval.</div>}
          <div><Lbl>Direction</Lbl><div style={{display:"flex",gap:8}}>{["even","received","gave"].map(d=>(<button key={d} onClick={()=>setEDir(d)} style={pill(eDir===d)}>{d==="even"?"Even":d==="received"?"I Get":"I Give"}</button>))}</div></div>
          {eDir!=="even"&&<div><Lbl>Strokes</Lbl><input type="number" min="1" value={eStr} onChange={e=>setEStr(e.target.value)} style={inp}/></div>}
          <BigBtn onClick={saveStrokes} disabled={saving}>{saving?"Saving...":player?.linked_user_id?"Send Request":"Save"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* INVITE SHEET */}
      <Sheet open={sheet==="invite"} onClose={()=>setSheet(null)} title={`Invite ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:36,marginBottom:8}}>🔗</div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Invite {player?.name} to Press</div>
            <div style={{fontSize:12,color:C.muted}}>Enter their cell number to text them directly</div>
          </div>
          <div>
            <Lbl>Cell Phone Number</Lbl>
            <div style={{display:"flex",gap:8}}>
              <input type="tel" value={invitePhone} onChange={e=>setInvitePhone(e.target.value)} placeholder="e.g. 4195551234" style={{...inp,flex:1}} inputMode="tel"/>
              <button onClick={async()=>{try{if("contacts" in navigator&&"ContactsManager" in window){const contacts=await navigator.contacts.select(["name","tel"],{multiple:false});if(contacts&&contacts.length>0&&contacts[0].tel?.length>0){setInvitePhone(contacts[0].tel[0].replace(/\D/g,""));t2("Contact selected!");}}else{t2("Type the number manually");}}catch{t2("Type the number manually");}}} style={{flexShrink:0,padding:"0 12px",background:C.green,border:"none",borderRadius:10,color:"#0a1a0f",fontSize:12,fontWeight:700,cursor:"pointer",height:50}}>👤</button>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:5}}>Tap 👤 to pick from your contacts</div>
          </div>
          <BigBtn onClick={()=>{const phone=invitePhone.replace(/\D/g,"");const msg=encodeURIComponent(`Hey ${player?.name}! Join me on Press to track our golf bets. Sign up here: ${inviteLink}`);window.open(`sms:${phone}?&body=${msg}`);}}>📱 Text {player?.name} the Invite</BigBtn>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:11,color:C.muted}}>OR</span><div style={{flex:1,height:1,background:C.border}}/></div>
          <div style={{background:C.dim,borderRadius:8,padding:"10px 12px",fontSize:11,color:C.muted,wordBreak:"break-all",border:`1px solid ${C.border}`}}>{inviteLink}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{try{await navigator.clipboard.writeText(inviteLink);t2("Copied!");}catch{t2("Copy the link above");}}} style={{flex:1,padding:"11px",background:C.dim,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,cursor:"pointer",fontWeight:600}}>📋 Copy</button>
            <button onClick={()=>window.open(`mailto:?subject=Join me on Press Golf&body=${encodeURIComponent(`Hey! Join me on Press: ${inviteLink}`)}`)} style={{flex:1,padding:"11px",background:C.dim,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,cursor:"pointer",fontWeight:600}}>📧 Email</button>
          </div>
          <GhostBtn onClick={()=>setSheet(null)}>Done</GhostBtn>
        </div>
      </Sheet>

      {/* SETTLE SHEET */}
      <Sheet open={sheet==="settle"} onClose={()=>{setSheet(null);setPartialAmt("");}}>
        {player&&(<div style={{padding:"0 0 10px"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:40,marginBottom:8}}>🤝</div>
            <div style={{background:"rgba(0,0,0,0.3)",border:`1px solid ${player.bank>0?C.green:player.bank<0?C.red:C.border}`,borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{player.bank>0?`${player.name} owes you`:player.bank<0?`You owe ${player.name}`:"You're even"}</div>
              <Money value={player.bank} size={40}/>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>Total Balance</div>
            </div>
            {player.bank!==0&&<div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>{[{l:"Rounds",v:player.round_money},{l:"Side Bets",v:player.bet_money}].map((item,i)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"10px",borderRight:i===0?`1px solid ${C.border}`:"none",background:"rgba(0,0,0,0.2)"}}><Money value={item.v} size={13}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{item.l}</div></div>))}</div>}
          </div>
          {player.bank!==0&&(
            <div>
              <div style={{marginBottom:12}}>
                <Lbl>Payment Amount</Lbl>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <input type="number" min="0" max={Math.abs(player.bank)} value={partialAmt} onChange={e=>setPartialAmt(e.target.value)} placeholder={`Max $${Math.abs(player.bank).toFixed(2)}`} style={{...inp,flex:1}} inputMode="decimal"/>
                  <button onClick={()=>setPartialAmt(String(Math.abs(player.bank).toFixed(2)))} style={{flexShrink:0,padding:"0 12px",background:C.dim,border:`1px solid ${C.border}`,borderRadius:8,color:C.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>Full</button>
                </div>
                {partialAmt&&Number(partialAmt)<Math.abs(player.bank)&&<div style={{fontSize:12,color:C.gold,textAlign:"center"}}>Remaining: ${(Math.abs(player.bank)-Number(partialAmt)).toFixed(2)}</div>}
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Pay With</div>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <button onClick={()=>openVenmo(player.venmo||player.name,Number(partialAmt)||player.bank)} style={{flex:1,padding:"12px 4px",background:"#008CFF",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Venmo</button>
                  <button onClick={()=>openCashApp(player.cashapp||player.name,Number(partialAmt)||player.bank)} style={{flex:1,padding:"12px 4px",background:"#00D54B",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Cash App</button>
                  <button onClick={()=>openZelle(player.phone||null)} style={{flex:1,padding:"12px 4px",background:"#6D1ED4",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Zelle</button>
                </div>
                <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:12}}>
                  Tap to open app → After paying, tap "Mark as Settled"
                </div>
              </div>
              <BigBtn onClick={()=>settleUp(partialAmt?(player.bank>0?Number(partialAmt):-Number(partialAmt)):player.bank)} disabled={saving} color={player.bank>0?C.green:C.red} textColor="#fff" style={{marginBottom:10}}>
                {saving?"Saving...":(player.bank>0?"Mark as Collected ✓":"Mark as Paid ✓")}
              </BigBtn>
            </div>
          )}
          {player.bank===0&&<div style={{color:C.green,fontSize:14,marginBottom:14,textAlign:"center"}}>Already square! ✓</div>}
          <GhostBtn onClick={()=>{setSheet(null);setPartialAmt("");}}>Cancel</GhostBtn>
        </div>)}
      </Sheet>

      {/* DISPUTE SHEET */}
      <Sheet open={sheet==="dispute"} onClose={()=>setSheet(null)} title="Dispute Amount">
        {disputeItem&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{disputeItem.date} · {disputeItem.kind==="round"?"Round":"Side Bet"}</div>
            <div style={{fontSize:15,fontWeight:600}}>Original: <Money value={disputeItem.kind==="round"?disputeItem.money:disputeItem.amount} size={15}/></div>
          </div>
          <div><Lbl>Proposed Amount ($)</Lbl><input type="number" min="0" value={disputeAmt} onChange={e=>setDisputeAmt(e.target.value)} style={inp} placeholder="Enter correct amount" inputMode="decimal"/></div>
          <div><Lbl>Reason (optional)</Lbl><input type="text" value={disputeReason} onChange={e=>setDisputeReason(e.target.value)} style={inp} placeholder="e.g. We agreed on $10 not $20"/></div>
          <BigBtn onClick={submitDispute} disabled={saving} color={C.gold} textColor="#0a1a0f">{saving?"Sending...":"Submit Dispute"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>)}
      </Sheet>

      {/* SEASON RESET SHEET */}
      <Sheet open={sheet==="seasonReset"} onClose={()=>setSheet(null)} title="Start New Season">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:40,marginBottom:8}}>🏆</div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>New Season with {player?.name}</div>
            <div style={{fontSize:12,color:C.muted}}>Archives all {pRounds.length} rounds and {pBets.length} bets. History preserved. Balance must be $0.</div>
          </div>
          {(player?.bank||0)!==0?(
            <div style={{background:"rgba(224,80,80,0.08)",border:"1px solid rgba(224,80,80,0.2)",borderRadius:8,padding:"12px",fontSize:13,color:C.red,textAlign:"center"}}>Settle up (${Math.abs(player?.bank||0).toFixed(2)}) before starting a new season.</div>
          ):(
            <BigBtn onClick={seasonReset} disabled={saving} color={C.gold} textColor="#0a1a0f">{saving?"Archiving...":"Start New Season 🏆"}</BigBtn>
          )}
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:24,width:"100%",maxWidth:360}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>Delete this entry?</div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{confirmDelete.kind==="round"?confirmDelete.date:confirmDelete.type}</div>
                <div style={{fontSize:12,color:C.muted}}>{confirmDelete.notes||confirmDelete.date}</div>
                <div style={{marginTop:6}}><Money value={confirmDelete.kind==="round"?confirmDelete.money:confirmDelete.amount} size={15}/></div>
              </div>
              <div style={{fontSize:12,color:C.red,marginBottom:10}}>Balance will adjust by <Money value={confirmDelete.kind==="round"?-confirmDelete.money:-confirmDelete.amount} size={12}/></div>
              <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Type <strong style={{color:C.red}}>DELETE</strong> to confirm</div>
              <input
                autoFocus
                value={deleteInput}
                onChange={e=>setDeleteInput(e.target.value)}
                placeholder="Type DELETE"
                autoCapitalize="characters"
                style={{width:"100%",padding:"12px",background:C.bg,border:`2px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.6)":C.border}`,borderRadius:8,color:C.red,fontSize:16,fontWeight:800,outline:"none",textAlign:"center",letterSpacing:3,boxSizing:"border-box",fontFamily:"monospace"}}
              />
            </div>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button onClick={()=>{setConfirmDelete(null);setDeleteInput("");}} style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>Keep It</button>
              <button
                disabled={deleteInput.toUpperCase()!=="DELETE"}
                onClick={async()=>{const item=confirmDelete;setConfirmDelete(null);setDeleteInput("");await archiveAndDelete(item,true);}}
                style={{flex:1,padding:"14px",background:deleteInput.toUpperCase()==="DELETE"?C.red:"#1a1a1a",color:deleteInput.toUpperCase()==="DELETE"?"#fff":C.dim,border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:deleteInput.toUpperCase()==="DELETE"?"pointer":"not-allowed",transition:"all 0.15s"}}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSettle&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:24,width:"100%",maxWidth:360}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>Delete this settlement?</div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>🤝 {confirmDeleteSettle.date}</div>
                <div style={{fontSize:20,fontWeight:800,color:C.green,marginTop:4}}>${Math.abs(confirmDeleteSettle.amount||0).toFixed(2)} settled</div>
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Type <strong style={{color:C.red}}>DELETE</strong> to confirm</div>
              <input
                autoFocus
                value={deleteInput}
                onChange={e=>setDeleteInput(e.target.value)}
                placeholder="Type DELETE"
                autoCapitalize="characters"
                style={{width:"100%",padding:"12px",background:C.bg,border:`2px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.6)":C.border}`,borderRadius:8,color:C.red,fontSize:16,fontWeight:800,outline:"none",textAlign:"center",letterSpacing:3,boxSizing:"border-box",fontFamily:"monospace"}}
              />
            </div>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button onClick={()=>{setConfirmDeleteSettle(null);setDeleteInput("");}} style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>Keep It</button>
              <button
                disabled={deleteInput.toUpperCase()!=="DELETE"}
                onClick={()=>deleteSettlement(confirmDeleteSettle)}
                style={{flex:1,padding:"14px",background:deleteInput.toUpperCase()==="DELETE"?C.red:"#1a1a1a",color:deleteInput.toUpperCase()==="DELETE"?"#fff":C.dim,border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:deleteInput.toUpperCase()==="DELETE"?"pointer":"not-allowed",transition:"all 0.15s"}}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STROKE SUGGESTION MODAL */}
      {strokeSuggest&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:24,width:"100%",maxWidth:360}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:40,marginBottom:10}}>{strokeSuggest.iWon?"🏆":"📉"}</div>
              <div style={{fontWeight:700,fontSize:20,marginBottom:6}}>{strokeSuggest.iWon?`You beat ${strokeSuggest.playerName}!`:`${strokeSuggest.playerName} won this one.`}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:20}}>Adjust strokes for next round?</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:20}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Now</div><div style={{fontSize:16,fontWeight:600}}>{strokeSuggest.currentLabel}</div></div>
                <div style={{fontSize:24,color:C.green}}>→</div>
                <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Next Round</div><div style={{fontSize:16,fontWeight:700,color:C.green}}>{strokeSuggest.suggestedLabel}</div></div>
              </div>
              {strokeSuggest.linked&&<div style={{fontSize:11,color:C.muted,marginBottom:10}}>Will send a request to {strokeSuggest.playerName} for approval.</div>}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStrokeSuggest(null)} style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>Keep Same</button>
              <button onClick={applyStrokeChange} style={{flex:1,padding:"14px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>Yes, Update ✓</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} error={toast.error}/>
    </div>
  );
}

// ── Activity Item ─────────────────────────────────────────────────────────────
// ── LINK STATUS PANEL ────────────────────────────────────────────────────────
function LinkStatusPanel({ player, user, isPro, saving, onGenerateInvite, onUnlink }) {
  const [pendingInvite, setPendingInvite] = React.useState(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!player?.id) return;
    async function checkInvite() {
      const { data } = await sb.from("invites")
        .select("*")
        .eq("player_id", player.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPendingInvite(data || null);
    }
    checkInvite();
  }, [player?.id, player?.linked_user_id]);

  async function refresh() {
    setChecking(true);
    const { data: inv } = await sb.from("invites")
      .select("*")
      .eq("player_id", player.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPendingInvite(inv || null);

    // Also refresh player row to pick up linked_user_id if they just accepted
    const { data: p } = await sb.from("players").select("*").eq("id", player.id).single();
    if (p) {
      // bubble up — parent will need a reload; simplest is page reload
      if (p.linked_user_id && !player.linked_user_id) {
        window.location.reload();
      }
    }
    setChecking(false);
  }

  const isLinked = !!player?.linked_user_id;

  if (isLinked) {
    return (
      <div style={{background:"rgba(123,180,80,0.07)",border:"1px solid rgba(123,180,80,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontWeight:700,fontSize:14,color:C.green}}>🔗 Linked Account</div>
          <button onClick={onUnlink} style={{background:"transparent",border:"none",color:C.red,fontSize:11,cursor:"pointer",fontWeight:600}}>Unlink</button>
        </div>
        <div style={{fontSize:12,color:C.muted,marginBottom:4}}>
          {player.linked_email
            ? <span>Connected as <span style={{color:C.text,fontWeight:600}}>{player.linked_email}</span></span>
            : "Account linked — email not available"}
        </div>
        <div style={{fontSize:11,color:C.green,marginTop:6}}>
          ✅ Auto-syncing · Disputes, stroke requests & settlements active
        </div>
      </div>
    );
  }

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontWeight:700,fontSize:14}}>Invite to Press</div>
        <button onClick={refresh} disabled={checking} style={{background:"transparent",border:"none",color:C.muted,fontSize:11,cursor:"pointer",fontWeight:600}}>
          {checking ? "Checking..." : "↻ Refresh"}
        </button>
      </div>

      {/* Invite status */}
      {pendingInvite ? (
        <div style={{marginBottom:10}}>
          {pendingInvite.accepted ? (
            <div style={{background:"rgba(123,180,80,0.1)",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,fontWeight:600}}>
              ✅ Invite accepted — tap Refresh to confirm link
            </div>
          ) : (
            <div style={{background:"rgba(232,184,75,0.08)",border:`1px solid ${C.gold}33`,borderRadius:8,padding:"8px 12px",fontSize:12}}>
              <div style={{color:C.gold,fontWeight:600,marginBottom:2}}>⏳ Invite sent — waiting for {player.name}</div>
              <div style={{color:C.muted,fontSize:11}}>They haven't accepted yet. Tap Refresh to check.</div>
              <div style={{color:C.dim,fontSize:10,marginTop:4,wordBreak:"break-all"}}>
                Code: {pendingInvite.code}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
          No invite sent yet. Generate a link to connect {player.name}'s account.
        </div>
      )}

      {/* Action buttons */}
      {isPro ? (
        <div style={{display:"flex",gap:8}}>
          <BigBtn onClick={onGenerateInvite} disabled={saving} style={{flex:1}}>
            {saving ? "Generating..." : pendingInvite ? "New Invite Link 🔗" : "Generate Invite Link 🔗"}
          </BigBtn>
        </div>
      ) : (
        <div style={{background:`rgba(232,184,75,0.08)`,border:`1px solid ${C.gold}33`,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.muted,textAlign:"center"}}>
          ⭐ Pro feature — upgrade to invite players
        </div>
      )}
    </div>
  );
}

function ActivityItem({item, onDelete}){
  const isArchived=item.kind==="archived_round"||item.kind==="archived_bet";
  const isRound=item.kind==="round"||item.kind==="archived_round";
  const value=isRound?(item.money||0):(item.amount||0);
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:isArchived?"rgba(100,100,100,0.06)":C.card,borderRadius:10,marginBottom:8,border:`1px solid ${isArchived?"rgba(150,150,150,0.15)":item.kind==="bet"?"rgba(232,184,75,0.15)":C.border}`,opacity:isArchived?0.7:1}}>
      <span style={{fontSize:16}}>{isArchived?"🗑️":isRound?"🏌️":"🎯"}</span>
      <div style={{flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontWeight:600,fontSize:13}}>{isRound?(item.date||item.archived_at?.slice(0,10)):(item.type||"Bet")}</span>
          {isArchived&&<span style={{fontSize:9,color:C.muted,background:"rgba(150,150,150,0.15)",padding:"1px 6px",borderRadius:6}}>Archived</span>}
        </div>
        {(item.notes||(!isRound&&item.date))&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{!isRound&&item.date?item.date:""}{item.notes?` · ${item.notes}`:""}</div>}
      </div>
      <Money value={value} size={14}/>
      {onDelete&&!isArchived&&(
        <button onClick={()=>onDelete(item)}
          style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",padding:"0 2px",flexShrink:0,lineHeight:1}}
          title="Delete">✕</button>
      )}
    </div>
  );
}
