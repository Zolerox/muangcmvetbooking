/**
 * ระบบการจองคิวผ่าตัดทำหมันสัตว์ - สำนักงานปศุสัตว์อำเภอเมืองเชียงใหม่
 * รองรับทั้งการรันบน Google Apps Script โดยตรง และการเชื่อมต่อผ่าน GitHub Pages (PWA REST API)
 * เขตเวลา: Asia/Bangkok (GMT+7)
 * รูปแบบรหัสคิว (เฉพาะเคสที่ยืนยันผ่าตัดเสร็จสิ้นแล้ว): HN48 + ปี ค.ศ.(2 หลักท้าย) + เดือน(2 หลัก) + วันนัด(2 หลัก) + ลำดับ(3 หลัก เริ่มจาก 001)
 */

const CONFIG = {
  APP_TITLE: 'ระบบการจองคิวผ่าตัดทำหมัน - สำนักงานปศุสัตว์อำเภอเมืองเชียงใหม่',
  SPREADSHEET_ID: '1J9Lzra8Vaq_c-8hotM1KEgLxV9P9h9Ql47ycQiGo14U',
  SHEET_PETS: 'รายการจองคิว_รายตัว',
  SHEET_OWNERS: 'สรุปรายชื่อผู้จอง',
  TIMEZONE: 'Asia/Bangkok'
};

const DEMO_OWNER_NAMES = [
  'นายกิตติพงษ์ นันทขว้าง',
  'นางคำปัน สุขเกษม',
  'นายอนันต์ วงศ์สวัสดิ์ (ตัวแทนชุมชนวัดเกต)',
  'นางสาวพิมพ์ชนก เจริญราษฎร์'
];

function getTargetSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/**
 * รองรับทั้งการเปิดหน้าเว็บปกติ และ JSON API (?action=getInitialData) สำหรับ GitHub Pages
 */
function doGet(e) {
  initDatabase();

  if (e && e.parameter && e.parameter.action) {
    try {
      const action = String(e.parameter.action || '');
      let result = { success: false, message: 'Unknown action' };
      if (action === 'getInitialData') {
        result = { success: true, data: getInitialData() };
      } else if (action === 'deleteBookingRecord') {
        result = deleteBookingRecord(e.parameter.bookingId, e.parameter.ownerName, e.parameter.phone);
      } else if (action === 'updateBookingStatus') {
        result = updateBookingStatus(e.parameter.bookingId, e.parameter.newStatus);
      } else if (action === 'saveBookingRecord' && e.parameter.payload) {
        result = saveBookingRecord(JSON.parse(e.parameter.payload));
      } else if (action === 'updateBookingRecord' && e.parameter.payload) {
        result = updateBookingRecord(JSON.parse(e.parameter.payload));
      }
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: String(err && err.message ? err.message : err)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * รองรับคำสั่งบันทึก/แก้ไข/ลบ/เปลี่ยนสถานะ จากแอปบน GitHub Pages ผ่าน fetch POST
 */
function doPost(e) {
  try {
    initDatabase();
    const bodyStr = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const req = JSON.parse(bodyStr);
    const action = String(req.action || '');
    let result = { success: false, message: 'Unknown action' };

    if (action === 'getInitialData') {
      result = { success: true, data: getInitialData() };
    } else if (action === 'saveBookingRecord') {
      result = saveBookingRecord(req.payload || {});
    } else if (action === 'updateBookingRecord') {
      result = updateBookingRecord(req.payload || {});
    } else if (action === 'deleteBookingRecord') {
      result = deleteBookingRecord(req.bookingId, req.ownerName, req.phone);
    } else if (action === 'updateBookingStatus') {
      result = updateBookingStatus(req.bookingId, req.newStatus, req.petStatuses);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: String(err && err.message ? err.message : err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * สร้างรหัสคิว HN48 + YY + MM + DD + ลำดับ 3 หลัก (เริ่มนับจาก 001 เฉพาะเคสที่มีรหัส HN48 และผ่าตัดเสร็จสิ้นแล้วเท่านั้น)
 */
function generateHN48QueueId(appointmentDateStr, ownerSheet) {
  const tz = CONFIG.TIMEZONE;
  const now = new Date();
  let yy = Utilities.formatDate(now, tz, 'yy');
  let mm = Utilities.formatDate(now, tz, 'MM');
  let dd = Utilities.formatDate(now, tz, 'dd');

  const cleanDate = formatDateOnly(appointmentDateStr);
  if (cleanDate && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    yy = cleanDate.substring(2, 4);
    mm = cleanDate.substring(5, 7);
    dd = cleanDate.substring(8, 10);
  }

  const datePrefix = 'HN48' + yy + mm + dd;
  let maxSeqForDate = 0;
  if (ownerSheet && ownerSheet.getLastRow() > 1) {
    const rows = ownerSheet.getRange(2, 1, ownerSheet.getLastRow() - 1, 13).getValues();
    for (let i = 0; i < rows.length; i++) {
      const idStr = String(rows[i][0] || '').trim();
      const statusStr = String(rows[i][12] || '').trim();
      // นับเฉพาะเคสที่สถานะเป็น "ผ่าตัดเสร็จสิ้น" และมีรหัสขึ้นต้นด้วย HN48YYMMDD ของวันผ่าตัดนั้นๆ เท่านั้น (เริ่ม 001 ใหม่ทุกวัน ห้ามเอาวันอื่นมาต่อ)
      if (statusStr === 'ผ่าตัดเสร็จสิ้น' && idStr.indexOf(datePrefix) === 0 && /^HN48\d{9}$/.test(idStr)) {
        const num = parseInt(idStr.slice(-3), 10);
        if (!isNaN(num) && num > maxSeqForDate) {
          maxSeqForDate = num;
        }
      }
    }
  }

  const nextSeq = maxSeqForDate + 1;
  return datePrefix + ('000' + nextSeq).slice(-3);
}

/**
 * สร้างตารางอัตโนมัติ ล้างข้อมูลตัวอย่างเดิม และซ่อมแซมรูปแบบเวลา/ลำดับรหัส HN48 ให้เริ่มนับจาก 001 อย่างถูกต้อง
 */
function initDatabase() {
  const ss = getTargetSpreadsheet();

  let petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
  if (!petSheet) {
    petSheet = ss.insertSheet(CONFIG.SHEET_PETS);
    const petHeaders = [
      'รหัสคิว (Booking_ID)',           // 0
      'รหัสสัตว์ (Pet_ID)',             // 1
      'วันเวลาที่บันทึก (Created_At)',   // 2
      'ผู้บันทึก (Staff_Email)',         // 3
      'ชื่อ-สกุล เจ้าของสัตว์',          // 4
      'ที่อยู่เจ้าของสัตว์',             // 5
      'เบอร์โทรศัพท์',                  // 6
      'เลขบัตรประชาชน',                // 7
      'ชื่อสัตว์',                      // 8
      'ประเภท (มีเจ้าของ/จรจัด)',       // 9
      'ชนิด (สุนัข/แมว)',               // 10
      'เพศ (ผู้/เมีย)',                 // 11
      'อายุ (ปี)',                      // 12
      'อายุ (เดือน)',                   // 13
      'อายุรวม',                        // 14
      'พันธุ์',                         // 15
      'ตำหนิ/สี',                       // 16
      'วันที่จองคิว (YYYY-MM-DD)',       // 17
      'เวลาที่จองคิว',                  // 18
      'เดือนที่จองคิว (YYYY-MM)',        // 19
      'ประเภทราคา (ฟรี/ชำระเงิน)',      // 20
      'ราคา (บาท)',                     // 21
      'สถานะคิว'                        // 22
    ];
    petSheet.appendRow(petHeaders);
    petSheet.getRange(1, 1, 1, petHeaders.length)
      .setBackground('#0f766e')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    petSheet.setFrozenRows(1);
  }

  let ownerSheet = ss.getSheetByName(CONFIG.SHEET_OWNERS);
  if (!ownerSheet) {
    ownerSheet = ss.insertSheet(CONFIG.SHEET_OWNERS);
    const ownerHeaders = [
      'รหัสคิว (Booking_ID)',
      'วันเวลาที่บันทึก (Created_At)',
      'ผู้บันทึก (Staff_Email)',
      'ชื่อ-สกุล เจ้าของสัตว์',
      'ที่อยู่เจ้าของสัตว์',
      'เบอร์โทรศัพท์',
      'เลขบัตรประชาชน',
      'จำนวนสัตว์ (ตัว)',
      'สรุปรายการสัตว์',
      'วันนัดหมายหลัก',
      'เดือนที่นัดหมาย (YYYY-MM)',
      'รวมค่าบริการ (บาท)',
      'สถานะคิว'
    ];
    ownerSheet.appendRow(ownerHeaders);
    ownerSheet.getRange(1, 1, 1, ownerHeaders.length)
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    ownerSheet.setFrozenRows(1);
  }

  cleanDemoAndRepairDatabase(petSheet, ownerSheet);
}

/**
 * ลบข้อมูลตัวอย่าง 4 รายการแรก (ถ้าเคยถูกสร้างไว้) และจัดลำดับรหัส HN48 ของเคสจริงที่ผ่าตัดเสร็จสิ้นให้เริ่มจาก 001 เสมอ
 */
function cleanDemoAndRepairDatabase(petSheet, ownerSheet) {
  if (petSheet && petSheet.getLastRow() > 1) {
    const petData = petSheet.getDataRange().getValues();
    for (let i = petData.length - 1; i >= 1; i--) {
      const oName = String(petData[i][4] || '').trim();
      if (DEMO_OWNER_NAMES.indexOf(oName) !== -1) {
        petSheet.deleteRow(i + 1);
      }
    }
  }

  if (ownerSheet && ownerSheet.getLastRow() > 1) {
    const ownerData = ownerSheet.getDataRange().getValues();
    for (let j = ownerData.length - 1; j >= 1; j--) {
      const oName = String(ownerData[j][3] || '').trim();
      if (DEMO_OWNER_NAMES.indexOf(oName) !== -1) {
        ownerSheet.deleteRow(j + 1);
      }
    }
  }

  // ลบคิวที่ถูกบันทึกซ้ำกันโดยไม่ตั้งใจ (ชื่อเจ้าของ + เบอร์โทร + รายการสัตว์ + วันเวลานัด ตรงกันทุกประการในสถานะรอดำเนินการ)
  if (ownerSheet && ownerSheet.getLastRow() > 1) {
    const ownerData = ownerSheet.getDataRange().getValues();
    const seenSignatures = {};
    const duplicateBookingIds = {};
    for (let j = 1; j < ownerData.length; j++) {
      const bId = String(ownerData[j][0] || '').trim();
      const oName = String(ownerData[j][3] || '').trim();
      const oPhone = String(ownerData[j][5] || '').replace(/^'/, '').trim();
      const petSum = String(ownerData[j][8] || '').trim();
      const pDate = String(ownerData[j][9] || '').replace(/^'/, '').trim();
      const st = String(ownerData[j][12] || '').trim();
      if (st === 'รอดำเนินการ' && oName) {
        const sig = oName + '|' + oPhone + '|' + petSum + '|' + pDate;
        if (seenSignatures[sig]) {
          duplicateBookingIds[bId] = true;
        } else {
          seenSignatures[sig] = bId;
        }
      }
    }
    const dupIds = Object.keys(duplicateBookingIds);
    if (dupIds.length > 0) {
      for (let j = ownerData.length - 1; j >= 1; j--) {
        const bId = String(ownerData[j][0] || '').trim();
        if (duplicateBookingIds[bId]) {
          ownerSheet.deleteRow(j + 1);
        }
      }
      if (petSheet && petSheet.getLastRow() > 1) {
        const petData = petSheet.getDataRange().getValues();
        for (let i = petData.length - 1; i >= 1; i--) {
          const bId = String(petData[i][0] || '').trim();
          if (duplicateBookingIds[bId]) {
            petSheet.deleteRow(i + 1);
          }
        }
      }
    }
  }

  // ตรวจสอบและเรียงลำดับรหัส HN48YYMMDDXXX ของเคสที่ "ผ่าตัดเสร็จสิ้น" ให้เริ่มนับ 001 แยกตามแต่ละวันผ่าตัด (ห้ามเอาเลขของวันอื่นมาต่อกัน)
  if (ownerSheet && ownerSheet.getLastRow() > 1 && petSheet && petSheet.getLastRow() > 1) {
    const ownerData = ownerSheet.getDataRange().getValues();
    const petData = petSheet.getDataRange().getValues();
    const seqByDateKey = {};

    for (let j = 1; j < ownerData.length; j++) {
      const oldId = String(ownerData[j][0] || '').trim();
      const status = String(ownerData[j][12] || '').trim();

      if (status === 'ผ่าตัดเสร็จสิ้น') {
        let apptDate = '';
        for (let i = 1; i < petData.length; i++) {
          if (String(petData[i][0] || '').trim() === oldId) {
            apptDate = formatDateOnly(petData[i][17]);
            break;
          }
        }
        if (!apptDate) {
          apptDate = formatDateOnly(ownerData[j][9]);
        }
        let yy = '26', mm = '10', dd = '20';
        if (apptDate && /^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
          yy = apptDate.substring(2, 4);
          mm = apptDate.substring(5, 7);
          dd = apptDate.substring(8, 10);
        }
        const dateKey = yy + mm + dd;
        seqByDateKey[dateKey] = (seqByDateKey[dateKey] || 0) + 1;
        const seqForThisDay = seqByDateKey[dateKey];
        const expectedHnId = 'HN48' + dateKey + ('000' + seqForThisDay).slice(-3);

        if (oldId !== expectedHnId) {
          ownerSheet.getRange(j + 1, 1).setValue(expectedHnId);
          let pIdx = 1;
          for (let i = 1; i < petData.length; i++) {
            if (String(petData[i][0] || '').trim() === oldId) {
              petData[i][0] = expectedHnId;
              petSheet.getRange(i + 1, 1).setValue(expectedHnId);
              petSheet.getRange(i + 1, 2).setValue(expectedHnId + '-P' + pIdx++);
            }
          }
        }
      } else {
        if (/^HN48/.test(oldId)) {
          const waitId = 'WAIT-R' + j;
          ownerSheet.getRange(j + 1, 1).setValue(waitId);
          let pIdx = 1;
          for (let i = 1; i < petData.length; i++) {
            if (String(petData[i][0] || '').trim() === oldId) {
              petData[i][0] = waitId;
              petSheet.getRange(i + 1, 1).setValue(waitId);
              petSheet.getRange(i + 1, 2).setValue(waitId + '-P' + pIdx++);
            }
          }
        }
      }
    }
  }
}

/**
 * ดึงข้อมูลทั้งหมดสำหรับแสดงผลตอนเริ่มต้นและบน Dashboard
 */
function getInitialData() {
  initDatabase();
  const ss = getTargetSpreadsheet();
  const petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
  let userEmail = 'บุคลากรในองค์กร';
  try {
    userEmail = Session.getActiveUser().getEmail() || 'บุคลากรในองค์กร';
  } catch (e) {}

  let webAppUrl = '';
  try {
    webAppUrl = ScriptApp.getService().getUrl() || '';
  } catch (e) {}

  const values = petSheet.getDataRange().getValues();
  const bookingsMap = {};
  const bookingsList = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const bookingId = String(row[0] || '').trim();
    if (!bookingId) continue;

    if (!bookingsMap[bookingId]) {
      const bookingObj = {
        bookingId: bookingId,
        createdAt: formatCellDate(row[2]),
        staffEmail: String(row[3] || ''),
        ownerName: String(row[4] || ''),
        ownerAddress: String(row[5] || ''),
        phone: String(row[6] || '').replace(/^'/, ''),
        nationalId: String(row[7] || '').replace(/^'/, ''),
        status: String(row[22] || 'รอดำเนินการ').trim(),
        pets: []
      };
      bookingsMap[bookingId] = bookingObj;
      bookingsList.push(bookingObj);
    }

    const apptDate = formatDateOnly(row[17]);
    const apptTime = formatTimeOnly(row[18]);
    const apptMonth = String(row[19] || (apptDate ? apptDate.substring(0, 7) : '')).replace(/^'/, '').trim();
    const rowStatus = String(row[22] || 'รอดำเนินการ').trim();

    bookingsMap[bookingId].pets.push({
      petId: String(row[1] || ''),
      petName: String(row[8] || ''),
      ownershipType: String(row[9] || 'มีเจ้าของ'),
      species: String(row[10] || 'สุนัข'),
      gender: String(row[11] || 'ผู้'),
      ageYears: Number(row[12] || 0),
      ageMonths: Number(row[13] || 0),
      ageText: String(row[14] || ''),
      breed: String(row[15] || 'ผสม'),
      markings: String(row[16] || '-'),
      appointmentDate: apptDate,
      appointmentTime: apptTime,
      appointmentMonth: apptMonth,
      priceType: String(row[20] || 'ฟรี'),
      priceAmount: Number(row[21] || 0),
      petStatus: rowStatus
    });
  }

  return {
    userEmail: userEmail,
    spreadsheetUrl: ss.getUrl(),
    webAppUrl: webAppUrl,
    bookings: bookingsList.reverse()
  };
}

/**
 * บันทึกข้อมูลการจองคิวผ่าตัดทำหมันใหม่ (อิงเวลา Asia/Bangkok GMT+7)
 */
function saveBookingRecord(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    initDatabase();
    const ss = getTargetSpreadsheet();
    const petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
    const ownerSheet = ss.getSheetByName(CONFIG.SHEET_OWNERS);

    const now = new Date();
    const tz = CONFIG.TIMEZONE;
    const createdAtStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
    let userEmail = 'staff@dld.go.th';
    try {
      userEmail = Session.getActiveUser().getEmail() || 'staff@dld.go.th';
    } catch (e) {}

    const ownerName = String(payload.ownerName || '').trim();
    const ownerAddress = String(payload.ownerAddress || '').trim();
    const phone = String(payload.phone || '').trim();
    const nationalId = String(payload.nationalId || '').trim();
    const pets = Array.isArray(payload.pets) ? payload.pets : [];

    if (!ownerName || !ownerAddress || !phone || pets.length === 0) {
      throw new Error('กรุณากรอกข้อมูลของเจ้าของสัตว์และข้อมูลสัตว์อย่างน้อย 1 ตัวให้ครบถ้วน');
    }

    // ป้องกันการบันทึกซ้ำ (Idempotency Check): หากมีคิวรอดำเนินการของเจ้าของคนเดียวกัน เบอร์เดียวกัน และรายการสัตว์+วันเวลานัดตรงกันอยู่แล้ว ไม่ต้องสร้างแถวซ้ำ
    const checkSummaryParts = pets.map(function(pet) {
      return String(pet.petName || '').trim() + ' (' + String(pet.species || 'สุนัข') + '-' + String(pet.gender || 'ผู้') + ')';
    }).join(', ');
    const firstApptDate = formatDateOnly(pets[0].appointmentDate) || Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const firstApptTime = formatTimeOnly(pets[0].appointmentTime) || Utilities.formatDate(now, tz, 'HH:mm');
    const checkPrimaryDate = firstApptDate + ' ' + firstApptTime;

    if (ownerSheet && ownerSheet.getLastRow() > 1) {
      const existingOwners = ownerSheet.getDataRange().getValues();
      for (let j = existingOwners.length - 1; j >= 1; j--) {
        const exId = String(existingOwners[j][0] || '').trim();
        const exName = String(existingOwners[j][3] || '').trim();
        const exPhone = String(existingOwners[j][5] || '').replace(/^'/, '').trim();
        const exSum = String(existingOwners[j][8] || '').trim();
        const exDate = String(existingOwners[j][9] || '').replace(/^'/, '').trim();
        const exStatus = String(existingOwners[j][12] || '').trim();
        if (exStatus === 'รอดำเนินการ' && exName === ownerName && exPhone === phone && exSum === checkSummaryParts && exDate === checkPrimaryDate) {
          return {
            success: true,
            bookingId: exId,
            deduplicated: true,
            data: getInitialData()
          };
        }
      }
    }

    const bookingId = 'WAIT-' + Utilities.formatDate(now, tz, 'yyMMddHHmmss');

    let totalCost = 0;
    const petSummaryParts = [];
    let primaryDate = '';
    let primaryMonth = '';

    pets.forEach(function(pet, idx) {
      const petId = bookingId + '-P' + (idx + 1);
      const years = Number(pet.ageYears || 0);
      const months = Number(pet.ageMonths || 0);
      const ageText = years + ' ปี ' + months + ' เดือน';
      const apptDate = formatDateOnly(pet.appointmentDate) || Utilities.formatDate(now, tz, 'yyyy-MM-dd');
      const apptTime = formatTimeOnly(pet.appointmentTime) || Utilities.formatDate(now, tz, 'HH:mm');
      const apptMonth = apptDate ? apptDate.substring(0, 7) : Utilities.formatDate(now, tz, 'yyyy-MM');
      const priceType = String(pet.priceType || 'ฟรี');
      const priceAmount = priceType === 'ฟรี' ? 0 : Number(pet.priceAmount || 0);

      if (!primaryDate) {
        primaryDate = apptDate + ' ' + apptTime;
        primaryMonth = apptMonth;
      }

      totalCost += priceAmount;
      petSummaryParts.push(pet.petName + ' (' + pet.species + '-' + pet.gender + ')');

      petSheet.appendRow([
        bookingId,
        petId,
        "'" + createdAtStr,
        userEmail,
        ownerName,
        ownerAddress,
        "'" + phone,
        nationalId && nationalId !== '-' ? "'" + nationalId : '-',
        String(pet.petName || '').trim(),
        String(pet.ownershipType || 'มีเจ้าของ'),
        String(pet.species || 'สุนัข'),
        String(pet.gender || 'ผู้'),
        years,
        months,
        ageText,
        String(pet.breed || 'ผสม').trim(),
        String(pet.markings || '-').trim(),
        "'" + apptDate,
        "'" + apptTime,
        "'" + apptMonth,
        priceType,
        priceAmount,
        'รอดำเนินการ'
      ]);
    });

    ownerSheet.appendRow([
      bookingId,
      "'" + createdAtStr,
      userEmail,
      ownerName,
      ownerAddress,
      "'" + phone,
      nationalId && nationalId !== '-' ? "'" + nationalId : '-',
      pets.length,
      petSummaryParts.join(', '),
      "'" + primaryDate,
      "'" + primaryMonth,
      totalCost,
      'รอดำเนินการ'
    ]);

    return {
      success: true,
      bookingId: bookingId,
      data: getInitialData()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * แก้ไขข้อมูลการจองคิวเดิม
 */
function updateBookingRecord(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    initDatabase();
    const ss = getTargetSpreadsheet();
    const petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
    const ownerSheet = ss.getSheetByName(CONFIG.SHEET_OWNERS);
    const tz = CONFIG.TIMEZONE;
    const now = new Date();
    const updatedAtStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
    let userEmail = 'staff@dld.go.th';
    try {
      userEmail = Session.getActiveUser().getEmail() || 'staff@dld.go.th';
    } catch (e) {}

    const bookingId = String(payload.bookingId || '').trim();
    if (!bookingId) throw new Error('ไม่พบรหัสคิวที่ต้องการแก้ไข');

    const ownerName = String(payload.ownerName || '').trim();
    const ownerAddress = String(payload.ownerAddress || '').trim();
    const phone = String(payload.phone || '').trim();
    const nationalId = String(payload.nationalId || '').trim();
    const status = String(payload.status || 'รอดำเนินการ').trim();
    const pets = Array.isArray(payload.pets) ? payload.pets : [];

    const petData = petSheet.getDataRange().getValues();
    for (let i = petData.length - 1; i >= 1; i--) {
      if (String(petData[i][0]).trim() === bookingId) {
        petSheet.deleteRow(i + 1);
      }
    }

    const ownerData = ownerSheet.getDataRange().getValues();
    for (let j = ownerData.length - 1; j >= 1; j--) {
      if (String(ownerData[j][0]).trim() === bookingId) {
        ownerSheet.deleteRow(j + 1);
      }
    }

    let totalCost = 0;
    const petSummaryParts = [];
    let primaryDate = '';
    let primaryMonth = '';

    pets.forEach(function(pet, idx) {
      const petId = bookingId + '-P' + (idx + 1);
      const years = Number(pet.ageYears || 0);
      const months = Number(pet.ageMonths || 0);
      const ageText = years + ' ปี ' + months + ' เดือน';
      const apptDate = formatDateOnly(pet.appointmentDate) || Utilities.formatDate(now, tz, 'yyyy-MM-dd');
      const apptTime = formatTimeOnly(pet.appointmentTime) || Utilities.formatDate(now, tz, 'HH:mm');
      const apptMonth = apptDate ? apptDate.substring(0, 7) : Utilities.formatDate(now, tz, 'yyyy-MM');
      const priceType = String(pet.priceType || 'ฟรี');
      const priceAmount = priceType === 'ฟรี' ? 0 : Number(pet.priceAmount || 0);

      if (!primaryDate) {
        primaryDate = apptDate + ' ' + apptTime;
        primaryMonth = apptMonth;
      }

      totalCost += priceAmount;
      petSummaryParts.push(pet.petName + ' (' + pet.species + '-' + pet.gender + ')');

      petSheet.appendRow([
        bookingId,
        petId,
        "'" + updatedAtStr,
        userEmail,
        ownerName,
        ownerAddress,
        "'" + phone,
        nationalId && nationalId !== '-' ? "'" + nationalId : '-',
        String(pet.petName || '').trim(),
        String(pet.ownershipType || 'มีเจ้าของ'),
        String(pet.species || 'สุนัข'),
        String(pet.gender || 'ผู้'),
        years,
        months,
        ageText,
        String(pet.breed || 'ผสม').trim(),
        String(pet.markings || '-').trim(),
        "'" + apptDate,
        "'" + apptTime,
        "'" + apptMonth,
        priceType,
        priceAmount,
        status
      ]);
    });

    ownerSheet.appendRow([
      bookingId,
      "'" + updatedAtStr,
      userEmail,
      ownerName,
      ownerAddress,
      "'" + phone,
      nationalId && nationalId !== '-' ? "'" + nationalId : '-',
      pets.length,
      petSummaryParts.join(', '),
      "'" + primaryDate,
      "'" + primaryMonth,
      totalCost,
      status
    ]);

    return {
      success: true,
      bookingId: bookingId,
      data: getInitialData()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลบข้อมูลการจองคิวออกจากฐานข้อมูล Google Sheets (รองรับการลบทุกสถานะ รวมถึง "ยกเลิกคิว")
 */
function deleteBookingRecord(bookingId, ownerName, phone) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getTargetSpreadsheet();
    const petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
    const ownerSheet = ss.getSheetByName(CONFIG.SHEET_OWNERS);
    const targetId = String(bookingId || '').trim();
    const targetOwner = String(ownerName || '').trim();
    const targetPhone = String(phone || '').replace(/^'/, '').trim();

    let deletedPetRows = 0;
    if (petSheet && petSheet.getLastRow() > 1) {
      const petData = petSheet.getDataRange().getValues();
      for (let i = petData.length - 1; i >= 1; i--) {
        const rowId = String(petData[i][0] || '').trim();
        const rowOwner = String(petData[i][4] || '').trim();
        const rowPhone = String(petData[i][6] || '').replace(/^'/, '').trim();
        if ((targetId && rowId === targetId) || (targetOwner && rowOwner === targetOwner && (!targetPhone || rowPhone === targetPhone))) {
          petSheet.deleteRow(i + 1);
          deletedPetRows++;
        }
      }
    }

    if (ownerSheet && ownerSheet.getLastRow() > 1) {
      const ownerData = ownerSheet.getDataRange().getValues();
      for (let j = ownerData.length - 1; j >= 1; j--) {
        const rowId = String(ownerData[j][0] || '').trim();
        const rowOwner = String(ownerData[j][3] || '').trim();
        const rowPhone = String(ownerData[j][5] || '').replace(/^'/, '').trim();
        if ((targetId && rowId === targetId) || (targetOwner && rowOwner === targetOwner && (!targetPhone || rowPhone === targetPhone))) {
          ownerSheet.deleteRow(j + 1);
        }
      }
    }

    return {
      success: true,
      deletedCount: deletedPetRows,
      data: getInitialData()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * อัปเดตสถานะคิวผ่าตัดทำหมัน (รันรหัส HN48YYMMDDXXX เริ่มจาก 001 เฉพาะเมื่อยืนยัน "ผ่าตัดเสร็จสิ้น")
 */
function updateBookingStatus(bookingId, newStatus) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = getTargetSpreadsheet();
    const tz = CONFIG.TIMEZONE;
    const now = new Date();
    const petSheet = ss.getSheetByName(CONFIG.SHEET_PETS);
    const ownerSheet = ss.getSheetByName(CONFIG.SHEET_OWNERS);

    let assignedHnId = String(bookingId || '').trim();
    let appointmentDateForHn = '';

    if (petSheet && petSheet.getLastRow() > 1) {
      const petData = petSheet.getDataRange().getValues();
      for (let i = 1; i < petData.length; i++) {
        if (String(petData[i][0] || '').trim() === assignedHnId && !appointmentDateForHn) {
          appointmentDateForHn = formatDateOnly(petData[i][17]);
        }
      }
    }

    if (newStatus === 'ผ่าตัดเสร็จสิ้น' && !/^HN48\d{9}$/.test(assignedHnId)) {
      assignedHnId = generateHN48QueueId(appointmentDateForHn, ownerSheet);
    } else if (newStatus !== 'ผ่าตัดเสร็จสิ้น' && /^HN48/.test(assignedHnId)) {
      assignedHnId = 'WAIT-' + Utilities.formatDate(now, tz, 'yyMMddHHmmss');
    }

    if (petSheet && petSheet.getLastRow() > 1) {
      const petData = petSheet.getDataRange().getValues();
      let petIdx = 1;
      for (let i = 1; i < petData.length; i++) {
        if (String(petData[i][0] || '').trim() === String(bookingId || '').trim()) {
          if (assignedHnId !== String(bookingId || '').trim()) {
            petSheet.getRange(i + 1, 1).setValue(assignedHnId);
            petSheet.getRange(i + 1, 2).setValue(assignedHnId + '-P' + petIdx++);
          }
          petSheet.getRange(i + 1, 23).setValue(newStatus);
        }
      }
    }

    if (ownerSheet && ownerSheet.getLastRow() > 1) {
      const ownerData = ownerSheet.getDataRange().getValues();
      for (let j = 1; j < ownerData.length; j++) {
        if (String(ownerData[j][0] || '').trim() === String(bookingId || '').trim()) {
          if (assignedHnId !== String(bookingId || '').trim()) {
            ownerSheet.getRange(j + 1, 1).setValue(assignedHnId);
          }
          ownerSheet.getRange(j + 1, 13).setValue(newStatus);
        }
      }
    }

    cleanDemoAndRepairDatabase(petSheet, ownerSheet);

    return {
      success: true,
      assignedBookingId: assignedHnId,
      data: getInitialData()
    };
  } finally {
    lock.releaseLock();
  }
}

function formatCellDate(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  }
  return String(val).replace(/^'/, '').trim();
}

function formatDateOnly(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  const clean = String(val).replace(/^'/, '').trim();
  const m = clean.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return clean.substring(0, 10);
}

/**
 * แปลงค่าเวลาจาก Google Sheets (ป้องกันปัญหาแสดง Sat Dec 30 1899 10:00:00 GMT+0642)
 */
function formatTimeOnly(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).replace(/^'/, '').trim();
  const mSimple = str.match(/^(\d{1,2}):(\d{2})$/);
  if (mSimple) {
    return ('0' + mSimple[1]).slice(-2) + ':' + mSimple[2];
  }
  const mTimeInStr = str.match(/(\d{1,2}):(\d{2}):\d{2}/);
  if (mTimeInStr) {
    return ('0' + mTimeInStr[1]).slice(-2) + ':' + mTimeInStr[2];
  }
  if (Object.prototype.toString.call(val) === '[object Date]') {
    const hh = ('0' + val.getHours()).slice(-2);
    const mm = ('0' + val.getMinutes()).slice(-2);
    return hh + ':' + mm;
  }
  return str;
}
