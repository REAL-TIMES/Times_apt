// api/parse-res.js — 네이버 주거 매물 텍스트 파싱 v1.2.0
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
- supplyM2: 공급면적 m2 숫자 (예: 80.63)
- exclusiveM2: 전용면적 m2 숫자 (예: 59.96)
- floor: 해당층 (예: "중", "15", "고", "저")
- totalFloor: 총층 숫자
- rooms: 방수 숫자
- bathrooms: 욕실수 숫자
- direction: 향 (예: "남향")
- moveIn: 입주가능일 (예: "즉시입주", "2026년 10월 30일")
- approvalDate: 사용승인일 (예: "2021.11.24") - 텍스트에서 사용승인일/준공일 추출
- parking: 주차 (예: "6대")
- elevator: 엘리베이터 (예: "1대")
- heating: 난방 (예: "개별난방/도시가스")
- units: 세대수 숫자
- notes: 매물 제목/특이사항

★★ 금액 단위 변환 규칙 (반드시 만원 단위 숫자로) ★★
모든 가격(salePrice, jeonsePrice, deposit, monthlyRent)은 "만원 단위" 숫자로 변환합니다.
- "1억" = 10000 (만원)
- "2억" = 20000 (만원)
- "10억" = 100000 (만원)
- "16억 6,560" = 166560 (만원)
- "12억" = 120000 (만원)
- "600" (월세) = 600 (만원)
- "5,000만원" = 5000 (만원)
- "3000" = 3000 (만원)

★ "억"을 변환할 때 0을 하나 더 붙이지 마세요. 1억은 10000이지 100000이 아닙니다.
★ 검산: (억 숫자 × 10000) + 만원 숫자 = 최종값
   예) "2억/600" → 보증금 = 2×10000 = 20000, 월세 = 600
   예) "16억 6560" → 전세가 = 16×10000 + 6560 = 166560

중요:
- 면적은 반드시 m2로 추출 (평 계산은 자동)
- 반전세/월세 "2억/600" 형식은 dealType="monthly", deposit=20000, monthlyRent=600 으로 분리
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
    if (parsed.supplyM2) parsed.supplyPy = String(+(parseFloat(parsed.supplyM2)/PY).toFixed(2));
    if (parsed.exclusiveM2) parsed.exclusivePy = String(+(parseFloat(parsed.exclusiveM2)/PY).toFixed(2));
    ['salePrice','jeonsePrice','deposit','monthlyRent','mgmtFee','totalFloor','rooms','bathrooms','units'].forEach(k => {
      if (parsed[k] !== null && parsed[k] !== undefined) parsed[k] = String(parsed[k]);
    });
    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
