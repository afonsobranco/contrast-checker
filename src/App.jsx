import { useState, useEffect, useMemo, useRef } from "react";
import {
  Sun, Moon, Copy, Check, Wand2, RefreshCw, ArrowLeftRight,
  RotateCcw, Clock, Link, X, ChevronDown, ChevronUp,
  Eye, Download, Palette, Keyboard
} from "lucide-react";

// ─── Color Utilities ──────────────────────────────────────────────────────────

const isValidColor = s => { try { return !!(s?.trim()) && CSS.supports("color", s.trim()); } catch { return false; } };
const isGradientStr = s => /gradient/i.test(s ?? "");
const isImageUrl = s => /^https?:\/\/|^data:image/i.test((s ?? "").trim());

const parseRGB = input => {
  if (!isValidColor(input)) return null;
  const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
  ctx.fillStyle = input.trim(); ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
};

const toHex = ({ r, g, b }) => "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");

const toHsl = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = ((g-b)/d + (g<b?6:0)) / 6; break;
      case g: h = ((b-r)/d + 2) / 6; break;
      case b: h = ((r-g)/d + 4) / 6; break;
    }
  }
  return { h: h*360, s: s*100, l: l*100 };
};

const fromHsl = (h, s, l) => {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l*255); return { r:v, g:v, b:v }; }
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = (p,q,t) => { if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
  return { r:Math.round(f(p,q,h+1/3)*255), g:Math.round(f(p,q,h)*255), b:Math.round(f(p,q,h-1/3)*255) };
};

const lin = c => { c /= 255; return c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
const fromLin = c => { c = Math.max(0,Math.min(1,c)); return Math.round((c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055)*255); };
const luminance = ({ r, g, b }) => 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
const wcagRatio = (a, b) => { const [hi,lo]=[Math.max(a,b),Math.min(a,b)]; return (hi+0.05)/(lo+0.05); };

const calcApca = (txt, bg) => {
  const Y = ({r,g,b}) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const yt=Y(txt), yb=Y(bg), c=0.022, e=1.414;
  const Yt=yt>=c?yt:yt+(c-yt)**e, Yb=yb>=c?yb:yb+(c-yb)**e;
  let s = yb>=yt ? (Yb**0.56-Yt**0.57)*1.14 : (Yb**0.65-Yt**0.62)*1.14;
  if (Math.abs(s)<0.1) return 0;
  return (s>0?s-0.027:s+0.027)*100;
};

const isLargeText = (sz, wt) => sz >= 18 || (sz >= 14 && wt >= 700);

// ─── Color Blindness Simulation (Machado et al. 2009) ────────────────────────

const CB_M = {
  deuteranopia:  [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  protanopia:    [[0.152286,1.052583,-0.204868],[0.114475,0.786281,0.099243],[-0.003882,-0.048116,1.051998]],
  tritanopia:    [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
};

const simulateCB = (type, rgb) => {
  if (type === "achromatopsia") { const v=fromLin(luminance(rgb)); return {r:v,g:v,b:v}; }
  const m=CB_M[type], rL=lin(rgb.r), gL=lin(rgb.g), bL=lin(rgb.b);
  return { r:fromLin(m[0][0]*rL+m[0][1]*gL+m[0][2]*bL), g:fromLin(m[1][0]*rL+m[1][1]*gL+m[1][2]*bL), b:fromLin(m[2][0]*rL+m[2][1]*gL+m[2][2]*bL) };
};

const CB_TYPES = [
  { id:"deuteranopia",  label:"Deuteranopia",  note:"Green-blind · ~6% of males" },
  { id:"protanopia",    label:"Protanopia",    note:"Red-blind · ~2% of males" },
  { id:"tritanopia",    label:"Tritanopia",    note:"Blue-blind · rare" },
  { id:"achromatopsia", label:"Achromatopsia", note:"No color · very rare" },
];

// ─── Smart Suggest ────────────────────────────────────────────────────────────

const smartSuggest = (adjustRGB, fixedRGB, minRatio=4.5) => {
  const fl=luminance(fixedRGB), hsl=toHsl(adjustRGB);
  let best=null, bestDist=Infinity;
  for (const hs of [0,15,-15,30,-30,60,-60,120,-120,180]) {
    const nh=((hsl.h+hs)%360+360)%360;
    for (const dir of [-1,1]) {
      for (let step=1; step<=50; step++) {
        const nl=Math.max(0,Math.min(100,hsl.l+step*dir*2));
        const rgb=fromHsl(nh,hsl.s,nl);
        if (wcagRatio(luminance(rgb),fl)>=minRatio) {
          const dH=Math.min(Math.abs(nh-hsl.h),360-Math.abs(nh-hsl.h));
          const d=dH*2+Math.abs(nl-hsl.l);
          if (d<bestDist) { bestDist=d; best=rgb; }
          break;
        }
      }
    }
  }
  return best;
};

// ─── Gradient helpers ─────────────────────────────────────────────────────────

const extractFirstGradientColor = str => {
  const m = str.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/);
  return m ? parseRGB(m[0]) : null;
};

// ─── Animated Value Hook ──────────────────────────────────────────────────────

function useAnimatedValue(target, duration=380) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);
  useEffect(() => {
    const from=fromRef.current, to=target, t0=performance.now();
    if (Math.abs(from-to)<0.005) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = now => {
      const p=Math.min((now-t0)/duration,1), e=1-(1-p)**3;
      const v=from+(to-from)*e; fromRef.current=v; setDisplay(v);
      if (p<1) rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);
  return display;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APCA_SIZES = [12,14,16,18,24,32,48];
const APCA_WEIGHTS = [100,200,300,400,500,600,700,900];
const APCA_DATA = {
  12:{100:null,200:null,300:null,400:100,500:90,600:75,700:70,900:60},
  14:{100:null,200:null,300:90,400:75,500:70,600:60,700:55,900:50},
  16:{100:null,200:90,300:75,400:60,500:55,600:50,700:45,900:40},
  18:{100:90,200:75,300:60,400:55,500:50,600:45,700:40,900:35},
  24:{100:75,200:60,300:55,400:50,500:45,600:40,700:38,900:30},
  32:{100:60,200:55,300:50,400:45,500:40,600:38,700:35,900:25},
  48:{100:55,200:50,300:45,400:40,500:38,600:35,700:30,900:20},
};

const PREVIEW_SIZES = [
  { label:"Caption",  fs:12, fw:400 },
  { label:"Body",     fs:16, fw:400 },
  { label:"Heading",  fs:24, fw:500 },
  { label:"Display",  fs:48, fw:500 },
];

const SHORTCUTS = [
  { key:"W", desc:"Swap colors" }, { key:"R", desc:"Reset" },
  { key:"D", desc:"Toggle dark mode" }, { key:"S", desc:"Smart Suggest" },
  { key:"T", desc:"APCA table" }, { key:"E", desc:"Export" },
  { key:"B", desc:"Color blindness" }, { key:"P", desc:"Palette" },
  { key:"?", desc:"This help" },
];

const DEFAULT = { fg:"#1a1a2e", bg:"#eef2ff", fs:16, fw:400 };

// ─── Export Generators ────────────────────────────────────────────────────────

const makeCSS = (fg,bg,r,aaP,aaaP,lc,apcaP) =>
`:root {\n  --color-text:       ${fg};\n  --color-background: ${bg};\n\n  /* WCAG 2.1 ratio: ${r.toFixed(2)}:1 */\n  /* AA:  ${aaP?"PASS":"FAIL"}  |  AAA: ${aaaP?"PASS":"FAIL"} */\n  /* APCA Lc: ${Math.abs(lc).toFixed(1)}  |  ${apcaP?"PASS":"FAIL"} */\n}`;

const makeTailwind = (fg,bg) =>
`// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        text:       "${fg}",\n        background: "${bg}",\n      },\n    },\n  },\n};`;

const makeFigma = (fg,bg,r) =>
JSON.stringify({"color":{"text":{"$value":fg,"$type":"color","description":`WCAG ${r.toFixed(2)}:1`},"background":{"$value":bg,"$type":"color"}}},null,2);

const makeStyleDict = (fg,bg,r,aaP) =>
JSON.stringify({"color":{"text":{"value":fg,"comment":`WCAG AA: ${aaP?"PASS":"FAIL"} (${r.toFixed(2)}:1)`},"background":{"value":bg}}},null,2);

// ─── Reusable Components ──────────────────────────────────────────────────────

const Swatch = ({ hex, size=20, radius=5, border }) =>
  <div style={{width:size,height:size,borderRadius:radius,background:hex,border,flexShrink:0}}/>;

const ResultBadge = ({ pass }) =>
  <span style={{fontSize:10,fontWeight:500,letterSpacing:"0.05em",padding:"2px 8px",borderRadius:999,color:pass?"#30d158":"#ff453a",background:pass?"#30d15818":"#ff453a18",border:`0.5px solid ${pass?"#30d15850":"#ff453a50"}`}}>
    {pass?"PASS":"FAIL"}
  </span>;

const Section = ({ T, title, icon, hint, open, onToggle, children }) => (
  <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:14,marginBottom:14,overflow:"hidden",transition:"background 0.3s"}}>
    <button onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"18px 22px",background:"none",border:"none",cursor:"pointer",color:T.text,textAlign:"left"}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        {icon && <span style={{color:T.sub,display:"flex"}}>{icon}</span>}
        <span style={{fontWeight:500,fontSize:14}}>{title}</span>
        {hint && <span style={{fontSize:12,color:T.sub}}>{hint}</span>}
      </div>
      {open ? <ChevronUp size={14} color={T.sub}/> : <ChevronDown size={14} color={T.sub}/>}
    </button>
    {open && <div style={{padding:"0 22px 20px"}}>{children}</div>}
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {

  const [fgIn,  setFgIn]  = useState(DEFAULT.fg);
  const [bgIn,  setBgIn]  = useState(DEFAULT.bg);
  const [fgRGB, setFgRGB] = useState({r:26,g:26,b:46});
  const [bgRGB, setBgRGB] = useState({r:238,g:242,b:255});
  const [fgErr, setFgErr] = useState(false);
  const [bgErr, setBgErr] = useState(false);
  const [imgBgRGB, setImgBgRGB] = useState(null);

  const [dark, setDark] = useState(false);
  const [fs,   setFs]   = useState(DEFAULT.fs);
  const [fw,   setFw]   = useState(DEFAULT.fw);

  const [showHistory,   setShowHistory]   = useState(false);
  const [showMultiSize, setShowMultiSize] = useState(true);
  const [showMockup,    setShowMockup]    = useState(true);
  const [showCB,        setShowCB]        = useState(false);
  const [showPalette,   setShowPalette]   = useState(false);
  const [showSuggest,   setShowSuggest]   = useState(false);
  const [showTable,     setShowTable]     = useState(false);
  const [showExport,    setShowExport]    = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [exportTab, setExportTab] = useState("css");
  const [copied,    setCopied]    = useState(null);
  const [sugTarget, setSugTarget] = useState("fg");
  const [sug,       setSug]       = useState(null);
  const [history,   setHistory]   = useState([]);
  const histTimer = useRef(null);

  const fgInRef   = useRef(fgIn);   fgInRef.current   = fgIn;
  const bgInRef   = useRef(bgIn);   bgInRef.current   = bgIn;
  const fgRGBRef  = useRef(fgRGB);  fgRGBRef.current  = fgRGB;
  const bgRGBRef  = useRef(bgRGB);  bgRGBRef.current  = bgRGB;
  const sugTgtRef = useRef(sugTarget); sugTgtRef.current = sugTarget;
  const fsRef     = useRef(fs);     fsRef.current     = fs;
  const fwRef     = useRef(fw);     fwRef.current     = fw;

  // Parse URL hash
  useEffect(() => {
    try {
      const p=new URLSearchParams(window.location.hash.slice(1));
      const fg=p.get("fg"), bg=p.get("bg");
      if (fg&&isValidColor("#"+fg)) setFgIn("#"+fg);
      if (bg&&isValidColor("#"+bg)) setBgIn("#"+bg);
    } catch {}
  }, []);

  // Parse fg
  useEffect(() => {
    const rgb=parseRGB(fgIn);
    if (rgb) { setFgRGB(rgb); setFgErr(false); } else setFgErr(true);
  }, [fgIn]);

  // Parse bg
  useEffect(() => {
    if (isGradientStr(bgIn)) {
      const rgb=extractFirstGradientColor(bgIn);
      if (rgb) setBgRGB(rgb);
      setBgErr(false);
    } else if (isImageUrl(bgIn)) {
      setBgErr(false);
    } else {
      const rgb=parseRGB(bgIn);
      if (rgb) { setBgRGB(rgb); setBgErr(false); } else setBgErr(true);
    }
    setImgBgRGB(null);
  }, [bgIn]);

  // Sample image bg
  useEffect(() => {
    if (!isImageUrl(bgIn)) return;
    const img=new Image(); img.crossOrigin="anonymous";
    img.onload = () => {
      try {
        const S=50, ctx=Object.assign(document.createElement("canvas"),{width:S,height:S}).getContext("2d");
        ctx.drawImage(img,(img.width-S)/2,(img.height-S)/2,S,S,0,0,S,S);
        const d=ctx.getImageData(0,0,S,S).data;
        let r=0,g=0,b=0;
        for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
        const n=d.length/4, s={r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)};
        setImgBgRGB(s); setBgRGB(s);
      } catch {}
    };
    img.src=bgIn;
  }, [bgIn]);

  // History (debounced)
  useEffect(() => {
    if (fgErr||bgErr) return;
    if (histTimer.current) clearTimeout(histTimer.current);
    histTimer.current=setTimeout(()=>{
      const fgHex=toHex(fgRGB), bgHex=toHex(bgRGB);
      setHistory(prev=>{
        const dd=prev.filter(e=>e.fgHex!==fgHex||e.bgHex!==bgHex);
        return [{fg:fgIn,bg:bgIn,fgHex,bgHex},...dd].slice(0,5);
      });
    },900);
    return ()=>clearTimeout(histTimer.current);
  }, [fgIn,bgIn,fgErr,bgErr]);

  // Keyboard shortcuts
  useEffect(()=>{
    const handler=e=>{
      if(["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if(e.metaKey||e.ctrlKey||e.altKey) return;
      const k=e.key.toLowerCase();
      if(k==="?"){setShowShortcuts(v=>!v);return;}
      if(k==="w"){setFgIn(bgInRef.current);setBgIn(fgInRef.current);setSug(null);return;}
      if(k==="r"){setFgIn(DEFAULT.fg);setBgIn(DEFAULT.bg);setFs(DEFAULT.fs);setFw(DEFAULT.fw);setSug(null);return;}
      if(k==="d"){setDark(v=>!v);return;}
      if(k==="s"){
        const [adj,fix]=sugTgtRef.current==="fg"?[fgRGBRef.current,bgRGBRef.current]:[bgRGBRef.current,fgRGBRef.current];
        const r=smartSuggest(adj,fix,isLargeText(fsRef.current,fwRef.current)?3:4.5);
        if(r){setSug({target:sugTgtRef.current,rgb:r,hex:toHex(r)});setShowSuggest(true);}
        return;
      }
      if(k==="t"){setShowTable(v=>!v);return;}
      if(k==="e"){setShowExport(v=>!v);return;}
      if(k==="b"){setShowCB(v=>!v);return;}
      if(k==="p"){setShowPalette(v=>!v);return;}
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[]);

  // ── Derived values ────────────────────────────────────────────────────────

  const effBg  = imgBgRGB || bgRGB;
  const ratio  = useMemo(()=>wcagRatio(luminance(fgRGB),luminance(effBg)),[fgRGB,effBg]);
  const lc     = useMemo(()=>calcApca(fgRGB,effBg),[fgRGB,effBg]);
  const large  = useMemo(()=>isLargeText(fs,fw),[fs,fw]);
  const lcAbs  = Math.abs(lc);
  const aaReq  = large?3:4.5, aaaReq=large?4.5:7, apcaReq=large?45:60;
  const aaP    = ratio>=aaReq, aaaP=ratio>=aaaReq, apcaP=lcAbs>=apcaReq, ntP=ratio>=3;

  const animRatio = useAnimatedValue(ratio);
  const animLc    = useAnimatedValue(lcAbs);

  const nearSz  = APCA_SIZES.reduce((p,c)=>Math.abs(c-fs)<Math.abs(p-fs)?c:p);
  const nearWt  = APCA_WEIGHTS.reduce((p,c)=>Math.abs(c-fw)<Math.abs(p-fw)?c:p);

  const cbSims = useMemo(()=>CB_TYPES.map(t=>{
    const sf=simulateCB(t.id,fgRGB), sb=simulateCB(t.id,effBg);
    const r=wcagRatio(luminance(sf),luminance(sb));
    return {...t,fgHex:toHex(sf),bgHex:toHex(sb),ratio:r,pass:r>=aaReq};
  }),[fgRGB,effBg,aaReq]);

  const palette = useMemo(()=>{
    const bL=luminance(effBg), hsl=toHsl(fgRGB);
    return Array.from({length:9},(_,i)=>{
      const l=5+i*10.5, rgb=fromHsl(hsl.h,hsl.s,l), r=wcagRatio(luminance(rgb),bL);
      return {hex:toHex(rgb),rgb,ratio:r,passAAA:r>=7,passAA:r>=4.5,pass3:r>=3};
    });
  },[fgRGB,effBg]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSuggest=()=>{
    const [adj,fix]=sugTarget==="fg"?[fgRGB,effBg]:[effBg,fgRGB];
    const r=smartSuggest(adj,fix,aaReq);
    if(r) setSug({target:sugTarget,rgb:r,hex:toHex(r)});
  };
  const applySug=()=>{if(!sug)return;sug.target==="fg"?setFgIn(sug.hex):setBgIn(sug.hex);setSug(null);};
  const handleSwap=()=>{setFgIn(bgIn);setBgIn(fgIn);setSug(null);};
  const handleReset=()=>{setFgIn(DEFAULT.fg);setBgIn(DEFAULT.bg);setFs(DEFAULT.fs);setFw(DEFAULT.fw);setSug(null);};
  const doCopy=(what,text)=>{navigator.clipboard.writeText(text).catch(()=>{});setCopied(what);setTimeout(()=>setCopied(null),2200);};

  const exportCode=()=>({
    css:makeTailwind?makeCSS(fgIn,bgIn,ratio,aaP,aaaP,lc,apcaP):"",
    tailwind:makeTailwind(fgIn,bgIn),
    figma:makeFigma(fgIn,bgIn,ratio),
    styledict:makeStyleDict(fgIn,bgIn,ratio,aaP),
  }[exportTab]||"");

  // ── Theme ─────────────────────────────────────────────────────────────────

  const T={
    page:   dark?"#0a0a0a":"#f5f5f7",
    card:   dark?"#141414":"#ffffff",
    raised: dark?"#1c1c1c":"#f9f9fb",
    border: dark?"rgba(255,255,255,0.09)":"rgba(0,0,0,0.08)",
    text:   dark?"#f0f0f0":"#1d1d1f",
    sub:    dark?"#5a5a5e":"#8a8a8e",
    accent: "#4361ee",
    pass:   "#30d158",
    fail:   "#ff453a",
    warn:   "#ff9f0a",
    mono:   "'SF Mono','Menlo','Monaco',monospace",
    sans:   "-apple-system,'SF Pro Text','SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
  };

  const card={background:T.card,border:`0.5px solid ${T.border}`,borderRadius:14,padding:"22px 24px",transition:"background 0.3s",marginBottom:14};

  const bgPreviewStyle = isGradientStr(bgIn) ? {background:bgIn}
    : isImageUrl(bgIn) ? {backgroundImage:`url(${bgIn})`,backgroundSize:"cover",backgroundPosition:"center"}
    : {background:`rgb(${effBg.r},${effBg.g},${effBg.b})`};

  const fgCss=`rgb(${fgRGB.r},${fgRGB.g},${fgRGB.b})`;

  return (
    <div style={{minHeight:"100vh",background:T.page,color:T.text,fontFamily:T.sans,fontSize:14,padding:"36px 20px 80px",transition:"background .35s,color .35s"}}>
      <style>{`
        *{box-sizing:border-box}
        input[type=range]{-webkit-appearance:none;height:3px;border-radius:2px;cursor:pointer;outline:none;display:block;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#4361ee;cursor:pointer;transition:transform .1s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.2)}
        .ci{transition:border-color .2s,box-shadow .2s}
        .ci:focus{outline:none;border-color:#4361ee!important;box-shadow:0 0 0 3px #4361ee18!important}
        .ib{background:none;border:none;cursor:pointer;transition:opacity .15s,transform .12s;padding:0}
        .ib:hover{opacity:.75}
        .ib:active{transform:scale(.96)}
        @keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:fi .22s ease forwards}
        @keyframes sd{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        .sd{animation:sd .18s ease forwards}
        pre{margin:0;font-size:12px;line-height:1.7;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
        .hrow:hover td{background:rgba(67,97,238,.04)}
        .exp-tab{transition:background .15s,color .15s}
      `}</style>

      <div style={{maxWidth:920,margin:"0 auto"}}>

        {/* HEADER */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:44}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:500,letterSpacing:"-0.5px",lineHeight:1.1,margin:0}}>Contrast</h1>
            <p style={{color:T.sub,marginTop:5,fontSize:13,margin:"5px 0 0"}}>WCAG 2.1 · APCA (WCAG 3.0 draft)</p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Shortcuts */}
            <div style={{position:"relative"}}>
              <button className="ib" onClick={()=>setShowShortcuts(v=>!v)} title="Keyboard shortcuts (?)"
                style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"8px 13px",color:T.sub,display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:500}}>
                <Keyboard size={14}/>?
              </button>
              {showShortcuts && (
                <div className="sd" style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,padding:14,minWidth:210,zIndex:100}}>
                  <p style={{fontSize:11,fontWeight:500,color:T.sub,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>Keyboard shortcuts</p>
                  {SHORTCUTS.map(({key,desc})=>(
                    <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
                      <span style={{fontSize:12,color:T.text}}>{desc}</span>
                      <kbd style={{fontSize:11,fontFamily:T.mono,background:T.raised,border:`0.5px solid ${T.border}`,borderRadius:5,padding:"1px 7px",color:T.sub}}>{key}</kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* History */}
            <div style={{position:"relative"}}>
              <button className="ib" onClick={()=>{setShowHistory(v=>!v);setShowShortcuts(false);}}
                style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"8px 14px",color:T.text,display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:500}}>
                <Clock size={15}/>History
                {history.length>0&&<span style={{fontSize:10,background:T.accent,color:"#fff",borderRadius:999,padding:"1px 6px"}}>{history.length}</span>}
              </button>
              {showHistory&&(
                <div className="sd" style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,padding:8,minWidth:250,zIndex:100}}>
                  {history.length===0
                    ?<p style={{fontSize:12,color:T.sub,padding:"8px 10px"}}>No history yet</p>
                    :history.map((e,i)=>(
                      <button key={i} className="ib"
                        onClick={()=>{setFgIn(e.fg);setBgIn(e.bg);setShowHistory(false);}}
                        onMouseEnter={ev=>ev.currentTarget.style.background=T.raised}
                        onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}
                        style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 10px",borderRadius:8,color:T.text,textAlign:"left",background:"transparent",transition:"background .1s"}}>
                        <div style={{display:"flex",gap:3}}>
                          <Swatch hex={e.fgHex} border={`0.5px solid ${T.border}`}/>
                          <Swatch hex={e.bgHex} border={`0.5px solid ${T.border}`}/>
                        </div>
                        <span style={{fontSize:11,fontFamily:T.mono,color:T.sub}}>{e.fgHex} / {e.bgHex}</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            {/* Dark mode */}
            <button className="ib" onClick={()=>setDark(v=>!v)}
              style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"8px 14px",color:T.text,display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:500}}>
              {dark?<Sun size={15}/>:<Moon size={15}/>}{dark?"Light":"Dark"}
            </button>
          </div>
        </div>

        {/* COLOR INPUTS */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,marginBottom:14,alignItems:"center"}}>
          {[
            {label:"Foreground",val:fgIn,set:setFgIn,rgb:fgRGB,err:fgErr,isBg:false},
            null,
            {label:"Background",val:bgIn,set:setBgIn,rgb:effBg,err:bgErr,isBg:true},
          ].map((item,idx)=>{
            if(idx===1) return(
              <div key="ctrl" style={{display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
                <button className="ib" onClick={handleSwap} title="Swap (W)"
                  style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,padding:10,color:T.text,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <ArrowLeftRight size={16}/>
                </button>
                <button className="ib" onClick={handleReset} title="Reset (R)"
                  style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,padding:10,color:T.sub,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <RotateCcw size={16}/>
                </button>
              </div>
            );
            const {label,val,set,rgb,err,isBg}=item;
            const hsl=toHsl(rgb);
            const isGrad=isGradientStr(val), isImg=isImageUrl(val);
            return(
              <div key={label} style={{...card,marginBottom:0,border:`0.5px solid ${err?T.fail:T.border}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <span style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.sub}}>{label}</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {isBg&&isImg&&imgBgRGB&&<span style={{fontSize:11,color:T.pass}}>✓ Sampled</span>}
                    {isBg&&isGrad&&<span style={{fontSize:11,color:T.accent}}>Gradient</span>}
                    {err&&<span style={{fontSize:11,color:T.fail}}>Invalid</span>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{position:"relative",width:44,height:44,borderRadius:10,overflow:"hidden",border:`0.5px solid ${T.border}`,flexShrink:0}}>
                    {isGrad?<div style={{position:"absolute",inset:0,background:val}}/>
                      :isImg?<div style={{position:"absolute",inset:0,backgroundImage:`url(${val})`,backgroundSize:"cover",backgroundPosition:"center"}}/>
                      :<div style={{position:"absolute",inset:0,background:`rgb(${rgb.r},${rgb.g},${rgb.b})`,transition:"background .15s"}}/>
                    }
                    {!isGrad&&!isImg&&<input type="color" value={toHex(rgb)} onChange={e=>set(e.target.value)} style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}}/>}
                  </div>
                  <input className="ci" value={val} onChange={e=>set(e.target.value)}
                    placeholder={isBg?"#hex · rgb() · gradient · url()":"#hex · rgb() · hsl() · name"}
                    style={{flex:1,background:"transparent",border:`0.5px solid ${T.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,fontFamily:T.mono,color:T.text}}/>
                </div>
                <p style={{marginTop:9,fontSize:11,color:T.sub,fontFamily:T.mono,margin:"9px 0 0"}}>
                  hsl({Math.round(hsl.h)}°, {Math.round(hsl.s)}%, {Math.round(hsl.l)}%) · rgb({rgb.r}, {rgb.g}, {rgb.b})
                </p>
              </div>
            );
          })}
        </div>

        {/* LIVE PREVIEW */}
        <div style={{...bgPreviewStyle,borderRadius:14,padding:"28px 26px",marginBottom:14,border:`0.5px solid ${T.border}`,transition:"background .15s",position:"relative"}}>
          {(isGradientStr(bgIn)||isImageUrl(bgIn))&&(
            <div style={{position:"absolute",top:10,right:12,fontSize:11,fontFamily:T.mono,background:"rgba(0,0,0,.5)",color:"#fff",padding:"2px 9px",borderRadius:999}}>
              effective bg {toHex(effBg)} · {ratio.toFixed(2)}:1
            </div>
          )}
          <p style={{color:fgCss,fontSize:fs,fontWeight:fw,lineHeight:1.65,margin:0,transition:"color .15s,font-size .1s"}}>
            The quick brown fox jumps over the lazy dog.
          </p>
          <p style={{color:fgCss,fontSize:Math.max(fs-2,10),fontWeight:fw,lineHeight:1.5,marginTop:8,opacity:.8,transition:"color .15s"}}>
            Pack my box with five dozen liquor jugs — Aa Bb Cc 0123456789
          </p>
          <p style={{color:fgCss,fontSize:11,marginTop:14,opacity:.4,fontFamily:T.mono,transition:"color .15s"}}>
            {fs}px / weight {fw} · {large?"Large text threshold met":"Normal text"}
          </p>
        </div>

        {/* MULTI-SIZE PREVIEW */}
        <Section T={T} title="Multi-size preview" icon={<Eye size={15}/>} hint="All contexts at once" open={showMultiSize} onToggle={()=>setShowMultiSize(v=>!v)}>
          {PREVIEW_SIZES.map(({label,fs:pfs,fw:pfw},i)=>{
            const pl=isLargeText(pfs,pfw);
            const pAA=ratio>=(pl?3:4.5), pAAA=ratio>=(pl?4.5:7), pApca=lcAbs>=(pl?45:60);
            return(
              <div key={label} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:i<3?`0.5px solid ${T.border}`:"none"}}>
                <div style={{width:70,flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:500,color:T.sub,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
                  <div style={{fontSize:10,color:T.sub,fontFamily:T.mono,marginTop:2}}>{pfs}px/{pfw}</div>
                </div>
                <div style={{flex:1,background:`rgb(${effBg.r},${effBg.g},${effBg.b})`,borderRadius:8,padding:"9px 14px",minWidth:0,overflow:"hidden"}}>
                  <span style={{color:fgCss,fontSize:pfs,fontWeight:pfw,lineHeight:1.3,display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    The quick brown fox jumps over the lazy dog
                  </span>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <ResultBadge pass={pAA}/> <ResultBadge pass={pAAA}/> <ResultBadge pass={pApca}/>
                </div>
              </div>
            );
          })}
        </Section>

        {/* TYPOGRAPHY SLIDERS */}
        <div style={{...card,display:"grid",gridTemplateColumns:"1fr 1fr",gap:22}}>
          {[
            {label:"Font size",val:fs,set:setFs,min:10,max:48,step:1,unit:"px"},
            {label:"Font weight",val:fw,set:setFw,min:100,max:900,step:100,unit:""},
          ].map(({label,val,set,min,max,step,unit})=>(
            <div key={label}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.sub}}>{label}</span>
                <span style={{fontSize:13,fontWeight:500,fontFamily:T.mono}}>{val}{unit}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={val} onChange={e=>set(Number(e.target.value))}
                style={{background:`linear-gradient(to right,${T.accent} ${((val-min)/(max-min))*100}%,${T.border} ${((val-min)/(max-min))*100}%)`}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.sub,marginTop:5}}>
                <span>{min}{unit}</span><span>{max}{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CONTRAST RESULTS */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {/* WCAG 2.1 */}
          <div style={{...card,marginBottom:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <span style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.sub}}>WCAG 2.1</span>
                <div style={{fontSize:42,fontWeight:500,letterSpacing:"-2px",marginTop:4,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
                  {animRatio.toFixed(2)}<span style={{fontSize:19,fontWeight:400,color:T.sub}}>:1</span>
                </div>
              </div>
              <div style={{width:48,height:48,borderRadius:"50%",background:aaP?`${T.pass}18`:`${T.fail}18`,border:`1.5px solid ${aaP?T.pass:T.fail}`,display:"flex",alignItems:"center",justifyContent:"center",color:aaP?T.pass:T.fail,fontSize:20,transition:"all .3s"}}>
                {aaP?"✓":"✗"}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                {label:`AA — ${large?"large":"normal"} text`,pass:aaP,req:`${aaReq}:1`,gap:aaReq-ratio},
                {label:`AAA — ${large?"large":"normal"} text`,pass:aaaP,req:`${aaaReq}:1`,gap:aaaReq-ratio},
                {label:"UI components · WCAG 1.4.11",pass:ntP,req:"3:1",gap:3-ratio},
              ].map(({label,pass,req,gap})=>(
                <div key={label} style={{padding:"10px 13px",borderRadius:10,background:pass?`${T.pass}0d`:`${T.fail}0d`,border:`0.5px solid ${pass?T.pass+"44":T.fail+"44"}`,transition:"background .3s"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:12,fontWeight:500}}>{label}</div><div style={{fontSize:11,color:T.sub,marginTop:1}}>Requires {req}</div></div>
                    <ResultBadge pass={pass}/>
                  </div>
                  <div style={{marginTop:5,fontSize:11,fontFamily:T.mono,color:pass?T.pass:T.warn}}>
                    {pass?`+${Math.abs(gap).toFixed(2)} above threshold`:`Need +${Math.max(0,gap).toFixed(2)} to pass`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* APCA */}
          <div style={{...card,marginBottom:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <span style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:T.sub}}>APCA — WCAG 3.0</span>
                <div style={{fontSize:42,fontWeight:500,letterSpacing:"-2px",marginTop:4,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
                  Lc {animLc.toFixed(1)}
                </div>
              </div>
              <div style={{width:48,height:48,borderRadius:"50%",background:apcaP?`${T.pass}18`:`${T.fail}18`,border:`1.5px solid ${apcaP?T.pass:T.fail}`,display:"flex",alignItems:"center",justifyContent:"center",color:apcaP?T.pass:T.fail,fontSize:20,transition:"all .3s"}}>
                {apcaP?"✓":"✗"}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{height:4,background:T.border,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,width:`${Math.min(100,(lcAbs/106)*100)}%`,background:`linear-gradient(to right,${T.fail},${T.warn} 45%,${T.pass})`,transition:"width .35s ease"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.sub,marginTop:4}}>
                {["0","30","45","60","75","90+"].map(v=><span key={v}>{v}</span>)}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                {label:large?"Large / heading text":"Body text",pass:apcaP,req:large?"Lc 45":"Lc 60",gap:apcaReq-lcAbs},
                {label:"Fluent reading text",pass:lcAbs>=75,req:"Lc 75",gap:75-lcAbs},
                {label:"UI elements / components",pass:lcAbs>=30,req:"Lc 30",gap:30-lcAbs},
              ].map(({label,pass,req,gap})=>(
                <div key={label} style={{padding:"10px 13px",borderRadius:10,background:pass?`${T.pass}0d`:`${T.fail}0d`,border:`0.5px solid ${pass?T.pass+"44":T.fail+"44"}`,transition:"background .3s"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:12,fontWeight:500}}>{label}</div><div style={{fontSize:11,color:T.sub,marginTop:1}}>Requires {req}</div></div>
                    <ResultBadge pass={pass}/>
                  </div>
                  <div style={{marginTop:5,fontSize:11,fontFamily:T.mono,color:pass?T.pass:T.warn}}>
                    {pass?`+${Math.abs(gap).toFixed(1)} above threshold`:`Need +${Math.max(0,gap).toFixed(1)} Lc`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MINI UI MOCKUP */}
        <Section T={T} title="UI mockup preview" hint="Colors in real interface context" open={showMockup} onToggle={()=>setShowMockup(v=>!v)}>
          <div style={{background:`rgb(${effBg.r},${effBg.g},${effBg.b})`,borderRadius:10,padding:20,border:`0.5px solid ${T.border}`,marginBottom:12}}>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
              <div style={{padding:"9px 18px",borderRadius:8,background:fgCss,color:`rgb(${effBg.r},${effBg.g},${effBg.b})`,fontSize:13,fontWeight:500}}>Primary</div>
              <div style={{padding:"8px 17px",borderRadius:8,background:"transparent",color:fgCss,border:`1.5px solid ${fgCss}`,fontSize:13,fontWeight:500}}>Outline</div>
              <div style={{padding:"3px 12px",borderRadius:999,background:`rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.12)`,color:fgCss,border:`0.5px solid rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.35)`,fontSize:12,fontWeight:500}}>Badge</div>
              <div style={{width:34,height:34,borderRadius:8,background:`rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.1)`,display:"flex",alignItems:"center",justifyContent:"center",color:fgCss,fontSize:16,border:`0.5px solid rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.2)`}}>⊕</div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <div style={{flex:1,padding:"9px 12px",borderRadius:8,border:`1px solid rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.35)`,color:`rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.45)`,fontSize:13,background:"transparent"}}>Placeholder text…</div>
              <div style={{padding:"9px 16px",borderRadius:8,background:fgCss,color:`rgb(${effBg.r},${effBg.g},${effBg.b})`,fontSize:13,fontWeight:500,flexShrink:0}}>Submit</div>
            </div>
            <div style={{padding:"14px 16px",borderRadius:10,border:`0.5px solid rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.15)`,background:`rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.04)`}}>
              <div style={{fontSize:14,fontWeight:500,color:fgCss,marginBottom:5}}>Card heading</div>
              <div style={{fontSize:12,color:`rgba(${fgRGB.r},${fgRGB.g},${fgRGB.b},0.7)`,lineHeight:1.6}}>Supporting body text that describes the content of this component in real UI context.</div>
            </div>
          </div>
        </Section>

        {/* COLOR BLINDNESS */}
        <Section T={T} title="Color blindness simulation" icon={<Eye size={15}/>} hint="Press B" open={showCB} onToggle={()=>setShowCB(v=>!v)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {cbSims.map(sim=>(
              <div key={sim.id} style={{borderRadius:10,overflow:"hidden",border:`0.5px solid ${T.border}`}}>
                <div style={{background:sim.bgHex,padding:"14px 16px"}}>
                  <div style={{color:sim.fgHex,fontSize:14,fontWeight:500,marginBottom:4}}>The quick brown fox</div>
                  <div style={{color:sim.fgHex,fontSize:12,opacity:.8}}>Aa Bb Cc 0123456789</div>
                </div>
                <div style={{padding:"10px 14px",background:T.raised,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:500,color:T.text}}>{sim.label}</div>
                    <div style={{fontSize:11,color:T.sub,marginTop:1}}>{sim.note}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,fontFamily:T.mono,fontWeight:500,color:T.text}}>{sim.ratio.toFixed(2)}:1</span>
                    <ResultBadge pass={sim.pass}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:T.sub,marginTop:12}}>Simulates how the color pair appears to people with different types of color vision deficiency.</p>
        </Section>

        {/* ACCESSIBLE PALETTE */}
        <Section T={T} title="Accessible palette" icon={<Palette size={15}/>} hint="Variants of your foreground · Press P" open={showPalette} onToggle={()=>setShowPalette(v=>!v)}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:6}}>
            {palette.map((p,i)=>(
              <button key={i} className="ib" onClick={()=>setFgIn(p.hex)} title={`${p.hex}\n${p.ratio.toFixed(2)}:1\n${p.passAAA?"AAA":p.passAA?"AA":p.pass3?"3:1":"✗"}`}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"8px 4px",borderRadius:8,border:`0.5px solid ${p.passAA?T.pass:p.pass3?T.warn:T.fail}44`,background:p.passAA?`${T.pass}0a`:p.pass3?`${T.warn}0a`:`${T.fail}0a`,cursor:"pointer"}}>
                <div style={{width:"100%",paddingTop:"100%",borderRadius:6,background:p.hex,border:`0.5px solid ${T.border}`,position:"relative"}}>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:`rgba(${effBg.r},${effBg.g},${effBg.b},0.8)`,fontSize:12}}>
                    {p.passAAA?"✓":""}
                  </div>
                </div>
                <div style={{fontSize:10,fontFamily:T.mono,color:T.text,textAlign:"center"}}>{p.ratio.toFixed(1)}</div>
                <div style={{fontSize:9,color:p.passAA?T.pass:p.pass3?T.warn:T.fail,fontWeight:500}}>{p.passAAA?"AAA":p.passAA?"AA":p.pass3?"3:1":"✗"}</div>
              </button>
            ))}
          </div>
          <p style={{fontSize:11,color:T.sub,marginTop:12}}>Click any swatch to apply as foreground. Ratios calculated against your current background.</p>
        </Section>

        {/* SMART SUGGEST */}
        <Section T={T} title="Smart suggest" icon={<Wand2 size={15}/>} hint="Nearest AA-passing color · Press S" open={showSuggest} onToggle={()=>setShowSuggest(v=>!v)}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:sug?14:0}}>
            <span style={{fontSize:13,color:T.sub}}>Shifts hue + lightness to the nearest AA pass</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{display:"flex",background:T.raised,borderRadius:8,padding:3,gap:2}}>
                {["fg","bg"].map(o=>(
                  <button key={o} className="ib" onClick={()=>setSugTarget(o)}
                    style={{padding:"5px 13px",borderRadius:6,fontSize:12,fontWeight:500,background:sugTarget===o?T.accent:"transparent",color:sugTarget===o?"#fff":T.sub,transition:"background .15s,color .15s"}}>
                    {o==="fg"?"Foreground":"Background"}
                  </button>
                ))}
              </div>
              <button className="ib" onClick={handleSuggest}
                style={{background:T.accent,color:"#fff",borderRadius:8,padding:"8px 15px",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
                <RefreshCw size={13}/> Suggest
              </button>
            </div>
          </div>
          {sug&&(
            <div className="fi" style={{padding:14,borderRadius:10,background:T.raised,border:`0.5px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <Swatch hex={sug.target==="fg"?toHex(fgRGB):toHex(effBg)} border={`0.5px solid ${T.border}`}/>
                  <span style={{fontSize:13,color:T.sub}}>→</span>
                  <Swatch hex={sug.hex} border={`0.5px solid ${T.border}`}/>
                </div>
                <span style={{fontSize:13,fontFamily:T.mono,fontWeight:500}}>{sug.hex}</span>
                <span style={{fontSize:12,color:T.pass,fontFamily:T.mono}}>
                  ✓ {wcagRatio(luminance(sug.rgb),luminance(sug.target==="fg"?effBg:fgRGB)).toFixed(2)}:1
                </span>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="ib" onClick={applySug} style={{background:T.pass,color:"#fff",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:500}}>Apply</button>
                <button className="ib" onClick={()=>setSug(null)} style={{background:"transparent",color:T.sub,border:`0.5px solid ${T.border}`,borderRadius:7,padding:"6px 10px",display:"flex",alignItems:"center"}}><X size={13}/></button>
              </div>
            </div>
          )}
        </Section>

        {/* APCA TABLE */}
        <Section T={T} title="APCA reference table" hint="Minimum Lc by size × weight · Press T" open={showTable} onToggle={()=>setShowTable(v=>!v)}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono}}>
              <thead>
                <tr>
                  <th style={{padding:"6px 10px",textAlign:"left",color:T.sub,fontWeight:500,borderBottom:`0.5px solid ${T.border}`,whiteSpace:"nowrap"}}>px ↓ / wt →</th>
                  {APCA_WEIGHTS.map(w=>(
                    <th key={w} style={{padding:"6px 8px",textAlign:"center",fontWeight:500,borderBottom:`0.5px solid ${T.border}`,color:nearWt===w?T.accent:T.sub}}>{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {APCA_SIZES.map(sz=>(
                  <tr key={sz} className="hrow">
                    <td style={{padding:"7px 10px",borderBottom:`0.5px solid ${T.border}`,fontWeight:500,whiteSpace:"nowrap",color:nearSz===sz?T.accent:T.sub}}>{sz}px</td>
                    {APCA_WEIGHTS.map(wt=>{
                      const val=APCA_DATA[sz][wt], isActive=nearSz===sz&&nearWt===wt, ok=val!==null&&lcAbs>=val;
                      return(
                        <td key={wt} style={{padding:"7px 8px",textAlign:"center",borderBottom:`0.5px solid ${T.border}`,background:isActive?`${T.accent}14`:"transparent",outline:isActive?`1px solid ${T.accent}40`:"none",color:val===null?T.border:ok?T.pass:T.fail,fontWeight:isActive?500:400}}>
                          {val===null?"—":val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:11,color:T.sub,marginTop:10}}>
              Your Lc: <strong style={{color:T.text}}>{lcAbs.toFixed(1)}</strong> · Highlighted = current size/weight · Green = passes · Red = fails
            </p>
          </div>
        </Section>

        {/* EXPORT */}
        <Section T={T} title="Export" icon={<Download size={15}/>} hint="4 formats · Press E" open={showExport} onToggle={()=>setShowExport(v=>!v)}>
          <div style={{display:"flex",gap:4,marginBottom:14,background:T.raised,borderRadius:9,padding:3}}>
            {[{id:"css",label:"CSS"},{id:"tailwind",label:"Tailwind"},{id:"figma",label:"Figma"},{id:"styledict",label:"Style Dict"}].map(t=>(
              <button key={t.id} className="exp-tab ib" onClick={()=>setExportTab(t.id)}
                style={{flex:1,padding:"6px 0",borderRadius:7,fontSize:12,fontWeight:500,background:exportTab===t.id?T.card:T.raised,color:exportTab===t.id?T.text:T.sub,border:exportTab===t.id?`0.5px solid ${T.border}`:"none"}}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{background:T.raised,border:`0.5px solid ${T.border}`,borderRadius:10,padding:16,position:"relative"}}>
            <pre style={{color:T.text,fontFamily:T.mono}}>{exportCode()}</pre>
            <button className="ib" onClick={()=>doCopy("export",exportCode())}
              style={{position:"absolute",top:10,right:10,background:T.card,border:`0.5px solid ${T.border}`,borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:500,color:T.text,display:"flex",alignItems:"center",gap:5}}>
              {copied==="export"?<Check size={12} color={T.pass}/>:<Copy size={12}/>}
              {copied==="export"?"Copied!":"Copy"}
            </button>
          </div>
        </Section>

        {/* FOOTER */}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <button className="ib" onClick={()=>doCopy("url",`${window.location.href.split("#")[0]}#fg=${toHex(fgRGB).slice(1)}&bg=${toHex(effBg).slice(1)}`)}
            style={{background:T.card,color:T.text,border:`0.5px solid ${T.border}`,borderRadius:9,padding:"8px 15px",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:7}}>
            {copied==="url"?<Check size={14} color={T.pass}/>:<Link size={14}/>}
            {copied==="url"?"Link copied!":"Copy shareable URL"}
          </button>
          <button className="ib" onClick={()=>doCopy("css",makeCSS(fgIn,bgIn,ratio,aaP,aaaP,lc,apcaP))}
            style={{background:T.card,color:T.text,border:`0.5px solid ${T.border}`,borderRadius:9,padding:"8px 15px",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:7}}>
            {copied==="css"?<Check size={14} color={T.pass}/>:<Copy size={14}/>}
            {copied==="css"?"Copied!":"Copy CSS variables"}
          </button>
        </div>

      </div>
    </div>
  );
}
