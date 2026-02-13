// ============================================================
// Google Apps Script — RSVP API for Amino & Yasmeen Wedding
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Create a new Google Sheet
// 2. Name the first sheet "RSVPs" (exact spelling)
// 3. Add these headers in Row 1:
//    A1: ID | B1: Name | C1: Email | D1: Attendance | E1: Guests | F1: Dietary | G1: Message | H1: Created At
// 4. Go to Extensions > Apps Script
// 5. Delete any code in the editor, paste this entire file
// 6. Click Deploy > New deployment
// 7. Select type: "Web app"
// 8. Set "Execute as": Me
// 9. Set "Who has access": Anyone
// 10. Click Deploy, then copy the Web App URL
// 11. Paste that URL into admin.html and guestbook.html where it says GOOGLE_SCRIPT_URL
// ============================================================

const SHEET_NAME = "RSVPs";

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function getNextId() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(v => v !== "");
  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "rsvps";
  const callback = e && e.parameter && e.parameter.callback;
  var result;

  if (action === "comments") {
    result = getComments();
  } else if (action === "rsvp") {
    // RSVP submission via GET (works on Safari — GET survives the 302 redirect)
    result = addRsvp({
      name: e.parameter.name,
      email: e.parameter.email,
      attendance: e.parameter.attendance,
      guests: e.parameter.guests,
      dietary: e.parameter.dietary,
      message: e.parameter.message
    });
  } else if (action === "delete") {
    // Delete via GET (works on Safari)
    result = deleteRsvp(e.parameter.id);
  } else {
    result = getRsvps();
  }

  var json = JSON.stringify(result);

  // JSONP support: if a callback parameter is provided, wrap the JSON in a function call
  // This allows loading data via <script> tags, which bypasses CORS entirely
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // Support both JSON body (from admin delete) and form fields (from RSVP form)
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    // Fall back to standard form parameters (e.parameter)
    body = e.parameter || {};
  }

  var result;
  var action = body.action || "rsvp";

  if (action === "delete") {
    result = deleteRsvp(body.id);
  } else {
    result = addRsvp(body);
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function addRsvp(data) {
  const { name, email, attendance, guests, dietary, message } = data;

  if (!name || !email || !attendance) {
    return { error: "Name, email, and attendance are required." };
  }

  if (attendance !== "Joyfully Accept" && attendance !== "Regretfully Decline") {
    return { error: "Invalid attendance value." };
  }

  const guestCount = attendance === "Joyfully Accept" ? (parseInt(guests, 10) || 1) : 0;
  const id = getNextId();
  const createdAt = new Date().toISOString();

  const sheet = getSheet();
  sheet.appendRow([
    id,
    (name || "").trim(),
    (email || "").trim(),
    attendance,
    guestCount,
    (dietary || "").trim(),
    (message || "").trim(),
    createdAt
  ]);

  return { id: id, message: "RSVP saved successfully." };
}

function getRsvps() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return {
      stats: { total: 0, accepted: 0, declined: 0, total_guests: 0 },
      rsvps: []
    };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const rsvps = [];
  let accepted = 0, declined = 0, totalGuests = 0;

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    if (!row[1]) continue; // skip empty rows

    const rsvp = {
      id: row[0],
      name: row[1],
      email: row[2],
      attendance: row[3],
      guests: row[4],
      dietary: row[5],
      message: row[6],
      created_at: row[7] instanceof Date ? row[7].toISOString() : row[7]
    };

    rsvps.push(rsvp);

    if (rsvp.attendance === "Joyfully Accept") {
      accepted++;
      totalGuests += rsvp.guests || 0;
    } else {
      declined++;
    }
  }

  return {
    stats: {
      total: rsvps.length,
      accepted: accepted,
      declined: declined,
      total_guests: totalGuests
    },
    rsvps: rsvps
  };
}

function getComments() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return { comments: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const comments = [];

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    const message = (row[6] || "").toString().trim();
    if (message) {
      comments.push({
        name: row[1],
        message: message,
        created_at: row[7] instanceof Date ? row[7].toISOString() : row[7]
      });
    }
  }

  return { comments: comments };
}

function deleteRsvp(id) {
  if (!id) return { error: "ID is required." };

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { error: "RSVP not found." };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();

  for (let i = 0; i < ids.length; i++) {
    if (ids[i] == id) {
      sheet.deleteRow(i + 2); // +2 because row 1 is header, array is 0-indexed
      return { message: "RSVP deleted successfully." };
    }
  }

  return { error: "RSVP not found." };
}
