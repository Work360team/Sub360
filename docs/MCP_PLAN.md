# แผน MCP · สั่งงาน Sub360 ผ่าน Claude, ChatGPT, Gemini และแอป AI ในเครื่อง

สถานะ: M1–M3 ทำในเครื่องแล้ว (ดู §10) · 16 พ.ย. 2569 · ออกแบบตามหลักของ skill `webapp-mcp-connector` แต่**ไม่ได้ติดตั้ง kit** (เหตุผลใน §4)

## 1. เป้าหมาย

ผู้ใช้พิมพ์ในแอป AI เช่น "ใส่ซับไทยให้คลิป D:\clips\รีวิวลิป.mp4 สไตล์คาราโอเกะ แก้คำว่า มิสทีน ให้ถูก แล้วเรนเดอร์" แล้วงานเกิดใน Sub360 บนเครื่องจริง ผู้ใช้เห็นความคืบหน้าในหน้าต่าง Sub360 เหมือนกดเอง และได้ที่อยู่ไฟล์ MP4/SRT กลับมา

**นิยาม "ครบ":** ทุก route ที่เปลี่ยนข้อมูลใน `server/index.mjs` มี tool รองรับ หรือมีเหตุผลใน §2 ว่าทำไมให้คนทำในแอป บังคับด้วย `tests/mcp-coverage.test.mjs`

## 2. สิ่งที่ไม่เปิดผ่าน MCP

| เรื่อง | ทางที่ใช้แทน |
|---|---|
| ลบโปรเจกต์ (ลบทั้งโฟลเดอร์ กู้ไม่ได้) | คนลบในแอป |
| ติดตั้ง/ยกเลิกติดตั้ง FFmpeg, whisper, cloudflared | คนกดในหน้าตั้งค่า |
| ใส่/ลบ Gemini API key, โทเค็น tunnel | คนกรอกในหน้าตั้งค่า |
| เริ่มจับคู่แอป AI บนคลาวด์, ยกเลิกการเชื่อม | คนกดในหน้า "เชื่อมต่อ AI" |
| อัปเดตโปรแกรม | ตัวอัปเดตของแอป |
| อ่านไฟล์อื่นนอกจากวิดีโอที่ผู้ใช้ระบุ, รันคำสั่ง, แก้โค้ด | ไม่มี tool ให้เรียก |

## 3. การตัดสินใจของผู้ใช้ · 16 พ.ย. 2569

| ข้อ | เรื่อง | ผู้ใช้เลือก | ผลต่อการพัฒนา |
|---|---|---|---|
| 1 | ทางเชื่อม | ในเครื่อง + ผ่าน tunnel | ทำทั้ง stdio (แอปในเครื่อง) และ gateway OAuth ผ่าน tunnel (แอปบนคลาวด์) |
| 2 | การลบ | ไม่ให้ AI ลบ | ไม่มี tool ลบ |
| 3 | งานที่ส่งข้อมูลไป Gemini (ขัดเกลา, แปล) | สั่งได้ + ยืนยันในแชต | `refine_subtitles_with_ai`, `translate_subtitles`, `ai_refine` ตอนสร้าง ต้องมี `confirm_token` |
| 4 | Sub360 ยังไม่เปิด | เปิดหน้าต่างให้เอง | stdio bridge เปิด Sub360 แล้วรอจนพร้อม |
| 5 | Tunnel | Cloudflare Tunnel | Quick Tunnel (ไม่ต้องมีบัญชี ที่อยู่เปลี่ยนทุกครั้ง) + named tunnel ด้วยโทเค็น (ที่อยู่ถาวร) |

## 4. สถาปัตยกรรม

```text
Claude Desktop / Claude Code / Codex / Gemini CLI / Cursor
  └─ stdio ─► Sub360.exe (ELECTRON_RUN_AS_NODE=1) server/mcp-stdio.mjs
                 ├─ อ่าน <SUB360_HOME>/mcp-runtime.json (พอร์ต + กุญแจ) ไม่เจอ → เปิด Sub360 แล้วรอ
                 └─ POST http://127.0.0.1:<พอร์ต>/mcp  (header x-sub360-mcp-key)
ChatGPT / Gemini / claude.ai
  └─ https://<tunnel>/mcp ─► cloudflared ─► 127.0.0.1:<gateway> (เปิดเฉพาะ /mcp, /oauth/*, /.well-known/*)
                 └─ OAuth 2.1 + PKCE + DCR · คนกด "เชื่อมแอป AI ใหม่" ใน Sub360 แล้วพิมพ์รหัส 6 หลักในหน้าที่แอปเปิด
ทั้งสองทาง ──► server/mcp/tools.mjs ──► /api/* เดิม (คิวงานเดียว validation เดียว หน้าแอปเห็นทันที)
```

**ทำไมไม่ติดตั้ง kit:** kit ผูกกับ MariaDB (SQL แบบ `UTC_TIMESTAMP`, `ON DUPLICATE KEY` ทั้งชุด) ระบบผู้ใช้หลายคน และหน้า login ของเว็บ ส่วน Sub360 เก็บงานเป็นไฟล์ ใช้คนเดียว ไม่มีบัญชี จึงเขียนโมดูลเฉพาะใน `server/mcp/` โดยยึดหลักของ kit: รุ่นโปรโตคอลที่พิสูจน์แล้ว, Streamable HTTP แบบไม่มี session ตอบ JSON, `confirm_token`, ตอบ 401 ทุก method ก่อนล็อกอิน (Gemini), `/.well-known/openid-configuration`, รับ `state` ยาว, หน้าอนุญาตที่ไม่ใช้ 302 หลังฟอร์ม

**ขอบเขตความปลอดภัย:**
- `/api/*` และหน้าแอปอยู่บนพอร์ตหลัก (127.0.0.1) เท่านั้น gateway เป็นอีก listener ที่ไม่มี route `/api` เลย tunnel ชี้ไปที่ gateway จึงเปิดหน้าแอปผ่านเน็ตไม่ได้แม้ตั้งค่าผิด
- `/mcp` บนพอร์ตหลักต้องมีกุญแจจาก `mcp-runtime.json` (สุ่มใหม่ทุกครั้งที่เปิด อยู่ในโฟลเดอร์ของผู้ใช้) และปฏิเสธ `Origin` ของเว็บอื่น
- โทเค็น OAuth เก็บเป็น SHA-256 ใน `<SUB360_HOME>/mcp-remote.json` access 1 ชม. refresh 30 วันหมุนทุกครั้ง ยกเลิกได้ในแอป
- สวิตช์ "แอป AI บนคลาวด์" ปิดเป็นค่าเริ่มต้น ปิดแล้ว gateway และ cloudflared หยุดทันที
- **การจับคู่เริ่มจากหน้าต่างเท่านั้น** (แก้หลังรีวิวความปลอดภัย 16 พ.ย.): แบบเดิมที่ให้กด "อนุญาต" คำขอที่เข้ามาถูกหลอกได้ — คนร้ายเปิดหน้าขออนุญาตเองแล้วรอให้เหยื่อกด ตอนนี้ไม่มีคำขอค้างให้กด รหัสวิ่งจากหน้าต่างไปเบราว์เซอร์ของผู้ใช้ ใช้ครั้งเดียว 10 นาที ผิด 10 ครั้งปิด และไม่ดึงหน้าต่างขึ้นมาเองจากคำขอทางเน็ต
- gateway ตอบเฉพาะ Host ที่ตรงกับที่อยู่สาธารณะ (กัน DNS rebinding จากหน้าเว็บบนเครื่อง) · ลงทะเบียนแอปจำกัดต่อ IP ของ Cloudflare · refresh token ที่ถูกใช้ซ้ำหลังช่วงผ่อนผันยกเลิกการเชื่อมทั้งหมด · การเชื่อมเกิดเมื่อแอปแลกโทเค็นสำเร็จเท่านั้น
- ไม่รับ path เครือข่าย (`\\server\…`) ทุกทาง (Windows จะส่งข้อมูลยืนยันตัวตนไปเครื่องนั้น) และแอปบนคลาวด์นำเข้าไฟล์จากเครื่องไม่ได้

## 5. สิทธิ์

แอปคนเดียว ไม่มีบทบาท ทุกการเชื่อมทำได้เท่ากัน ต่างกันที่:

| ทาง | อนุญาตโดย | ข้อจำกัดเพิ่ม |
|---|---|---|
| ในเครื่อง (stdio) | ผู้ใช้ใส่ config ในแอป AI เอง | – |
| บนคลาวด์ (tunnel) | ผู้ใช้กด "เชื่อมแอป AI ใหม่" แล้วพิมพ์รหัสในหน้าที่แอปเปิด | นำเข้าวิดีโอจากเครื่องไม่ได้ (ผู้ใช้ลากเข้าหน้าต่างเอง) |

## 6. Tools

| กลุ่ม | tool | route ที่ใช้ | kind | ยืนยัน |
|---|---|---|---|---|
| อ่าน | `get_sub360_status` | GET /api/status | read | |
| อ่าน | `list_styles` | GET /api/styles | read | |
| อ่าน | `list_projects` | GET /api/projects | read | |
| อ่าน | `get_project` | GET /api/projects/:id | read | |
| อ่าน | `get_subtitles` | GET /api/projects/:id | read | |
| อ่าน | `wait_for_job` | GET /api/projects/:id (รอ) | read | |
| สร้าง | `create_project_from_file` | POST /api/projects (เฉพาะแอปในเครื่อง) | write | เมื่อ `ai_refine` |
| แก้ | `update_project_settings` | PATCH /api/projects/:id | write | |
| แก้ | `edit_subtitles` | PUT /api/projects/:id/timeline + `version` | write | |
| แก้ | `import_subtitles` | POST /api/projects/:id/import | write | เมื่อมีซับอยู่แล้ว (ทับ) |
| แก้ | `regroup_subtitles` | POST /api/projects/:id/rechunk | destructive | เสมอ (ทับการแก้ทั้งหมด) |
| งาน | `transcribe_video` | POST /api/projects/:id/transcribe | write | เมื่อมีซับอยู่แล้ว (ทับ) |
| งาน | `refine_subtitles_with_ai` | POST /api/projects/:id/refine | write | เสมอ (ส่งเสียงไป Gemini) |
| งาน | `translate_subtitles` | POST /api/projects/:id/translate | write | เสมอ (ส่งข้อความไป Gemini) |
| งาน | `render_video` | POST /api/projects/:id/render | write | |
| งาน | `cancel_job` | POST /api/projects/:id/cancel | write | |
| แอป | `show_in_sub360` | เปิดหน้าโปรเจกต์ในหน้าต่าง Sub360 | read | |

**ลำดับงานที่ใช้บ่อย:** `create_project_from_file` → `wait_for_job` (ถอดเสียง) → `get_subtitles` → `edit_subtitles` → `update_project_settings` → `render_video` → `wait_for_job` → ตอบที่อยู่ไฟล์จาก `get_project`

## 7. งานที่ต้องให้คนตัดสิน

- ส่งข้อมูลออกนอกเครื่อง (Gemini): ยืนยันในแชตทุกครั้ง server บังคับด้วย `confirm_token` (ผูกกับ tool + argument อายุ 10 นาที ใช้ครั้งเดียว)
- ทับงานที่แก้ไว้ (ถอดเสียงใหม่, นำเข้าซับ, แบ่งท่อนใหม่): ยืนยันในแชต
- แก้ซับใช้ `version` จาก `get_subtitles` ถ้าผู้ใช้แก้ในแอประหว่างนั้นจะถูกปฏิเสธให้อ่านใหม่

## 8. ข้อมูลส่วนบุคคล

Sub360 ไม่มีข้อมูลลูกค้า แต่ข้อความซับคือเสียงพูดในวิดีโอของผู้ใช้ ถือเป็นข้อมูลที่ส่งให้แอป AI ที่ผู้ใช้เชื่อมเอง · คำตอบติดป้ายว่าเป็นข้อมูลไม่ใช่คำสั่ง (กันคำสั่งแฝงในเสียงพูด) · ไม่ส่งไฟล์วิดีโอผ่าน tunnel

## 9. ไฟล์

- เข้า: แอปในเครื่องระบุ path ของวิดีโอบนเครื่อง (`.mp4 .mov .m4v .mkv .webm .avi` ไม่เกิน 8 GB, ไม่รับ path เครือข่าย) bridge สตรีมเข้า Sub360 · แอปบนคลาวด์นำเข้าไฟล์ไม่ได้ ผู้ใช้ลากไฟล์เข้าแอปเองแล้วให้ AI หาใน `list_projects`
- ออก: ตอบ path ของ MP4/SRT/ASS/VTT/TXT ในเครื่อง และข้อความซับผ่าน `get_subtitles` ไม่ส่งไฟล์วิดีโอผ่านเน็ต

## 10. ระยะงาน

| ระยะ | ส่งมอบ | ผ่านเมื่อ | สถานะ |
|---|---|---|---|
| M1 | `server/mcp/` + tools + `/mcp` ในเครื่อง + stdio bridge + เปิดแอปเอง | เทสต์ผ่าน + Claude Code ตัวจริงสั่งงานได้ | ทำในเครื่องแล้ว · ผ่าน |
| M2 | gateway OAuth + Cloudflare Tunnel (quick/named) + อนุมัติในแอป | เทสต์ OAuth ครบวงจร + quick tunnel จริงตอบ metadata | ทำในเครื่องแล้ว · quick ผ่าน, named ยังไม่ทดสอบ |
| M3 | หน้า "เชื่อมต่อ AI" + คู่มือ `docs/AI_CONNECT.md` + coverage test | coverage ผ่าน | ทำในเครื่องแล้ว |
| M4 | ทดสอบกับ ChatGPT / Gemini / claude.ai ตัวจริงผ่าน tunnel | ผู้ใช้เชื่อมเองและสั่งงานได้ 1 ชิ้น | รอผู้ใช้ |
| M5 | ออกเวอร์ชัน Windows ที่มี MCP (electron-builder) และทดสอบ Sub360.exe เป็น stdio server | Claude Desktop เรียกได้จากตัวติดตั้งจริง | รอ |

## 11. ทดสอบกับแอปจริง

| แอป | สถานะ | หมายเหตุ |
|---|---|---|
| Claude Code (stdio) | ทดสอบแล้ว 16 พ.ย. 2569 | ผ่าน `Sub360.exe` (ELECTRON_RUN_AS_NODE) อ่านสถานะ/โปรเจกต์ได้ถูก และงานเขียนครบวงจร (bridge เปิด Sub360 เอง → สร้างโปรเจกต์ → นำเข้า SRT → แก้บรรทัด → สไตล์ → เรนเดอร์ได้ MP4/SRT) |
| Claude Desktop (stdio) | ยังไม่ทดสอบ | config รูปแบบเดียวกับที่ทดสอบกับ Claude Code |
| Codex / Gemini CLI (stdio) | ยังไม่ทดสอบ | |
| Cloudflare Quick Tunnel | ทดสอบแล้ว 16 พ.ย. 2569 | metadata, DCR, หน้าขออนุญาต, อนุมัติในแอป, แลกโทเค็น, `tools/list` + `list_projects`, ยกเลิกแล้วได้ 401, `/api` ผ่าน tunnel ได้ 404 |
| Named tunnel (โทเค็น + โดเมน) | ยังไม่ทดสอบ | ต้องมีบัญชี/โดเมนบน Cloudflare |
| ChatGPT / Gemini / claude.ai (tunnel) | ยังไม่ทดสอบ | ต้องให้ผู้ใช้เชื่อมเอง |

**เทสต์อัตโนมัติ:** `tests/mcp.test.mjs` (in-process + stdio + เรนเดอร์จริง), `tests/mcp-remote.test.mjs` (OAuth ครบวงจรไม่ผ่าน tunnel), `tests/mcp-coverage.test.mjs` (ทุก route เขียนมี tool หรือเหตุผล)
