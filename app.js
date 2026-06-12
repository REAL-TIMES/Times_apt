// ── TIMES 주거 매물 관리 ──
const APP_VERSION = 'v1.7.2';
const { useState, useEffect, useRef } = React;

// ── 상수 ──
const PY        = 3.30579;
const STO_CACHE = 'times-apt-cache';
const TBL       = 'residential_listings';
const TBL_CFG   = 'app_config';          // 설정 저장 테이블

// ── Supabase 하드코딩 ──
const SB_URL = 'https://vvksunsazcfroupzxgum.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2a3N1bnNhemNmcm91cHp4Z3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NjMxODgsImV4cCI6MjA5NTQzOTE4OH0.51YbHy_MmJRTYW1BK8bVcZexizCtoMkVKVa_sRREL2A';

let _sb = null;
const getSB  = () => _sb;
const initSB = () => { _sb = window.supabase.createClient(SB_URL, SB_KEY); return _sb; };

// ── DB: 매물 ──
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

// ── DB: 앱 설정 (로고·상호 등) ──
const CONFIG_ID = 'times-office-info';
const dbLoadConfig = async () => {
  const { data, error } = await getSB().from(TBL_CFG).select('data').eq('id', CONFIG_ID).limit(1);
  if (error) throw error;
  if (data && data.length > 0) return data[0].data || {};
  return {};
};
const dbSaveConfig = async (obj) => {
  const { error } = await getSB().from(TBL_CFG)
    .upsert({ id: CONFIG_ID, data: obj, updated_at: new Date().toISOString() });
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
const fmtShort = v => {
  const a = Math.round(n(v));
  if (a<=0) return '—';
  if (a>=10000) {
    const uk=Math.floor(a/10000), man=a%10000;
    if (man===0) return uk+'억';
    const decimal = Math.round(man/1000);
    if (decimal===0) return uk+'억';
    if (decimal===10) return (uk+1)+'억';
    return uk+'.'+decimal+'억';
  }
  return a.toLocaleString()+'만';
};
const fmtPy = (price, py) => (!price||!py||n(py)===0)?'—': Math.round(n(price)/n(py)).toLocaleString()+'만원';
const perPy = (price, py) => (!price||!py||n(py)===0)?null: Math.round(n(price)/n(py));

// ── 작성일 포맷 (YYYY.MM.DD) ──
const fmtDate = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2), day=('0'+d.getDate()).slice(-2);
  return y+'.'+m+'.'+day;
};

// ── 행정동 추출: 주소에서 "○○동/읍/면/가" 추출 ──
const extractDong = addr => {
  if (!addr) return '';
  // "서울특별시 서초구 반포동 ..." → "반포동"
  const m = String(addr).match(/([가-힣]+(?:동|읍|면|[0-9]+가))(?:\s|$|[0-9])/);
  return m ? m[1] : '';
};

// ── 정렬용: 매물의 대표 금액 (거래유형 기준) ──
const sortPrice = l => {
  if (l.dealType==='sale')   return n(l.salePrice);
  if (l.dealType==='jeonse') return n(l.jeonsePrice);
  // 월세/렌트: 보증금 + 월세×100 으로 환산 비교 (대략적 가중)
  return n(l.deposit) + n(l.monthlyRent)*100;
};
// ── 정렬용: 대표 면적 (공급 우선, 없으면 전용) ──
const sortArea = l => n(l.supplyPy) || n(l.exclusivePy) || 0;
// ── 정렬용: 평당가 (매매만 의미) ──
const sortPerPy = l => (l.dealType==='sale') ? (perPy(l.salePrice, l.supplyPy)||0) : 0;

const DEAL_LABEL = { sale:'매매', jeonse:'전세', monthly:'월세', rent:'렌트' };
const DEAL_COLOR = { sale:'#1a5276', jeonse:'#196f3d', monthly:'#7d6608', rent:'#6e2f1a' };
const PROP_LABEL = { apt:'아파트', villa:'빌라/다세대', officetel:'오피스텔' };

const INFO_DEFAULT = {
  bizName:'타임즈부동산중개', bizAddr:'서울특별시 서초구 반포동 반포프라자',
  agentName:'성재윤', agentPhone:'010-6655-5445', logoSrc:''
};

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
            <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'20px',fontWeight:600,color:'#0d1b2a'}}>네이버 매물 자동 입력</div>
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
      ho:          parsed.ho          || prev.ho,
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

  const fld = (label, key, ph) => (
    <div>
      <div style={{fontSize:'10px',color:'#888',marginBottom:'2px'}}>{label}</div>
      <input value={ls[key]||''} placeholder={ph||''} onChange={e=>set(key,e.target.value)}
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
          <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'20px',fontWeight:600,color:'#0d1b2a'}}>
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

        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>기본 정보</div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
          {fld('단지/건물명 *','complexName','예) 래미안원베일리')}
          {fld('동','dong','예) 106동')}
          {fld('호수','ho','예) 1203호')}
        </div>
        <div style={{marginBottom:'16px'}}>
          {fld('주소','address','서울특별시 서초구...')}
        </div>

        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>가격 (만원)</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
          {isSale && fld('매매가','salePrice','예) 120000')}
          {isJeonse && fld('전세가','jeonsePrice','예) 166560')}
          {isMonthly && fld('보증금','deposit','예) 10000')}
          {isMonthly && fld('월세','monthlyRent','예) 200')}
          {fld('관리비/월','mgmtFee','예) 25')}
        </div>

        <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.1em',marginBottom:'8px'}}>면적</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
          <AreaInput labelPy="공급면적 (평)" labelM2="공급면적 (㎡)"
            valPy={ls.supplyPy} valM2={ls.supplyM2}
            onChangePy={v=>set('supplyPy',v)} onChangeM2={v=>set('supplyM2',v)} />
          <AreaInput labelPy="전용면적 (평)" labelM2="전용면적 (㎡)"
            valPy={ls.exclusivePy} valM2={ls.exclusiveM2}
            onChangePy={v=>set('exclusivePy',v)} onChangeM2={v=>set('exclusiveM2',v)} />
        </div>

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
// ── 범위 입력 (최소/최대) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function RangeField({ label, min, max, setMin, setMax }) {
  return (
    <div>
      <div style={{fontSize:'11px',color:'#888',marginBottom:'4px'}}>{label}</div>
      <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
        <input value={min} onChange={e=>setMin(e.target.value)} placeholder="최소" type="number"
          style={{width:'100%',fontSize:'12px',padding:'6px 6px',border:'1px solid #e0dcd4',boxSizing:'border-box'}} />
        <span style={{color:'#bbb',fontSize:'12px'}}>~</span>
        <input value={max} onChange={e=>setMax(e.target.value)} placeholder="최대" type="number"
          style={{width:'100%',fontSize:'12px',padding:'6px 6px',border:'1px solid #e0dcd4',boxSizing:'border-box'}} />
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 매물 카드 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LCard({ ls, onEdit, onDelete, onToggle, onDragStart, onDragOver, onDrop, isDragging, draggable }) {
  const isSale = ls.dealType==='sale';
  return (
    <div draggable={draggable!==false} onDragStart={onDragStart} onDragOver={onDragOver?(e=>{e.preventDefault();onDragOver();}):undefined} onDrop={onDrop}
      style={{background:'white',border:'1px solid #e0dcd4',position:'relative',overflow:'hidden',
        opacity:isDragging?0.4:1,cursor:draggable!==false?'grab':'default',transition:'opacity .15s',fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif"}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:'3px',background:ls.printSel?DEAL_COLOR[ls.dealType]||'#c9a84c':'#e0dcd4'}} />
      <div style={{padding:'14px 14px 10px 17px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'3px'}}>
              <span style={{fontSize:'17px',fontWeight:700,color:'#0d1b2a'}}>
                {ls.complexName||'(단지명 없음)'}
              </span>
              <span style={{fontSize:'12px',fontWeight:700,color:'white',background:DEAL_COLOR[ls.dealType]||'#888',padding:'2px 7px',flexShrink:0}}>
                {DEAL_LABEL[ls.dealType]||ls.dealType}
              </span>
            </div>
            {ls.dong && <span style={{fontSize:'13px',color:'#c9a84c',fontWeight:600}}>{ls.dong}동 </span>}
            {ls.floor && <span style={{fontSize:'13px',color:'#888'}}>{ls.floor}{ls.totalFloor?'/'+ls.totalFloor+'층':'층'}</span>}
            {ls.address && <div style={{fontSize:'12px',color:'#aaa',marginTop:'3px'}}>{ls.address}</div>}
          </div>
          <input type="checkbox" checked={ls.printSel} onChange={onToggle}
            style={{cursor:'pointer',marginLeft:'8px',flexShrink:0}} />
        </div>

        <div style={{background:'#f7f4ef',padding:'7px 10px',marginBottom:'7px'}}>
          {isSale && ls.salePrice && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'13px',color:'#888'}}>매매가</span>
            <span style={{fontSize:'15px',fontWeight:700,color:'#1a5276'}}>{fmt(ls.salePrice)}</span>
          </div>}
          {!isSale && ls.jeonsePrice && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'13px',color:'#888'}}>전세가</span>
            <span style={{fontSize:'15px',fontWeight:700,color:'#196f3d'}}>{fmt(ls.jeonsePrice)}</span>
          </div>}
          {!isSale && (ls.deposit||ls.monthlyRent) && <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'13px',color:'#888'}}>보증/월세</span>
            <span style={{fontSize:'15px',fontWeight:700,color:'#7d6608'}}>{fmt(ls.deposit)} / {fmt(ls.monthlyRent)}</span>
          </div>}
          {ls.mgmtFee && <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #ede9e1',marginTop:'4px',paddingTop:'4px'}}>
            <span style={{fontSize:'12px',color:'#aaa'}}>관리비</span>
            <span style={{fontSize:'13px',color:'#555'}}>{fmt(ls.mgmtFee)}/월</span>
          </div>}
        </div>

        <div style={{display:'flex',gap:'12px',fontSize:'13px',color:'#666',flexWrap:'wrap'}}>
          {ls.supplyPy && <span>공급 <strong>{ls.supplyPy}평</strong></span>}
          {ls.exclusivePy && <span>전용 <strong>{ls.exclusivePy}평</strong></span>}
          {ls.rooms && <span>방 <strong>{ls.rooms}</strong></span>}
          {ls.direction && <span><strong>{ls.direction}</strong></span>}
        </div>
        {isSale && ls.salePrice && ls.supplyPy && (
          <div style={{marginTop:'5px',fontSize:'12px',color:'#1a5276'}}>
            공급평당 {fmtPy(ls.salePrice, ls.supplyPy)}
            {ls.exclusivePy && ' · 전용평당 '+fmtPy(ls.salePrice, ls.exclusivePy)}
          </div>
        )}
        {ls.notes && <div style={{marginTop:'5px',fontSize:'12px',color:'#2471a3',lineHeight:1.5}}>{ls.notes.slice(0,50)}{ls.notes.length>50?'…':''}</div>}
      </div>

      <div style={{borderTop:'1px solid #f0ede6',padding:'6px 14px',display:'flex',gap:'6px',justifyContent:'space-between',alignItems:'center',background:'#fafaf8'}}>
        <span style={{fontSize:'11px',color:'#bbb'}}>{ls.createdAt?fmtDate(ls.createdAt):''}</span>
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={onEdit} style={{fontSize:'12px',padding:'4px 12px',background:'none',border:'1px solid #c9a84c',color:'#c9a84c',cursor:'pointer'}}>편집</button>
          <button onClick={onDelete} style={{fontSize:'12px',padding:'4px 12px',background:'none',border:'1px solid #ddd',color:'#888',cursor:'pointer'}}>삭제</button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 브리핑 시트 (A4 가로, 6매물) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BriefingSheet({ listings, clientName, reportDate, bizName, bizAddr, agentName, agentPhone, logoSrc }) {
  const sel = listings.filter(l=>l.printSel);
  if (!sel.length) return <div style={{textAlign:'center',padding:'60px',color:'#aaa'}}>매물 목록에서 출력할 매물을 체크하세요</div>;

  const CHUNK = 6;
  const chunks = [];
  for (let i=0; i<sel.length; i+=CHUNK) chunks.push(sel.slice(i,i+CHUNK));

  const BD = '0.5pt solid #e0dcd4';
  const thS = { background:'#0d1b2a',color:'white',padding:'6pt 7pt',fontSize:'10pt',fontWeight:600,textAlign:'center',border:'0.5pt solid #0d1b2a',verticalAlign:'top',lineHeight:1.3,WebkitPrintColorAdjust:'exact',printColorAdjust:'exact' };
  const labelS = { background:'#f5f2eb',padding:'5pt 7pt',fontSize:'9pt',fontWeight:600,color:'#555',border:BD,textAlign:'center',verticalAlign:'middle',whiteSpace:'nowrap',WebkitPrintColorAdjust:'exact',printColorAdjust:'exact' };
  const cellS = (i) => ({ padding:'5pt 7pt',fontSize:'10pt',textAlign:'center',border:BD,background:i%2===0?'white':'#fafaf8',verticalAlign:'middle' });
  const hiCellS = (i) => ({ padding:'5pt 7pt',fontSize:'11pt',fontWeight:700,textAlign:'center',border:BD,background:i%2===0?'#f0f7ff':'#e8f4fd',verticalAlign:'middle',color:'#1a5276' });

  return (
    <>
      {chunks.map((chunk, ci) => (
        <div key={ci} className="print-only" style={{pageBreakBefore:ci>0?'always':'auto',breakBefore:ci>0?'page':'auto'}}>
          <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'6pt',marginBottom:'10pt',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
            <div>
              <div style={{fontSize:'8pt',letterSpacing:'.15em',color:'#c9a84c',marginBottom:'5pt'}}>TIMES REAL ESTATE</div>
              <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'24pt',fontWeight:700,color:'#0d1b2a',lineHeight:1}}>
                {clientName||'매물 브리핑 시트'}
              </div>
            </div>
            <div style={{textAlign:'right',fontSize:'9pt',color:'#aaa'}}>
              {reportDate}&nbsp;·&nbsp;총 {sel.length}건
              {chunks.length>1&&<span>&nbsp;·&nbsp;{ci+1}/{chunks.length}</span>}
            </div>
          </div>

          <table style={{borderCollapse:'collapse',tableLayout:'fixed',width:'auto',maxWidth:'100%'}}>
            <colgroup>
              <col style={{width:'58pt'}} />
              {chunk.map((_,i)=><col key={i} style={{width:'120pt'}} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{...thS,background:'#0d1b2a',color:'#c9a84c',fontSize:'9pt',verticalAlign:'middle'}}>항목</th>
                {chunk.map((l,i)=>(
                  <th key={l.id} style={thS}>
                    <div style={{fontSize:'11pt',fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontWeight:700,lineHeight:1.2,color:'#c9a84c'}}>
                      {'①②③④⑤⑥⑦⑧⑨⑩'[i+(ci*CHUNK)]} {l.complexName}
                    </div>
                    {l.dong&&<div style={{fontSize:'9pt',color:'#aaa',marginTop:'2pt'}}>{l.dong}동</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{...labelS}}>거래유형</td>
                {chunk.map((l,i)=>(
                  <td key={l.id} style={{...cellS(i),fontWeight:700,color:DEAL_COLOR[l.dealType]||'#888'}}>
                    {DEAL_LABEL[l.dealType]||'—'}
                  </td>
                ))}
              </tr>
              {chunk.some(l=>l.salePrice)&&(
                <tr><td style={labelS}>매매가</td>{chunk.map((l,i)=><td key={l.id} style={hiCellS(i)}>{l.salePrice?fmtShort(l.salePrice):'—'}</td>)}</tr>
              )}
              {chunk.some(l=>l.jeonsePrice)&&(
                <tr><td style={labelS}>전세가</td>{chunk.map((l,i)=><td key={l.id} style={{...hiCellS(i),color:'#196f3d',background:i%2===0?'#f0fff4':'#e8faf0'}}>{l.jeonsePrice?fmtShort(l.jeonsePrice):'—'}</td>)}</tr>
              )}
              {chunk.some(l=>l.deposit)&&(
                <tr><td style={labelS}>보증금</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.deposit?fmtShort(l.deposit):'—'}</td>)}</tr>
              )}
              {chunk.some(l=>l.monthlyRent)&&(
                <tr><td style={labelS}>월세</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.monthlyRent?fmtShort(l.monthlyRent):'—'}</td>)}</tr>
              )}
              {chunk.some(l=>l.mgmtFee)&&(
                <tr><td style={labelS}>관리비/월</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.mgmtFee?fmtShort(l.mgmtFee):'—'}</td>)}</tr>
              )}
              <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>공급면적</td>{chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0'}}>{l.supplyPy?l.supplyPy+'평':'—'}</td>)}</tr>
              <tr><td style={labelS}>전용면적</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.exclusivePy?l.exclusivePy+'평':'—'}</td>)}</tr>
              <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>층</td>{chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0'}}>{l.floor?(l.floor+(l.totalFloor?'/'+l.totalFloor+'층':'층')):'—'}</td>)}</tr>
              {chunk.some(l=>l.rooms)&&<tr><td style={labelS}>방/욕실</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{(l.rooms||'—')+'/'+(l.bathrooms||'—')}</td>)}</tr>}
              {chunk.some(l=>l.direction)&&<tr><td style={labelS}>향</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.direction||'—'}</td>)}</tr>}
              {chunk.some(l=>l.moveIn)&&<tr><td style={labelS}>입주가능</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.moveIn||'—'}</td>)}</tr>}
              {chunk.some(l=>l.approvalDate)&&<tr><td style={labelS}>사용승인</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.approvalDate||'—'}</td>)}</tr>}
              {chunk.some(l=>l.parking)&&<tr><td style={labelS}>주차</td>{chunk.map((l,i)=><td key={l.id} style={cellS(i)}>{l.parking||'—'}</td>)}</tr>}
              {chunk.some(l=>l.salePrice&&l.supplyPy)&&(
                <>
                  <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0',color:'#1a5276'}}>공급평당가</td>
                    {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0',color:'#1a5276',fontWeight:600}}>{fmtPy(l.salePrice,l.supplyPy)}</td>)}</tr>
                  <tr><td style={{...labelS,color:'#1a5276'}}>전용평당가</td>
                    {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),color:'#1a5276',fontWeight:600}}>{fmtPy(l.salePrice,l.exclusivePy)}</td>)}</tr>
                </>
              )}
              {chunk.some(l=>l.notes)&&(
                <tr><td style={{...labelS,borderTop:'1pt solid #ccc8c0'}}>비고</td>
                  {chunk.map((l,i)=><td key={l.id} style={{...cellS(i),borderTop:'1pt solid #ccc8c0',fontSize:'9pt',textAlign:l.notes?'left':'center'}}>{l.notes||'—'}</td>)}</tr>
              )}
            </tbody>
          </table>

          <div style={{marginTop:'8pt',borderTop:'1pt solid #c9a84c',paddingTop:'5pt',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'9pt',color:'#555'}}>
            <span style={{display:'flex',alignItems:'center',gap:'8pt'}}>
              {logoSrc&&<img src={logoSrc} style={{height:'18pt',objectFit:'contain'}} />}
              {bizName&&<strong style={{color:'#0d1b2a',fontSize:'10pt'}}>{bizName}</strong>}
              {bizAddr&&<span style={{color:'#888',marginLeft:'6pt'}}>{bizAddr}</span>}
            </span>
            <span>
              {agentName&&<strong style={{color:'#0d1b2a',marginRight:'6pt'}}>{agentName}</strong>}
              {agentPhone&&<span>{agentPhone}</span>}
            </span>
          </div>
        </div>
      ))}

      {/* ── 화면 미리보기: 6개씩 끊어 세로로 쌓기 (좌우 스크롤 제거) ── */}
      <div className="screen-only">
        {chunks.map((chunk, ci) => {
          const cellPad = '10px 12px';
          const numFor = idx => '①②③④⑤⑥⑦⑧⑨⑩'[idx] || (idx+1);
          const row = (label, render, opt) => {
            opt = opt || {};
            return (
              <tr>
                <td style={{padding:cellPad,background:opt.labelBg||'#f5f2eb',fontWeight:600,color:opt.labelColor||'#555',textAlign:'center',whiteSpace:'nowrap',borderBottom:'1px solid #f0ede6',fontSize:'13px'}}>{label}</td>
                {chunk.map((l,i)=>(
                  <td key={l.id} style={{padding:cellPad,textAlign:'center',borderBottom:'1px solid #f0ede6',background:opt.cellBg?opt.cellBg(i):(i%2===0?'white':'#fafaf8'),color:opt.color||'#333',fontWeight:opt.bold?700:400,fontSize:opt.fs||'14px'}}>
                    {render(l)}
                  </td>
                ))}
              </tr>
            );
          };
          return (
            <div key={ci} style={{marginBottom:'28px'}}>
              {chunks.length>1&&(
                <div style={{fontSize:'12px',color:'#aaa',marginBottom:'8px',fontWeight:600}}>
                  {ci+1} / {chunks.length} 페이지 · {chunk.length}건
                </div>
              )}
              <div style={{border:'1px solid #e0dcd4',overflow:'hidden'}}>
                <table style={{borderCollapse:'collapse',width:'100%',tableLayout:'fixed',fontSize:'13px'}}>
                  <colgroup>
                    <col style={{width:'92px'}} />
                    {chunk.map((_,i)=><col key={i} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{background:'#0d1b2a',color:'#c9a84c',padding:'12px 10px',textAlign:'center',borderBottom:'3px solid #c9a84c',fontSize:'12px'}}>항목</th>
                      {chunk.map((l,i)=>(
                        <th key={l.id} style={{background:'#0d1b2a',color:'white',padding:'12px 10px',textAlign:'center',borderBottom:'3px solid #c9a84c',borderLeft:'1px solid #1c3148'}}>
                          <div style={{fontSize:'11px',color:DEAL_COLOR[l.dealType]||'#c9a84c',marginBottom:'3px',fontWeight:600}}>{numFor(i+ci*CHUNK)} {DEAL_LABEL[l.dealType]}</div>
                          <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'15px',fontWeight:700,lineHeight:1.3}}>{l.complexName}</div>
                          {(l.dong||l.ho)&&<div style={{fontSize:'11px',color:'#c9a84c',marginTop:'2px'}}>{l.dong?l.dong+'동 ':''}{l.ho?l.ho+'호':''}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.some(l=>l.salePrice)&&row('매매가', l=>l.salePrice?fmt(l.salePrice):'—', {labelBg:'#eaf2fb',labelColor:'#1a5276',color:'#1a5276',bold:true,fs:'15px',cellBg:i=>i%2===0?'#f0f7ff':'#e8f4fd'})}
                    {chunk.some(l=>l.jeonsePrice)&&row('전세가', l=>l.jeonsePrice?fmt(l.jeonsePrice):'—', {labelBg:'#eafaf1',labelColor:'#196f3d',color:'#196f3d',bold:true,fs:'15px',cellBg:i=>i%2===0?'#f0fff4':'#e8faf0'})}
                    {chunk.some(l=>l.deposit)&&row('보증금', l=>l.deposit?fmt(l.deposit):'—', {bold:true,color:'#7d6608'})}
                    {chunk.some(l=>l.monthlyRent)&&row('월세', l=>l.monthlyRent?fmt(l.monthlyRent):'—', {bold:true,color:'#7d6608'})}
                    {chunk.some(l=>l.mgmtFee)&&row('관리비/월', l=>l.mgmtFee?fmt(l.mgmtFee):'—', {fs:'13px',color:'#666'})}
                    {row('공급/전용', l=>(l.supplyPy||'—')+' / '+(l.exclusivePy||'—')+'평', {labelBg:'#f5f2eb'})}
                    {chunk.some(l=>l.floor)&&row('층', l=>l.floor?(l.floor+(l.totalFloor?'/'+l.totalFloor+'층':'층')):'—')}
                    {chunk.some(l=>l.rooms||l.bathrooms)&&row('방/욕실', l=>(l.rooms||'—')+' / '+(l.bathrooms||'—'))}
                    {chunk.some(l=>l.direction)&&row('향', l=>l.direction||'—')}
                    {chunk.some(l=>l.parking)&&row('주차', l=>l.parking||'—', {fs:'12px',color:'#666'})}
                    {chunk.some(l=>l.moveIn)&&row('입주가능', l=>l.moveIn||'—', {fs:'12px',color:'#666'})}
                    {chunk.some(l=>l.approvalDate)&&row('사용승인', l=>l.approvalDate||'—', {fs:'12px',color:'#666'})}
                    {chunk.some(l=>l.salePrice&&l.supplyPy)&&row('공급평당가', l=>fmtPy(l.salePrice,l.supplyPy), {labelBg:'#eaf2fb',labelColor:'#1a5276',color:'#1a5276',bold:true,cellBg:i=>i%2===0?'#f0f7ff':'#e8f4fd'})}
                    {chunk.some(l=>l.salePrice&&l.exclusivePy)&&row('전용평당가', l=>fmtPy(l.salePrice,l.exclusivePy), {labelBg:'#eaf2fb',labelColor:'#1a5276',color:'#1a5276',bold:true,cellBg:i=>i%2===0?'#f0f7ff':'#e8f4fd'})}
                    {chunk.some(l=>l.notes)&&row('비고', l=><span style={{fontSize:'12px',color:'#2471a3',lineHeight:1.5}}>{l.notes||'—'}</span>, {})}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
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
        <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'6pt',marginBottom:'8pt',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:'6pt'}}>
            <span style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'20pt',fontWeight:700,color:'#0d1b2a',lineHeight:1,flexShrink:0}}>{num}</span>
            <div>
              <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'13pt',fontWeight:600,color:'#0d1b2a',lineHeight:1.2}}>
                {ls.complexName}
                {ls.dong&&<span style={{fontSize:'11pt',color:'#c9a84c',marginLeft:'5pt',fontWeight:600}}>{ls.dong}동</span>}
              </div>
              {ls.address&&<div style={{fontSize:'9pt',color:'#888',marginTop:'1pt'}}>{ls.address}</div>}
            </div>
          </div>
          <span style={{fontSize:'9pt',fontWeight:700,color:'white',background:DEAL_COLOR[ls.dealType]||'#888',padding:'2pt 9pt',flexShrink:0,marginLeft:'6pt'}}>
            {DEAL_LABEL[ls.dealType]||ls.dealType}
          </span>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5pt',marginBottom:'7pt'}}>
          {isSale&&ls.salePrice&&(
            <div style={{background:'#eaf0f8',padding:'6pt 9pt',gridColumn:'1/-1'}}>
              <div style={{fontSize:'9pt',color:'#1a5276',marginBottom:'2pt'}}>매매가</div>
              <div style={{fontSize:'16pt',fontWeight:700,color:'#1a5276',lineHeight:1}}>{fmt(ls.salePrice)}</div>
            </div>
          )}
          {!isSale&&ls.jeonsePrice&&(
            <div style={{background:'#eafaf1',padding:'6pt 9pt',gridColumn:'1/-1'}}>
              <div style={{fontSize:'9pt',color:'#196f3d',marginBottom:'2pt'}}>전세가</div>
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

        {isSale&&ls.salePrice&&(ls.supplyPy||ls.exclusivePy)&&(
          <div style={{display:'flex',gap:'10pt',marginBottom:'6pt',fontSize:'9pt',color:'#1a5276'}}>
            {ls.supplyPy&&<span>공급평당 <strong>{fmtPy(ls.salePrice,ls.supplyPy)}</strong></span>}
            {ls.exclusivePy&&<span>전용평당 <strong>{fmtPy(ls.salePrice,ls.exclusivePy)}</strong></span>}
          </div>
        )}

        <div style={{flex:1,border:'0.5pt dashed #ccc',padding:'5pt 7pt',marginTop:'4pt',display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:'8pt',color:'#bbb',marginBottom:'4pt'}}>✎ 메모</div>
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

  var pages = chunks.map(function(chunk, ci) {
    return (
      <div key={ci} className="tour-page print-only">
        <div style={{borderBottom:'1.5pt solid #0d1b2a',paddingBottom:'7pt',marginBottom:'12pt',display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexShrink:0}}>
          <div>
            <div style={{fontSize:'7pt',letterSpacing:'.2em',color:'#c9a84c',marginBottom:'6pt'}}>TIMES REAL ESTATE</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'10pt'}}>
              <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'22pt',fontWeight:600,color:'#0d1b2a',lineHeight:1}}>
                {clientName||'투어 카드'}
              </div>
              {clientName&&(
                <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'15pt',fontWeight:400,color:'#aaa',lineHeight:1}}>
                  투어 카드
                </div>
              )}
            </div>
          </div>
          <div style={{textAlign:'right',fontSize:'8pt',color:'#aaa',paddingBottom:'2pt'}}>
            {reportDate}&nbsp;·&nbsp;총 {sel.length}건
          </div>
        </div>

        <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr',gap:'6pt',minHeight:0,overflow:'hidden'}}>
          {chunk.map(function(l,li){ return <Card key={l.id} ls={l} idx={globalIdx(ci,li)} />; })}
          {chunk.length<4&&Array.from({length:4-chunk.length}).map(function(_,ei){
            return <div key={'e'+ei} style={{border:'0.5pt dashed #e0dcd4'}} />;
          })}
        </div>

        <div style={{marginTop:'6pt',borderTop:'1pt solid #c9a84c',paddingTop:'5pt',display:'flex',alignItems:'center',flexShrink:0,position:'relative'}}>
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

  var screenView = (
    <div className="screen-only">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'16px'}}>
        {sel.map(function(l,i){
          var isSale = l.dealType==='sale';
          return (
            <div key={l.id} style={{border:'1px solid #e0dcd4',padding:'14px',background:'white'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px',borderBottom:'2px solid #0d1b2a',paddingBottom:'8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <span style={{fontSize:'22px',fontWeight:700,color:'#c9a84c'}}>{'①②③④⑤⑥⑦⑧⑨⑩'[i]||i+1}</span>
                  <div>
                    <div style={{fontSize:'16px',fontWeight:600,color:'#0d1b2a'}}>{l.complexName}</div>
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

  return (<>{pages}{screenView}</>);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── 삭제 확인 모달 ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ConfirmModal({ message, subMessage, onConfirm, onCancel, busy }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,42,0.7)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
      <div style={{background:'white',width:'100%',maxWidth:'360px',padding:'28px 24px'}}>
        <div style={{fontSize:'20px',fontWeight:600,color:'#0d1b2a',marginBottom:'10px'}}>삭제 확인</div>
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
// ── 출력 정보 패널 (DB 저장) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function InfoPanel({ info, setInfo, saving }) {
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
        {saving&&<span style={{fontSize:'11px',color:'#c9a84c'}}>저장 중…</span>}
        {!saving&&open&&<span style={{fontSize:'11px',color:'#2ecc71'}}>☁ 클라우드 저장됨</span>}
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
              {info.logoSrc&&<button onClick={()=>f('logoSrc','')} style={{fontSize:'11px',padding:'4px 10px',background:'none',border:'1px solid #ddd',color:'#888',cursor:'pointer'}}>제거</button>}
            </div>
          </div>
          <div style={{gridColumn:'1/-1',fontSize:'11px',color:'#aaa',background:'#f7f4ef',padding:'6px 10px'}}>
            ☁ 설정이 Supabase에 저장되어 모든 기기에서 동일하게 표시됩니다
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
  const [listings,   setListings]  = useState([]);
  const [view,       setView]      = useState('list');
  const [showForm,   setShowForm]  = useState(false);
  const [editing,    setEditing]   = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [loadErr,    setLoadErr]   = useState('');
  const [dbReady,    setDbReady]   = useState(false);
  const [dragId,     setDragId]    = useState(null);
  const [confirmDlg, setConfirmDlg]= useState(null);
  const [delBusy,    setDelBusy]   = useState(false);
  const [dealFilter, setDealFilter]= useState('all');
  const [clientName, setClientName]= useState('');
  const [reportDate, setReportDate]= useState(new Date().toISOString().slice(0,10));
  const [infoSaving, setInfoSaving]= useState(false);
  const [info, setInfo] = useState(INFO_DEFAULT);
  // ── 정렬 ──
  const [sortKey, setSortKey]   = useState('date'); // manual/date/price/area/name/perpy
  const [sortDir, setSortDir]   = useState('desc');   // asc/desc
  // ── 검색/필터 ──
  const [showFilter, setShowFilter] = useState(false);
  const [qName,   setQName]   = useState('');   // 단지명 텍스트
  const [qDongs,  setQDongs]  = useState([]);   // 선택된 행정동 목록
  const [qSaleMin,setQSaleMin]= useState(''); const [qSaleMax,setQSaleMax]= useState('');
  const [qDepMin, setQDepMin] = useState(''); const [qDepMax, setQDepMax] = useState('');
  const [qRentMin,setQRentMin]= useState(''); const [qRentMax,setQRentMax]= useState('');
  const [qSupMin, setQSupMin] = useState(''); const [qSupMax, setQSupMax] = useState('');
  const [qExcMin, setQExcMin] = useState(''); const [qExcMax, setQExcMax] = useState('');
  const [qRooms,  setQRooms]  = useState(''); const [qBaths,  setQBaths]  = useState('');

  // info 변경 debounce 타이머
  const infoTimer = useRef(null);

  // ── 앱 시작: Supabase 연결 + 데이터 + 설정 로드 ──
  useEffect(()=>{
    initSB();
    loadData();
    loadConfig();
  },[]);

  // ── info 변경 시 1.5초 후 DB 저장 (debounce) ──
  useEffect(()=>{
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(function(){
      setInfoSaving(true);
      dbSaveConfig(info).catch(function(e){ console.warn('설정 저장 실패:', e); }).finally(function(){ setInfoSaving(false); });
    }, 1500);
    return function(){ if(infoTimer.current) clearTimeout(infoTimer.current); };
  },[info]);

  const loadConfig = async () => {
    try {
      const cfg = await dbLoadConfig();
      if (cfg && Object.keys(cfg).length > 0) {
        setInfo(Object.assign({}, INFO_DEFAULT, cfg));
      }
    } catch(e) { console.warn('설정 로드 실패:', e); }
  };

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

  // ── 체크박스: DB 저장 없이 로컬 state만 즉시 변경, 별도 debounce로 저장 ──
  const toggleTimer = useRef({});
  const onToggle = (id) => {
    setListings(prev=>{
      const updated = prev.map(x=>x.id===id?{...x,printSel:!x.printSel}:x);
      // debounce: 300ms 후 DB 저장
      if (toggleTimer.current[id]) clearTimeout(toggleTimer.current[id]);
      toggleTimer.current[id] = setTimeout(function(){
        const ls = updated.find(x=>x.id===id);
        if (ls) dbUpsert(ls).catch(e=>console.warn(e));
      }, 300);
      return updated;
    });
  };

  // ── 거래유형 필터 ──
  let working = dealFilter==='all' ? listings.slice() : listings.filter(l=>{
    if (dealFilter==='sale') return l.dealType==='sale';
    if (dealFilter==='jeonse-monthly') return l.dealType==='jeonse'||l.dealType==='monthly'||l.dealType==='rent';
    return true;
  });

  // ── 검색/상세 필터 ──
  const inRange = (val, min, max) => {
    const v = n(val);
    if (min!=='' && v < n(min)) return false;
    if (max!=='' && v > n(max)) return false;
    return true;
  };
  working = working.filter(l => {
    // 단지명 텍스트
    if (qName.trim() && !(l.complexName||'').toLowerCase().includes(qName.trim().toLowerCase())) return false;
    // 행정동
    if (qDongs.length > 0) {
      const d = extractDong(l.address) || l.dong;
      if (!qDongs.includes(d)) return false;
    }
    // 금액 (해당 거래유형에만 적용)
    if ((qSaleMin!==''||qSaleMax!=='') && l.dealType==='sale' && !inRange(l.salePrice,qSaleMin,qSaleMax)) return false;
    if ((qDepMin!==''||qDepMax!=='')) {
      // 전세가 또는 보증금
      const depVal = l.dealType==='jeonse' ? l.jeonsePrice : l.deposit;
      if ((l.dealType==='jeonse'||l.dealType==='monthly'||l.dealType==='rent') && !inRange(depVal,qDepMin,qDepMax)) return false;
    }
    if ((qRentMin!==''||qRentMax!=='') && (l.dealType==='monthly'||l.dealType==='rent') && !inRange(l.monthlyRent,qRentMin,qRentMax)) return false;
    // 면적
    if ((qSupMin!==''||qSupMax!=='') && !inRange(l.supplyPy,qSupMin,qSupMax)) return false;
    if ((qExcMin!==''||qExcMax!=='') && !inRange(l.exclusivePy,qExcMin,qExcMax)) return false;
    // 방/욕실 (이상)
    if (qRooms!=='' && n(l.rooms) < n(qRooms)) return false;
    if (qBaths!=='' && n(l.bathrooms) < n(qBaths)) return false;
    return true;
  });

  // ── 정렬 ──
  if (sortKey !== 'manual') {
    const dir = sortDir==='asc' ? 1 : -1;
    working.sort((a,b)=>{
      let av, bv;
      if (sortKey==='date')      { av=a.createdAt||0; bv=b.createdAt||0; }
      else if (sortKey==='price'){ av=sortPrice(a); bv=sortPrice(b); }
      else if (sortKey==='area') { av=sortArea(a); bv=sortArea(b); }
      else if (sortKey==='perpy'){ av=sortPerPy(a); bv=sortPerPy(b); }
      else if (sortKey==='name') { return dir * (a.complexName||'').localeCompare(b.complexName||'', 'ko'); }
      else { av=0; bv=0; }
      return dir * (av - bv);
    });
  }
  const filteredListings = working;

  // ── 행정동 목록 (중복 제거) ──
  const dongOptions = (function(){
    const set = {};
    listings.forEach(l=>{ const d=extractDong(l.address)||l.dong; if(d) set[d]=true; });
    return Object.keys(set).sort((a,b)=>a.localeCompare(b,'ko'));
  })();

  // ── 활성 필터 개수 ──
  const activeFilterCount = [qName.trim(), qDongs.length>0?'1':'', qSaleMin,qSaleMax,qDepMin,qDepMax,qRentMin,qRentMax,qSupMin,qSupMax,qExcMin,qExcMax,qRooms,qBaths].filter(x=>x!=='').length;
  const resetFilters = () => {
    setQName(''); setQDongs([]);
    setQSaleMin(''); setQSaleMax(''); setQDepMin(''); setQDepMax(''); setQRentMin(''); setQRentMax('');
    setQSupMin(''); setQSupMax(''); setQExcMin(''); setQExcMax(''); setQRooms(''); setQBaths('');
  };

  const selCount     = listings.filter(l=>l.printSel).length;
  const filtSelCount = filteredListings.filter(l=>l.printSel).length;

  const printCSS = view==='briefing'
    ? '@media print { @page { size:A4 landscape !important; margin:10mm 10mm 14mm; } body,main { padding:0 !important; margin:0 !important; max-width:none !important; } .print-only { display:block !important; } .screen-only { display:none !important; } .no-print { display:none !important; } }'
    : '@media print { @page { size:A4 portrait !important; margin:0mm !important; } body,main { padding:0 !important; margin:0 !important; max-width:none !important; } .print-only { display:block !important; } .screen-only { display:none !important; } .no-print { display:none !important; } .tour-page { display:flex !important; flex-direction:column !important; width:210mm !important; height:297mm !important; padding:10mm !important; overflow:hidden !important; box-sizing:border-box !important; } }';

  const TABS = [
    {id:'list',     label:'📋 매물 목록'},
    {id:'briefing', label:'≡ 브리핑 시트'},
    {id:'tour',     label:'🏠 투어 카드'},
  ];

  const FIXED_TOP = 108;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: printCSS}} />
      {showForm&&<ListingForm init={editing} onSave={onSave} onClose={()=>{setShowForm(false);setEditing(null);}} />}
      {confirmDlg&&<ConfirmModal message={confirmDlg.message} subMessage={confirmDlg.subMessage} onConfirm={confirmDlg.onConfirm} onCancel={()=>setConfirmDlg(null)} busy={delBusy} />}

      <div className="no-print" style={{position:'fixed',top:0,left:0,right:0,zIndex:100}}>
        <header style={{background:'#0d1b2a',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:'10px',letterSpacing:'.22em',color:'#c9a84c',marginBottom:'2px'}}>TIMES REAL ESTATE</div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",fontSize:'22px',color:'white',fontWeight:500,lineHeight:1}}>주거 매물 관리</div>
              <span style={{fontSize:'12px',color:'#0d1b2a',background:'#c9a84c',padding:'2px 8px',fontWeight:700,borderRadius:'2px'}}>{APP_VERSION}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
            {loading&&<span style={{fontSize:'12px',color:'#c9a84c'}}>↺ 동기화 중…</span>}
            {!loading&&loadErr&&<span style={{fontSize:'12px',color:'#e07070'}}>⚠ 연결 오류</span>}
            {!loading&&!loadErr&&dbReady&&<span style={{fontSize:'12px',color:'#9aacbe'}}>☁ 연결됨 · 선택 {selCount}건</span>}
            {view!=='list'&&<button onClick={()=>window.print()} style={{padding:'7px 16px',background:'#c9a84c',color:'white',border:'none',cursor:'pointer',fontSize:'13px',fontFamily:'inherit',fontWeight:600}}>🖨 인쇄</button>}
          </div>
        </header>

        <div style={{background:'#ede9e1',borderBottom:'1px solid #d8d4cc',padding:'0 24px'}}>
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
                <>
                  <input value={clientName} onChange={e=>setClientName(e.target.value)}
                    placeholder="고객명 입력"
                    style={{fontSize:'14px',padding:'6px 12px',border:'1px solid #ccc8c0',width:'160px'}} />
                  <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}
                    title="인쇄물에 표시될 날짜"
                    style={{fontSize:'14px',padding:'6px 10px',border:'1px solid #ccc8c0',fontFamily:'inherit'}} />
                </>
              )}
              {view==='list'&&(
                <>
                  <select value={dealFilter} onChange={e=>setDealFilter(e.target.value)}
                    style={{padding:'6px 10px',fontSize:'13px',border:'1px solid #bbb',background:'white',cursor:'pointer',fontFamily:'inherit'}}>
                    <option value="all">전체 거래유형</option>
                    <option value="sale">매매</option>
                    <option value="jeonse-monthly">전세/월세</option>
                  </select>
                  <select value={sortKey} onChange={e=>setSortKey(e.target.value)}
                    style={{padding:'6px 10px',fontSize:'13px',border:'1px solid #bbb',background:'white',cursor:'pointer',fontFamily:'inherit'}}>
                    <option value="manual">직접 정렬</option>
                    <option value="date">작성일</option>
                    <option value="price">금액</option>
                    <option value="area">면적</option>
                    <option value="name">단지명</option>
                    <option value="perpy">평당가</option>
                  </select>
                  {sortKey!=='manual'&&(
                    <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} title="정렬 방향"
                      style={{padding:'6px 10px',fontSize:'13px',background:'white',border:'1px solid #bbb',cursor:'pointer',fontFamily:'inherit'}}>
                      {sortKey==='name' ? (sortDir==='asc'?'ㄱ→ㅎ':'ㅎ→ㄱ') : (sortDir==='asc'?'▲ 낮은순':'▼ 높은순')}
                    </button>
                  )}
                  <button onClick={()=>setShowFilter(s=>!s)}
                    style={{padding:'6px 14px',fontSize:'13px',background:showFilter||activeFilterCount>0?'#0d1b2a':'white',color:showFilter||activeFilterCount>0?'#c9a84c':'#555',border:'1px solid '+(activeFilterCount>0?'#0d1b2a':'#bbb'),cursor:'pointer',fontFamily:'inherit',fontWeight:activeFilterCount>0?600:400}}>
                    🔍 검색{activeFilterCount>0?' ('+activeFilterCount+')':''}
                  </button>
                  <button onClick={()=>{ const ids=new Set(filteredListings.map(l=>l.id)); setListings(p=>p.map(x=>({...x,printSel:ids.has(x.id)}))); }}
                    style={{padding:'6px 14px',fontSize:'13px',background:'white',border:'1px solid #bbb',cursor:'pointer',fontFamily:'inherit'}}>전체 선택</button>
                  <button onClick={()=>{ const ids=new Set(filteredListings.map(l=>l.id)); setListings(p=>p.map(x=>ids.has(x.id)?{...x,printSel:false}:x)); }}
                    style={{padding:'6px 14px',fontSize:'13px',background:'white',border:'1px solid #bbb',cursor:'pointer',fontFamily:'inherit'}}>선택 해제</button>
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
      </div>

      <main style={{paddingTop:(FIXED_TOP+16)+'px',paddingLeft:'24px',paddingRight:'24px',paddingBottom:'60px',maxWidth:'1200px',margin:'0 auto'}}>
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
            {showFilter&&(
              <div className="no-print" style={{background:'white',border:'1px solid #d8d4cc',padding:'18px 20px',marginBottom:'18px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',borderBottom:'1px solid #ede9e1',paddingBottom:'10px'}}>
                  <span style={{fontSize:'13px',fontWeight:700,color:'#0d1b2a'}}>🔍 상세 검색</span>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button onClick={resetFilters} style={{fontSize:'12px',padding:'4px 12px',background:'none',border:'1px solid #ccc',color:'#888',cursor:'pointer',fontFamily:'inherit'}}>초기화</button>
                    <button onClick={()=>setShowFilter(false)} style={{fontSize:'12px',padding:'4px 12px',background:'none',border:'1px solid #ccc',color:'#888',cursor:'pointer',fontFamily:'inherit'}}>닫기</button>
                  </div>
                </div>

                {/* 단지명 + 행정동 */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'14px'}}>
                  <div>
                    <div style={{fontSize:'11px',color:'#888',marginBottom:'4px'}}>단지명 검색</div>
                    <input value={qName} onChange={e=>setQName(e.target.value)} placeholder="단지/건물명 일부 입력"
                      style={{width:'100%',fontSize:'13px',padding:'7px 10px',border:'1px solid #e0dcd4',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <div style={{fontSize:'11px',color:'#888',marginBottom:'4px'}}>행정동 {qDongs.length>0&&<span style={{color:'#c9a84c'}}>({qDongs.length} 선택)</span>}</div>
                    {dongOptions.length===0 ? (
                      <div style={{fontSize:'12px',color:'#ccc',padding:'7px 0'}}>등록된 주소가 없습니다</div>
                    ):(
                      <div style={{display:'flex',flexWrap:'wrap',gap:'5px',maxHeight:'72px',overflowY:'auto'}}>
                        {dongOptions.map(d=>(
                          <button key={d} onClick={()=>setQDongs(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}
                            style={{fontSize:'12px',padding:'4px 10px',border:'1px solid '+(qDongs.includes(d)?'#0d1b2a':'#e0dcd4'),
                              background:qDongs.includes(d)?'#0d1b2a':'white',color:qDongs.includes(d)?'#c9a84c':'#888',
                              cursor:'pointer',fontFamily:'inherit'}}>
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 금액 */}
                <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.05em',marginBottom:'6px'}}>거래금액 (만원)</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'14px'}}>
                  <RangeField label="매매가" min={qSaleMin} max={qSaleMax} setMin={setQSaleMin} setMax={setQSaleMax} />
                  <RangeField label="전세/보증금" min={qDepMin} max={qDepMax} setMin={setQDepMin} setMax={setQDepMax} />
                  <RangeField label="월세" min={qRentMin} max={qRentMax} setMin={setQRentMin} setMax={setQRentMax} />
                </div>

                {/* 면적 + 방/욕실 */}
                <div style={{fontSize:'11px',fontWeight:600,color:'#c9a84c',letterSpacing:'.05em',marginBottom:'6px'}}>면적 (평) · 방/욕실</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px'}}>
                  <RangeField label="공급면적" min={qSupMin} max={qSupMax} setMin={setQSupMin} setMax={setQSupMax} />
                  <RangeField label="전용면적" min={qExcMin} max={qExcMax} setMin={setQExcMin} setMax={setQExcMax} />
                  <div>
                    <div style={{fontSize:'11px',color:'#888',marginBottom:'4px'}}>방 (이상)</div>
                    <input value={qRooms} onChange={e=>setQRooms(e.target.value)} placeholder="예) 3" type="number"
                      style={{width:'100%',fontSize:'12px',padding:'6px 8px',border:'1px solid #e0dcd4',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <div style={{fontSize:'11px',color:'#888',marginBottom:'4px'}}>욕실 (이상)</div>
                    <input value={qBaths} onChange={e=>setQBaths(e.target.value)} placeholder="예) 2" type="number"
                      style={{width:'100%',fontSize:'12px',padding:'6px 8px',border:'1px solid #e0dcd4',boxSizing:'border-box'}} />
                  </div>
                </div>
                <div style={{marginTop:'12px',fontSize:'12px',color:'#888',textAlign:'right'}}>
                  검색 결과 <strong style={{color:'#0d1b2a'}}>{filteredListings.length}</strong>건
                </div>
              </div>
            )}

            {sortKey!=='manual'&&(
              <div className="no-print" style={{fontSize:'11px',color:'#aaa',marginBottom:'10px'}}>
                ※ 정렬 적용 중에는 드래그 순서 변경이 비활성화됩니다 (직접 정렬 선택 시 가능)
              </div>
            )}

            {filteredListings.length===0?(
              <div style={{textAlign:'center',padding:'80px 0',color:'#bbb'}}>
                <div style={{fontSize:'24px',marginBottom:'10px',color:'#c9a84c'}}>
                  {listings.length===0?'등록된 매물이 없습니다':'검색 결과가 없습니다'}
                </div>
                <div style={{fontSize:'12px',marginBottom:'20px'}}>{listings.length===0?'+ 새 매물 등록 버튼을 눌러 매물을 추가하세요':'검색 조건을 변경하거나 초기화해보세요'}</div>
                {listings.length===0&&<button onClick={()=>{setEditing(blank());setShowForm(true);}}
                  style={{padding:'10px 24px',background:'#c9a84c',color:'white',border:'none',cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}>+ 첫 매물 등록</button>}
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px'}}>
                {filteredListings.map(ls=>(
                  <LCard key={ls.id} ls={ls}
                    onEdit={()=>{setEditing(ls);setShowForm(true);}}
                    onDelete={()=>onDelete(ls.id, ls.complexName)}
                    onToggle={()=>onToggle(ls.id)}
                    onDragStart={sortKey==='manual'?(()=>handleDragStart(ls.id)):undefined}
                    onDragOver={sortKey==='manual'?(()=>handleDragOver(ls.id)):undefined}
                    onDrop={sortKey==='manual'?handleDrop:undefined}
                    draggable={sortKey==='manual'}
                    isDragging={dragId===ls.id} />
                ))}
              </div>
            )}
            <div className="no-print" style={{background:'white',border:'1px solid #e0dcd4',padding:'16px 20px',marginTop:'20px'}}>
              <InfoPanel info={info} setInfo={setInfo} saving={infoSaving} />
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
