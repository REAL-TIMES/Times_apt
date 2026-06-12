// api/parse-res.js — 네이버 주거 매물 텍스트 파싱 v1.4.0
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { text } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' }); return; }

  const prompt = `다음은 네이버 부동산 주거 매물 페이지 텍스트입니다. 아래 JSON 필드를 추출하세요.

텍스트:
${text.slice(0, 4000)}

추출할 필드 (없으면 null):
- complexName: 단지명/건물명 (예: "신반포자이")
- dong: 동 (숫자만, 예: "101")
- ho: 호수 (숫자만, 예: "1902")
- address: 주소 (예: "서울특별시 서초구 잠원동 160")
- propType: "apt"(아파트), "villa"(빌라/다세대/연립주택), "officetel"(오피스텔)
- dealType: "sale"(매매), "jeonse"(전세), "monthly"(월세/반전세), "rent"(렌트)
- salePrice: 매매가 (만원 단위 숫자)
- jeonsePrice: 전세가 (만원 단위 숫자)
- deposit: 보증금 (만원 단위 숫자, 월세/반전세일 때)
- monthlyRent: 월세 (만원 단위 숫자)
- mgmtFee: 관리비 (만원 단위 숫자, 예: 50)
- supplyM2: 공급면적 제곱미터(㎡) 숫자만 — 단위가 ㎡로만 표기된 값
- supplyPyText: 공급면적 평 숫자만 (예: 45.53) — 단위에 "평"이 포함된 값
- exclusiveM2: 전용면적 제곱미터(㎡) 숫자만 — 단위가 ㎡로만 표기된 값
- exclusivePyText: 전용면적 평 숫자만 (예: 34.76) — 단위에 "평"이 포함된 값
- floor: 해당층 (예: "고", "중", "저", "15")
- totalFloor: 총층 숫자 (예: 28)
- rooms: 방수 숫자
- bathrooms: 욕실수 숫자
- direction: 향 (예: "남향")
- moveIn: 입주가능일 (예: "즉시입주")
- approvalDate: 사용승인일 → 반드시 "YYYY.MM" 형식 (아래 규칙 참고)
- parking: 주차 → "세대당 N대" 형식 (아래 규칙 참고)
- elevator: 엘리베이터 (예: "1대")
- heating: 난방 (예: "지역난방")
- units: 세대수 숫자만 (예: 607)
- notes: 매물 특이사항/홍보문구 (예: "46형 슈퍼A급 공동ok 보증금조정ok")

★★ 호수 추출 ★★
- "101 1902" 또는 "101동 1902호" 형식에서 동은 dong="101", 호수는 ho="1902"
- 숫자만 추출 (호/동 글자 제외)

★★ 사용승인일 형식 (반드시 YYYY.MM) ★★
- "2018. 7. 27." → "2018.07"
- "2021.11.24" → "2021.11"
- 연도와 월만 사용, 월은 2자리(앞에 0), 일(日)은 버립니다.

★★ 주차 형식 (반드시 "세대당 N대") ★★
- "981대 (세대당 1.61대)" → "세대당 1.61대"
- "세대당 1.61대"만 추출. 총 대수는 버립니다.
- 세대당 정보가 없고 총 대수만 있으면 그대로 (예: "981대")

★★ 면적 추출 (매우 중요) ★★
- 네이버는 "45.53평㎡", "45.53평", "34.76평 (전용률 76%)" 처럼 평 단위로 표기하는 경우가 많습니다.
- 숫자 뒤에 "평"이 붙어 있으면 그 값은 평입니다 → supplyPyText / exclusivePyText 에 넣으세요.
  ("45.53평㎡"는 45.53이 평입니다. ㎡ 기호에 속지 마세요.)
- 순수하게 ㎡ 단위로만 표기된 경우만 supplyM2 / exclusiveM2 에 넣습니다.
- "공급면적 45.53평" → supplyPyText="45.53"
- "전용면적 34.76평" → exclusivePyText="34.76"
- 해당 단위 표기가 없으면 그 필드는 null. 임의 환산 금지.

★★ 금액 단위 변환 (반드시 만원 단위 숫자) ★★
- "1억" = 10000 / "2억" = 20000 / "10억" = 100000
- "1억/900" → dealType="monthly", deposit=10000, monthlyRent=900
- "16억 6,560" = 166560 / "5,000만원" = 5000
- "억"에 0을 더 붙이지 마세요. 1억은 10000이지 100000이 아닙니다.
- 검산: (억 숫자 × 10000) + 만원 숫자 = 최종값

기타:
- propType: 아파트→apt, 빌라/다세대/연립→villa, 오피스텔→officetel
JSON만 반환, 마크다운 없이.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ? data.error.message : 'API error');
    const raw = data.content[0].text.trim();
    const clean = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    const parsed = JSON.parse(clean);
    const PY = 3.30579;

    // ── 면적 보정: ㎡ 우선, 없으면 평으로 환산 ──
    var sM2 = parsed.supplyM2 ? parseFloat(parsed.supplyM2) : null;
    var sPy = parsed.supplyPyText ? parseFloat(parsed.supplyPyText) : null;
    if (sM2 && !isNaN(sM2)) {
      parsed.supplyM2 = String(+sM2.toFixed(2));
      parsed.supplyPy = String(+(sM2 / PY).toFixed(2));
    } else if (sPy && !isNaN(sPy)) {
      parsed.supplyPy = String(+sPy.toFixed(2));
      parsed.supplyM2 = String(+(sPy * PY).toFixed(2));
    }
    var eM2 = parsed.exclusiveM2 ? parseFloat(parsed.exclusiveM2) : null;
    var ePy = parsed.exclusivePyText ? parseFloat(parsed.exclusivePyText) : null;
    if (eM2 && !isNaN(eM2)) {
      parsed.exclusiveM2 = String(+eM2.toFixed(2));
      parsed.exclusivePy = String(+(eM2 / PY).toFixed(2));
    } else if (ePy && !isNaN(ePy)) {
      parsed.exclusivePy = String(+ePy.toFixed(2));
      parsed.exclusiveM2 = String(+(ePy * PY).toFixed(2));
    }
    delete parsed.supplyPyText;
    delete parsed.exclusivePyText;

    // ── 사용승인일 보정: YYYY.MM 강제 ──
    if (parsed.approvalDate) {
      var am = String(parsed.approvalDate).match(/(\d{4})[.\s]*(\d{1,2})/);
      if (am) {
        var mm = ('0' + am[2]).slice(-2);
        parsed.approvalDate = am[1] + '.' + mm;
      }
    }

    // ── 주차 보정: "세대당 N대" 우선 추출 ──
    if (parsed.parking) {
      var pm = String(parsed.parking).match(/세대당\s*([0-9.]+)\s*대/);
      if (pm) parsed.parking = '세대당 ' + pm[1] + '대';
    }

    ['salePrice','jeonsePrice','deposit','monthlyRent','mgmtFee','totalFloor','rooms','bathrooms','units','dong','ho'].forEach(k => {
      if (parsed[k] !== null && parsed[k] !== undefined) parsed[k] = String(parsed[k]);
    });
    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
