// ─────────────────────────────────────────────────────────────
//  slip-parser.js — Thai Bank Slip Extractor via Gemini Flash Vision API
//  Finance Tracker v2
//  Extracts amount, date, bank, memo, bank category tags, and payee account.
//  Does NOT extract personal names for privacy.
// ─────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Convert a File or Blob into a base64 string.
 * @param {Blob} blob
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = /** @type {string} */ (reader.result);
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      const mimeType = blob.type || 'image/jpeg';
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Parse a Thai bank slip image using Google Gemini Flash Vision API.
 *
 * @param {File|Blob} imageFile
 * @param {string} apiKey
 * @returns {Promise<{
 *   amountMinor: number,
 *   date: string,
 *   time: string,
 *   bank: string,
 *   memo: string,
 *   bankCategoryTag: string,
 *   payeeAccount: string
 * }>}
 */
export async function parseSlipImage(imageFile, apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('ยังไม่ได้ตั้งค่า Gemini API Key — กรุณาใส่ API Key ฟรีในหน้าตั้งค่า');
  }

  const { base64, mimeType } = await blobToBase64(imageFile);

  const prompt = `Analyze this Thai bank transfer slip image carefully.
Extract the transaction data and return ONLY a raw JSON object (without markdown code blocks) matching this schema:
{
  "amount": number (e.g. 150.00),
  "date": string in "YYYY-MM-DD" format (convert Thai Buddhist era year to Christian era, e.g. 2569 -> 2026),
  "time": string in "HH:MM" format (24-hour),
  "bank": string of the sender's bank code (e.g. "KBANK", "SCB", "KTB", "BBL", "TTB", "BAY", "GSB"),
  "memo": string containing ONLY the transfer note / memo / "บันทึกช่วยจำ" that the sender typed. If there is no memo note, return "". IMPORTANT: DO NOT include the receiver's person name or merchant name here.
  "bankCategoryTag": string of any built-in category tag printed on the slip by the bank (e.g. K PLUS "อาหารและเครื่องดื่ม", "ช้อปปิ้ง", "บิล"). If none, return "".
  "payeeAccount": string of the masked receiver account number or promptpay (e.g. "xxx-1234"). If none, return ""
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey.trim()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody.error?.message || `HTTP ${response.status}`;
    if (response.status === 400 || response.status === 403) {
      throw new Error(`Gemini API Error: ${message} (กรุณาตรวจสอบ API Key)`);
    }
    throw new Error(`วิเคราะห์สลิปล้มเหลว: ${message}`);
  }

  const resJson = await response.json();
  const textContent = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('ไม่สามารถอ่านข้อมูลจากสลิปได้');
  }

  let parsed;
  try {
    // Clean code fences if returned despite responseMimeType
    const cleaned = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('รูปแบบข้อมูลสลิปไม่ถูกต้อง');
  }

  // Normalize and validate
  const amount = parseFloat(parsed.amount) || 0;
  const amountMinor = Math.round(amount * 100);

  // Fallback today if date is invalid
  let date = parsed.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = new Date();
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return {
    amountMinor,
    date,
    time:            parsed.time            || '',
    bank:            (parsed.bank           || '').toUpperCase(),
    memo:            parsed.memo            || '',
    bankCategoryTag: parsed.bankCategoryTag || '',
    payeeAccount:    parsed.payeeAccount    || '',
  };
}

/**
 * Match bank code (e.g. KBANK, SCB, KTB) to local user accounts.
 * @param {string} bankCode
 * @param {Array<{id: string, name: string}>} accounts
 * @returns {string|null} accountId or null
 */
export function matchBankToAccount(bankCode, accounts = []) {
  if (!bankCode || !accounts.length) return null;
  const code = bankCode.toUpperCase();

  const BANK_KEYWORDS = {
    KBANK: ['กสิกร', 'kbank', 'k plus'],
    SCB:   ['ไทยพาณิชย์', 'scb', 'easy'],
    KTB:   ['กรุงไทย', 'ktb', 'next'],
    BBL:   ['กรุงเทพ', 'bbl', 'bualuang'],
    TTB:   ['ทีเอ็มบี', 'ทหารไทย', 'ttb', 'tmb'],
    BAY:   ['กรุงศรี', 'bay'],
    GSB:   ['ออมสิน', 'gsb'],
  };

  const keywords = BANK_KEYWORDS[code] || [code.toLowerCase()];

  for (const acc of accounts) {
    const accName = acc.name.toLowerCase();
    if (keywords.some(k => accName.includes(k))) {
      return acc.id;
    }
  }

  return accounts[0]?.id || null;
}
