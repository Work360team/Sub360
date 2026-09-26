# Sub360

ถอดเสียงวิดีโอเป็นซับไทยสวย ๆ บนเครื่องของคุณเอง — อัปโหลด → ตรวจแก้ซับ → เลือกสไตล์ → ได้ MP4 + SRT / ASS / VTT / TXT

- **ถอดเสียง** ด้วย whisper.cpp บนเครื่อง (ฟรี ไม่ส่งข้อมูลออก) พร้อมจังหวะรายคำ
- **AI แก้คำ** (ไม่บังคับ) — Gemini ฟังเสียงซ้ำแล้วแก้ชื่อเฉพาะ/ศัพท์อังกฤษ เวลาของแต่ละคำยังมาจาก whisper
- **แปลซับ** 9 ภาษา แสดงแบบต้นฉบับ / สองภาษา / คำแปลอย่างเดียว และได้ SRT คำแปลแยกไฟล์
- **นำเข้า SRT / VTT / ASS** ที่มีอยู่แล้ว มาแต่งสไตล์โดยไม่ต้องถอดเสียง
- **15 สไตล์** (เร็ว 3 · พรีเมียม HyperFrames 12) × 8 ชุดสี ใช้ได้ทุกขนาดจอ
- วิดีโอยาว + สไตล์พรีเมียม เรนเดอร์ทีละ ~1 นาทีแล้วต่อกัน ไม่กินดิสก์หลายสิบ GB

ต่อยอดจากระบบซับของ Clip360 (ClipPang): ใช้ตัวตัดคำไทย สไตล์ซับ 15 แบบ ชุดสี 8 ชุด ซับแบบเร็ว (FFmpeg/libass) และซับพรีเมียม (HyperFrames) ชุดเดียวกัน

## ติดตั้ง (Windows 10/11)

ดาวน์โหลด **[`Sub360-Setup.exe`](https://github.com/Work360team/Sub360/releases/latest/download/Sub360-Setup.exe)** (ลิงก์นี้ได้เวอร์ชันล่าสุดเสมอ) แล้วดับเบิลคลิก
ติดตั้งเสร็จจะเปิดแอปให้เอง มีไอคอน Sub360 บน Desktop และ Start menu และแอปจะอัปเดตตัวเองเมื่อมีเวอร์ชันใหม่
(ไฟล์ยังไม่ได้เซ็นชื่อดิจิทัล ครั้งแรก Windows จะขึ้น "Windows protected your PC" → กด **More info** → **Run anyway**)

แอปเก็บงานและการตั้งค่าที่ `%LOCALAPPDATA%\Sub360` (ถ้าเคยใช้ตัวติดตั้งแบบเก่า จะย้าย `app\data` และ `.env` มาให้เองตอนเปิดครั้งแรก)
และเขียน log ไว้ที่ `%LOCALAPPDATA%\Sub360\logs`

### ออกเวอร์ชันใหม่ของแอป

ขยับ `version` ใน `package.json` แล้ว merge เข้า `main` — GitHub Actions ([`windows-app.yml`](.github/workflows/windows-app.yml))
จะสร้างไฟล์ติดตั้งบน Windows เปิดแอปทดสอบ (`--smoke-test`) แล้วออก Release `v<version>` ให้เอง แอปที่ติดตั้งไว้จะเห็นและอัปเดตตัวเอง
ทุก PR ก็สร้างและทดสอบเหมือนกัน (ดาวน์โหลดไฟล์ติดตั้งไปลองได้จากหน้า Actions) · รันแอปจากโค้ดในเครื่อง: `npm run app` · สร้างไฟล์ติดตั้งเอง: `npm run dist`

### ติดตั้งแบบไม่ใช้ไฟล์ .exe (ทางเลือก)

กด <kbd>Win</kbd>+<kbd>R</kbd> วางบรรทัดนี้ แล้วกด Enter:

```
powershell -NoProfile -c "irm https://raw.githubusercontent.com/Work360team/Sub360/main/scripts/install.ps1|iex"
```

หรือดาวน์โหลด [`installer/ติดตั้ง Sub360.bat`](installer/) แล้วดับเบิลคลิก (Windows อาจเตือน → More info → Run anyway)

ตัวติดตั้ง ([`scripts/install.ps1`](scripts/install.ps1)) ดาวน์โหลด Node.js และ Git แบบพกพามาไว้ใน `runtime\` ของโปรแกรม
(ไม่ต้องใช้สิทธิ์ admin ไม่แตะโปรแกรมอื่นในเครื่อง) → ดึงโค้ดลง `%LOCALAPPDATA%\Sub360\app` → สร้างไอคอน **Sub360**
บน Desktop และ Start menu → เปิดโปรแกรม · รันซ้ำได้เพื่อซ่อม/อัปเดต งานใน `data\` และ `.env` ไม่ถูกแตะ

## เปิดโปรแกรม

ดับเบิลคลิกไอคอน **Sub360** หรือ **`เริ่มโปรแกรม.bat`** แล้วเบราว์เซอร์จะเปิด `http://127.0.0.1:4360` ให้เอง
(ครั้งแรกระบบจะรัน `npm install` ให้อัตโนมัติ)

**อัปเดตอัตโนมัติ:** ทุกครั้งที่เปิด `เริ่มโปรแกรม.bat` จะ `git pull` เอาโค้ดล่าสุดมาก่อน (ถ้าแพ็กเกจเปลี่ยนจะ `npm install` ให้ด้วย)
แล้วแสดงเวอร์ชันในหน้าต่างดำและมุมล่างซ้ายของหน้าเว็บ เช่น `v0.2.0 (bf360ea · 2026-09-26)` — เลขจาก `package.json` + commit ที่ใช้อยู่
ต้องติดตั้งด้วยตัวติดตั้งด้านบน หรือ `git clone` + [Git](https://git-scm.com) ในเครื่อง · ถ้าไม่มีเน็ตหรือดึงไม่ได้ จะเตือนแล้วเปิดเวอร์ชันเดิมต่อ ·
ปิดการอัปเดตได้ด้วย `SUB360_NO_UPDATE=1` · ออกรุ่นใหม่ให้ขยับ `version` ใน `package.json`

**เครื่องใหม่:** ถ้ายังไม่มี FFmpeg หรือตัวถอดเสียง หน้าเว็บจะพาไป **ตั้งค่าครั้งแรก** (`#/setup`) เอง
แล้วติดตั้งให้ด้วยการกดปุ่ม — ตรวจเครื่อง → FFmpeg (~100 MB) → whisper.cpp + โมเดล (1.6–3.1 GB, เลือกรุ่นใช้การ์ดจอให้เองถ้ามี NVIDIA)
→ Gemini API key (ไม่บังคับ) · whisper ติดตั้งในโฟลเดอร์ชื่ออังกฤษ (`%LOCALAPPDATA%\Sub360\whisper`) เพราะ whisper.cpp เปิดไฟล์ใต้ path ไทยไม่ได้
เปิดหน้านี้ซ้ำได้จากเมนู ตั้งค่า → เปิดตัวช่วยตั้งค่า

หรือรันจาก terminal:

```bash
npm install
npm start
```

## สิ่งที่ต้องมี

| เครื่องมือ | ใช้ทำอะไร | ตั้งค่า |
|---|---|---|
| Node.js 22.13+ | ตัวโปรแกรม | — |
| FFmpeg | ประกอบซับลงวิดีโอ | อยู่ใน PATH หรือตั้ง `FFMPEG_PATH` |
| whisper.cpp + โมเดล | ถอดเสียง | `WHISPER_CLI_PATH`, `WHISPER_MODEL_PATH` ใน `.env` (path ต้องเป็นอักษรอังกฤษ) |
| hyperframes (npm) | ซับพรีเมียม | ติดตั้งด้วย `npm install` — ถ้าไม่มี ระบบจะใช้ซับแบบเร็วแทน |

### Gemini (ไม่บังคับ — สำหรับ AI แก้คำและแปลซับ)

ใส่คีย์ในหน้า **ตั้งค่า** ของแอป (ระบบตรวจกับ Google ก่อนบันทึกลง `.env`) หรือเขียนเองใน `.env`:

```
GEMINI_API_KEY=...          # คีย์หลัก
GEMINI_API_KEY_2=...        # (ถึง _9) สลับให้เองเมื่อโควตาเต็ม
GEMINI_MODEL=gemini-flash-latest              # ค่าเริ่มต้น
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-3-flash-preview
```

ข้อมูลที่ส่งออก: "AI แก้คำ" ส่งเสียงของคลิป · "แปลซับ" ส่งเฉพาะข้อความ · การถอดเสียงและเรนเดอร์ไม่ส่งอะไรออกเลย

## ใช้จาก command line (ไม่ต้องเปิดเว็บ)

```bash
node scripts/sub-cli.mjs วิดีโอ.mp4 --style karaoke-pop --colors yellow-pop
node scripts/sub-cli.mjs --list                                    # ดูสไตล์ทั้งหมด
node scripts/sub-cli.mjs วิดีโอ.mp4 --segments output/x/segments.json  # ใช้ผลถอดเสียงเดิม ไม่ถอดใหม่
```

ตัวเลือก: `--anchor top|middle|bottom` · `--scale 1.2` · `--lang th|en|auto` · `--prompt "ชื่อแบรนด์"` · `--out โฟลเดอร์`

## โครงสร้าง

```
pipeline/
  transcribe.mjs   แยกเสียง + whisper.cpp → segments (ข้อความ + เวลาระดับ token)
  gemini.mjs       เรียก Gemini + สลับคีย์/รุ่นสำรองเมื่อล่มหรือโควตาเต็ม
  refine.mjs       AI ฟังเสียงแก้คำ (ทีละช่วง ≤4 นาที) แล้วจับคู่กลับกับเวลาของ whisper
  translate.mjs    แปลทีละท่อนแบบรู้บริบท
  subfile.mjs      อ่าน SRT / VTT / ASS
  timeline.mjs     segments → ท่อนซับ + เวลาต่อคำ (ใหม่) · export VTT/TXT
  styles.mjs       โหลดสไตล์ + สเกลตามขนาดวิดีโอ (ใหม่)
  render.mjs       วางซับลงวิดีโอต้นฉบับ ใช้เสียงเดิม (ใหม่)
  index.mjs        API ระดับสูง + โหมดสองภาษา + เรนเดอร์พรีเมียมทีละช่วงสำหรับวิดีโอยาว
  thai.mjs ass.mjs hyperframes.mjs caption-colors.mjs lib.mjs  ← ยกมาจาก Clip360
  styles/ fonts/ vendor/                                         ← ยกมาจาก Clip360
server/            local server (127.0.0.1 เท่านั้น) + คิวงานทีละงาน + เก็บโปรเจกต์เป็นโฟลเดอร์
public/            หน้าเว็บ (vanilla JS ไม่ต้อง build) หน้าตาถอดแบบ Clip360
data/projects/<id>/  วิดีโอต้นฉบับ, project.json (ซับที่แก้), out/ (ไฟล์ผลลัพธ์)
```

## ทดสอบ

```bash
npm test
```
