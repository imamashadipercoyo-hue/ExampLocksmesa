/**
 * UJIAN LOCK SMESA — Google Sheets & Apps Script Database Connector
 * SMK NEGERI 1 JEMBER
 * Tagline: Ujian Tertib • Data Terpantau • Integritas Terjaga
 *
 * CARA DEPLOY:
 * 1. Buka Google Sheets baru (misal: "DB_UJIAN_LOCK_SMESA").
 * 2. Klik menu Ekstensi (Extensions) -> Apps Script.
 * 3. Hapus seluruh isi Code.gs lalu tempel kode ini.
 * 4. (Opsional) Di Project Settings -> Script Properties, tambahkan:
 *    SYNC_SECRET = <kata_sandi_sinkronisasi_rahasia_anda>
 * 5. Jalankan fungsi `setupSheets()` satu kali untuk membuat seluruh tab tabel otomatis.
 * 6. Klik Deploy -> New deployment -> Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Salin URL Web App (`https://script.google.com/macros/s/.../exec`) ke Dashboard Admin
 *    UJIAN LOCK SMESA -> menu "Google Sheet & Apps Script".
 */

var SHEET_SCHEMAS = {
  students: ['id', 'nis', 'nama', 'kelas', 'jurusan', 'status', 'updated_at'],
  exams: ['id', 'nama_ujian', 'mata_pelajaran', 'kelas', 'tanggal', 'jam_mulai', 'jam_selesai', 'durasi', 'google_form_url', 'status', 'created_at', 'updated_at'],
  exam_sessions: ['session_id', 'exam_id', 'student_id', 'started_at', 'ended_at', 'status', 'violation_count', 'current_token_id', 'last_activity', 'last_activity_at', 'unlocked_count', 'is_fullscreen'],
  tokens: ['id', 'code', 'exam_id', 'student_id', 'used_by_student_id', 'status', 'is_unlock_token', 'expires_at', 'issued_by', 'issued_by_role', 'issued_at', 'invalidated_at'],
  violations: ['id', 'session_id', 'exam_id', 'student_id', 'event_type', 'detail', 'violation_number', 'resulting_status', 'created_at'],
  activity_logs: ['id', 'session_id', 'exam_id', 'student_id', 'actor_name', 'actor_role', 'activity', 'created_at'],
  audit_logs: ['id', 'action', 'actor_name', 'actor_role', 'target_id', 'summary', 'created_at']
};

/**
 * Inisialisasi seluruh tab lembar kerja secara otomatis
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    var headers = SHEET_SCHEMAS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#0B1F3A')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
}

function verifySecret(providedSecret) {
  var expected = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!expected || expected.trim() === '') {
    return true; // Tidak disetel = mode terbuka untuk lab internal
  }
  return String(providedSecret || '') === String(expected);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheetAsObjects(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var hasValue = row.some(function (cell) { return cell !== '' && cell !== null; });
    if (!hasValue) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      obj[headers[j]] = val instanceof Date ? val.toISOString() : val;
    }
    rows.push(obj);
  }
  return rows;
}

function overwriteSheetFromObjects(sheetName, items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = SHEET_SCHEMAS[sheetName];
  if (!headers) return 0;

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();
  var rows = [headers];
  (items || []).forEach(function (item) {
    var line = headers.map(function (key) {
      var v = item[key];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    rows.push(line);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#0B1F3A')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  return (items || []).length;
}

/**
 * GET ?action=pull&secret=...
 * Menarik data Master Siswa & Ujian (serta status terbaru) dari Google Sheet ke sistem utama.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    if (!verifySecret(params.secret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized: SYNC_SECRET tidak cocok.' });
    }
    setupSheets();

    var action = params.action || 'pull';
    if (action === 'ping') {
      return jsonResponse({
        ok: true,
        app: 'UJIAN LOCK SMESA',
        school: 'SMK NEGERI 1 JEMBER',
        timestamp: new Date().toISOString()
      });
    }

    return jsonResponse({
      ok: true,
      timestamp: new Date().toISOString(),
      data: {
        students: readSheetAsObjects('students'),
        exams: readSheetAsObjects('exams')
      }
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

/**
 * POST JSON { action: "push", secret: "...", data: { students, exams, exam_sessions, tokens, violations, activity_logs, audit_logs } }
 * Menyimpan seluruh data realtime dari sistem utama ke masing-masing tab Google Sheet.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    if (!verifySecret(body.secret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized: SYNC_SECRET tidak cocok.' });
    }

    setupSheets();
    var data = body.data || {};
    var counts = {};

    Object.keys(SHEET_SCHEMAS).forEach(function (tableName) {
      if (Array.isArray(data[tableName])) {
        counts[tableName] = overwriteSheetFromObjects(tableName, data[tableName]);
      }
    });

    return jsonResponse({
      ok: true,
      synced_at: new Date().toISOString(),
      counts: counts
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
