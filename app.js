// ── TIMES 주거 매물 관리 v1.0.0 ──
const APP_VERSION = 'v1.4.0';
const { useState, useEffect, useRef } = React;

// ── 상수 ──
const PY       = 3.30579;
const STO_CRED  = 'times-apt-sb';
const STO_INFO  = 'times-apt-info';
const STO_CACHE = 'times-apt-cache';
const TBL = 'residential_listings';

// ── Supabase ──
let _sb = null;
const getSB  = () => _sb;
const initSB = (url, key) => { _sb = window.supabase.createClient(url, key); return _sb; };

// ── DB ──
const dbLoad = async () => {
  const { data, error } = await getSB()
    .from(TBL).select('id, data, updated_at').order('updated_at', {ascending:true}).limit(300);
  if (error) throw error;
  return data.map(r => Object.assign({}, r.data||{}));
};
const dbUpsert = async (item) => {
  const { error } = await getSB().from(TBL)
    .upsert({ id: item.id, data: item, updated_at: new Date().toISOString() });
  if (error) throw error;
};
const dbDelete = async (id) => {
  const { error } = await getSB().from(TBL).delete().eq('id', id);
  if (error) throw error;
};

// ── 유틸 ──
const py2m  = v => v ? (parseFloat(v)*PY).toFixed(2) : '';
const m2py  = v => v ? (parseFloat(v)/PY).toFixed(2) : '';
const n     = v => parseFloat(v)||0;
const uid   = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmt   = v => {
  const a = Math.round(n(v));
  if (a<=0) return '—';
  if (a>=10000) { const uk=Math.floor(a/10000), man=a%10000; return man>0?uk+'억 '+man.toLocaleString()+'만원':uk+'억원'; }
  return a.toLocaleString()+'만원';
};
const fmtPy = (price, py) => (!price||!py||n(py)===0)?'—': Math.round(n(price)/n(py)).toLocaleString()+'만원';
const perPy = (price, py) => (!price||!py||n(py)===0)?null: Math.round(n(price)/n(py));
const loadInfo = () => { try { return JSON.parse(localStorage.getItem(STO_INFO)||'{}'); } catch { return {}; } };
const saveInfo = obj => localStorage.setItem(STO_INFO, JSON.stringify(obj));

const DEAL_LABEL = { sale:'매매', jeonse:'전세', monthly:'월세', rent:'렌트' };
const DEAL_COLOR = { sale:'#1a5276', jeonse:'#196f3d', monthly:'#7d6608', rent:'#6e2f1a' };
const PROP_LABEL = { apt:'아파트', villa:'빌라/다세대', officetel:'오피스텔' };

const blank = () => ({
  id: uid(), createdAt: Date.now(), sortOrder: 0,
  complexName:'', dong:'', ho:'', address:'', propType:'apt',
  dealType:'jeonse',
  salePrice:'', jeonsePrice:'', deposit:'', monthlyRent:'', mgmtFee:'',
  supplyPy:'', supplyM2:'', exclusivePy:'', exclusiveM2:'',
  floor:'', totalFloor:'', rooms:'', bathrooms:'', direction:'',
  moveIn:'', approvalDate:'', parking:'', elevator:'', heating:'', units:'',
  notes:'', printSel:true,
});

// ── 면적 환산 헬퍼 ──
function AreaInput({ labelPy, labelM2, valPy, valM2, onChangePy, onChangeM2 }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
      <div>
        <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>{labelPy}</div>
        <input value={valPy} placeholder="예) 24.39"
          onChange={e=>{ const v=e.target.value; onChangePy(v); onChangeM2(v?py2m(v):''); }}
          style={{width:'100%',fontSize:'12px',padding:'5px 8px',border:'1px solid #e0dcd4'}} />
      </div>
      <div>
        <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>{labelM2}</div>
        <input value={valM2} placeholder="예) 80.63"
          onChange={e=>{ const v=e.target.value; onChangeM2(v); onChangePy(v?m2py(v):''); }}
          style={{width:'100%',fontSize:'12px',padding:'5px 8px',border:'1px solid #e0dcd4'}} />
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 네이버 파싱 모달 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function NaverParseModal({ onParsed, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  const parse = async () => {
    if (!text.trim()) { setErr('텍스트를 붙여넣어 주세요'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/parse-res', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: text.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'API 오류 '+res.status);
      onParsed(data);
    } catch(e) { setErr('파싱 실패: '+(e.message||String(e))); }
    finally { setBusy(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,42,0.88)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div style={{background:'white',width:'100%',maxWidth:'580px',padding:'24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'16px',borderBottom:'2px solid #0d1b2a',paddingBottom:'12px'}}>
          <div>
            <div style={{fontSize:'8px',letterSpacing:'.2em',color:'#c9a84c',marginBottom:'4px'}}>NAVER LISTING IMPORT</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'20px',fontWeight:600,color:'#0d1b2a'}}>네이버 매물 자동 입력</div>
            <div style={{fontSize:'11px',color:'#888',marginTop:'3px'}}>네이버 부동산 매물 텍스트를 붙여넣으세요</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:'20px',color:'#888'}}>×</button>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder="네이버 부동산 매물 상세 페이지 전체 텍스트 붙여넣기 (Ctrl+A → Ctrl+C → Ctrl+V)" rows={10}
          style={{width:'100%',fontSize:'12px',padding:'10px',border:'1px solid #e0dcd4',resize:'vertical',fontFamily:'inherit',lineHeight:1.7,boxSizing:'border-box'}} />
        {err && <div style={{fontSize:'11px',color:'#c0392b',background:'#fff5f4',padding:'8px',marginTop:'8px'}}>{err}</div>}
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'14px'}}>
          <button onClick={onClose} style={{padding:'8px 18px',background:'white',border:'1px solid #ccc',cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>취소</button>
          <button onClick={parse} disabled={busy}
            style={{padding:'8px 22px',background:busy?'#aaa':'#0d1b2a',color:'#c9a84c',border:'none',cursor:busy?'not-allowed':'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600,minWidth:'110px'}}>
            {busy?'⏳ 분석 중…':'✨ 자동 입력'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Supabase 연결 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SBSetup({ onConnect }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy,setBusy] = useState(false);

  const connect = async () => {
    if (!url.trim()||!key.trim()) { setErr('URL과 API Key를 입력하세요'); return; }
    setBusy(true); setErr('');
    try {
      const client = initSB(url.trim(), key.trim());
      const { error } = await client.from(TBL).select('id').limit(1);
      if (error) throw error;
      localStorage.setItem(STO_CRED, JSON.stringify({url:url.trim(),key:key.trim()}));
      onConnect();
    } catch(e) { _sb=null; setErr('연결 실패: '+(e.message||String(e))); }
    finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f7f4ef'}}>
      <div style={{background:'white',border:'1px solid #0d1b2a',padding:'32px',width:'100%',maxWidth:'440px'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'9px',letterSpacing:'.25em',color:'#c9a84c',marginBottom:'6px'}}>TIMES REAL ESTATE</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'24px',fontWeight:600,color:'#0d1b2a',marginBottom:'4px'}}>주거 매물 관리</div>
        <div style={{fontSize:'11px',color:'#888',marginBottom:'24px'}}>Supabase 프로젝트에 연결하세요</div>
        <div style={{marginBottom:'12px'}}>
          <div style={{fontSize:'10px',color:'#888',marginBottom:'3px'}}>Supabase Project URL</div>
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"
            style={{width:'100%',fontSize:'12px',padding:'8px 10px',border:'1px solid #e0dcd4',outline:'none'}} />
        </div>
        <div style={{marginBottom:'20px'}}>
          <div style={{fontSize:'10px',color:'#888',marginBottom:'3px'}}>anon / public API Key</div>
          <input value={key} onChange={e=>setKey(e.target.value)} placeholder="eyJ..." type="password"
            style={{width:'100%',fontSize:'12px',padding:'8px 10px',border:'1px solid #e0dcd4',outline:'none'}} />
        </div>
        {err && <div style={{fontSize:'11px',color:'#c0392b',background:'#fff5f4',padding:'8px',marginBottom:'12px'}}>{err}</div>}
        <div style={{background:'#f5f2eb',padding:'10px 12px',fontSize:'10px',color:'#888',marginBottom:'16px',lineHeight:1.7}}>
          <strong style={{color:'#0d1b2a'}}>테이블 생성 SQL</strong><br/>
          <code style={{fontSize:'9px',color:'#2471a3',display:'block',marginTop:'4px'}}>
            CREATE TABLE residential_listings (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());<br/>
            ALTER TABLE residential_listings ENABLE ROW LEVEL SECURITY;<br/>
            CREATE POLICY "allow_all" ON residential_listings FOR ALL USING (true);
          </code>
        </div>
        <button onClick={connect} disabled={busy}
          style={{width:'100%',background:busy?'#888':'#0d1b2a',color:'#c9a84c',border:'none',padding:'10px',fontSize:'13px',cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',letterSpacing:'.05em'}}>
          {busy?'연결 중…':'연결하기'}
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 입력 폼 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ListingForm({ init, onSave, onClose }) {
  const [ls, setLs] = useState(init||blank());
  const [busy, setBusy] = useState(false);
  const [showNaver, setShowNaver] = useState(false);
  const set = (k,v) => setLs(p=>({...p,[k]:v}));

  const handleParsed = parsed => {
    setLs(prev => ({
      ...prev,
      complexName: parsed.complexName || prev.complexName,
      dong:        parsed.dong        || prev.dong,
      address:     parsed.address     || prev.address,
      propType:    parsed.propType    || prev.propType,
      dealType:    parsed.dealType    || prev.dealType,
      salePrice:   parsed.salePrice   || prev.salePrice,
      jeonsePrice: parsed.jeonsePrice || prev.jeonsePrice,
      deposit:     parsed.deposit     || prev.deposit,
      monthlyRent: parsed.monthlyRent || prev.monthlyRent,
      mgmtFee:     parsed.mgmtFee     || prev.mgmtFee,
      supplyPy:    parsed.supplyPy    || prev.supplyPy,
      supplyM2:    parsed.supplyM2    || prev.supplyM2,
      exclusivePy: parsed.exclusivePy || prev.exclusivePy,
      exclusiveM2: parsed.exclusiveM2 || prev.exclusiveM2,
      floor:       parsed.floor       || prev.floor,
      totalFloor:  parsed.totalFloor  || prev.totalFloor,
      rooms:       parsed.rooms       || prev.rooms,
      bathrooms:   parsed.bathrooms   || prev.bathrooms,
      direction:   parsed.direction   || prev.direction,
      moveIn:      parsed.moveIn      || prev.moveIn,
      approvalDate:parsed.approvalDate|| prev.approvalDate,
      parking:     parsed.parking     || prev.parking,
      elevator:    parsed.elevator    || prev.elevator,
      heating:     parsed.heating     || prev.heating,
      units:       parsed.units       || prev.units,
    }));
    setShowNaver(false);
  };

  const fld = (label, key, ph='') => (
    <div>
      <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>{label}</div>
      <input value={ls[key]||''} placeholder={ph} onChange={e=>set(key,e.target.value)}
        style={{width:'100%',fontSize:'12px',padding:'5px 8px',border:'1px solid #e0dcd4'}} />
    </div>
  );

  const handleSave = async () => {
    if (!ls.complexName.trim()) { alert('단지/건물명을 입력하세요'); return; }
    setBusy(true);
    try { await dbUpsert(ls); onSave(ls); }
    catch(e) { alert('저장 실패: '+e.message); }
    finally { setBusy(false); }
  };

  const isSale    = ls.dealType==='sale';
  const isJeonse  = ls.dealType==='jeonse';
  const isMonthly = ls.dealType==='monthly'||ls.dealType==='rent';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,42,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div style={{background:'white',width:'100%',maxWidth:'720px',maxHeight:'90vh',overflowY:'auto',padding:'24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px',borderBottom:'2px solid #0d1b2a',paddingBottom:'10px'}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'20px',fontWeight:600,color:'#0d1b2a'}}>
            {init?'매물 수정':'새 매물 등록'}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:'18px',color:'#888'}}>×</button>
        </div>

        {showNaver && <NaverParseModal onParsed={handleParsed} onClose={()=>setShowNaver(false)} />}
        <div style={{marginBottom:'18px',padding:'12px 14px',background:'#f0f6ff',border:'1px solid #b8d0f5',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
          <div>
            <div style={{fontSize:'12px',fontWeight:600,color:'#1a3a6e',marginBottom:'2px'}}>📋 네이버 매물 텍스트로 자동 입력</div>
            <div style={{fontSize:'11px',color:'#5a7aaa'}}>네이버 부동산 상세 페이지 전체 복사 → 자동 분석</div>
          </div>
          <button onClick={()=>setShowNaver(true)}
            style={{flexShrink:0,padding:'7px 16px',background:'#1a3a6e',color:'white',border:'none',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:600}}>
            ✨ 자동 입력
          </button>
        </div>

        {/* 거래 유형 */}
        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>거래 유형</div>
        <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
          {Object.entries(DEAL_LABEL).map(([v,l]) => (
            <button key={v} onClick={()=>set('dealType',v)}
              style={{padding:'6px 16px',fontSize:'12px',border:'2px solid '+(ls.dealType===v?DEAL_COLOR[v]:'#e0dcd4'),
                background:ls.dealType===v?DEAL_COLOR[v]:'white',color:ls.dealType===v?'white':'#888',
                cursor:'pointer',fontFamily:'inherit',fontWeight:ls.dealType===v?700:400}}>
              {l}
            </button>
          ))}
          <div style={{marginLeft:'auto',display:'flex',gap:'8px'}}>
            {Object.entries(PROP_LABEL).map(([v,l]) => (
              <button key={v} onClick={()=>set('propType',v)}
                style={{padding:'5px 12px',fontSize:'11px',border:'1px solid '+(ls.propType===v?'#0d1b2a':'#e0dcd4'),
                  background:ls.propType===v?'#0d1b2a':'white',color:ls.propType===v?'white':'#888',
                  cursor:'pointer',fontFamily:'inherit'}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 기본 정보 */}
        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>기본 정보</div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
          {fld('단지/건물명 *','complexName','예) 래미안원베일리')}
          {fld('동','dong','예) 106동')}
          {fld('호수','ho','예) 1203호')}
        </div>
        <div style={{marginBottom:'16px'}}>
          {fld('주소','address','서울특별시 서초구...')}
        </div>

        {/* 가격 */}
        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>가격 (만원)</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
          {isSale && fld('매매가','salePrice','예) 120000')}
          {isJeonse && fld('전세가','jeonsePrice','예) 166560')}
          {isMonthly && fld('보증금','deposit','예) 10000')}
          {isMonthly && fld('월세','monthlyRent','예) 200')}
          {fld('관리비/월','mgmtFee','예) 25')}
        </div>

        {/* 면적 */}
        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>면적</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
          <AreaInput labelPy="공급면적 (평)" labelM2="공급면적 (㎡)"
            valPy={ls.supplyPy} valM2={ls.supplyM2}
            onChangePy={v=>set('supplyPy',v)} onChangeM2={v=>set('supplyM2',v)} />
          <AreaInput labelPy="전용면적 (평)" labelM2="전용면적 (㎡)"
            valPy={ls.exclusivePy} valM2={ls.exclusiveM2}
            onChangePy={v=>set('exclusivePy',v)} onChangeM2={v=>set('exclusiveM2',v)} />
        </div>

        {/* 상세 정보 */}
        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>상세 정보</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
          {fld('해당층','floor','예) 중')}
          {fld('총층','totalFloor','예) 35')}
          {fld('방수','rooms','예) 3')}
          {fld('욕실수','bathrooms','예) 2')}
          {fld('향','direction','예) 남향')}
          {fld('주차','parking','예) 단지내')}
          {fld('엘리베이터','elevator','예) 총 2대')}
          {fld('난방','heating','예) 개별난방')}
          {fld('세대수','units','예) 2990')}
          {fld('사용승인일','approvalDate','예) 2021.11.24')}
          {fld('입주가능일','moveIn','예) 즉시입주')}
        </div>

        <div style={{marginBottom:'16px'}}>
          <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>비고 / 특이사항</div>
          <textarea value={ls.notes||''} rows={3} onChange={e=>set('notes',e.target.value)}
            placeholder="옵션, 리모델링, 특이사항 등"
            style={{width:'100%',resize:'vertical',fontSize:'12px',padding:'6px 8px',border:'1px solid #e0dcd4'}} />
        </div>

        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',background:'white',border:'1px solid #ccc',cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>취소</button>
          <button onClick={handleSave} disabled={busy}
            style={{padding:'7px 20px',background:busy?'#888':'#c9a84c',color:'white',border:'none',cursor:busy?'not-allowed':'pointer',fontSize:'12px',fontFamily:'inherit'}}>
            {busy?'저장 중…':'저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 매물 카드 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LCard({ ls, onEdit, onDelete, onToggle, onDragStart, onDragOver, onDrop, isDragging }) {
  const isSale = ls.dealType==='sale';
  return (
    <div draggable onDragStart={onDragStart} onDragOver={e=>{e.preventDefault();onDragOver();}} onDrop={onDrop}
      style={{background:'white',border:'1px solid #e0dcd4',position:'relative',overflow:'hidden',
        opacity:isDragging?0.4:1,cursor:'grab',transition:'opacity .15s'}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:'3px',background:ls.printSel?DEAL_COLOR[ls.dealType]||'#c9a84c':'#e0dcd4'}} />
      <div style={{padding:'12px 12px 8px 15px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'2px'}}>
              <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'15px',fontWeight:600,color:'#0d1b2a'}}>
                {ls.complexName||'(단지명 없음)'}
              </span>
              <span style={{fontSize:'10px',fontWeight:700,color:'white',background:DEAL_COLOR[ls.dealType]||'#888',padding:'1px 6px',flexShrink:0}}>
                {DEAL_LABEL[ls.dealType]||ls.dealType}
              </span>
            </div>
            {ls.dong && <span style={{fontSize:'11px',color:'#c9a84c',fontWeight:600}}>{ls.dong}동 </span>}
            {ls.floor && <span style={{fontSize:'11px',color:'#888'}}>{ls.floor}{ls.totalFloor?'/'+ls.totalFloor+'층':'층'}</span>}
            {ls.address && <div style={{fontSize:'10px',color:'#aaa',marginTop:'2px'}}>{ls.address}</div>}
          </div>
          <input type="checkbox" checked={ls.printSel} onChange={onToggle}
            style={{cursor:'pointer',marginLeft:'8px',flexShrink:0}} />
        </div>

        {/* 가격 */}
        <div style={{background:'#f7f4ef',padding:'6px 8px',marginBottom:'6px'}}>
          {isSale && ls.salePrice && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'11px',color:'#888'}}>매매가</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'#1a5276'}}>{fmt(ls.salePrice)}</span>
          </div>}
          {!isSale && ls.jeonsePrice && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'11px',color:'#888'}}>전세가</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'#196f3d'}}>{fmt(ls.jeonsePrice)}</span>
          </div>}
          {!isSale && (ls.deposit||ls.monthlyRent) && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'11px',color:'#888'}}>보증/월세</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'#7d6608'}}>{fmt(ls.deposit)} / {fmt(ls.monthlyRent)}</span>
          </div>}
          {ls.mgmtFee && <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #ede9e1',marginTop:'3px',paddingTop:'3px'}}>
            <span style={{fontSize:'10px',color:'#aaa'}}>관리비</span>
            <span style={{fontSize:'11px',color:'#555'}}>{fmt(ls.mgmtFee)}/월</span>
          </div>}
        </div>

        {/* 면적/상세 */}
        <div style={{display:'flex',gap:'12px',fontSize:'11px',color:'#666',flexWrap:'wrap'}}>
          {ls.supplyPy && <span>공급 <strong>{ls.supplyPy}평</strong></span>}
          {ls.exclusivePy && <span>전용 <strong>{ls.exclusivePy}평</strong></span>}
          {ls.rooms && <span>방 <strong>{ls.rooms}</strong></span>}
          {ls.direction && <span><strong>{ls.direction}</strong></span>}
        </div>
        {isSale && ls.salePrice && ls.supplyPy && (
          <div style={{marginTop:'4px',fontSize:'10px',color:'#1a5276'}}>
            공급평당 {fmtPy(ls.salePrice, ls.supplyPy)}
            {ls.exclusivePy && ' · 전용평당 '+fmtPy(ls.salePrice, ls.exclusivePy)}
          </div>
        )}
        {ls.notes && <div style={{marginTop:'4px',fontSize:'10px',color:'#2471a3',lineHeight:1.4}}>{ls.notes.slice(0,50)}{ls.notes.length>50?'…':''}</div>}
      </div>

      <div style={{borderTop:'1px solid #f0ede6',padding:'5px 12px',display:'flex',gap:'6px',justifyContent:'flex-end',background:'#fafaf8'}}>
        <button onClick={onEdit} style={{fontSize:'10px',padding:'3px 10px',background:'none',border:'1px solid #c9a84c',color:'#c9a84c',cursor:'pointer'}}>편집</button>
        <button onClick={onDelete} style={{fontSize:'10px',padding:'3px 10px',background:'none',border:'1px solid #ddd',color:'#888',cursor:'pointer'}}>삭제</button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 브리핑 시트 (A4 가로, 7매물) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BriefingSheet({ listings, clientName, reportDate, bizName, bizAddr, agentName, agentPhone, logoSrc }) {
  const sel = listings.filter(l=>l.printSel);
  if (!sel.length) return <div style={{textAlign:'center',padding:'60px',color:'#aaa'}}>매물 목록에서 출력할 매물을 체크하세요</div>;

  const isSale = sel.some(l=>l.dealType==='sale');

  const CHUNK = 7;
  const chunks = [];
  for (let i=0; i<sel.length; i+=CHUNK) chunks.push(sel.slice(i,i+CHUNK));

  const BD = '0.5pt solid #e0dcd4';
  const BDH = '2pt solid #0d1b2a';
  const thS = { background:'#0d1b2a',color:'white',padding:'5pt 6pt',fontSize:'8pt',fontWeight:600,textAlign:'center',border:'0.5pt solid #0d1b2a',verticalAlign:'top',lineHeight:1.3 };
  const labelS = { background:'#f5f2eb',padding:'4pt 6pt',fontSize:'7.5pt',fontWeight:600,color:'#555',border:BD,textAlign:'center',verticalAlign:'middle',whiteSpace:'nowrap' };
  const cellS = (i) => ({ padding:'4pt 6pt',fontSize:'8.5pt',textAlign:'center',border:BD,background:i%2===0?'white':'#fafaf8',verticalAlign:'middle' });
  const hiCellS = (i) => ({ padding:'4pt 6pt',fontSize:'9pt',fontWeight:700,textAlign:'center',border:BD,background:i%2===0?'#f0f7ff':'#e8f4fd',verticalAlign:'middle',color:'#1a5276' });

  return (
    <>
      {chunks.map((chunk, ci) => (
        <div key={ci} className="print-only" style={{pageBreakBefore:ci>0?'always':'auto',breakBefore:ci>0?'page':'auto'}}>
          {/* 헤더 */}
          <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'6pt',marginBottom:'10pt',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
            <div>
              <div style={{fontSize:'7pt',letterSpacing:'.15em',color:'#c9a84c',marginBottom:'5pt'}}>TIMES REAL ESTATE</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'24pt',fontWeight:600,color:'#0d1b2a',lineHeight:1}}>
                {clientName||'매물 브리핑 시트'}
              </div>
            </div>
            <div style={{textAlign:'right',fontSize:'8pt',color:'#aaa'}}>
              {reportDate}&nbsp;·&nbsp;총 {sel.length}건
              {chunks.length>1&&<span>&nbsp;·&nbsp;{ci+1}/{chunks.length}</span>}
            </div>
          </div>

          <table style={{borderCollapse:'collapse',tableLayout:'fixed',width: chunk.length < 7 ? (52 + chunk.length*99)+'pt' : '100%'}}>
            <colgroup>
              <col style={{width:'52pt'}} />
              {chunk.map((_,i)=><col key={i} style={{width:'99pt'}} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{...thS,background:'#0d1b2a',color:'#c9a84c',fontSize:'7pt',verticalAlign:'middle'}}>항목</th>
                {chunk.map((l,i)=>(
                  <th key={l.id} style={thS}>
                    <div style={{fontSize:'6.5pt',color:DEAL_COLOR[l.dealType]||'#c9a84c',marginBottom:'2pt',fontWeight:700}}>
                      {'①②③④⑤⑥⑦⑧⑨⑩'[i+(ci*CHUNK)]} {DEAL_LABEL[l.dealType]}
                    </div>
                    <div style={{fontSize:'9.5pt',fontFamily:"'Cormorant Garamond',serif",fontWeight:700,lineHeight:1.2}}>
                      {l.complexName}
                    </div>
                    {l.dong&&<div style={{fontSize:'7pt',color:'#c9a84c',marginTop:'1pt'}}>{l.dong}동</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 가격 행 */}
              {isSale&&chunk.some(l=>l.salePrice)&&(
                <tr><td style={labelS}>매매가</td>{chunk.map((l,i)=><td key={l.id} style={hiCellS(i)}>{l.salePrice?fmt(l.salePrice):'—'}</td>)}</tr>
              )}
              {!isSale&&chunk.some(l=>l.jeonsePrice)&&(
                <tr><td style={labelS}>전세가</td>{chunk.map((l,i)=><td key={l.id} style={{...hiCellS(i),color:'#196f3d',background:i%2===0?'#f0fff4':'#e8faf0'}}>{l.jeonsePrice?fmt(l.jeonsePrice):'—'}</td>)}</tr>
              )}
              {!isSale&&chunk.some(l=>l.deposit)&&(
                <tr><td style={labelS}>보증금</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.deposit?fmt(l.deposit):'—'}</td>)}</tr>
              )}
              {!isSale&&chunk.some(l=>l.monthlyRent)&&(
                <tr><td style={labelS}>월세</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.monthlyRent?fmt(l.monthlyRent):'—'}</td>)}</tr>
              )}
              {chunk.some(l=>l.mgmtFee)&&(
                <tr><td style={labelS}>관리비/월</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.mgmtFee?fmt(l.mgmtFee):'—'}</td>)}</tr>
              )}
              {/* 면적 */}
              <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>공급면적</td>{chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0'}}>{l.supplyPy?l.supplyPy+'평':'—'}</td>)}</tr>
              <tr><td style={labelS}>전용면적</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.exclusivePy?l.exclusivePy+'평':'—'}</td>)}</tr>
              {/* 상세 */}
              <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>층</td>{chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0'}}>{l.floor?(l.floor+(l.totalFloor?'/'+l.totalFloor+'층':'층')):'—'}</td>)}</tr>
              {chunk.some(l=>l.rooms)&&<tr><td style={labelS}>방/욕실</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{(l.rooms||'—')+'/'+(l.bathrooms||'—')}</td>)}</tr>}
              {chunk.some(l=>l.direction)&&<tr><td style={labelS}>향</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.direction||'—'}</td>)}</tr>}
              {chunk.some(l=>l.moveIn)&&<tr><td style={labelS}>입주가능</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.moveIn||'—'}</td>)}</tr>}
              {chunk.some(l=>l.approvalDate)&&<tr><td style={labelS}>사용승인</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.approvalDate||'—'}</td>)}</tr>}
              {chunk.some(l=>l.parking)&&<tr><td style={labelS}>주차</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.parking||'—'}</td>)}</tr>}
              {/* 평단가 (매매만) */}
              {isSale&&(
                <>
                  <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0',color:'#1a5276'}}>공급평당가</td>
                    {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0',color:'#1a5276',fontWeight:600}}>{fmtPy(l.salePrice,l.supplyPy)}</td>)}</tr>
                  <tr><td style={{...labelS,color:'#1a5276'}}>전용평당가</td>
                    {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),color:'#1a5276',fontWeight:600}}>{fmtPy(l.salePrice,l.exclusivePy)}</td>)}</tr>
                </>
              )}
              {/* 비고 */}
              {chunk.some(l=>l.notes)&&(
                <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>비고</td>
                  {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0',fontSize:'7.5pt',textAlign:l.notes?'left':'center'}}>{l.notes||'—'}</td>)}</tr>
              )}
            </tbody>
          </table>

          {/* 푸터 */}
          <div style={{marginTop:'8pt',borderTop:'1pt solid #c9a84c',paddingTop:'5pt',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'8pt',color:'#555'}}>
            <span style={{display:'flex',alignItems:'center',gap:'8pt'}}>
              {logoSrc&&<img src={logoSrc} style={{height:'18pt',objectFit:'contain'}} />}
              {bizName&&<strong style={{color:'#0d1b2a',fontSize:'9pt'}}>{bizName}</strong>}
              {bizAddr&&<span style={{color:'#888',marginLeft:'6pt'}}>{bizAddr}</span>}
            </span>
            <span>
              {agentName&&<strong style={{color:'#0d1b2a',marginRight:'6pt'}}>{agentName}</strong>}
              {agentPhone&&<span>{agentPhone}</span>}
            </span>
          </div>
        </div>
      ))}

      {/* 화면 미리보기 */}
      <div className="screen-only" style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',minWidth:'600px',fontSize:'12px',borderTop:'2px solid #0d1b2a'}}>
          <thead>
            <tr>
              <th style={{background:'#0d1b2a',color:'#c9a84c',padding:'8px 10px',minWidth:'80px',textAlign:'center',borderBottom:'3px solid #c9a84c'}}>항목</th>
              {sel.map((l,i)=>(
                <th key={l.id} style={{background:'#0d1b2a',color:'white',padding:'8px 10px',minWidth:'130px',textAlign:'center',borderBottom:'3px solid #c9a84c'}}>
                  <div style={{fontSize:'10px',color:DEAL_COLOR[l.dealType]||'#c9a84c',marginBottom:'2px'}}>{'①②③④⑤⑥⑦⑧⑨⑩'[i]} {DEAL_LABEL[l.dealType]}</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'14px',fontWeight:700}}>{l.complexName}</div>
                  {l.dong&&<div style={{fontSize:'10px',color:'#c9a84c'}}>{l.dong}동</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isSale&&sel.some(l=>l.salePrice)&&<tr><td style={{padding:'6px 10px',background:'#f0f7ff',fontWeight:700,color:'#1a5276',textAlign:'center'}}>매매가</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',fontWeight:700,color:'#1a5276',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'#f0f7ff':'#e8f4fd'}}>{l.salePrice?fmt(l.salePrice):'—'}</td>)}</tr>}
            {!isSale&&sel.some(l=>l.jeonsePrice)&&<tr><td style={{padding:'6px 10px',background:'#f0fff4',fontWeight:700,color:'#196f3d',textAlign:'center'}}>전세가</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',fontWeight:700,color:'#196f3d',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'#f0fff4':'#e8faf0'}}>{l.jeonsePrice?fmt(l.jeonsePrice):'—'}</td>)}</tr>}
            {!isSale&&sel.some(l=>l.deposit)&&<tr><td style={{padding:'6px 10px',background:'#fafaf8',textAlign:'center'}}>보증금</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'white':'#fafaf8'}}>{l.deposit?fmt(l.deposit):'—'}</td>)}</tr>}
            {sel.some(l=>l.mgmtFee)&&<tr><td style={{padding:'6px 10px',background:'#fafaf8',textAlign:'center'}}>관리비</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'white':'#fafaf8'}}>{l.mgmtFee?fmt(l.mgmtFee):'—'}</td>)}</tr>}
            <tr><td style={{padding:'6px 10px',background:'#fafaf8',textAlign:'center'}}>공급/전용</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'white':'#fafaf8'}}>{(l.supplyPy||'—')+'/'+(l.exclusivePy||'—')+'평'}</td>)}</tr>
            <tr><td style={{padding:'6px 10px',background:'#fafaf8',textAlign:'center'}}>층/방/향</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',borderBottom:'0.5px solid #f0ede6',background:i%2===0?'white':'#fafaf8'}}>{(l.floor||'—')+'층 '+(l.rooms||'—')+'방 '+(l.direction||'—')}</td>)}</tr>
            {isSale&&<tr><td style={{padding:'6px 10px',background:'#e8f4fd',color:'#1a5276',fontWeight:700,textAlign:'center'}}>공급평당가</td>{sel.map((l,i)=><td key={l.id} style={{padding:'6px 10px',textAlign:'center',color:'#1a5276',fontWeight:600,borderBottom:'0.5px solid #f0ede6',background:i%2===0?'#f0f7ff':'#e8f4fd'}}>{fmtPy(l.salePrice,l.supplyPy)}</td>)}</tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 투어 카드 (A4 세로, 4장/페이지) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TourCards({ listings, clientName, reportDate, bizName, agentName, agentPhone, logoSrc }) {
  var sel = listings.filter(function(l){return l.printSel;});
  if (!sel.length) return <div style={{textAlign:'center',padding:'60px',color:'#aaa'}}>매물 목록에서 출력할 매물을 체크하세요</div>;

  var CHUNK = 4;
  var chunks = [];
  for (var i=0; i<sel.length; i+=CHUNK) chunks.push(sel.slice(i,i+CHUNK));

  var globalIdx = function(ci,li){ return ci*CHUNK+li; };

  var Card = function(props) {
    var ls = props.ls;
    var idx = props.idx;
    var isSale = ls.dealType==='sale';
    var num = '①②③④⑤⑥⑦⑧⑨⑩'[idx]||String(idx+1);
    return (
      <div style={{border:'1pt solid #0d1b2a',padding:'8pt 10pt',display:'flex',flexDirection:'column',overflow:'hidden',WebkitPrintColorAdjust:'exact',printColorAdjust:'exact'}}>
        {/* 카드 헤더 */}
        <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'6pt',marginBottom:'8pt',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:'6pt'}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'20pt',fontWeight:700,color:'#0d1b2a',lineHeight:1,flexShrink:0}}>
              {num}
            </span>
            <div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'13pt',fontWeight:600,color:'#0d1b2a',lineHeight:1.2}}>
                {ls.complexName}
                {ls.dong&&<span style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'11pt',color:'#c9a84c',marginLeft:'5pt',fontWeight:600}}>{ls.dong}동</span>}
              </div>
              {ls.address&&<div style={{fontSize:'9pt',color:'#888',marginTop:'1pt'}}>{ls.address}</div>}
            </div>
          </div>
          <span style={{fontSize:'9pt',fontWeight:700,color:'white',background:DEAL_COLOR[ls.dealType]||'#888',padding:'2pt 9pt',flexShrink:0,marginLeft:'6pt'}}>
            {DEAL_LABEL[ls.dealType]||ls.dealType}
          </span>
        </div>

        {/* 가격 블록 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5pt',marginBottom:'7pt'}}>
          {isSale&&ls.salePrice&&(
            <div style={{background:'#eaf0f8',padding:'6pt 9pt',gridColumn:'1/-1'}}>
              <div style={{fontSize:'9pt',color:'#1a5276',letterSpacing:'.05em',marginBottom:'2pt'}}>매매가</div>
              <div style={{fontSize:'16pt',fontWeight:700,color:'#1a5276',lineHeight:1}}>{fmt(ls.salePrice)}</div>
            </div>
          )}
          {!isSale&&ls.jeonsePrice&&(
            <div style={{background:'#eafaf1',padding:'6pt 9pt',gridColumn:'1/-1'}}>
              <div style={{fontSize:'9pt',color:'#196f3d',letterSpacing:'.05em',marginBottom:'2pt'}}>전세가</div>
              <div style={{fontSize:'16pt',fontWeight:700,color:'#196f3d',lineHeight:1}}>{fmt(ls.jeonsePrice)}</div>
            </div>
          )}
          {!isSale&&(ls.deposit||ls.monthlyRent)&&(
            <>
              {ls.deposit&&<div style={{background:'#fef9e7',padding:'5pt 9pt'}}>
                <div style={{fontSize:'9pt',color:'#7d6608'}}>보증금</div>
                <div style={{fontSize:'12pt',fontWeight:700,color:'#7d6608'}}>{fmt(ls.deposit)}</div>
              </div>}
              {ls.monthlyRent&&<div style={{background:'#fef9e7',padding:'5pt 9pt'}}>
                <div style={{fontSize:'9pt',color:'#7d6608'}}>월세</div>
                <div style={{fontSize:'12pt',fontWeight:700,color:'#7d6608'}}>{fmt(ls.monthlyRent)}</div>
              </div>}
            </>
          )}
        </div>

        {/* 상세 정보 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4pt',marginBottom:'6pt'}}>
          {[
            ['관리비', ls.mgmtFee?fmt(ls.mgmtFee)+'/월':'—', null, 1],
            ['면적', ls.supplyPy?(ls.supplyPy+'평형'):'—', ls.exclusivePy?('전용 '+ls.exclusivePy+'평'):null, 1],
            ['층', ls.floor?(ls.floor+(ls.totalFloor?'/'+ls.totalFloor+'층':'층')):'—', null, 1],
            ['방/욕실', (ls.rooms||'—')+'/'+(ls.bathrooms||'—'), null, 1],
            ['주차', ls.parking||'—', null, 1],
            ['방향', ls.direction||'—', null, 1],
            ['사용승인', ls.approvalDate||'—', null, 1],
            ['입주', ls.moveIn||'—', null, 2],
          ].map(function(row,ri){
            return (
              <div key={ri} style={{background:'#f7f4ef',padding:'4pt 6pt',gridColumn:'span '+row[3]}}>
                <div style={{fontSize:'8pt',color:'#999',marginBottom:'2pt'}}>{row[0]}</div>
                <div style={{fontSize:'9pt',fontWeight:600,color:'#0d1b2a',lineHeight:1.3}}>{row[1]}</div>
                {row[2]&&<div style={{fontSize:'8pt',color:'#888'}}>{row[2]}</div>}
              </div>
            );
          })}
        </div>

        {/* 평단가 (매매만) */}
        {isSale&&ls.salePrice&&(ls.supplyPy||ls.exclusivePy)&&(
          <div style={{display:'flex',gap:'10pt',marginBottom:'6pt',fontSize:'9pt',color:'#1a5276'}}>
            {ls.supplyPy&&<span>공급평당 <strong>{fmtPy(ls.salePrice,ls.supplyPy)}</strong></span>}
            {ls.exclusivePy&&<span>전용평당 <strong>{fmtPy(ls.salePrice,ls.exclusivePy)}</strong></span>}
          </div>
        )}

        {/* 메모란 */}
        <div style={{flex:1,border:'0.5pt dashed #ccc',padding:'5pt 7pt',marginTop:'4pt',display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:'8pt',color:'#bbb',marginBottom:'4pt',letterSpacing:'.05em'}}>✎ 메모</div>
          {ls.notes ? (
            <div style={{flex:1}}>
              {ls.notes.split('\n').filter(function(line){return line.trim();}).map(function(line,li){
                return (
                  <div key={li} style={{display:'flex',gap:'4pt',fontSize:'9pt',color:'#333',lineHeight:1.7,marginBottom:'1pt'}}>
                    <span style={{color:'#c9a84c',flexShrink:0,fontWeight:700}}>•</span>
                    <span>{line}</span>
                  </div>
                );
              })}
            </div>
          ) : <div style={{flex:1}} />}
        </div>
      </div>
    );
  };

  /* ── 인쇄 전용 페이지들 ── */
  var pages = chunks.map(function(chunk, ci) {
    return (
      <div key={ci} className="tour-page print-only">

        {/* 헤더 */}
        <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'7pt',marginBottom:'12pt',
          display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexShrink:0}}>
          <div>
            <div style={{fontSize:'7pt',letterSpacing:'.2em',color:'#c9a84c',marginBottom:'6pt'}}>TIMES REAL ESTATE</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'10pt'}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'22pt',fontWeight:600,color:'#0d1b2a',lineHeight:1}}>
                {clientName||'투어 카드'}
              </div>
              {clientName&&(
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'15pt',fontWeight:400,color:'#aaa',lineHeight:1}}>
                  투어 카드
                </div>
              )}
            </div>
          </div>
          <div style={{textAlign:'right',fontSize:'8pt',color:'#aaa',paddingBottom:'2pt'}}>
            {reportDate}&nbsp;·&nbsp;총 {sel.length}건
          </div>
        </div>

        {/* 2×2 그리드 */}
        <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr',gap:'6pt',minHeight:0,overflow:'hidden'}}>
          {chunk.map(function(l,li){
            return <Card key={l.id} ls={l} idx={globalIdx(ci,li)} />;
          })}
          {chunk.length<4&&Array.from({length:4-chunk.length}).map(function(_,ei){
            return <div key={'e'+ei} style={{border:'0.5pt dashed #e0dcd4'}} />;
          })}
        </div>

        {/* 푸터 */}
        <div style={{marginTop:'6pt',borderTop:'1pt solid #c9a84c',paddingTop:'5pt',
          display:'flex',alignItems:'center',flexShrink:0,position:'relative'}}>
          <span style={{display:'flex',alignItems:'center',gap:'8pt',flex:1}}>
            {logoSrc&&<img src={logoSrc} style={{height:'18pt',objectFit:'contain'}} />}
            {bizName&&<strong style={{color:'#0d1b2a',fontSize:'11pt'}}>{bizName}</strong>}
          </span>
          <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',fontSize:'9pt',color:'#aaa',whiteSpace:'nowrap'}}>
            {ci+1} / {chunks.length}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'10pt',flex:1,justifyContent:'flex-end'}}>
            {agentName&&<strong style={{color:'#0d1b2a',fontSize:'11pt'}}>{agentName}</strong>}
            {agentPhone&&<span style={{fontSize:'11pt',color:'#555'}}>{agentPhone}</span>}
          </span>
        </div>
      </div>
    );
  });

  /* ── 화면 미리보기 ── */
  var screenView = (
    <div className="screen-only">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'16px'}}>
        {sel.map(function(l,i){
          var isSale = l.dealType==='sale';
          return (
            <div key={l.id} style={{border:'1px solid #e0dcd4',padding:'14px',background:'white'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px',borderBottom:'2px solid #0d1b2a',paddingBottom:'8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'22px',fontWeight:700,color:'#c9a84c'}}>{'①②③④⑤⑥⑦⑧⑨⑩'[i]||i+1}</span>
                  <div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'16px',fontWeight:600,color:'#0d1b2a'}}>{l.complexName}</div>
                    {l.dong&&<div style={{fontSize:'11px',color:'#c9a84c'}}>{l.dong}동</div>}
                  </div>
                </div>
                <span style={{fontSize:'11px',fontWeight:700,color:'white',background:DEAL_COLOR[l.dealType]||'#888',padding:'2px 8px'}}>{DEAL_LABEL[l.dealType]}</span>
              </div>
              <div style={{fontSize:'20px',fontWeight:700,color:isSale?'#1a5276':'#196f3d',marginBottom:'8px'}}>
                {isSale?fmt(l.salePrice):(l.jeonsePrice?fmt(l.jeonsePrice):(fmt(l.deposit)+' / '+fmt(l.monthlyRent)))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px',fontSize:'12px',color:'#555',marginBottom:'8px'}}>
                <span>공급 {l.supplyPy||'—'}평형 · 전용 {l.exclusivePy||'—'}평</span>
                <span>{l.floor||'—'}층 · {l.direction||'—'}</span>
                <span>방/욕실 {l.rooms||'—'}/{l.bathrooms||'—'}</span>
                <span>관리비 {l.mgmtFee?fmt(l.mgmtFee):'—'}</span>
                <span>입주 {l.moveIn||'—'}</span>
                {isSale&&l.supplyPy&&<span style={{color:'#1a5276'}}>공급평당 {perPy(l.salePrice,l.supplyPy)?perPy(l.salePrice,l.supplyPy).toLocaleString()+'만':'—'}</span>}
              </div>
              {l.notes&&<div style={{fontSize:'11px',color:'#2471a3',borderTop:'1px dashed #ddd',paddingTop:'6px'}}>{l.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {pages}
      {screenView}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 삭제 확인 모달 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ConfirmModal({ message, subMessage, onConfirm, onCancel, busy }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,42,0.7)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
      <div style={{background:'white',width:'100%',maxWidth:'360px',padding:'28px 24px'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'20px',fontWeight:600,color:'#0d1b2a',marginBottom:'10px'}}>삭제 확인</div>
        <div style={{fontSize:'13px',color:'#333',marginBottom:'6px',lineHeight:1.6}}>{message}</div>
        {subMessage&&<div style={{fontSize:'11px',color:'#c0392b',background:'#fff5f4',padding:'8px 10px',marginBottom:'4px'}}>{subMessage}</div>}
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'20px'}}>
          <button onClick={onCancel} disabled={busy} style={{padding:'8px 20px',background:'white',border:'1px solid #ccc',cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}>취소</button>
          <button onClick={onConfirm} disabled={busy}
            style={{padding:'8px 20px',background:busy?'#aaa':'#c0392b',color:'white',border:'none',cursor:busy?'not-allowed':'pointer',fontSize:'13px',fontFamily:'inherit',fontWeight:600}}>
            {busy?'삭제 중…':'삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 출력 정보 패널 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function InfoPanel({ info, setInfo, onDisconnect }) {
  const [open, setOpen] = useState(false);
  const f = (k,v) => setInfo(p=>({...p,[k]:v}));
  const inp = (label, key, ph) => (
    <div>
      <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>{label}</div>
      <input value={info[key]||''} placeholder={ph} onChange={e=>f(key,e.target.value)}
        style={{width:'100%',fontSize:'12px',padding:'6px 8px',border:'1px solid #e0dcd4'}} />
    </div>
  );
  return (
    <div style={{borderTop:'1px solid #e0dcd4',marginTop:'8px',paddingTop:'8px'}}>
      <div onClick={()=>setOpen(!open)} style={{cursor:'pointer',fontSize:'12px',color:'#888',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span>{open?'▲':'▼'} 출력 정보 설정 (상호 · 담당자 · 로고)</span>
        <button onClick={e=>{e.stopPropagation();if(confirm('Supabase 연결을 해제하시겠습니까?'))onDisconnect();}}
          style={{fontSize:'10px',padding:'2px 8px',background:'none',border:'1px solid #ddd',color:'#888',cursor:'pointer'}}>연결 해제</button>
      </div>
      {open&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'10px'}}>
          {inp('상호','bizName','타임즈부동산중개')}
          {inp('주소','bizAddr','서울특별시 서초구 반포동 반포프라자')}
          {inp('담당자','agentName','성재윤')}
          {inp('연락처','agentPhone','010-6655-5445')}
          <div style={{gridColumn:'1/-1'}}>
            <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>로고 이미지</div>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {info.logoSrc&&<img src={info.logoSrc} style={{height:'28px',objectFit:'contain',border:'1px solid #e0dcd4'}} />}
              <label style={{cursor:'pointer',fontSize:'11px',color:'#3a6fd8',border:'1px solid #b8ccff',padding:'4px 10px',background:'#f0f4ff'}}>
                로고 업로드
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                  const file=e.target.files[0]; if(!file) return;
                  const r=new FileReader(); r.onload=ev=>f('logoSrc',ev.target.result); r.readAsDataURL(file);
                }} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 메인 앱 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function App() {
  const [listings,  setListings]  = useState([]);
  const [view,      setView]      = useState('list');
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [loadErr,   setLoadErr]   = useState('');
  const [dbReady,   setDbReady]   = useState(false);
  const [dragId,    setDragId]    = useState(null);
  const [confirmDlg,setConfirmDlg]= useState(null);
  const [delBusy,   setDelBusy]   = useState(false);
  const [dealFilter,setDealFilter]= useState('all');
  const [clientName,setClientName]= useState('');
  const [info, setInfo] = useState(()=>({
    bizName:'타임즈부동산중개', bizAddr:'서울특별시 서초구 반포동 반포프라자',
    agentName:'성재윤', agentPhone:'010-6655-5445', logoSrc:'',
    ...loadInfo()
  }));
  const reportDate = new Date().toISOString().slice(0,10);

  useEffect(()=>{
    const cred = localStorage.getItem(STO_CRED);
    if (cred) { try { const {url,key}=JSON.parse(cred); initSB(url,key); loadData(); } catch{} }
  },[]);
  useEffect(()=>{ saveInfo(info); },[info]);

  const doSort = arr => arr.slice().sort((a,b)=>{
    const ao=a.sortOrder!==undefined?a.sortOrder:(a.createdAt||0);
    const bo=b.sortOrder!==undefined?b.sortOrder:(b.createdAt||0);
    return ao-bo;
  });

  const loadData = async () => {
    try {
      const raw=localStorage.getItem(STO_CACHE);
      if (raw) { const cached=JSON.parse(raw); if(cached&&cached.length>0){setListings(doSort(cached));setDbReady(true);} }
    } catch(e1){}
    setLoading(true); setLoadErr('');
    try {
      const fresh=await dbLoad();
      const sorted=doSort(fresh);
      setListings(sorted); setDbReady(true);
      try{localStorage.setItem(STO_CACHE,JSON.stringify(sorted));}catch(e2){}
    } catch(err) {
      try{ const has=JSON.parse(localStorage.getItem(STO_CACHE)||'[]').length>0; if(!has)setLoadErr(err.message||'연결 실패'); }
      catch(e3){setLoadErr(err.message||'연결 실패');}
    } finally { setLoading(false); }
  };

  const handleConnect    = ()=>{ loadData(); };
  const handleDisconnect = ()=>{ localStorage.removeItem(STO_CRED); _sb=null; setDbReady(false); setListings([]); };

  const handleDragStart = id=>setDragId(id);
  const handleDragOver  = id=>{
    if (!dragId||dragId===id) return;
    setListings(prev=>{
      const arr=prev.slice();
      const fi=arr.findIndex(x=>x.id===dragId), ti=arr.findIndex(x=>x.id===id);
      if(fi<0||ti<0) return prev;
      const moved=arr.splice(fi,1)[0]; arr.splice(ti,0,moved); return arr;
    });
  };
  const handleDrop = async ()=>{
    setDragId(null);
    setListings(prev=>{ const updated=prev.map((ls,i)=>({...ls,sortOrder:i})); updated.forEach(ls=>dbUpsert(ls).catch(e=>console.warn(e))); return updated; });
  };

  const onSave = ls=>{ setListings(p=>{ const idx=p.findIndex(x=>x.id===ls.id); return idx>=0?p.map(x=>x.id===ls.id?ls:x):[...p,ls]; }); setShowForm(false); setEditing(null); };

  const onDelete = (id,name)=>{ setConfirmDlg({ message:name+' 매물을 삭제하시겠습니까?', onConfirm:async()=>{ setDelBusy(true); try{await dbDelete(id);setListings(p=>p.filter(x=>x.id!==id));setConfirmDlg(null);}catch(e){alert('삭제 실패:'+e.message);}finally{setDelBusy(false);} } }); };

  const onBulkDelete = ()=>{
    const sel = filteredListings.filter(l=>l.printSel);
    if (!sel.length) return;
    setConfirmDlg({ message:'선택한 '+sel.length+'개 매물을 삭제하시겠습니까?', subMessage:'이 작업은 되돌릴 수 없습니다.',
      onConfirm: async()=>{ setDelBusy(true); try{ for(const s of sel) await dbDelete(s.id); setListings(p=>p.filter(l=>!sel.find(s=>s.id===l.id))); setConfirmDlg(null); }catch(e){alert('삭제 실패:'+e.message);} finally{setDelBusy(false);} }
    });
  };
  const onToggle = async id=>{ const updated=listings.map(x=>x.id===id?{...x,printSel:!x.printSel}:x); setListings(updated); const ls=updated.find(x=>x.id===id); if(ls) await dbUpsert(ls).catch(e=>console.warn(e)); };

  // 필터 (selCount 계산 전에 정의)
  const filteredListings = dealFilter==='all' ? listings : listings.filter(l=>{
    if (dealFilter==='sale') return l.dealType==='sale';
    if (dealFilter==='jeonse-monthly') return l.dealType==='jeonse'||l.dealType==='monthly'||l.dealType==='rent';
    return true;
  });
  const selCount     = listings.filter(l=>l.printSel).length;
  const filtSelCount = filteredListings.filter(l=>l.printSel).length;

  if (!dbReady&&!loading) {
    const cred=localStorage.getItem(STO_CRED);
    if (!cred) return <SBSetup onConnect={handleConnect} />;
  }

  const printCSS = view==='briefing'
    ? '@media print { @page { size:A4 landscape !important; margin:10mm 10mm 14mm; } .print-only { display:block !important; } .screen-only { display:none !important; } .no-print { display:none !important; } }'
    : '@media print { @page { size:A4 portrait !important; margin:0mm !important; } body,main { padding:0 !important; margin:0 !important; max-width:none !important; } .print-only { display:block !important; } .screen-only { display:none !important; } .no-print { display:none !important; } .tour-page { display:flex !important; flex-direction:column !important; width:210mm !important; height:297mm !important; padding:10mm !important; overflow:hidden !important; box-sizing:border-box !important; } }';

  const TABS = [
    {id:'list',     label:'📋 매물 목록'},
    {id:'briefing', label:'≡ 브리핑 시트'},
    {id:'tour',     label:'🏠 투어 카드'},
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: printCSS}} />
      {showForm&&<ListingForm init={editing} onSave={onSave} onClose={()=>{setShowForm(false);setEditing(null);}} />}
      {confirmDlg&&<ConfirmModal message={confirmDlg.message} subMessage={confirmDlg.subMessage} onConfirm={confirmDlg.onConfirm} onCancel={()=>setConfirmDlg(null)} busy={delBusy} />}

      <header className="no-print" style={{background:'#0d1b2a',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:'10px',letterSpacing:'.22em',color:'#c9a84c',marginBottom:'2px'}}>TIMES REAL ESTATE</div>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'22px',color:'white',fontWeight:500,lineHeight:1}}>주거 매물 관리</div>
            <span style={{fontSize:'12px',color:'#0d1b2a',background:'#c9a84c',padding:'2px 8px',fontWeight:700,borderRadius:'2px'}}>{APP_VERSION}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
          {loading&&<span style={{fontSize:'12px',color:'#c9a84c'}}>↺ 동기화 중…</span>}
          {!loading&&loadErr&&<span style={{fontSize:'12px',color:'#e07070'}}>⚠ 캐시 표시 중</span>}
          {!loading&&!loadErr&&<span style={{fontSize:'12px',color:'#9aacbe'}}>☁ 연결됨 · 선택 {selCount}건</span>}
          {view!=='list'&&<button onClick={()=>window.print()} style={{padding:'7px 16px',background:'#c9a84c',color:'white',border:'none',cursor:'pointer',fontSize:'13px',fontFamily:'inherit',fontWeight:600}}>🖨 인쇄</button>}
        </div>
      </header>

      <div className="no-print" style={{background:'#ede9e1',borderBottom:'1px solid #d8d4cc',padding:'0 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:'1200px',margin:'0 auto'}}>
          <div style={{display:'flex'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setView(t.id)}
                style={{padding:'11px 20px',fontSize:'14px',border:'none',cursor:'pointer',background:'none',
                  borderBottom:view===t.id?'3px solid #c9a84c':'3px solid transparent',
                  color:view===t.id?'#0d1b2a':'#999',fontWeight:view===t.id?700:400,fontFamily:'inherit'}}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center',padding:'8px 0'}}>
            {view!=='list'&&(
              <input value={clientName} onChange={e=>setClientName(e.target.value)}
                placeholder="고객명 입력"
                style={{fontSize:'14px',padding:'6px 12px',border:'1px solid #ccc8c0',width:'180px'}} />
            )}
            {view==='list'&&(
              <>
                <select value={dealFilter} onChange={e=>setDealFilter(e.target.value)}
                  style={{padding:'6px 10px',fontSize:'13px',border:'1px solid #bbb',background:'white',cursor:'pointer',fontFamily:'inherit'}}>
                  <option value="all">전체 거래유형</option>
                  <option value="sale">매매</option>
                  <option value="jeonse-monthly">전세/월세</option>
                </select>
                <button onClick={()=>{
                    const ids=new Set(filteredListings.map(l=>l.id));
                    setListings(p=>p.map(x=>({...x,printSel:ids.has(x.id)})));
                  }} style={{padding:'6px 14px',fontSize:'13px',background:'white',border:'1px solid #bbb',cursor:'pointer',fontFamily:'inherit'}}>전체 선택</button>
                <button onClick={()=>{
                    const ids=new Set(filteredListings.map(l=>l.id));
                    setListings(p=>p.map(x=>ids.has(x.id)?{...x,printSel:false}:x));
                  }} style={{padding:'6px 14px',fontSize:'13px',background:'white',border:'1px solid #bbb',cursor:'pointer',fontFamily:'inherit'}}>선택 해제</button>
                {filtSelCount>0&&<button onClick={onBulkDelete}
                  style={{padding:'6px 14px',fontSize:'13px',background:'white',border:'1px solid #e07070',color:'#c0392b',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                  선택 삭제 ({filtSelCount}건)
                </button>}
                <button onClick={()=>{setEditing(blank());setShowForm(true);}}
                  style={{padding:'7px 18px',background:'#c9a84c',color:'white',border:'none',cursor:'pointer',fontSize:'14px',fontFamily:'inherit',fontWeight:600}}>+ 새 매물 등록</button>
              </>
            )}
          </div>
        </div>
      </div>

      <main style={{padding:'16px 24px 60px',maxWidth:'1200px',margin:'0 auto'}}>
        {loading&&listings.length===0&&(
          <div style={{textAlign:'center',padding:'60px',color:'#c9a84c'}}>
            <div style={{fontSize:'24px',marginBottom:'8px'}}>☁</div>
            <div style={{fontSize:'12px'}}>데이터를 불러오는 중…</div>
          </div>
        )}
        {!loading&&loadErr&&(
          <div style={{textAlign:'center',padding:'60px'}}>
            <div style={{fontSize:'20px',marginBottom:'12px',color:'#c0392b'}}>⚠ 연결 오류</div>
            <div style={{fontSize:'13px',color:'#888',marginBottom:'20px'}}>{loadErr}</div>
            <button onClick={()=>loadData()} style={{padding:'10px 28px',background:'#0d1b2a',color:'#c9a84c',border:'none',cursor:'pointer',fontSize:'14px',fontFamily:'inherit',fontWeight:600}}>↺ 다시 시도</button>
          </div>
        )}

        {!loading&&view==='list'&&(
          <>
            {filteredListings.length===0?(
              <div style={{textAlign:'center',padding:'80px 0',color:'#bbb'}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'24px',marginBottom:'10px',color:'#c9a84c'}}>
                  {listings.length===0?'등록된 매물이 없습니다':'검색 결과가 없습니다'}
                </div>
                <div style={{fontSize:'12px',marginBottom:'20px'}}>+ 새 매물 등록 버튼을 눌러 매물을 추가하세요</div>
                <button onClick={()=>{setEditing(blank());setShowForm(true);}}
                  style={{padding:'10px 24px',background:'#c9a84c',color:'white',border:'none',cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}>+ 첫 매물 등록</button>
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px'}}>
                {filteredListings.map(ls=>(
                  <LCard key={ls.id} ls={ls}
                    onEdit={()=>{setEditing(ls);setShowForm(true);}}
                    onDelete={()=>onDelete(ls.id, ls.complexName)}
                    onToggle={()=>onToggle(ls.id)}
                    onDragStart={()=>handleDragStart(ls.id)}
                    onDragOver={()=>handleDragOver(ls.id)}
                    onDrop={handleDrop}
                    isDragging={dragId===ls.id} />
                ))}
              </div>
            )}
            <div className="no-print" style={{background:'white',border:'1px solid #e0dcd4',padding:'16px 20px',marginTop:'20px'}}>
              <InfoPanel info={info} setInfo={setInfo} onDisconnect={handleDisconnect} />
            </div>
          </>
        )}

        {!loading&&view==='briefing'&&(
          <BriefingSheet listings={filteredListings} clientName={clientName} reportDate={reportDate}
            bizName={info.bizName} bizAddr={info.bizAddr} agentName={info.agentName}
            agentPhone={info.agentPhone} logoSrc={info.logoSrc} />
        )}

        {!loading&&view==='tour'&&(
          <TourCards listings={filteredListings} clientName={clientName} reportDate={reportDate}
            bizName={info.bizName} agentName={info.agentName} agentPhone={info.agentPhone} logoSrc={info.logoSrc} />
        )}
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
