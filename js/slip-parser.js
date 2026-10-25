// ─────────────────────────────────────────────────────────────
//  slip-parser.js — Thai Bank Slip Extractor via Gemini Flash Vision API
//  Finance Tracker v2
//  Extracts amount, date, bank, memo, bank category tags, and payee account.
//  Does NOT extract personal names for privacy.
// ─────────────────────────────────────────────────────────────

// Dynamic Model Discovery & Session Cache
let _cachedWorkingModel = null;
let _allDiscoveredFlashModels = null;

/**
 * Dynamically discover available Flash models for the user's API key.
 * Caches the winning model in sessionStorage and memory for instant subsequent calls.
 * @param {string} apiKey
 * @returns {Promise<string[]>} List of model resource paths (e.g. ['models/gemini-3.1-flash-lite-preview', ...])
 */
export async function getDynamicFlashModels(apiKey) {
  let cached = _cachedWorkingModel;
  if (!cached) {
    try {
      cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ft_working_gemini_model') : null;
      if (cached) _cachedWorkingModel = cached;
    } catch (_) {}
  }

  if (!_allDiscoveredFlashModels) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
    if (!res.ok) {
      if (cached) return [cached];
      throw new Error('ไม่สามารถตรวจสอบรายการโมเดลได้ (กรุณาตรวจ API Key)');
    }
    const data = await res.json();
    const allModels = data.models || [];

    const flashModels = allModels.filter(m =>
      m.supportedGenerationMethods?.includes('generateContent') &&
      m.name?.includes('flash') &&
      !m.name?.includes('tts') &&
      !m.name?.includes('image')
    );

    if (!flashModels.length) {
      if (cached) return [cached];
      throw new Error('ไม่พบโมเดล Flash ที่เปิดใช้งานสำหรับ API Key นี้');
    }

    // Sort: lite preview / lite first for ultra-fast response & free tier stability, deprioritize retired 2.5
    flashModels.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aScore = (aName.includes('2.5') ? -10 : 0) + (aName.includes('lite') ? 5 : 0) + (aName.includes('preview') ? 2 : 0);
      const bScore = (bName.includes('2.5') ? -10 : 0) + (bName.includes('lite') ? 5 : 0) + (bName.includes('preview') ? 2 : 0);
      return bScore - aScore;
    });

    _allDiscoveredFlashModels = flashModels.map(m => m.name.startsWith('models/') ? m.name : `models/${m.name}`);
  }

  if (cached && _allDiscoveredFlashModels.includes(cached)) {
    return [cached, ..._allDiscoveredFlashModels.filter(m => m !== cached)];
  }
  return _allDiscoveredFlashModels;
}


/**
 * Client-side image compression and resizing using HTML Canvas.
 * Downscales images to maxDimension (default 1280px) and converts to JPEG (0.82 quality).
 * Dramatically reduces payload size from ~8MB to ~150-250KB, avoids mobile tab memory exhaustion,
 * and speeds up Gemini API transfer by 10x.
 * @param {Blob|File} file
 * @param {number} [maxDimension=1280]
 * @param {number} [quality=0.82]
 * @returns {Promise<Blob>}
 */
export async function compressImage(file, maxDimension = 1280, quality = 0.82) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Fill white background for transparent PNG/WebP before JPEG conversion
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob && (blob.size < file.size || file.type !== 'image/jpeg')) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

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
  "payeeAccount": string of the masked receiver account number or promptpay (e.g. "xxx-1234"). If none, return "",
  "type": string "expense" or "income" (default "expense". If the slip clearly indicates incoming transfer / money received / "เงินเข้า" / "รับเงินโอน", set to "income")
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
  let winningModel = '';
  const candidateModels = await getDynamicFlashModels(apiKey);

  for (const modelPath of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey.trim()}`;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          winningModel = modelPath;
          break;
        }

        const errBody = await response.clone().json().catch(() => ({}));
        lastErrorMsg = errBody.error?.message || `HTTP ${response.status}`;

        // If rate limited (429), back off 2.5s and retry before moving to next candidate
        if (response.status === 429) {
          if (attempts < maxAttempts) {
            console.warn(`Gemini 429 rate limit on ${modelPath}, retrying in 2.5s...`);
            await new Promise(r => setTimeout(r, 2500));
            continue;
          }
          break;
        }

        // If model deprecated, not found, or overloaded, continue to next candidate
        if (response.status === 404 || response.status === 503 || lastErrorMsg.includes('no longer available') || lastErrorMsg.includes('not found')) {
          break;
        }

        // For auth or permission errors, stop immediately
        if (response.status === 400 || response.status === 403) {
          throw new Error(`Gemini API Error: ${lastErrorMsg} (กรุณาตรวจสอบ API Key)`);
        }
      } catch (err) {
        if (err.message.includes('API Key')) throw err;
        lastErrorMsg = err.message;
        if (err.name === 'TimeoutError' || err.message?.includes('aborted')) {
          lastErrorMsg = 'การเชื่อมต่อใช้เวลานานเกินไป (Timeout 30s)';
        }
      }
    }

    if (winningModel) break;
  }

  // Clear cache if previously cached model is now failing with 404 or permanently unavailable
  if (!response || !response.ok) {
    if (response?.status === 404 || lastErrorMsg?.includes('not found') || lastErrorMsg?.includes('no longer available')) {
      _cachedWorkingModel = null;
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('ft_working_gemini_model');
      } catch (_) {}
    }
    throw new Error(`วิเคราะห์สลิปล้มเหลว: ${lastErrorMsg || 'ไม่สามารถเรียกใช้ Gemini Flash ได้'}`);
  }

  // Cache the winning model for 0ms subsequent calls
  if (winningModel) {
    _cachedWorkingModel = winningModel;
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ft_working_gemini_model', winningModel);
    } catch (_) {}
  }

  const resJson = await response.json();
  const textContent = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('ไม่สามารถอ่านข้อมูลจากสลิปได้');
  }

  let parsed;
  try {
    // Robust JSON extraction matching outermost {...}
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in Gemini response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Raw Gemini text:', textContent);
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
    type:            parsed.type === 'income' ? 'income' : 'expense',
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
