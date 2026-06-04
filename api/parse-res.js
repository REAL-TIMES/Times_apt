// api/parse-res.js — 네이버 주거 매물 텍스트 파싱 v1.4.0
// v1.4.0: 단지 총세대수 · 사용승인일을 '단지 기초정보' 위치 기반으로 우선 추출
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
- approvalDate: 사용승인일 (아래 ★단지 기초정보 규칙 참고)
- parking: 주차 (예: "6대")
- elevator: 엘리베이터 (예: "1대")
- heating: 난방 (예: "개별난방/도시가스")
- units: 단지 총세대수 (아래 ★단지 기초정보 규칙 참고)
- notes: 매물 제목/특이사항

★★ 단지 기초정보 규칙 (units · approvalDate, 매우 중요) ★★
- 페이지 상단/좌측에 단지 기초정보가 라벨 없이 다음 순서로 나열됩니다:
    [단지명] / [매물유형] / [총세대수] / [총동수] / [사용승인일] / [면적범위]
    예) "인시그니아반포 / 오피스텔 / 148세대 / 총 2동 / 2025.05.30 / 144.13㎡~346.29㎡"
- units = 이 나열의 3번째 항목인 "○○세대"의 숫자 (= 단지 총세대수). 예: 148
- approvalDate = 이 나열의 5번째 항목인 날짜. 예: "2025.05.30"
- ★주의: 매물 상세 영역에도 "세대수"가 나올 수 있으나 그것은 '해당 면적 세대수'이며
  units 가 아닙니다. 반드시 위 단지 기초정보 나열의 총세대수를 우선 사용하세요.
  (예: 단지 기초정보 148세대 + 매물 상세 36세대 → units=148)
- 위 나열 패턴이 보이지 않으면(빌라·주택 등) 매물 상세 정보에서 총세대수/사용승인일을 찾고,
  그래도 없으면 해당 필드는 null. 임의로 지어내지 마세요.

★★ 면적 추출 규칙 (매우 중요) ★★
- ㎡(제곱미터)와 평(평형)은 절대 혼동하지 마세요. 단위를 반드시 보고 판단합니다.
- 단위가 "㎡", "m2", "제곱미터"로 표기된 값 → supplyM2 / exclusiveM2 에만 넣습니다.
- 단위가 "평", "평형"으로 표기된 값 → supplyPyText / exclusivePyText 에만 넣습니다.
- 네이버는 보통 "84.96㎡/59.96㎡" 처럼 공급/전용을 ㎡로 함께 표기합니다. 앞이 공급, 뒤가 전용입니다.
- ㎡ 값은 대개 소수점이 있습니다 (84.96). 평 값을 ㎡ 칸에 넣지 마세요.
- 해당 단위로 표기된 값이 없으면 그 필드는 null. 임의로 환산해서 채우지 마세요.
  (예: "25평"만 있고 ㎡ 표기가 없으면 → supplyPyText="25", supplyM2=null)
- ★주의: 위 단지 기초정보의 "면적범위"(예: 144.13㎡~346.29㎡)는 단지 전체 면적 범위이며
  개별 매물 면적이 아닙니다. supplyM2/exclusiveM2 에는 '매물 상세'의 개별 면적을 사용하세요.

★★ 금액 단위 변환 규칙 (반드시 만원 단위 숫자로) ★★
- "1억" = 10000 / "2억" = 20000 / "10억" = 100000 / "12억" = 120000
- "16억 6,560" = 166560 / "5,000만원" = 5000 / "600"(월세) = 600
- "억"을 변환할 때 0을 하나 더 붙이지 마세요. 1억은 10000이지 100000이 아닙니다.
- 검산: (억 숫자 × 10000) + 만원 숫자 = 최종값
  예) "2억/600" → dealType="monthly", deposit=20000, monthlyRent=600
  예) "16억 6560" → 166560
- ★주의: 단지 기초정보의 "최근 매매 실거래가"나 단지 가격범위(예: "매매 15억~58억")는
  단지 전체 시세이며 이 매물의 가격이 아닙니다. salePrice 등에는 '이 매물'의 가격만 넣으세요.

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
