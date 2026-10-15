// ─────────────────────────────────────────────────────────────
//  slip-parser.js — Thai Bank Slip Extractor via Gemini Flash Vision API
//  Finance Tracker v2
//  Extracts amount, date, bank, memo, bank category tags, and payee account.
//  Does NOT extract personal names for privacy.
// ─────────────────────────────────────────────────────────────

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

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
  "bank": string of the sender bank, financial institution, or app name seen on the slip (e.g. "MAKE by KBank", "KBank", "SCB", "Krungthai", "Dime", "TrueMoney", "LHBANK", etc.),
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

  let response;
  let lastErrorMsg = '';

  for (const model of CANDIDATE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        break;
      }

      const errBody = await response.clone().json().catch(() => ({}));
      lastErrorMsg = errBody.error?.message || `HTTP ${response.status}`;

      // If model deprecated or not found, continue to next candidate model
      if (response.status === 404 || lastErrorMsg.includes('no longer available') || lastErrorMsg.includes('not found')) {
        continue;
      }

      // For auth or permission errors, stop immediately
      if (response.status === 400 || response.status === 403) {
        throw new Error(`Gemini API Error: ${lastErrorMsg} (กรุณาตรวจสอบ API Key)`);
      }
    } catch (err) {
      if (err.message.includes('API Key')) throw err;
      lastErrorMsg = err.message;
    }
  }

  if (!response || !response.ok) {
    throw new Error(`วิเคราะห์สลิปล้มเหลว: ${lastErrorMsg || 'ไม่สามารถเรียกใช้ Gemini Flash ได้'}`);
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
    bank:            (parsed.bank           || '').trim(),
    memo:            parsed.memo            || '',
    bankCategoryTag: parsed.bankCategoryTag || '',
    payeeAccount:    parsed.payeeAccount    || '',
  };
}

/**
 * Match sender bank/app dynamically to local user accounts without hardcoding.
 * Priority:
 * 1. Learned habit mapping (Habit Engine)
 * 2. Exact or substring name match with user accounts
 * 3. Token-based word overlap
 * 4. First active account fallback
 *
 * @param {string} bankOrApp
 * @param {Array<{id: string, name: string}>} accounts
 * @param {Object} [habitData]
 * @returns {string|null} accountId or null
 */
export function matchBankToAccount(bankOrApp, accounts = [], habitData = null) {
  if (!accounts.length) return null;
  if (!bankOrApp) return accounts[0]?.id || null;

  const raw = bankOrApp.toLowerCase().trim();

  // 1. Check learned habit mapping from past confirmations
  if (habitData?.banks && habitData.banks[raw]) {
    const learnedId = habitData.banks[raw];
    if (accounts.some(a => a.id === learnedId)) {
      return learnedId;
    }
  }

  // 2. Direct string inclusion (e.g. account named "Make by KBank" vs "Make")
  for (const acc of accounts) {
    const accName = acc.name.toLowerCase();
    if (accName.includes(raw) || raw.includes(accName)) {
      return acc.id;
    }
  }

  // 3. Token-based word overlap (e.g. ["make", "kbank", "dime", "scb"])
  const tokens = raw.split(/[\s\-_/]+/).filter(t => t.length >= 2);
  for (const acc of accounts) {
    const accName = acc.name.toLowerCase();
    if (tokens.some(t => accName.includes(t))) {
      return acc.id;
    }
  }

  return accounts[0]?.id || null;
}
