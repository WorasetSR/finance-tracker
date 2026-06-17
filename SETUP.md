# Finance Tracker — Firebase Setup Guide

ทำครั้งเดียว ใช้ได้ตลอด (~10 นาที)

---

## ขั้นตอนที่ 1: สร้าง Firebase Project

1. เปิด https://console.firebase.google.com
2. คลิก **"Add project"**
3. ตั้งชื่อ เช่น `finance-tracker`
4. ปิด Google Analytics (ไม่จำเป็น) → **Create project**

---

## ขั้นตอนที่ 2: เปิดใช้ Google Sign-In

1. เมนูซ้าย → **Authentication** → **Get started**
2. แท็บ **Sign-in method** → เลือก **Google**
3. Toggle เปิด → ใส่ email ตัวเอง → **Save**

---

## ขั้นตอนที่ 3: สร้าง Firestore Database

1. เมนูซ้าย → **Firestore Database** → **Create database**
2. เลือก **Start in production mode** → **Next**
3. เลือก region ใกล้สุด เช่น `asia-southeast1` (สิงคโปร์) → **Enable**

---

## ขั้นตอนที่ 4: ตั้ง Security Rules

ใน Firestore → แท็บ **Rules** → วางโค้ดนี้:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

คลิก **Publish**

---

## ขั้นตอนที่ 5: รับ Firebase Config

1. เมนูซ้าย → รูปฟันเฟือง ⚙️ → **Project settings**
2. เลื่อนลงหา **Your apps** → คลิก `</>` (Web)
3. ตั้งชื่อ app → **Register app**
4. Copy ค่าใน `firebaseConfig = { ... }`

---

## ขั้นตอนที่ 6: ใส่ Config ในไฟล์

เปิดไฟล์ `js/config.js` แล้วแทนที่ค่าทั้งหมด:

```js
export const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "finance-tracker-xxxxx.firebaseapp.com",
  projectId:         "finance-tracker-xxxxx",
  storageBucket:     "finance-tracker-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

---

## ขั้นตอนที่ 7: เปิดใช้งาน

### วิธีที่ 1 — รันบน Local (ต้องใช้ HTTP server)

เพราะ Firebase ต้องการ HTTP ไม่ใช่ `file://`

**ถ้ามี Python:**
```bash
cd workspace/finance-tracker
python -m http.server 8080
```
แล้วเปิด http://localhost:8080

**ถ้ามี Node.js:**
```bash
npx serve workspace/finance-tracker
```

### วิธีที่ 2 — Host ฟรีบน Firebase Hosting (แนะนำ)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# เลือก project ที่สร้าง
# public directory: . (จุด)
# single-page app: Yes
firebase deploy
```

จะได้ URL เช่น `https://finance-tracker-xxxxx.web.app`
เปิดได้ทั้งมือถือและคอม ข้อมูล sync อัตโนมัติ ✓

---

## ปัญหาที่พบบ่อย

**เปิดไฟล์โดยตรง (file://) แล้ว login ไม่ได้**
→ ต้องรันผ่าน HTTP server (ดูวิธีที่ 1)

**Domain not authorized**
→ Firebase Console → Authentication → Settings → Authorized domains → เพิ่ม `localhost`

**Permission denied เวลาบันทึกข้อมูล**
→ ตรวจสอบ Firestore Rules (ขั้นตอนที่ 4)
