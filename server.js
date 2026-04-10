// ORACLE GOD SERVER v2 — Fixed for Render
// Key fixes: instant HTTP response, non-blocking price fetch,
// proper timeout handling, server listens on 0.0.0.0
const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 10000;

// STATE
let bal=1000,startBal=1000,peakBal=1000;
let positions=[],closed=[],feedLog=[],termLog=[];
let cycleCount=0,guardHit=false,dlLimit=0.10,scanSecs=30;
let startTime=Date.now(),isRunning=false,lastCycleTime=null;
let sS={SMC:0,Momentum:0,Wyckoff:0,Volume:0};
let sW={SMC:0,Momentum:0,Wyckoff:0,Volume:0};
let pH={};

// COINS
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

// QUANT ENGINE
function calcATR(sym){
  const h=pH[sym]||[];
  if(h.length<3){const c=COINS.find(x=>x.s===sym);return c?c.p*0.07:0;}
  const trs=[];
  for(let i=1;i<h.length;i++)trs.push(Math.abs(h[i]-h[i-1]));
  const r=trs.slice(-14);
  return r.reduce((a,b)=>a+b,0)/r.length;
}

function smcSig(coin){
  const h=pH[coin.s]||[];
  if(h.length<4)return{sig:'neutral',type:'NONE',conf:40,reason:'Building history.'};
  const p=h.slice(-8),lat=p[p.length-1],prev=p[p.length-2]||lat;
  const psh=p.length>6?Math.max(...p.slice(-8,-3)):lat*0.95;
  const psl=p.length>6?Math.min(...p.slice(-8,-3)):lat*1.05;
  if(lat>psh&&prev<=psh)return{sig:'buy',type:'BOS',conf:78,reason:'Break of Structure — institutional accumulation.'};
  if(lat<psl&&prev>=psl)return{sig:'avoid',type:'CHoCH',conf:72,reason:'Change of Character — distributing.'};
  if(p.length>=3){
    const[c1,c2,c3]=[p[p.length-3],p[p.length-2],lat];
    if(c2>c1*1.006&&c3>c1*1.003)return{sig:'buy',type:'FVG',conf:74,reason:'Bullish Fair Value Gap — institutional imbalance.'};
  }
  const rl=Math.min(...p.slice(-4));
  if(lat>prev&&prev<=rl&&lat>rl*1.002)return{sig:'buy',type:'LIQ',conf:82,reason:'Liquidity Sweep reversed. Smart money loaded.'};
  const trend=(lat-p[0])/Math.max(p[0],0.000001);
  if(trend>0.04)return{sig:'buy',type:'OB',conf:68,reason:'Order Block — demand zone active.'};
  return{sig:'neutral',type:'NONE',conf:38,reason:'No SMC signal.'};
}

function wyckoff(coin){
  const h=pH[coin.s]||[];
  if(h.length<6)return null;
  const p=h.slice(-12),avg=p.reduce((a,b)=>a+b,0)/p.length,lat=p[p.length-1];
  const rng=Math.max(...p)-Math.min(...p),rr=avg>0?rng/avg:0;
  if(rr<0.05&&coin.v>coin.mc*0.03)return{action:'CONSOL',conf:65,reason:'Phase B: tight range, breakout imminent.'};
  const dip=p.slice(-3).some(x=>x<avg*0.95);
  if(dip&&lat>avg*0.98)return{action:'SPRING',conf:80,reason:'Wyckoff Spring (Phase C): shakeout then recovery.'};
  if(lat>avg*1.04)return{action:'MARKUP',conf:72,reason:'Markup phase confirmed.'};
  return null;
}

function calcMom(coin){
  const h=pH[coin.s]||[];
  if(h.length<4)return{score:20,sig:'weak',sigs:['building']};
  const p=h.slice(-8),lat=p[p.length-1],p4=p[Math.max(0,p.length-5)];
  const roc=(lat-p4)/Math.max(p4,0.000001)*100;
  let score=0,sigs=[];
  if(roc>8){score+=30;sigs.push('ROC+'+roc.toFixed(1)+'%');}
  else if(roc>3){score+=15;sigs.push('ROC+'+roc.toFixed(1)+'%');}
  else if(roc<-8){score-=25;sigs.push('ROC'+roc.toFixed(1)+'%');}
  if(coin.v>coin.mc*0.055){score+=25;sigs.push('vol-surge');}
  else if(coin.v>coin.mc*0.025){score+=12;sigs.push('vol-up');}
  const cons=p.slice(-4).every((x,i,a)=>i===0||x>=a[i-1]*0.998);
  if(cons){score+=20;sigs.push('4-consec');}
  if(coin.ch>15){score+=20;sigs.push('+'+coin.ch.toFixed(0)+'%24h');}
  else if(coin.ch>7){score+=10;sigs.push('+'+coin.ch.toFixed(0)+'%24h');}
  else if(coin.ch<-10){score-=15;}
  if(roc>35){score-=20;sigs.push('overbought');}
  const sig=score>=55?'strong':score>=30?'moderate':score>=10?'weak':'negative';
  return{score,sig,sigs};
}

function calcSLTP(coin){
  const a=calcATR(coin.s),ap=coin.p>0?a/coin.p:0.07;
  let sl=-(Math.max(0.10,Math.min(0.45,ap*2.2)));
  let tp=Math.abs(sl)*3.2;
  if(coin.v>100e6)tp*=1.2;
  if(coin.liq<300e3){sl*=0.75;tp*=0.88;}
  if(coin.rug<70)sl*=0.72;
  if(coin.isNew){sl=-0.18;tp=1.2;}
  return{
    sl:parseFloat(Math.max(-0.45,Math.min(-0.09,sl)).toFixed(3)),
    tp:parseFloat(Math.min(2.5,Math.max(0.22,tp)).toFixed(3))
  };
}

function calcSize(coin,conf){
  conf=conf||68;
  const{sl}=calcSLTP(coin);
  const riskAmt=bal*0.012,slP=Math.abs(sl);
  const volSz=riskAmt/slP,kSz=bal*(conf/100)*0.20;
  return Math.max(10,Math.min(80,Math.round(Math.min(volSz,kSz))));
}

function driftCoin(c){
  const trend=c.ch>8?0.003:c.ch<-8?-0.003:c.ch>3?0.001:0;
  c.p=Math.max(0.000001,c.p*(1+(Math.random()-0.47)*0.035+trend));
  c.ch+=(Math.random()-0.5)*1.8;
  if(!pH[c.s])pH[c.s]=[];
  pH[c.s].push(c.p);
  if(pH[c.s].length>20)pH[c.s].shift();
}

// Non-blocking CoinGecko fetch — fire and forget
function fetchPricesBG(){
  const GIDS={BONK:'bonk',WIF:'dogwifcoin',POPCAT:'popcat',TRUMP:'official-trump',PENGU:'pudgy-penguins',MEW:'cat-in-a-dogs-world',PEPE:'pepe',DOGE:'dogecoin'};
  const ids=Object.values(GIDS).join(',');
  try{
    const req=https.get(
      'https://api.coingecko.com/api/v3/simple/price?ids='+ids+'&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true',
      {headers:{'Accept':'application/json'},timeout:4000},
      (res)=>{
        if(res.statusCode!==200){res.resume();return;}
        let data='';
        res.on('data',d=>data+=d);
        res.on('end',()=>{
          try{
            const d=JSON.parse(data);
            COINS.forEach(c=>{
              const gid=GIDS[c.s];
              if(d[gid]){c.p=d[gid].usd;c.ch=d[gid].usd_24h_change||0;c.v=d[gid].usd_24h_vol||c.v;}
              if(!pH[c.s])pH[c.s]=[];
              pH[c.s].push(c.p);
              if(pH[c.s].length>20)pH[c.s].shift();
            });
            tlog('INFO','CoinGecko prices updated');
          }catch(e){}
        });
      }
    );
    req.on('error',()=>{});
    req.on('timeout',()=>{req.destroy();});
  }catch(e){}
}

function updateTrail(pos){
  const pnl=(pos.cur-pos.entry)/pos.entry;
  if(pnl<0.15)return;
  const a=calcATR(pos.sym);
  const mult=pnl>=0.50?1.0:pnl>=0.30?2.0:3.0;
  pos.trailPhase=pnl>=0.50?3:pnl>=0.30?2:1;
  const newT=pos.peak-(a*mult);
  if(pos.trailSL===null||newT>pos.trailSL)pos.trailSL=newT;
}

function checkGuard(){
  const lC=closed.filter(t=>t.pnl<0).reduce((s,t)=>s+Math.abs(t.pnl),0);
  const lO=positions.reduce((s,p)=>{const pl=(p.cur-p.entry)/p.entry*p.spent;return s+(pl<0?Math.abs(pl):0);},0);
  const pct=(lC+lO)/startBal*100;
  if(pct>=dlLimit*100&&!guardHit){
    guardHit=true;
    tlog('WARN','Daily guard: '+pct.toFixed(1)+'%. Trading halted.');
    addFeed('🛡','GUARD','Daily loss '+pct.toFixed(1)+'% hit limit.',null,'guard');
  }
  return !guardHit;
}

function doExit(pos,idx,reason,pnlP,type){
  const pnlD=pos.spent*pnlP;
  bal+=pos.spent+pnlD;
  if(bal>peakBal)peakBal=bal;
  closed.push({id:Date.now(),sym:pos.sym,ic:pos.ic,nm:pos.nm,win:pnlP>0,pnl:pnlD,pnlP,type,strat:pos.strat,entry:pos.entry,exit:pos.cur,spent:pos.spent,held:Math.round((Date.now()-pos.openTime)/60000),reason,time:new Date().toISOString().slice(11,19)});
  if(sS[pos.strat]!==undefined){sS[pos.strat]++;if(pnlP>0)sW[pos.strat]++;}
  positions.splice(idx,1);
  const ICONS={SL:'🛑',TP:'💰',TRAIL:'📈',CRASH:'⚡',STAG:'⏱'};
  const LABS={SL:'STOP',TP:'TAKE PROFIT',TRAIL:'TRAIL',CRASH:'CRASH',STAG:'STAGNANT'};
  tlog('TRADE',type+' '+pos.sym+': '+(pnlP>=0?'+':'')+( pnlP*100).toFixed(1)+'% $'+pnlD.toFixed(2)+' ['+pos.strat+']');
  addFeed(ICONS[type]||'🔴',LABS[type]||'EXIT',pos.ic+' '+pos.sym+' — '+reason,(pnlD>=0?'+':'')+'$'+Math.abs(pnlD).toFixed(2),pnlP>0?'win':'loss');
}

function doEntry(coin,strat,conf,sz,reason,signal){
  const{sl,tp}=calcSLTP(coin);
  bal-=sz;
  positions.push({id:Date.now(),sym:coin.s,ic:coin.ic,nm:coin.n,entry:coin.p,cur:coin.p,peak:coin.p,lastP:coin.p,size:sz/coin.p,spent:sz,sl,tp,trailSL:null,trailPhase:0,openTime:Date.now(),strat,signal});
  if(sS[strat]!==undefined)sS[strat]++;
  tlog('TRADE','ENTRY '+coin.s+' $'+sz+' ['+strat+'] conf:'+conf+'% SL:'+Math.round(sl*100)+'% TP:+'+Math.round(tp*100)+'%');
  addFeed(coin.ic,strat+' BUY',coin.s+' — '+reason+' | SL:'+Math.round(sl*100)+'% TP:+'+Math.round(tp*100)+'%','$'+sz,'entry');
}

// MAIN CYCLE — synchronous, never blocks HTTP
function runCycle(){
  if(isRunning)return;
  isRunning=true;
  cycleCount++;
  lastCycleTime=new Date().toISOString().slice(11,19);
  try{
    COINS.forEach(driftCoin);
    fetchPricesBG(); // fire and forget, doesn't block
    positions.forEach(p=>{
      const c=COINS.find(x=>x.s===p.sym);
      if(c){p.lastP=p.cur;p.cur=c.p;if(p.cur>p.peak)p.peak=p.cur;updateTrail(p);}
    });
    for(let i=positions.length-1;i>=0;i--){
      const p=positions[i];
      const pnlP=(p.cur-p.entry)/p.entry;
      const hm=(Date.now()-p.openTime)/60000;
      if(p.lastP&&p.lastP>0){const drop=(p.lastP-p.cur)/p.lastP;if(drop>0.15){doExit(p,i,'Flash crash -'+Math.round(drop*100)+'%',pnlP,'CRASH');continue;}}
      if(pnlP<=p.sl){doExit(p,i,'Stop-loss '+Math.round(p.sl*100)+'%',pnlP,'SL');continue;}
      if(p.trailSL!==null&&p.cur<p.trailSL){const lg=(p.trailSL-p.entry)/p.entry*100;doExit(p,i,'Trail Ph'+p.trailPhase+' locked +'+lg.toFixed(1)+'%',pnlP,'TRAIL');continue;}
      if(pnlP>=p.tp){doExit(p,i,'Take-profit +'+Math.round(p.tp*100)+'%',pnlP,'TP');continue;}
      if(hm>75&&Math.abs(pnlP)<0.04){doExit(p,i,'Stagnant '+Math.round(hm)+'min',pnlP,'STAG');continue;}
    }
    if(positions.length<6&&checkGuard()){
      const avail=COINS.filter(c=>!positions.find(p=>p.sym===c.s));
      const scored=avail.map(c=>{
        const s=smcSig(c),m=calcMom(c),w=wyckoff(c);
        let score=0;
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
          if(bal>=sz){const reason=s.sig==='buy'?s.reason:m.sigs.join(', ');doEntry(c,strat,conf,sz,reason,s.type||w&&w.action||strat);}
        }
      }
    }
    const pnl=positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0)+closed.reduce((s,t)=>s+t.pnl,0);
    const wins=closed.filter(t=>t.win).length,tot=closed.length;
    tlog('INFO','Cycle#'+cycleCount+' Bal:$'+bal.toFixed(2)+' PnL:'+(pnl>=0?'+':'')+'$'+pnl.toFixed(2)+' Open:'+positions.length+' Trades:'+tot+' Win:'+(tot?Math.round(wins/tot*100):0)+'%');
  }catch(e){tlog('ERROR','Cycle error: '+e.message);}
  finally{isRunning=false;}
}

function tlog(type,msg){
  const t=new Date().toISOString().slice(11,19);
  const line='['+t+']['+type+'] '+msg;
  console.log(line);
  termLog.push(line);
  if(termLog.length>300)termLog.shift();
}

function addFeed(ic,label,msg,amt,side){
  feedLog.push({t:new Date().toISOString().slice(11,19),ic,label,msg,amt,side});
  if(feedLog.length>100)feedLog.shift();
}

// HTTP SERVER
const server=http.createServer((req,res)=>{
  if(req.url==='/health'||req.url==='/ping'){
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end('OK');
    return;
  }
  if(req.url==='/api/state'){
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    const pnl=positions.reduce((s,p)=>s+(p.cur-p.entry)/p.entry*p.spent,0)+closed.reduce((s,t)=>s+t.pnl,0);
    const wins=closed.filter(t=>t.win).length,tot=closed.length,losses=tot-wins;
    const avgW=wins?closed.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0)/wins:0;
    const avgL=losses?closed.filter(t=>!t.win).reduce((s,t)=>s+Math.abs(t.pnl),0)/losses:0;
    const pf=losses&&avgL>0?(wins*avgW)/(losses*avgL):0;
    res.end(JSON.stringify({
      bal:bal.toFixed(2),pnl:pnl.toFixed(2),wins,tot,losses,
      wr:tot?Math.round(wins/tot*100):0,
      avgW:avgW.toFixed(2),avgL:avgL.toFixed(2),pf:pf.toFixed(2),
      openCount:positions.length,cycleCount,
      uptimeMins:Math.round((Date.now()-startTime)/60000),
      lastCycle:lastCycleTime,guardHit,sS,sW,
      positions:positions.map(p=>({
        sym:p.sym,ic:p.ic,nm:p.nm,entry:p.entry,cur:p.cur,peak:p.peak,
        pnlP:((p.cur-p.entry)/p.entry*100).toFixed(2),
        pnlD:(p.spent*(p.cur-p.entry)/p.entry).toFixed(2),
        sl:(p.sl*100).toFixed(0),tp:(p.tp*100).toFixed(0),
        trailPhase:p.trailPhase,trailSL:p.trailSL,
        strat:p.strat,signal:p.signal,
        held:Math.round((Date.now()-p.openTime)/60000),spent:p.spent
      })),
      feed:feedLog.slice(-30).reverse(),
      log:termLog.slice(-60),
      closed:closed.slice(-30).reverse().map(t=>({
        sym:t.sym,ic:t.ic,win:t.win,pnl:t.pnl.toFixed(2),
        pnlP:(t.pnlP*100).toFixed(1),type:t.type,strat:t.strat,
        held:t.held,reason:t.reason,time:t.time
      })),
      coins:COINS.slice(0,10).map(c=>({s:c.s,p:c.p,ch:c.ch.toFixed(1)}))
    }));
    return;
  }
  // Dashboard — inline HTML (kept separate to avoid string size issues)
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(getDashboard());
});

function getDashboard(){
return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>ORACLE SERVER</title><link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}:root{--bg:#020409;--s1:#06080e;--s2:#090b15;--b1:#0f1624;--b2:#162030;--gold:#f4c430;--gd2:#ffd700;--neon:#00ff88;--red:#ff3355;--cyan:#00e5ff;--pur:#bb66ff;--org:#ff8c00;--yel:#ffe566;--t1:#dde8ff;--t2:#5a6f96;--t3:#253348}html,body{background:var(--bg);color:var(--t1);font-family:'Outfit',sans-serif;min-height:100vh;font-size:14px;-webkit-tap-highlight-color:transparent}.tb{position:sticky;top:0;z-index:100;background:rgba(2,4,9,.97);border-bottom:1px solid var(--b1);padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:7px}.tbl{display:flex;align-items:center;gap:7px}.gem{width:18px;height:18px;background:linear-gradient(135deg,var(--gd2),#b8880a);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);box-shadow:0 0 9px rgba(244,196,48,.4);flex-shrink:0}.nm{font-family:'Bebas Neue',cursive;font-size:14px;letter-spacing:3px;background:linear-gradient(90deg,var(--gd2),var(--neon));-webkit-background-clip:text;-webkit-text-fill-color:transparent}.bdg{font-family:'DM Mono',monospace;font-size:7px;padding:2px 7px;border-radius:9px;border:1px solid rgba(0,255,136,.3);background:rgba(0,255,136,.08);color:var(--neon);letter-spacing:1px;font-weight:700}.tbr{text-align:right;flex-shrink:0}.balv{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:var(--gold)}.bals{font-family:'DM Mono',monospace;font-size:7px;color:var(--t3)}.ticker{display:flex;align-items:center;gap:9px;padding:4px 12px;background:rgba(0,255,136,.03);border-bottom:1px solid rgba(0,255,136,.08);overflow-x:auto;min-height:24px}.ticker::-webkit-scrollbar{display:none}.tki{display:flex;align-items:center;gap:3px;font-family:'DM Mono',monospace;font-size:8px;white-space:nowrap;flex-shrink:0}.tks{font-weight:700;color:var(--t1)}.srvl{margin-left:auto;flex-shrink:0;display:flex;align-items:center;gap:3px;font-family:'DM Mono',monospace;font-size:7px;color:var(--neon)}.ldot{width:5px;height:5px;border-radius:50%;background:var(--neon);box-shadow:0 0 5px var(--neon);animation:bl 1.8s infinite}@keyframes bl{0%,100%{opacity:1}50%{opacity:.3}}.stats{display:grid;grid-template-columns:repeat(5,1fr);background:var(--s1);border-bottom:1px solid var(--b1)}.st{padding:6px 7px;border-right:1px solid var(--b1);position:relative}.st:last-child{border-right:none}.st::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--sc,var(--gold)),transparent);opacity:.5}.stl{font-family:'DM Mono',monospace;font-size:7px;letter-spacing:1px;color:var(--t3);text-transform:uppercase;margin-bottom:1px}.stv{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;line-height:1}.sts{font-size:7px;margin-top:1px;font-family:'DM Mono',monospace;color:var(--t3)}.up{color:var(--neon)}.dn{color:var(--red)}.go{color:var(--gold)}.cy{color:var(--cyan)}.sbar{display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:var(--s2);border-bottom:1px solid var(--b1);font-family:'DM Mono',monospace;font-size:8px;color:var(--t2)}.sbi{display:flex;align-items:center;gap:3px}.sbd{width:5px;height:5px;border-radius:50%;flex-shrink:0}.sbg{background:var(--neon);box-shadow:0 0 4px var(--neon);animation:bl 2s infinite}.sby{background:var(--gold)}.sbv{color:var(--t1);font-weight:600}.tabs{display:flex;background:var(--s1);border-bottom:1px solid var(--b1);overflow-x:auto}.tabs::-webkit-scrollbar{display:none}.tab{display:flex;align-items:center;gap:4px;padding:9px 11px;font-weight:700;font-size:11px;cursor:pointer;border-bottom:2px solid transparent;color:var(--t3);white-space:nowrap;flex-shrink:0;transition:all .15s}.tab.act{color:var(--tc,var(--gold));border-bottom-color:var(--tc,var(--gold))}.pg{display:none;padding:11px}.pg.act{display:block}.fc{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(15,22,36,.8);position:relative;overflow:hidden}.fc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--cc,var(--t3))}.fci{font-size:16px;flex-shrink:0;width:20px;text-align:center;margin-top:2px}.fcb{flex:1;min-width:0}.fcl{font-family:'DM Mono',monospace;font-size:8px;font-weight:700;color:var(--pur);margin-bottom:2px}.fcm{font-size:10px;color:var(--t2);line-height:1.5;font-family:'DM Mono',monospace}.fcr{flex-shrink:0;text-align:right;min-width:55px}.fca{font-family:'Space Mono',monospace;font-size:12px;font-weight:700}.fct{font-family:'DM Mono',monospace;font-size:7px;color:var(--t3);margin-top:3px}.pc{padding:11px;border:1px solid var(--b1);border-radius:10px;background:var(--s1);margin-bottom:7px;position:relative;overflow:hidden}.pc::before{content:'';position:absolute;top:0;left:0;bottom:0;width:3px;background:var(--pcol)}.pr1{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}.pn{font-weight:700;font-size:13px;display:flex;align-items:center;gap:5px}.pst{font-family:'DM Mono',monospace;font-size:8px;padding:2px 5px;border-radius:3px;border:1px solid rgba(187,102,255,.25);background:rgba(187,102,255,.08);color:var(--pur)}.pp{font-family:'Space Mono',monospace;font-size:14px;font-weight:700;text-align:right;line-height:1}.pprice{font-family:'DM Mono',monospace;font-size:8px;color:var(--cyan);text-align:right;margin-top:1px}.pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:6px}.pgv{font-family:'DM Mono',monospace;font-size:9px}.pgl{color:var(--t3);display:block;margin-bottom:1px}.pgvv{color:var(--t1);font-weight:600}.tbox{background:rgba(255,229,102,.04);border:1px solid rgba(255,229,102,.12);border-radius:6px;padding:7px 9px}.tboxt{font-family:'DM Mono',monospace;font-size:7px;letter-spacing:1.5px;color:var(--yel);margin-bottom:4px}.tboxg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}.ti{text-align:center}.til{font-family:'DM Mono',monospace;font-size:7px;color:var(--t3);text-transform:uppercase;margin-bottom:1px}.tiv{font-family:'Space Mono',monospace;font-size:11px;font-weight:700}.wcard{background:var(--s2);border:1px solid var(--b2);border-radius:10px;padding:12px;margin-bottom:9px}.wct{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:#b8880a;margin-bottom:9px}.wbig{display:flex;align-items:center;gap:12px;margin-bottom:9px}.wcirc{width:76px;height:76px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:3px solid var(--neon);background:rgba(0,255,136,.06);flex-shrink:0}.wpct{font-family:'Space Mono',monospace;font-size:18px;font-weight:700;line-height:1}.wlbl{font-family:'DM Mono',monospace;font-size:8px;color:var(--t3);letter-spacing:1px;margin-top:2px}.wmet{display:grid;grid-template-columns:1fr 1fr;gap:5px;flex:1}.wm{padding:6px;background:var(--bg);border-radius:6px;border:1px solid var(--b1)}.wml{font-family:'DM Mono',monospace;font-size:7px;color:var(--t3);letter-spacing:1px;text-transform:uppercase;margin-bottom:1px}.wmv{font-family:'Space Mono',monospace;font-size:12px;font-weight:700}.strats{display:flex;flex-direction:column;gap:5px;margin-top:7px}.sr{display:flex;align-items:center;gap:6px}.srn{font-family:'DM Mono',monospace;font-size:9px;color:var(--t2);width:82px;flex-shrink:0}.srb{flex:1;height:4px;background:var(--b1);border-radius:2px;overflow:hidden}.srf{height:100%;border-radius:2px;transition:width .7s}.srv{font-family:'DM Mono',monospace;font-size:9px;min-width:52px;text-align:right}.hc{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--b1);border-radius:8px;background:var(--s1);margin-bottom:5px;position:relative;overflow:hidden}.hc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--hcol)}.hic{font-size:14px;flex-shrink:0}.hbody{flex:1;min-width:0}.hr1{display:flex;align-items:center;gap:4px;margin-bottom:2px;flex-wrap:wrap}.hsym{font-weight:700;font-size:12px;color:var(--t1)}.hwin{font-family:'DM Mono',monospace;font-size:8px;padding:1px 5px;border-radius:3px;font-weight:700}.hww{background:rgba(0,255,136,.12);color:var(--neon);border:1px solid rgba(0,255,136,.22)}.hwl{background:rgba(255,51,85,.1);color:var(--red);border:1px solid rgba(255,51,85,.2)}.hst{font-family:'DM Mono',monospace;font-size:8px;padding:1px 5px;border-radius:3px;color:var(--pur);border:1px solid rgba(187,102,255,.2);background:rgba(187,102,255,.06)}.hreason{font-family:'DM Mono',monospace;font-size:8px;color:var(--t3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hright{flex-shrink:0;text-align:right}.hpnl{font-family:'Space Mono',monospace;font-size:12px;font-weight:700}.hmeta{font-family:'DM Mono',monospace;font-size:8px;color:var(--t3);margin-top:2px}.logbox{background:#020408;border:1px solid var(--b1);border-radius:8px;padding:9px 11px;font-family:'DM Mono',monospace;font-size:9px;line-height:1.8;max-height:400px;overflow-y:auto;color:var(--t2)}.logbox::-webkit-scrollbar{width:2px}.logbox::-webkit-scrollbar-thumb{background:var(--b2)}.ll{margin-bottom:1px}.lt{color:var(--t3)}.ltr{color:var(--neon)}.lw{color:var(--org)}.li{color:var(--cyan)}.le{color:var(--red)}.rbtn{background:rgba(244,196,48,.08);border:1px solid rgba(244,196,48,.3);color:var(--gold);font-family:'DM Mono',monospace;font-size:9px;padding:5px 12px;border-radius:6px;cursor:pointer;letter-spacing:1px;margin-bottom:10px;display:inline-block}.empty{font-family:'DM Mono',monospace;font-size:10px;color:var(--t3);padding:14px 0;text-align:center}</style></head><body><div class="tb"><div class="tbl"><div class="gem"></div><div class="nm">ORACLE SERVER</div><div class="bdg">24/7 LIVE</div></div><div class="tbr"><div class="balv" id="tbal">Loading…</div><div class="bals" id="tsub">connecting…</div></div></div><div class="ticker" id="tkEl"><div class="srvl"><div class="ldot"></div>LIVE</div></div><div class="stats"><div class="st" style="--sc:var(--neon)"><div class="stl">P&L</div><div class="stv up" id="spnl">—</div><div class="sts">session</div></div><div class="st" style="--sc:var(--gold)"><div class="stl">Win%</div><div class="stv go" id="swr">—</div><div class="sts" id="swrs">—</div></div><div class="st" style="--sc:var(--pur)"><div class="stl">Trades</div><div class="stv" style="color:var(--pur)" id="stot">—</div><div class="sts" id="sopen">0 open</div></div><div class="st" style="--sc:var(--cyan)"><div class="stl">Profit F</div><div class="stv cy" id="spf">—</div><div class="sts">factor</div></div><div class="st" style="--sc:var(--red)"><div class="stl">Guard</div><div class="stv dn" id="sg">OK</div><div class="sts" id="sgs">10% limit</div></div></div><div class="sbar"><div class="sbi"><div class="sbd sbg"></div>Bot: <span class="sbv" id="sbst">ACTIVE</span></div><div class="sbi"><div class="sbd sby"></div>Cycle: <span class="sbv" id="sbcy">—</span></div><div class="sbi">Last: <span class="sbv" id="sblast">—</span></div><div class="sbi">Up: <span class="sbv" id="sbup">—</span></div></div><div class="tabs"><div class="tab act" style="--tc:var(--neon)" onclick="sw(this,'feed')">📡 Feed</div><div class="tab" style="--tc:var(--pur)" onclick="sw(this,'pos')">📊 Positions</div><div class="tab" style="--tc:var(--gold)" onclick="sw(this,'hist')">📈 History</div><div class="tab" style="--tc:var(--cyan)" onclick="sw(this,'log')">🖥 Log</div></div><div class="pg act" id="pg-feed"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--t3);text-transform:uppercase">LIVE DECISIONS</div><div class="rbtn" onclick="load()">↻ REFRESH</div></div><div id="feedEl"><div class="empty">Loading…</div></div></div><div class="pg" id="pg-pos"><div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--t3);text-transform:uppercase;margin-bottom:8px;display:flex;justify-content:space-between"><span>OPEN POSITIONS</span><span id="posC" style="color:var(--gold)">0</span></div><div id="posEl"><div class="empty">No positions yet.</div></div></div><div class="pg" id="pg-hist"><div class="wcard"><div class="wct">WIN RATE &amp; PERFORMANCE</div><div class="wbig"><div class="wcirc" id="wcirc"><div class="wpct" id="wpct" style="color:var(--neon)">—</div><div class="wlbl">WIN RATE</div></div><div class="wmet"><div class="wm"><div class="wml">Total</div><div class="wmv" id="wt" style="color:var(--t1)">0</div></div><div class="wm"><div class="wml">Net P&L</div><div class="wmv" id="wp" style="color:var(--neon)">$0</div></div><div class="wm"><div class="wml">Profit Factor</div><div class="wmv" id="wpf" style="color:var(--gold)">—</div></div><div class="wm"><div class="wml">Avg Win</div><div class="wmv" id="waw" style="color:var(--neon)">—</div></div><div class="wm"><div class="wml">Avg Loss</div><div class="wmv" id="wal" style="color:var(--red)">—</div></div><div class="wm"><div class="wml">Open P&L</div><div class="wmv" id="wop" style="color:var(--t1)">$0</div></div></div></div><div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1.5px;color:var(--t3);text-transform:uppercase;margin-bottom:5px">BY STRATEGY</div><div class="strats" id="stratEl"><div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3)">No trades yet.</div></div></div><div id="histEl"><div class="empty">No closed trades yet.</div></div></div><div class="pg" id="pg-log"><div class="rbtn" onclick="load()">↻ REFRESH</div><div class="logbox" id="logEl">Loading…</div></div><script>var COLS={SMC:'var(--cyan)',Momentum:'var(--yel)',Wyckoff:'var(--cyan)',Volume:'var(--org)'};function sw(el,id){document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('act')});document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('act')});el.classList.add('act');document.getElementById('pg-'+id).classList.add('act')}function tv(id,v){var e=document.getElementById(id);if(e)e.textContent=v}async function load(){try{var r=await fetch('/api/state');if(!r.ok)throw new Error('HTTP '+r.status);var d=await r.json();tv('tbal','$'+d.bal);tv('tsub','cycle:'+d.cycleCount+' uptime:'+d.uptimeMins+'m');tv('sbst',d.guardHit?'GUARD':'ACTIVE');tv('sbcy',d.cycleCount);tv('sblast',d.lastCycle||'—');tv('sbup',d.uptimeMins+'m');var pe=document.getElementById('spnl');if(pe){pe.textContent=(parseFloat(d.pnl)>=0?'+':'')+'$'+d.pnl;pe.className='stv '+(parseFloat(d.pnl)>=0?'up':'dn')}tv('swr',d.tot?d.wr+'%':'—');tv('swrs',d.tot?d.wins+'W '+d.losses+'L':'—');tv('stot',d.tot);tv('sopen',d.openCount+' open');tv('spf',d.pf!='0.00'?d.pf:'—');tv('sg',d.guardHit?'HIT':'OK');var tk=document.getElementById('tkEl');if(tk&&d.coins){tk.innerHTML=d.coins.map(function(c){var col=parseFloat(c.ch)>=0?'var(--neon)':'var(--red)';return'<div class="tki"><span class="tks">'+c.s+'</span><span style="color:'+col+'">'+(parseFloat(c.ch)>=0?'+':'')+c.ch+'%</span></div>'}).join('')+'<div class="srvl"><div class="ldot"></div>SERVER</div>'}var fe=document.getElementById('feedEl');if(fe){if(!d.feed.length){fe.innerHTML='<div class="empty">No decisions yet. Bot scanning every 30s...</div>'}else{fe.innerHTML=d.feed.map(function(f){var col=f.side==='entry'?'var(--neon)':f.side==='win'?'var(--neon)':f.side==='loss'?'var(--red)':'var(--t3)';return'<div class="fc" style="--cc:'+col+'"><div class="fci">'+f.ic+'</div><div class="fcb"><div class="fcl">'+f.label+'</div><div class="fcm">'+f.msg+'</div></div><div class="fcr">'+(f.amt?'<div class="fca" style="color:'+col+'">'+f.amt+'</div>':'')+'<div class="fct">'+f.t+'</div></div></div>'}).join('')}}tv('posC',d.openCount+' open');var pe2=document.getElementById('posEl');if(pe2){if(!d.positions.length){pe2.innerHTML='<div class="empty">No positions. Bot scanning...</div>'}else{pe2.innerHTML=d.positions.map(function(p){var col=parseFloat(p.pnlP)>=0?'var(--neon)':'var(--red)';var locked=p.trailSL!==null?((p.trailSL-p.entry)/p.entry*100).toFixed(1):null;return'<div class="pc" style="--pcol:'+col+'"><div class="pr1"><div class="pn">'+p.ic+' '+p.sym+'<span class="pst">'+p.strat+'</span></div><div class="pp" style="color:'+col+'">'+(parseFloat(p.pnlP)>=0?'+':'')+p.pnlP+'%<div class="pprice">$'+parseFloat(p.cur).toFixed(8)+'</div></div></div><div class="pgrid"><div class="pgv"><span class="pgl">Entry</span><span class="pgvv">$'+parseFloat(p.entry).toFixed(8)+'</span></div><div class="pgv"><span class="pgl">P&L $</span><span class="pgvv" style="color:'+col+'">'+(parseFloat(p.pnlD)>=0?'+':'')+'$'+Math.abs(parseFloat(p.pnlD)).toFixed(2)+'</span></div><div class="pgv"><span class="pgl">Held</span><span class="pgvv">'+p.held+'m</span></div><div class="pgv"><span class="pgl">SL</span><span class="pgvv" style="color:var(--red)">'+p.sl+'%</span></div><div class="pgv"><span class="pgl">TP</span><span class="pgvv" style="color:var(--neon)">+'+p.tp+'%</span></div><div class="pgv"><span class="pgl">Signal</span><span class="pgvv">'+p.signal+'</span></div></div><div class="tbox"><div class="tboxt">ATR TRAIL</div><div class="tboxg"><div class="ti"><div class="til">Trail SL</div><div class="tiv" style="color:'+(p.trailSL?'var(--yel)':'var(--t3)')+'">'+(p.trailSL?'$'+parseFloat(p.trailSL).toFixed(8):'< +15%')+'</div></div><div class="ti"><div class="til">Phase</div><div class="tiv" style="color:var(--yel)">'+(p.trailSL?(p.trailPhase===3?'3\uD83D\uDD12':p.trailPhase===2?'2\u2B06':'1\uD83D\uDC41'):'—')+'</div></div><div class="ti"><div class="til">Locked</div><div class="tiv" style="color:'+(locked&&parseFloat(locked)>0?'var(--neon)':'var(--t3)')+'">'+(locked&&parseFloat(locked)>0?'+'+locked+'%':'—')+'</div></div></div></div></div>'}).join('')}}var wr=d.tot?d.wr:null;var wp=document.getElementById('wpct');if(wp){wp.textContent=wr!==null?d.wr+'%':'—';wp.style.color=wr>55?'var(--neon)':wr>45?'var(--gold)':'var(--red)'}var wc=document.getElementById('wcirc');if(wc)wc.style.borderColor=wr>55?'var(--neon)':wr>45?'var(--gold)':'var(--red)';tv('wt',d.tot);var wp2=document.getElementById('wp');if(wp2){wp2.textContent=(parseFloat(d.pnl)>=0?'+':'')+'$'+d.pnl;wp2.style.color=parseFloat(d.pnl)>=0?'var(--neon)':'var(--red)'}tv('wpf',d.pf!='0.00'?d.pf:'—');tv('waw',parseFloat(d.avgW)>0?'+$'+d.avgW:'—');tv('wal',parseFloat(d.avgL)>0?'-$'+d.avgL:'—');var openPnl=d.positions.reduce(function(s,p){return s+parseFloat(p.pnlD)},0);tv('wop',(openPnl>=0?'+':'')+'$'+openPnl.toFixed(2));var se=document.getElementById('stratEl');if(se&&d.sS){var rows=Object.keys(d.sS).map(function(s){var tot2=d.sS[s]||0,w2=d.sW[s]||0;if(!tot2)return'';var wr2=Math.round(w2/tot2*100);return'<div class="sr"><span class="srn">'+s+'</span><div class="srb"><div class="srf" style="width:'+wr2+'%;background:'+(COLS[s]||'var(--gold)')+'"></div></div><span class="srv" style="color:'+(COLS[s]||'var(--gold)')+'">'+wr2+'% ('+tot2+')</span></div>'}).filter(Boolean).join('');se.innerHTML=rows||'<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--t3)">No trades yet.</div>'}var he=document.getElementById('histEl');if(he){if(!d.closed.length){he.innerHTML='<div class="empty">No closed trades yet.</div>'}else{he.innerHTML=d.closed.map(function(t2){var col=t2.win?'var(--neon)':'var(--red)';return'<div class="hc" style="--hcol:'+col+'"><div class="hic">'+t2.ic+'</div><div class="hbody"><div class="hr1"><span class="hsym">'+t2.sym+'</span><span class="hwin '+(t2.win?'hww':'hwl')+'">'+(t2.win?'WIN':'LOSS')+'</span><span class="hst">'+t2.strat+'</span><span style="font-family:\'DM Mono\',monospace;font-size:8px;color:var(--t3)">'+t2.type+'</span></div><div class="hreason">'+t2.reason+'</div></div><div class="hright"><div class="hpnl" style="color:'+col+'">'+(parseFloat(t2.pnl)>=0?'+':'')+'$'+Math.abs(parseFloat(t2.pnl)).toFixed(2)+'</div><div class="hmeta">'+t2.pnlP+'% \xB7 '+t2.held+'m \xB7 '+t2.time+'</div></div></div>'}).join('')}}var le=document.getElementById('logEl');if(le&&d.log){le.innerHTML=d.log.map(function(l){var cls=l.includes('[TRADE]')?'ltr':l.includes('[WARN]')?'lw':l.includes('[ERROR]')?'le':'li';return'<div class="ll"><span class="lt">'+(l.slice(0,11))+'</span><span class="'+cls+'">'+l.slice(11)+'</span></div>'}).join('');le.scrollTop=le.scrollHeight}}catch(e){tv('tsub','Error: '+e.message)}}load();setInterval(load,12000);<\/script></body></html>`;
}

// Seed price history
COINS.forEach(c=>{
  pH[c.s]=[];
  let base=c.p;
  for(let i=0;i<10;i++){
    const drift=c.ch>5?0.003:c.ch<-5?-0.003:0;
    base=Math.max(0.000001,base*(1+drift+(Math.random()-0.48)*0.03));
    pH[c.s].push(base);
  }
  pH[c.s].push(c.p);
});

// Start server FIRST — then start trading loop
server.listen(PORT,'0.0.0.0',()=>{
  tlog('INFO','Server listening on port '+PORT);
  tlog('INFO','Dashboard ready at your Render URL');
  tlog('INFO','First trade cycle in 5 seconds...');
  tlog('INFO','Strategies: SMC + Wyckoff + Momentum + ATR Trail');
  setTimeout(()=>{
    tlog('INFO','Starting first cycle...');
    runCycle();
    setInterval(runCycle,scanSecs*1000);
  },5000);
});

server.on('error',(e)=>{
  console.error('Server error:',e.message);
  process.exit(1);
});
