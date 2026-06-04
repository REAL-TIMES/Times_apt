// api/parse-res.js — 네이버 주거 매물 텍스트 파싱 v1.3.0
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
- complexName: 단지명/건물명
- dong: 동 (숫자만, 예: "106")
- address: 주소
- propType: "apt"(아파트), "villa"(빌라/다세대/연립주택), "officetel"(오피스텔) - 텍스트의 건물 종류로 자동 판단
- dealType: "sale"(매매), "jeonse"(전세), "monthly"(월세/반전세), "rent"(렌트)
- salePrice: 매매가 (만원 단위 숫자)
- jeonsePrice: 전세가 (만원 단위 숫자)
- deposit: 보증금 (만원 단위 숫자, 월세/반전세일 때)
- monthlyRent: 월세 (만원 단위 숫자)
- mgmtFee: 관리비 (만원 단위 숫자, 예: 25)
- supplyM2: 공급면적 제곱미터(㎡) 숫자만 (예: 80.63) — 단위 ㎡로 표기된 값
- supplyPyText: 공급면적 평(평형) 숫자만 (예: 24.4) — 단위 "평"으로 표기된 값
- exclusiveM2: 전용면적 제곱미터(㎡) 숫자만 (예: 59.96) — 단위 ㎡로 표기된 값
- exclusivePyText: 전용면적 평 숫자만 (예: 18.1) — 단위 "평"으로 표기된 값
- floor: 해당층 (예: "중", "15", "고", "저")
- totalFloor: 총층 숫자
- rooms: 방수 숫자
- bathrooms: 욕실수 숫자
- direction: 향 (예: "남향")
- moveIn: 입주가능일 (예: "즉시입주", "2026년 10월 30일")
- approvalDate: 사용승인일 (예: "2021.11.24")
- parking: 주차 (예: "6대")
- elevator: 엘리베이터 (예: "1대")
- heating: 난방 (예: "개별난방/도시가스")
- units: 세대수 숫자
- notes: 매물 제목/특이사항

★★ 면적 추출 규칙 (매우 중요) ★★
- ㎡(제곱미터)와 평(평형)은 절대 혼동하지 마세요. 단위를 반드시 보고 판단합니다.
- 단위가 "㎡", "m2", "제곱미터"로 표기된 값 → supplyM2 / exclusiveM2 에만 넣습니다.
- 단위가 "평", "평형"으로 표기된 값 → supplyPyText / exclusivePyText 에만 넣습니다.
- 네이버는 보통 "84.96㎡/59.96㎡" 처럼 공급/전용을 ㎡로 함께 표기합니다. 앞이 공급, 뒤가 전용입니다.
- ㎡ 값은 대개 소수점이 있습니다 (84.96). 평 값을 ㎡ 칸에 넣지 마세요.
- 해당 단위로 표기된 값이 없으면 그 필드는 null. 임의로 환산해서 채우지 마세요.
  (예: "25평"만 있고 ㎡ 표기가 없으면 → supplyPyText="25", supplyM2=null)

★★ 금액 단위 변환 규칙 (반드시 만원 단위 숫자로) ★★
- "1억" = 10000 / "2억" = 20000 / "10억" = 100000 / "12억" = 120000
- "16억 6,560" = 166560 / "5,000만원" = 5000 / "600"(월세) = 600
- "억"을 변환할 때 0을 하나 더 붙이지 마세요. 1억은 10000이지 100000이 아닙니다.
- 검산: (억 숫자 × 10000) + 만원 숫자 = 최종값
  예) "2억/600" → dealType="monthly", deposit=20000, monthlyRent=600
  예) "16억 6560" → 166560

기타:
- propType: 아파트→apt, 빌라/다세대/연립→villa, 오피스텔→officetel
- approvalDate: "사용승인일", "준공", "건축" 관련 날짜 추출
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
    // 공급면적
    var sM2 = parsed.supplyM2 ? parseFloat(parsed.supplyM2) : null;
    var sPy = parsed.supplyPyText ? parseFloat(parsed.supplyPyText) : null;
    if (sM2 && !isNaN(sM2)) {
      // ㎡ 있으면 ㎡ 기준
      parsed.supplyM2 = String(+sM2.toFixed(2));
      parsed.supplyPy = String(+(sM2 / PY).toFixed(2));
    } else if (sPy && !isNaN(sPy)) {
      // ㎡ 없고 평만 있으면 평 기준으로 ㎡ 환산
      parsed.supplyPy = String(+sPy.toFixed(2));
      parsed.supplyM2 = String(+(sPy * PY).toFixed(2));
    }

    // 전용면적
    var eM2 = parsed.exclusiveM2 ? parseFloat(parsed.exclusiveM2) : null;
    var ePy = parsed.exclusivePyText ? parseFloat(parsed.exclusivePyText) : null;
    if (eM2 && !isNaN(eM2)) {
      parsed.exclusiveM2 = String(+eM2.toFixed(2));
      parsed.exclusivePy = String(+(eM2 / PY).toFixed(2));
    } else if (ePy && !isNaN(ePy)) {
      parsed.exclusivePy = String(+ePy.toFixed(2));
      parsed.exclusiveM2 = String(+(ePy * PY).toFixed(2));
    }

    // 보조 필드 제거 (앱에서 안 씀)
    delete parsed.supplyPyText;
    delete parsed.exclusivePyText;

    ['salePrice','jeonsePrice','deposit','monthlyRent','mgmtFee','totalFloor','rooms','bathrooms','units'].forEach(k => {
      if (parsed[k] !== null && parsed[k] !== undefined) parsed[k] = String(parsed[k]);
    });
    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
