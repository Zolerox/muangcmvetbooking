# ระบบการจองคิวผ่าตัดทำหมันสัตว์ (สำนักงานปศุสัตว์อำเภอเมืองเชียงใหม่) - สำหรับ GitHub Pages (PWA ติดตั้งลงมือถือได้)

## วิธีนำขึ้น GitHub Pages เพื่อให้ติดตั้งแอปลงมือถือได้จริง (และไม่มีแถบรายงานการละเมิดของ Google Apps Script)

### ขั้นตอนที่ 1: อัปเดตโค้ด `Code.gs` บน Google Apps Script
1. เปิดไฟล์ Google Sheet ฐานข้อมูลของคุณ: https://docs.google.com/spreadsheets/d/1J9Lzra8Vaq_c-8hotM1KEgLxV9P9h9Ql47ycQiGo14U/edit
2. ไปที่เมนู **ส่วนขยาย (Extensions) > Apps Script**
3. นำโค้ดจากไฟล์ **`Code.gs`** ในชุดนี้ไปวางทับในไฟล์ `Code.gs` เดิม และนำ **`Index.html`** ไปวางทับใน `Index.html` แล้วกดบันทึก (`Ctrl + S`)
4. กดปุ่ม **การทำให้ใช้งานได้ (Deploy) > จัดการการทำให้ใช้งานได้ (Manage deployments)**
5. คลิกไอคอน **รูปดินสอ ✎ (แก้ไข)** > เลือกช่อง **เวอร์ชัน (Version)** เป็น **"เวอร์ชันใหม่ (New version)"** > ตั้งค่า *ผู้ที่มีสิทธิ์เข้าถึง (Who has access)* เป็น **"ทุกคน (Anyone)"** > กด **Deploy** แล้วคัดลอกลิงก์ **Web app URL (`https://script.google.com/macros/s/.../exec`)** เก็บไว้

### ขั้นตอนที่ 2: นำไฟล์ขึ้น GitHub Pages
1. สร้าง Repository ใหม่บน GitHub (เช่น `cm-vet-booking`) แบบ **Public**
2. อัปโหลดไฟล์ทั้ง 5 ไฟล์ในชุดนี้ขึ้นไปที่หน้าแรกของ Repository:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
3. ไปที่เมนู **Settings** ของ Repository > เมนูซ้ายมือคลิก **Pages** > ในหัวข้อ **Branch** เปลี่ยนจาก `None` เป็น **`main`** แล้วกดปุ่ม **Save**
4. รอประมาณ 1 นาที คุณจะได้ลิงก์เว็บแอป `https://<ชื่อบัญชีของคุณ>.github.io/cm-vet-booking/`
5. เปิดลิงก์นั้น กดปุ่ม **"📲 ติดตั้งแอปลงมือถือ / GitHub"** ที่มุมขวาบน แล้ววางลิงก์ `https://script.google.com/macros/s/.../exec` ของคุณเพื่อเชื่อมต่อฐานข้อมูล (หรือกดดาวน์โหลด `index.html` ที่ฝังลิงก์แล้วไปวางทับบน GitHub เพื่อไม่ต้องกรอกซ้ำอีก)
6. เมื่อเปิดลิงก์ `github.io` บนมือถือ Android (Chrome) หรือ iPhone (Safari) จะสามารถกด **"ติดตั้งแอป (Install app) / เพิ่มไปยังหน้าจอหลัก (Add to Home Screen)"** ได้ทันที และไม่มีแถบรายงานการละเมิดด้านบนอีกต่อไป!
