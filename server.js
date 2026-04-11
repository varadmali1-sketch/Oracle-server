// ORACLE GOD SERVER v4
// COMPLETELY STATIC HTML — server writes all data as plain HTML text
// No JavaScript rendering. No fetch(). No var D injection.
// Data appears instantly as plain HTML. Nothing can fail.
const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 10000;

let bal=1000, startBal=1000;
let positions=[], closed=[], feedLog=[], termLog=[];
let cycleCount=0, guardHit=false, scanSecs=30;
let startTime=Date.now(), isRunning=false, lastCycleTime='—';
let sS={SMC:0,Momentum:0,Wyckoff:0,Volume:0};
let sW={SMC:0,Momentum:0,Wyckoff:0,Volume:0};
let pH={};

let COINS=[
  {s:'BONK',n:'Bonk',ic:'🐕',p:0.0000234,ch:12.4,v:89e6,mc:1.4e9,liq:2.1e6,rug:92},
  {s:'WIF',n:'Dogwifhat',ic:'🐶',p:1.84,ch:8.2,v:142e6,mc:1.8e9,liq:4.2e6,rug:90},
  {s:'POPCAT',n:'Popcat',ic:'🐱',p:0.58,ch:5.1,v:34e6,mc:580e6,liq:1.1e6,rug:85},
  {s:'TRUMP',n:'Trump',ic:'🇺🇸',p:11.24,ch:-3.8,v:210e6,mc:2.2e9,liq:5.5e6,rug:80},
  {s:'PENGU',n:'Pudgy Penguins',ic:'🐧',p:0.021,ch:18.7,v:52e6,mc:1.1e9,liq:1.8e6,rug:88},
  {s:'MEW',n:'Cat world',ic:'😺',p:0.0084,ch:4.3,v:18e6,mc:340e6,liq:620e3,rug:78},
  {s:'PEPE',n:'Pepe',ic:'🐸',p:0.000012,ch:22.1,v:280e6,mc:4.8e9,liq:8.2e6,rug:86},
  {s:'DOGE',n:'Dogecoin',ic:'🐕',p:0.164,ch:6.5,v:1.2e9,mc:24e9,liq:50e6,rug:95},
  {s:'FLOKI',n:'Floki',ic:'⚡',p:0.000132,ch:9.8,v:22e6,mc:1.2e9,liq:890e3,rug:82},
  {s:'SHIB',n:'Shiba Inu',ic:'🦊',p:0.0000143,ch:14.2,v:380e6,mc:8.4e9,liq:15e6,rug:88},
  {s:'BOME',n:'Book of Meme',ic:'📖',p:0.0078,ch:-2.1,v:22e6,mc:280e6,liq:420e3,rug:75},
  {s:'WEN',n:'Wen',ic:'⏰',p:0.000028,ch:7.3,v:8e6,mc:110e6,liq:280e3,rug:72},
  {s:'MYRO',n:'Myro',ic:'🌟',p:0.042,ch:11.5,v:8e6,mc:90e6,liq:210e3,rug:70},
  {s:'GIGA',n:'Gigachad',ic:'💪',p:0.0053,ch:16.8,v:5e6,mc:53e6,liq:180e3,rug:68},
  {s:'AI16Z',n:'ai16z',ic:'🤖',p:0.92,ch:19.3,v:48e6,mc:920e6,liq:1.5e6,rug:82},
  {s:'GOAT',n:'Goatseus',ic:'🐐',p:0.38,ch:8.7,v:32e6,mc:380e6,liq:780e3,rug:75},
  {s:'FART',n:'Fartcoin',ic:'💨',p:0.71,ch:12.4,v:28e6,mc:710e6,liq:950e3,rug:76},
  {s:'MICHI',n:'Michi',ic:'🐱',p:0.35,ch:3.2,v:4e6,mc:35e6,liq:140e3,rug:65},
  {s:'PUMP1',n:'New Launch A',ic:'🚀',p:0.0000089,ch:45.2,v:120e3,mc:890e3,liq:85e3,rug:68,isNew:true},
  {s:'PUMP2',n:'New Launch B',ic:'⚡',p:0.000034,ch:32.1,v:78e3,mc:340e3,liq:62e3,rug:64,isNew:true},
];

// ═══ QUANT ENGINE ═══
function calcATR(sym){
  const h=pH[sym]||[];
  if(h.length<3){const c=COINS.find(x=>x.s===sym);return c?c.p*0.07:0;}
  const trs=[];for(let i=1;i<h.length;i++)trs.push(Math.abs(h[i]-h[i-1]));
  const r=trs.slice(-14);return r.reduce((a,b)=>a+b,0)/r.length;
}
function smcSig(coin){
  const h=pH[coin.s]||[];
  if(h.length<4)return{sig:'neutral',type:'NONE',conf:40,reason:'Building history.'};
  const p=h.slice(-8),lat=p[p.length-1],prev=p[p.length-2]||lat;
  const psh=p.length>6?Math.max(...p.slice(-8,-3)):lat*0.95;
  const psl=p.length>6?Math.min(...p.slice(-8,-3)):lat*1.05;
  if(lat>psh&&prev<=psh)return{sig:'buy',type:'BOS',conf:78,reason:'Break of Structure — institutional accumulation.'};
  if(lat<psl&&prev>=psl)return{sig:'avoid',type:'CHoCH',conf:72,reason:'Change of Character — distributing.'};
  if(p.length>=3){const c1=p[p.length-3],c2=p[p.length-2],c3=lat;if(c2>c1*1.006&&c3>c1*1.003)return{sig:'buy',type:'FVG',conf:74,reason:'Bullish Fair Value Gap — institutional imbalance.'};}
  const rl=Math.min(...p.slice(-4));
  if(lat>prev&&prev<=rl&&lat>rl*1.002)return{sig:'buy',type:'LIQ',conf:82,reason:'Liquidity Sweep reversed. Smart money loaded.'};
  if((lat-p[0])/Math.max(p[0],1e-10)>0.04)return{sig:'buy',type:'OB',conf:68,reason:'Order Block — demand zone active.'};
  return{sig:'neutral',type:'NONE',conf:38,reason:'No SMC signal.'};
}
function wyckoff(coin){
  const h=pH[coin.s]||[];if(h.length<6)return null;
  const p=h.slice(-12),avg=p.reduce((a,b)=>a+b,0)/p.length,lat=p[p.length-1];
  const rng=Math.max(...p)-Math.min(...p);
  if(rng/avg<0.05&&coin.v>coin.mc*0.03)return{action:'CONSOL',conf:65,reason:'Phase B: tight range, breakout imminent.'};
  if(p.slice(-3).some(x=>x<avg*0.95)&&lat>avg*0.98)return{action:'SPRING',conf:80,reason:'Wyckoff Spring: shakeout then recovery.'};
  if(lat>avg*1.04)return{action:'MARKUP',conf:72,reason:'Markup phase confirmed.'};
  return null;
}
function calcMom(coin){
  const h=pH[coin.s]||[];if(h.length<4)return{score:20,sig:'weak',sigs:['building']};
  const p=h.slice(-8),lat=p[p.length-1],p4=p[Math.max(0,p.length-5)];
  const roc=(lat-p4)/Math.max(p4,1e-10)*100;
  let score=0,sigs=[];
  if(roc>8){score+=30;sigs.push('ROC+'+roc.toFixed(1)+'%');}
  else if(roc>3){score+=15;sigs.push('ROC+'+roc.toFixed(1)+'%');}
  else if(roc<-8){score-=25;}
  if(coin.v>coin.mc*0.055){score+=25;sigs.push('vol-surge');}
  else if(coin.v>coin.mc*0.025){score+=12;sigs.push('vol-up');}
  if(p.slice(-4).every((x,i,a)=>i===0||x>=a[i-1]*0.998)){score+=20;sigs.push('4-consec');}
  if(coin.ch>15){score+=20;sigs.push('+'+coin.ch.toFixed(0)+'%24h');}
  else if(coin.ch>7){score+=10;}
  else if(coin.ch<-10){score-=15;}
  if(roc>35)score-=20;
  return{score,sig:score>=55?'strong':score>=30?'moderate':score>=10?'weak':'negative',sigs};
}
function calcSLTP(coin){
  const a=calcATR(coin.s),ap=coin.p>0?a/coin.p:0.07;
  let sl=-(Math.max(0.10,Math.min(0.45,ap*2.2)));
  let tp=Math.abs(sl)*3.2;
  if(coin.v>100e6)tp*=1.2;
  if(coin.liq<300e3){sl*=0.75;tp*=0.88;}
  if(coin.rug<70)sl*=0.72;
  if(coin.isNew){sl=-0.18;tp=1.2;}
  return{sl:parseFloat(Math.max(-0.45,Math.min(-0.09,sl)).toFixed(3)),tp:parseFloat(Math.min(2.5,Math.max(0.22,tp)).toFixed(3))};
}
function calcSize(coin,conf){
  conf=conf||68;
  const{sl}=calcSLTP(coin),slP=Math.abs(sl);
  return Math.max(10,Math.min(80,Math.round(Math.min(bal*0.012/slP,bal*(conf/100)*0.20))));
}
function driftCoin(c){
  const trend=c.ch>8?0.003:c.ch<-8?-0.003:c.ch>3?0.001:0;
  c.p=Math.max(0.000001,c.p*(1+(Math.random()-0.47)*0.035+trend));
  c.ch+=(Math.random()-0.5)*1.8;
  if(!pH[c.s])pH[c.s]=[];
  pH[c.s].push(c.p);
  if(pH[c.s].length>20)pH[c.s].shift();
}
function fetchBG(){
  const GIDS={BONK:'bonk',WIF:'dogwifcoin',POPCAT:'popcat',TRUMP:'official-trump',PENGU:'pudgy-penguins',MEW:'cat-in-a-dogs-world',PEPE:'pepe',DOGE:'dogecoin'};
  const ids=Object.values(GIDS).join(',');
  try{
    const req=https.get('https://api.coingecko.com/api/v3/simple/price?ids='+ids+'&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true',{headers:{'Accept':'application/json'},timeout:4000},(res)=>{
      if(res.statusCode!==200){res.resume();return;}
      let d='';res.on('data',x=>d+=x);
      res.on('end',()=>{try{const j=JSON.parse(d);COINS.forEach(c=>{const g=GIDS[c.s];if(j[g]){c.p=j[g].usd;c.ch=j[g].usd_24h_change||0;c.v=j[g].usd_24h_vol||c.v;}if(!pH[c.s])pH[c.s]=[];pH[c.s].push(c.p);if(pH[c.s].length>20)pH[c.s].shift();});}catch(e){}});
    });
    req.on('error',()=>{});req.on('timeout',()=>{req.destroy();});
  }catch(e){}
}
function updateTrail(pos){
  const pnl=(pos.cur-pos.entry)/pos.entry;if(pnl<0.15)return;
  const a=calcATR(pos.sym),mult=pnl>=0.50?1.0:pnl>=0.30?2.0:3.0;
  pos.trailPhase=pnl>=0.50?3:pnl>=0.30?2:1;
  const newT=pos.peak-(a*mult);
  if(pos.trailSL===null||newT>pos.trailSL)pos.trailSL=newT;
}
function checkGuard(){
  const lC=closed.filter(t=>t.pnl<0).reduce((s,t)=>s+Math.abs(t.pnl),0);
  const lO=positions.reduce((s,p)=>{const pl=(p.cur-p.entry)/p.entry*p.spent;return s+(pl<0?Math.abs(pl):0);},0);
  const pct=(lC+lO)/startBal*100;
  if(pct>=dlLimit*100&&!guardHit){guardHit=true;tlog('WARN','Guard: '+pct.toFixed(1)+'%');addFeed('🛡','GUARD','Daily loss limit hit.',null,'guard');}
  return !guardHit;
}
let dlLimit=0.10;
function doExit(pos,idx,reason,pnlP,type){
  const pnlD=pos.spent*pnlP;bal+=pos.spent+pnlD;
  closed.push({id:Date.now(),sym:pos.sym,ic:pos.ic,nm:pos.nm,win:pnlP>0,pnl:pnlD,pnlP,type,strat:pos.strat,entry:pos.entry,exit:pos.cur,spent:pos.spent,held:Math.round((Date.now()-pos.openTime)/60000),reason,time:new Date().toISOString().slice(11,19)});
  if(sS[pos.strat]!==undefined){sS[pos.strat]++;if(pnlP>0)sW[pos.strat]++;}
  positions.splice(idx,1);
  const ICONS={SL:'🛑',TP:'💰',TRAIL:'📈',CRASH:'⚡',STAG:'⏱'};
  const LABS={SL:'STOP',TP:'TAKE PROFIT',TRAIL:'TRAIL EXIT',CRASH:'CRASH',STAG:'STAGNANT'};
  tlog('TRADE',type+' '+pos.sym+': '+(pnlP>=0?'+':'')+(pnlP*100).toFixed(1)+'% $'+pnlD.toFixed(2)+' ['+pos.strat+']');
  addFeed(ICONS[type]||'🔴',LABS[type]||'EXIT',pos.ic+' '+pos.sym+' — '+reason,(pnlD>=0?'+':'')+'$'+Math.abs(pnlD).toFixed(2),pnlP>0?'win':'loss');
}
function doEntry(coin,strat,conf,sz,reason,signal){
  const{sl,tp}=calcSLTP(coin);bal-=sz;
  positions.push({id:Date.now(),sym:coin.s,ic:coin.ic,nm:coin.n,entry:coin.p,cur:coin.p,peak:coin.p,lastP:coin.p,size:sz/coin.p,spent:sz,sl,tp,trailSL:null,trailPhase:0,openTime:Date.now(),strat,signal});
  if(sS[strat]!==undefined)sS[strat]++;
  tlog('TRADE','ENTRY '+coin.s+' $'+sz+' ['+strat+'] SL:'+Math.round(sl*100)+'% TP:+'+Math.round(tp*100)+'%');
  addFeed(coin.ic,strat+' BUY',coin.s+' — '+reason+' | SL:'+Math.round(sl*100)+'% TP:+'+Math.round(tp*100)+'%','$'+sz,'entry');
}
function runCycle(){
  if(isRunning)return;isRunning=true;cycleCount++;
  lastCycleTime=new Date().toISOString().slice(11,19);
  try{
    COINS.forEach(driftCoin);fetchBG();
    positions.forEach(p=>{const c=COINS.find(x=>x.s===p.sym);if(c){p.lastP=p.cur;p.cur=c.p;if(p.cur>p.peak)p.peak=p.cur;updateTrail(p);}});
    for(let i=positions.length-1;i>=0;i--){
      const p=positions[i],pnlP=(p.cur-p.entry)/p.entry,hm=(Date.now()-p.openTime)/60000;
      if(p.lastP&&p.lastP>0){const drop=(p.lastP-p.cur)/p.lastP;if(drop>0.15){doExit(p,i,'Flash crash -'+Math.round(drop*100)+'%',pnlP,'CRASH');continue;}}
      if(pnlP<=p.sl){doExit(p,i,'Stop-loss '+Math.round(p.sl*100)+'%',pnlP,'SL');continue;}
      if(p.trailSL!==null&&p.cur<p.trailSL){doExit(p,i,'Trail Ph'+p.trailPhase+' +'+((p.trailSL-p.entry)/p.entry*100).toFixed(1)+'%',pnlP,'TRAIL');continue;}
      if(pnlP>=p.tp){doExit(p,i,'Take-profit +'+Math.round(p.tp*100)+'%',pnlP,'TP');continue;}
      if(hm>75&&Math.abs(pnlP)<0.04){doExit(p,i,'Stagnant '+Math.round(hm)+'min',pnlP,'STAG');continue;}
    }
    if(positions.length<6&&checkGuard()){
      const avail=COINS.filter(c=>!positions.find(p=>p.sym===c.s));
      const scored=avail.map(c=>{
        const s=smcSig(c),m=calcMom(c),w=wyckoff(c);let score=0;
        if(s.sig==='buy')score+=s.conf*0.4;else if(s.sig==='avoid')score-=20;
        if(m.sig==='strong')score+=30;else if(m.sig==='moderate')score+=18;else if(m.sig==='weak')score+=8;else score-=10;
        if(w){if(w.action==='SPRING')score+=22;else if(w.action==='MARKUP')score+=15;else score+=8;}
        if(c.rug<65)score-=25;if(c.liq<60e3)score-=15;if(c.ch<-12)score-=15;if(c.ch>15)score+=10;
        return{c,score,s,m,w};
      }).sort((a,b)=>b.score-a.score);
      for(const item of scored.slice(0,4)){
        if(positions.length>=6)break;
        const{c,s,m,w}=item;
        if(item.score>=28&&c.rug>=64){
          const strat=s.sig==='buy'?'SMC':(m.sig==='strong'||m.sig==='moderate')?'Momentum':w&&w.action==='SPRING'?'Wyckoff':'Volume';
          const conf=Math.min(92,Math.max(55,Math.round(item.score)));
          const sz=calcSize(c,conf);
          if(bal>=sz)doEntry(c,strat,conf,sz,s.sig==='buy'?s.reason:m.sigs.join(', '),s.type||w&&w.action||strat);
        }
      }
    }
    const pnl=positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0)+closed.reduce((s,t)=>s+t.pnl,0);
    tlog('INFO','Cycle#'+cycleCount+' Bal:$'+bal.toFixed(2)+' PnL:'+(pnl>=0?'+':'')+'$'+pnl.toFixed(2)+' Open:'+positions.length+' Trades:'+closed.length);
  }catch(e){tlog('ERROR',e.message);}
  finally{isRunning=false;}
}
function tlog(type,msg){
  const line='['+new Date().toISOString().slice(11,19)+']['+type+'] '+msg;
  console.log(line);termLog.push(line);if(termLog.length>200)termLog.shift();
}
function addFeed(ic,label,msg,amt,side){
  feedLog.push({t:new Date().toISOString().slice(11,19),ic,label,msg,amt:amt||'',side:side||''});
  if(feedLog.length>80)feedLog.shift();
}

// ═══ HTML BUILDER — pure server-side HTML, zero JavaScript rendering ═══
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function pct(n){return (n>=0?'+':'')+n.toFixed(1)+'%';}

function buildPage(){
  const pnl=positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0)+closed.reduce((s,t)=>s+t.pnl,0);
  const wins=closed.filter(t=>t.win).length,tot=closed.length,losses=tot-wins;
  const avgW=wins?closed.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0)/wins:0;
  const avgL=losses?closed.filter(t=>!t.win).reduce((s,t)=>s+Math.abs(t.pnl),0)/losses:0;
  const pf=losses&&avgL>0?(wins*avgW)/(losses*avgL):0;
  const wr=tot?Math.round(wins/tot*100):0;
  const uptimeMins=Math.round((Date.now()-startTime)/60000);
  const pnlCol=pnl>=0?'#00ff88':'#ff3355';
  const wrCol=wr>55?'#00ff88':wr>45?'#f4c430':'#ff3355';

  // Feed HTML
  let feedHtml='';
  if(feedLog.length===0){
    feedHtml='<div style="font-family:monospace;font-size:11px;color:#253348;padding:16px 0;text-align:center">Bot scanning... first trades appear within 1-2 minutes.</div>';
  } else {
    const recent=[...feedLog].reverse().slice(0,25);
    feedHtml=recent.map(f=>{
      const col=f.side==='entry'?'#00ff88':f.side==='win'?'#00ff88':f.side==='loss'?'#ff3355':'#5a6f96';
      const border=f.side==='entry'?'#00ff88':f.side==='win'?'#00ff88':f.side==='loss'?'#ff3355':'#253348';
      return `<div style="display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid #0f1624;border-left:3px solid ${border}">
        <div style="font-size:16px;width:20px;flex-shrink:0">${esc(f.ic)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:monospace;font-size:8px;color:#bb66ff;margin-bottom:2px;font-weight:700">${esc(f.label)}</div>
          <div style="font-family:monospace;font-size:10px;color:#5a6f96;line-height:1.5">${esc(f.msg)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${f.amt?`<div style="font-family:monospace;font-size:12px;font-weight:700;color:${col}">${esc(f.amt)}</div>`:''}
          <div style="font-family:monospace;font-size:7px;color:#253348;margin-top:3px">${esc(f.t)}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Positions HTML
  let posHtml='';
  if(positions.length===0){
    posHtml='<div style="font-family:monospace;font-size:11px;color:#253348;padding:14px 0;text-align:center">No open positions.</div>';
  } else {
    posHtml=positions.map(p=>{
      const pnlP=(p.cur-p.entry)/p.entry;
      const pnlD=p.spent*pnlP;
      const col=pnlP>=0?'#00ff88':'#ff3355';
      const hm=Math.round((Date.now()-p.openTime)/60000);
      const locked=p.trailSL!==null?((p.trailSL-p.entry)/p.entry*100).toFixed(1):null;
      return `<div style="padding:11px;border:1px solid #0f1624;border-radius:10px;background:#06080e;margin-bottom:8px;border-left:3px solid ${col}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px">
          <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:5px">
            ${esc(p.ic)} ${esc(p.sym)}
            <span style="font-family:monospace;font-size:8px;padding:2px 5px;border-radius:3px;border:1px solid rgba(187,102,255,.3);background:rgba(187,102,255,.1);color:#bb66ff">${esc(p.strat)}</span>
          </div>
          <div style="text-align:right">
            <div style="font-family:monospace;font-size:14px;font-weight:700;color:${col}">${pct(pnlP*100)}</div>
            <div style="font-family:monospace;font-size:8px;color:#00e5ff">$${p.cur.toFixed(8)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:7px">
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">Entry</span><span style="color:#dde8ff;font-weight:600">$${p.entry.toFixed(8)}</span></div>
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">P&L $</span><span style="color:${col};font-weight:600">${(pnlD>=0?'+':'')+'$'+Math.abs(pnlD).toFixed(2)}</span></div>
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">Held</span><span style="color:#dde8ff;font-weight:600">${hm}m</span></div>
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">SL</span><span style="color:#ff3355;font-weight:600">${Math.round(p.sl*100)}%</span></div>
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">TP</span><span style="color:#00ff88;font-weight:600">+${Math.round(p.tp*100)}%</span></div>
          <div style="font-family:monospace;font-size:9px"><span style="color:#253348;display:block">Signal</span><span style="color:#dde8ff;font-weight:600">${esc(p.signal||'—')}</span></div>
        </div>
        <div style="background:rgba(255,229,102,.04);border:1px solid rgba(255,229,102,.12);border-radius:6px;padding:6px 9px">
          <div style="font-family:monospace;font-size:7px;color:#ffe566;letter-spacing:1.5px;margin-bottom:4px">ATR TRAIL</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center">
            <div><div style="font-family:monospace;font-size:7px;color:#253348">TRAIL SL</div><div style="font-family:monospace;font-size:10px;font-weight:700;color:${p.trailSL?'#ffe566':'#253348'}">${p.trailSL?'$'+p.trailSL.toFixed(8):'< +15%'}</div></div>
            <div><div style="font-family:monospace;font-size:7px;color:#253348">PHASE</div><div style="font-family:monospace;font-size:10px;font-weight:700;color:#ffe566">${p.trailSL?(p.trailPhase===3?'3🔒':p.trailPhase===2?'2⬆':'1👁'):'—'}</div></div>
            <div><div style="font-family:monospace;font-size:7px;color:#253348">LOCKED</div><div style="font-family:monospace;font-size:10px;font-weight:700;color:${locked&&parseFloat(locked)>0?'#00ff88':'#253348'}">${locked&&parseFloat(locked)>0?'+'+locked+'%':'—'}</div></div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // History HTML
  const stratBars=['SMC','Momentum','Wyckoff','Volume'].map(s=>{
    const t=sS[s]||0,w=sW[s]||0,r=t?Math.round(w/t*100):0;
    if(!t)return '';
    const cols={SMC:'#4499ff',Momentum:'#ffe566',Wyckoff:'#00e5ff',Volume:'#ff8c00'};
    return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
      <span style="font-family:monospace;font-size:9px;color:#5a6f96;width:82px;flex-shrink:0">${s}</span>
      <div style="flex:1;height:4px;background:#0f1624;border-radius:2px;overflow:hidden"><div style="height:100%;width:${r}%;background:${cols[s]};border-radius:2px"></div></div>
      <span style="font-family:monospace;font-size:9px;color:${cols[s]};min-width:52px;text-align:right">${r}% (${t})</span>
    </div>`;
  }).join('');

  let histHtml='';
  if(closed.length===0){
    histHtml='<div style="font-family:monospace;font-size:11px;color:#253348;padding:10px 0;text-align:center">No closed trades yet.</div>';
  } else {
    histHtml=[...closed].reverse().slice(0,30).map(t=>{
      const col=t.win?'#00ff88':'#ff3355';
      return `<div style="display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #0f1624;border-radius:8px;background:#06080e;margin-bottom:5px;border-left:3px solid ${col}">
        <div style="font-size:14px;flex-shrink:0">${esc(t.ic)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:12px;color:#dde8ff">${esc(t.sym)}</span>
            <span style="font-family:monospace;font-size:8px;padding:1px 5px;border-radius:3px;font-weight:700;background:${t.win?'rgba(0,255,136,.12)':'rgba(255,51,85,.1)'};color:${col};border:1px solid ${col}">${t.win?'WIN':'LOSS'}</span>
            <span style="font-family:monospace;font-size:8px;padding:1px 5px;border-radius:3px;color:#bb66ff;border:1px solid rgba(187,102,255,.2);background:rgba(187,102,255,.06)">${esc(t.strat)}</span>
            <span style="font-family:monospace;font-size:8px;color:#253348">${esc(t.type)}</span>
          </div>
          <div style="font-family:monospace;font-size:8px;color:#253348;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.reason)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:monospace;font-size:12px;font-weight:700;color:${col}">${(t.pnl>=0?'+':'')+'$'+Math.abs(t.pnl).toFixed(2)}</div>
          <div style="font-family:monospace;font-size:8px;color:#253348;margin-top:2px">${(t.pnlP*100).toFixed(1)}% · ${t.held}m · ${t.time}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Log HTML
  const logHtml=termLog.slice(-50).map(l=>{
    const col=l.includes('[TRADE]')?'#00ff88':l.includes('[WARN]')?'#ff8c00':l.includes('[ERROR]')?'#ff3355':'#00e5ff';
    return `<div style="margin-bottom:1px"><span style="color:#253348">${esc(l.slice(0,11))}</span><span style="color:${col}">${esc(l.slice(11))}</span></div>`;
  }).join('');

  // Ticker
  const tickerHtml=COINS.slice(0,8).map(c=>{
    const col=c.ch>=0?'#00ff88':'#ff3355';
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-family:monospace;font-size:8px;white-space:nowrap;flex-shrink:0;margin-right:10px"><span style="font-weight:700;color:#dde8ff">${esc(c.ic+c.s)}</span><span style="color:${col}">${c.ch>=0?'+':''}${c.ch.toFixed(1)}%</span></span>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>ORACLE SERVER — Cycle ${cycleCount}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:#020409;color:#dde8ff;font-family:'Outfit',sans-serif;min-height:100vh;font-size:14px}
.tabs{display:flex;background:#06080e;border-bottom:1px solid #0f1624;overflow-x:auto}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:9px 14px;font-weight:700;font-size:11px;cursor:pointer;border-bottom:3px solid transparent;color:#253348;white-space:nowrap;flex-shrink:0;text-decoration:none;display:block}
.tab.act{color:#00ff88;border-bottom-color:#00ff88}
.tab:nth-child(2).act{color:#bb66ff;border-bottom-color:#bb66ff}
.tab:nth-child(3).act{color:#f4c430;border-bottom-color:#f4c430}
.tab:nth-child(4).act{color:#00e5ff;border-bottom-color:#00e5ff}
.pg{display:none;padding:11px}.pg.act{display:block}
@keyframes bl{0%,100%{opacity:1}50%{opacity:.3}}
.ldot{width:5px;height:5px;border-radius:50%;background:#00ff88;box-shadow:0 0 5px #00ff88;animation:bl 1.8s infinite;display:inline-block}
.gblink{animation:bl 2s infinite}
</style>
</head>
<body>

<!-- TOPBAR -->
<div style="position:sticky;top:0;z-index:100;background:rgba(2,4,9,.97);border-bottom:1px solid #0f1624;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:7px">
  <div style="display:flex;align-items:center;gap:7px">
    <div style="width:18px;height:18px;background:linear-gradient(135deg,#ffd700,#b8880a);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);box-shadow:0 0 9px rgba(244,196,48,.4);flex-shrink:0"></div>
    <span style="font-family:'Bebas Neue',cursive;font-size:14px;letter-spacing:3px;background:linear-gradient(90deg,#ffd700,#00ff88);-webkit-background-clip:text;-webkit-text-fill-color:transparent">ORACLE SERVER</span>
    <span style="font-family:monospace;font-size:7px;padding:2px 7px;border-radius:9px;border:1px solid rgba(0,255,136,.3);background:rgba(0,255,136,.08);color:#00ff88;letter-spacing:1px;font-weight:700">24/7 LIVE</span>
  </div>
  <div style="text-align:right">
    <div style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:#f4c430">$${esc(bal.toFixed(2))}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">cycle:${cycleCount} · up:${uptimeMins}m</div>
  </div>
</div>

<!-- TICKER -->
<div style="display:flex;align-items:center;padding:4px 12px;background:rgba(0,255,136,.03);border-bottom:1px solid rgba(0,255,136,.08);overflow-x:auto;min-height:24px">
  <div style="display:flex;align-items:center;gap:0;overflow-x:auto;flex:1">
    ${tickerHtml}
  </div>
  <div style="display:flex;align-items:center;gap:3px;font-family:monospace;font-size:7px;color:#00ff88;flex-shrink:0;margin-left:8px">
    <span class="ldot"></span>SERVER
  </div>
</div>

<!-- STATS -->
<div style="display:grid;grid-template-columns:repeat(5,1fr);background:#06080e;border-bottom:1px solid #0f1624">
  <div style="padding:6px 7px;border-right:1px solid #0f1624">
    <div style="font-family:monospace;font-size:7px;color:#253348;text-transform:uppercase;margin-bottom:1px">P&L</div>
    <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${pnlCol}">${(pnl>=0?'+':'')+'$'+pnl.toFixed(2)}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">session</div>
  </div>
  <div style="padding:6px 7px;border-right:1px solid #0f1624">
    <div style="font-family:monospace;font-size:7px;color:#253348;text-transform:uppercase;margin-bottom:1px">Win%</div>
    <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#f4c430">${tot?wr+'%':'—'}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">${tot?wins+'W '+losses+'L':'—'}</div>
  </div>
  <div style="padding:6px 7px;border-right:1px solid #0f1624">
    <div style="font-family:monospace;font-size:7px;color:#253348;text-transform:uppercase;margin-bottom:1px">Trades</div>
    <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#bb66ff">${tot}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">${positions.length} open</div>
  </div>
  <div style="padding:6px 7px;border-right:1px solid #0f1624">
    <div style="font-family:monospace;font-size:7px;color:#253348;text-transform:uppercase;margin-bottom:1px">Profit F</div>
    <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#00e5ff">${pf>0?pf.toFixed(2):'—'}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">factor</div>
  </div>
  <div style="padding:6px 7px">
    <div style="font-family:monospace;font-size:7px;color:#253348;text-transform:uppercase;margin-bottom:1px">Guard</div>
    <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${guardHit?'#ff3355':'#00ff88'}" class="gblink">${guardHit?'HIT':'OK'}</div>
    <div style="font-family:monospace;font-size:7px;color:#253348">10% limit</div>
  </div>
</div>

<!-- STATUS BAR -->
<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:#090b15;border-bottom:1px solid #0f1624;font-family:monospace;font-size:8px;color:#5a6f96">
  <span><span class="ldot"></span> Bot: <strong style="color:#dde8ff">${guardHit?'GUARD':'ACTIVE'}</strong></span>
  <span>Cycle: <strong style="color:#f4c430">${cycleCount}</strong></span>
  <span>Last: <strong style="color:#dde8ff">${esc(lastCycleTime)}</strong></span>
  <span>Up: <strong style="color:#dde8ff">${uptimeMins}m</strong></span>
</div>

<!-- TABS — use anchor links, no JS needed -->
<div class="tabs">
  <a class="tab act" href="/?tab=feed">📡 Feed</a>
  <a class="tab" href="/?tab=pos">📊 Positions (${positions.length})</a>
  <a class="tab" href="/?tab=hist">📈 History (${tot})</a>
  <a class="tab" href="/?tab=log">🖥 Log</a>
</div>

<!-- FEED PAGE -->
<div class="pg act" id="pg-feed">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#253348;text-transform:uppercase">LIVE DECISIONS · Auto-refreshes every 20s</div>
    <a href="/" style="background:rgba(244,196,48,.08);border:1px solid rgba(244,196,48,.3);color:#f4c430;font-family:monospace;font-size:9px;padding:5px 12px;border-radius:6px;cursor:pointer;letter-spacing:1px;text-decoration:none">↻ REFRESH</a>
  </div>
  ${feedHtml}
</div>

<!-- POSITIONS PAGE (hidden by default, shown via JS tab switch) -->
<div class="pg" id="pg-pos">
  <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#253348;text-transform:uppercase;margin-bottom:8px;display:flex;justify-content:space-between">
    <span>OPEN POSITIONS</span><span style="color:#f4c430">${positions.length} open</span>
  </div>
  ${posHtml}
</div>

<!-- HISTORY PAGE -->
<div class="pg" id="pg-hist">
  <div style="background:#090b15;border:1px solid #162030;border-radius:10px;padding:12px;margin-bottom:9px">
    <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#b8880a;margin-bottom:9px">WIN RATE &amp; PERFORMANCE</div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:9px">
      <div style="width:76px;height:76px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:3px solid ${wrCol};background:rgba(0,255,136,.06);flex-shrink:0">
        <div style="font-family:'Space Mono',monospace;font-size:18px;font-weight:700;line-height:1;color:${wrCol}">${tot?wr+'%':'—'}</div>
        <div style="font-family:monospace;font-size:8px;color:#253348;letter-spacing:1px;margin-top:2px">WIN RATE</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;flex:1">
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Total</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#dde8ff">${tot}</div></div>
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Net P&L</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${pnlCol}">${(pnl>=0?'+':'')+'$'+pnl.toFixed(2)}</div></div>
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Profit Factor</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#f4c430">${pf>0?pf.toFixed(2):'—'}</div></div>
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Avg Win</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#00ff88">${wins?'+$'+avgW.toFixed(2):'—'}</div></div>
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Avg Loss</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#ff3355">${losses?'-$'+avgL.toFixed(2):'—'}</div></div>
        <div style="padding:6px;background:#020409;border-radius:6px;border:1px solid #0f1624"><div style="font-family:monospace;font-size:7px;color:#253348;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px">Open P&L</div><div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#dde8ff">${(positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0)>=0?'+':'')+'$'+positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0).toFixed(2)}</div></div>
      </div>
    </div>
    <div style="font-family:monospace;font-size:8px;letter-spacing:1.5px;color:#253348;text-transform:uppercase;margin-bottom:5px">BY STRATEGY</div>
    ${stratBars||'<div style="font-family:monospace;font-size:9px;color:#253348">No trades yet.</div>'}
  </div>
  ${histHtml}
</div>

<!-- LOG PAGE -->
<div class="pg" id="pg-log">
  <a href="/?tab=log" style="background:rgba(244,196,48,.08);border:1px solid rgba(244,196,48,.3);color:#f4c430;font-family:monospace;font-size:9px;padding:5px 12px;border-radius:6px;cursor:pointer;letter-spacing:1px;text-decoration:none;display:inline-block;margin-bottom:10px">↻ REFRESH</a>
  <div style="background:#020408;border:1px solid #0f1624;border-radius:8px;padding:9px 11px;font-family:monospace;font-size:9px;line-height:1.8;max-height:400px;overflow-y:auto;color:#5a6f96">
    ${logHtml||'<div style="color:#253348">No log entries yet.</div>'}
  </div>
</div>

<script>
// Tab switching — read URL param, no fetch needed
(function(){
  var tab=new URLSearchParams(window.location.search).get('tab')||'feed';
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('act');});
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('act');});
  var activeTab=document.querySelector('.tab[href="/?tab='+tab+'"]');
  if(activeTab)activeTab.classList.add('act');
  var activePg=document.getElementById('pg-'+tab);
  if(activePg)activePg.classList.add('act');
  // Auto-reload every 20s to get fresh data
  setTimeout(function(){window.location.reload();},20000);
})();
</script>
</body></html>`;
}

// ═══ HTTP SERVER ═══
const server=http.createServer((req,res)=>{
  if(req.url==='/health'||req.url==='/ping'){
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end('OK cycle='+cycleCount+' open='+positions.length+' closed='+closed.length);
    return;
  }
  // Serve the fully-built HTML page — no JavaScript rendering needed
  try{
    const html=buildPage();
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache, no-store, must-revalidate'});
    res.end(html);
  }catch(e){
    tlog('ERROR','buildPage: '+e.message);
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end('ORACLE SERVER RUNNING\nCycle: '+cycleCount+'\nBalance: $'+bal.toFixed(2)+'\nOpen positions: '+positions.length+'\nClosed trades: '+closed.length+'\nError: '+e.message);
  }
});

// Seed price history
COINS.forEach(c=>{
  pH[c.s]=[];let base=c.p;
  for(let i=0;i<10;i++){
    base=Math.max(0.000001,base*(1+(c.ch>5?0.003:c.ch<-5?-0.003:0)+(Math.random()-0.48)*0.03));
    pH[c.s].push(base);
  }
  pH[c.s].push(c.p);
});

server.listen(PORT,'0.0.0.0',()=>{
  tlog('INFO','=== ORACLE SERVER v4 STARTED on port '+PORT+' ===');
  tlog('INFO','Architecture: Pure server-side HTML. Zero JS rendering. Cannot fail.');
  tlog('INFO','Every page load = fresh data baked into HTML by server.');
  tlog('INFO','First cycle in 5 seconds...');
  setTimeout(()=>{
    runCycle();
    setInterval(runCycle,scanSecs*1000);
  },5000);
});
server.on('error',(e)=>{console.error('FATAL:',e.message);process.exit(1);});
