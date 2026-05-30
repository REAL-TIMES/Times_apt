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
- salePrice: 매매가 만원 숫자 (예: 120000)
- jeonsePrice: 전세가 만원 숫자 (예: 166560)
- deposit: 보증금 만원 숫자 (월세/반전세일 때)
- monthlyRent: 월세 만원 숫자
- mgmtFee: 관리비 만원 숫자 (예: 25)
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

중요:
- 면적은 반드시 m2로 추출 (평 계산은 자동)
- 반전세는 dealType="monthly"에 deposit+monthlyRent로 분리
- propType: 아파트→apt, 빌라/다세대/연립→villa, 오피스텔→officetel
- approvalDate: "사용승인일", "준공", "건축" 관련 날짜 추출
- 반드시 JSON 객체만 반환, 앞뒤 설명 텍스트 없이, 마크다운 코드블록 없이.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // API 응답이 JSON이 아닐 수 있으므로 text로 먼저 받기
    const rawBody = await r.text();

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch(e) {
      throw new Error('API 응답 파싱 실패: ' + rawBody.slice(0, 200));
    }

    if (!r.ok) {
      const msg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data).slice(0, 200);
      throw new Error('API 오류 ' + r.status + ': ' + msg);
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('API 응답에 content 없음: ' + JSON.stringify(data).slice(0, 200));
    }

    const raw = data.content[0].text.trim();

    // JSON 블록 추출 — 마크다운 코드블록 또는 중괄호 직접 추출
    let clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // 중괄호 시작~끝 직접 추출 (앞뒤 설명 텍스트 있을 경우 대비)
    const braceStart = clean.indexOf('{');
    const braceEnd = clean.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      clean = clean.slice(braceStart, braceEnd + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      throw new Error('JSON 파싱 실패. 모델 응답: ' + clean.slice(0, 300));
    }

    const PY = 3.30579;
    if (parsed.supplyM2) parsed.supplyPy = String(+(parseFloat(parsed.supplyM2)/PY).toFixed(2));
    if (parsed.exclusiveM2) parsed.exclusivePy = String(+(parseFloat(parsed.exclusiveM2)/PY).toFixed(2));
    ['salePrice','jeonsePrice','deposit','monthlyRent','mgmtFee','totalFloor','rooms','bathrooms','units'].forEach(function(k) {
      if (parsed[k] !== null && parsed[k] !== undefined) parsed[k] = String(parsed[k]);
    });

    res.status(200).json(parsed);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
