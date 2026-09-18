#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');

const DB_FILE = 'db.json';
const BACKUP_FILE = 'db.backup.json';
const IMAGES_DIR = 'images';
const PAGES_DIR = 'pages';

// ============================================================
// UTILITIES
// ============================================================

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { site: {}, exams: [], notifications: [] };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) {
    console.error('❌ db.json is corrupted. Fix it manually before running.');
    process.exit(1);
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function backupOnce() {
  if (fs.existsSync(DB_FILE) && !fs.existsSync(BACKUP_FILE)) {
    try { fs.copyFileSync(DB_FILE, BACKUP_FILE); console.log('📦 Backup: db.backup.json'); }
    catch (e) {}
  }
}

function slugify(str) {
  return String(str).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'item-' + Date.now();
}

function hr(title) {
  console.log('\n' + '─'.repeat(58));
  if (title) console.log('  ' + title);
  console.log('─'.repeat(58));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// IMAGE / FILE RESOLVER
// ============================================================

/**
 * Accepts either an https URL or a local file path.
 * - URL          → returned as-is
 * - Local file   → copied into ./images/ and relative path returned
 * - Empty        → returns null
 */
function resolveImage(input, nameHint) {
  if (!input) return null;
  const cleaned = String(input).trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;

  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  if (cleaned.startsWith(IMAGES_DIR + '/') && fs.existsSync(cleaned)) return cleaned;

  if (fs.existsSync(cleaned)) {
    ensureDir(IMAGES_DIR);
    const ext = path.extname(cleaned) || '.jpg';
    const destName = slugify(nameHint || 'img') + '-' + Date.now() + ext;
    const dest = path.join(IMAGES_DIR, destName);
    try {
      fs.copyFileSync(cleaned, dest);
      console.log(`   📁 Saved → ${dest}`);
      return dest;
    } catch (e) {
      console.log(`   ⚠️  Copy failed: ${e.message}`);
      return cleaned;
    }
  }

  return cleaned;
}

function copyHtmlToPages(htmlFilePath, nameHint) {
  const cleaned = String(htmlFilePath).trim().replace(/^["']|["']$/g, '');
  if (!fs.existsSync(cleaned)) { console.log(`❌ File not found: ${cleaned}`); return null; }
  ensureDir(PAGES_DIR);
  const dest = path.join(PAGES_DIR, slugify(nameHint) + '.html');
  fs.copyFileSync(cleaned, dest);
  return `${PAGES_DIR}/${slugify(nameHint)}.html`;
}

// ============================================================
// INTERACTIVE HELPERS
// ============================================================

function askImageInput(label) {
  console.log(`\n🖼️  ${label} (thumbnail)`);
  console.log('   → Paste image URL  (e.g. https://i.imgur.com/x.jpg)');
  console.log('   → Or local path    (e.g. /sdcard/Pictures/ssc.jpg)');
  console.log('   → Press ENTER to skip');
  const input = readline.question('   > ').trim();
  if (!input) return null;
  return resolveImage(input, label);
}

function readMultiLine(promptText) {
  console.log(`\n${promptText}`);
  console.log("   (Write lines one by one. Type 'DONE' on a new line to finish.)");
  const lines = [];
  while (true) {
    const line = readline.question('   > ');
    if (line.trim().toUpperCase() === 'DONE') break;
    lines.push(line);
  }
  return lines.join(' ').replace(/(\r\n|\n|\r)/gm, ' ').trim();
}

function confirmTwice(label) {
  console.log(`\n⚠️  About to DELETE: ${label}`);
  if (!readline.keyInYN('   Confirmation 1/2 — Continue?')) return false;
  if (!readline.keyInYN('   ⚠️  FINAL confirmation 2/2 — Really delete?')) return false;
  return true;
}

// ============================================================
// MIGRATION: legacy "courses" → new "exams"
// ============================================================

function migrateIfNeeded(db) {
  const legacyCount = (db.courses || []).length;
  if (legacyCount === 0) return false;

  const hasNew = (db.exams || []).length > 0;

  if (hasNew) {
    console.log(`\n⚠️  Found ${legacyCount} legacy course(s) AND ${db.exams.length} exam(s).`);
    if (!readline.keyInYN('   Merge legacy courses into exams?')) return false;
  } else {
    console.log(`\n🔄 Converting ${legacyCount} legacy course(s) → exams structure...`);
  }

  if (!db.exams) db.exams = [];

  db.courses.forEach(c => {
    db.exams.push({
      name: c.name || 'Untitled',
      icon: c.icon || 'graduation-cap',
      image: c.image || c.cover || null,
      directLink: c.directLink || null,
      subjects: (c.subjects || []).map(s => ({
        name: s.name || 'Untitled',
        image: s.image || null,
        'CHAPTERS': s.CHAPTERS || [],
        'WEEKLY TESTS': s['WEEKLY TESTS'] || []
      })),
      coachings: []
    });
  });

  delete db.courses;
  saveDB(db);
  console.log(`✅ Migrated ${legacyCount} course(s) into exams.`);
  return true;
}

// ============================================================
// SITE SETTINGS
// ============================================================

function manageSiteSettings(db) {
  hr('SITE SETTINGS');
  console.log(`   Current site image: ${db.site?.image || '(not set)'}`);

  const opts = ['🖼️  Set / change site image', '🗑️  Clear site image'];
  const idx = readline.keyInSelect(opts, 'Choose:');
  if (idx === -1) return;

  if (idx === 0) {
    const img = askImageInput('Site image');
    if (!img) { console.log('❌ Cancelled.'); return; }
    if (!db.site) db.site = {};
    db.site.image = img;
    saveDB(db);
    console.log(`✅ Site image set → ${img}`);
  } else if (idx === 1) {
    if (db.site) db.site.image = null;
    saveDB(db);
    console.log('✅ Site image cleared.');
  }
}

// ============================================================
// ADD / UPDATE CONTENT (main content flow)
// ============================================================

function addNewOrUpdate(db) {
  hr('ADD / UPDATE CONTENT');
  const exams = db.exams || [];
  const names = exams.map(e => `${e.name}  (${(e.subjects||[]).length} sub · ${(e.coachings||[]).length} inst)`);
  names.push('➕ ADD NEW EXAM');

  const idx = readline.keyInSelect(names, 'Select an exam:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addNewExam(db); return; }
  manageExam(db, exams[idx]);
}

// ---------- Add new exam ----------

function addNewExam(db) {
  hr('ADD NEW EXAM');
  const name = readline.question('Exam name (e.g. SSC, JEE, NEET): ').trim().toUpperCase();
  if (!name) { console.log('❌ Cancelled.'); return; }

  console.log('\n💡 Common icons: landmark, train, atom, dna, brain, bank, shield,');
  console.log('   graduation-cap, book, flask, language, earth, laptop-code');
  const icon = readline.question('Icon name [graduation-cap]: ').trim() || 'graduation-cap';

  const image = askImageInput('Exam thumbnail');

  console.log('\nMode:');
  const modes = [
    'Full hierarchy (Subjects / Coachings)',
    'Direct Link (redirect to URL)',
    'HTML File (self-hosted page)'
  ];
  const modeIdx = readline.keyInSelect(modes, 'Choose:');
  if (modeIdx === -1) return;

  const exam = { name, icon, image: image || null, subjects: [], coachings: [] };

  if (modeIdx === 1) {
    const link = readline.question('Redirect URL: ').trim();
    if (!link) { console.log('❌ URL required.'); return; }
    exam.directLink = link;
  } else if (modeIdx === 2) {
    const p = readline.question('HTML file path: ').trim();
    const rel = copyHtmlToPages(p, name);
    if (!rel) return;
    exam.directLink = rel;
  }

  if (!db.exams) db.exams = [];
  db.exams.push(exam);
  saveDB(db);
  console.log(`\n✅ Exam "${name}" added.`);
}

// ---------- Manage existing exam ----------

function manageExam(db, exam) {
  hr(`Exam: ${exam.name}`);
  const subC = (exam.subjects || []).length;
  const coaC = (exam.coachings || []).length;
  console.log(`   ${subC} subjects · ${coaC} coachings · directLink: ${exam.directLink ? 'yes' : 'no'}`);

  const opts = [
    '📚 By Subject',
    '🏫 By Institution (Coaching)',
    '✏️  Edit Exam (name / icon / image)',
    '🔗 Set / Change Direct Redirect',
    '🗑️  Delete this Exam'
  ];
  const idx = readline.keyInSelect(opts, 'Choose:');
  if (idx === -1) return;
  if (idx === 0) bySubjectFlow(db, exam);
  else if (idx === 1) byInstitutionFlow(db, exam);
  else if (idx === 2) editExam(db, exam);
  else if (idx === 3) setDirectLink(db, exam);
  else if (idx === 4) deleteExam(db, exam);
}

function bySubjectFlow(db, exam) {
  const subjects = exam.subjects || [];
  const names = subjects.map(s => `${s.name}  (${(s.CHAPTERS||[]).length} ch · ${(s['WEEKLY TESTS']||[]).length} tests)`);
  names.push('➕ ADD NEW SUBJECT');

  const idx = readline.keyInSelect(names, 'Subjects:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addSubject(db, exam); return; }
  manageContainer(db, exam, subjects[idx], 'subject');
}

function byInstitutionFlow(db, exam) {
  const coachings = exam.coachings || [];
  const names = coachings.map(s => `${s.name}  (${(s.CHAPTERS||[]).length} ch · ${(s['WEEKLY TESTS']||[]).length} tests)`);
  names.push('➕ ADD NEW COACHING / INSTITUTION');

  const idx = readline.keyInSelect(names, 'Coachings:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addCoaching(db, exam); return; }
  manageContainer(db, exam, coachings[idx], 'coaching');
}

// ---------- Add subject / coaching ----------

function addSubject(db, exam) {
  hr(`Add Subject → ${exam.name}`);
  const name = readline.question('Subject name: ').trim().toUpperCase();
  if (!name) { console.log('❌ Cancelled.'); return; }
  const image = askImageInput('Subject thumbnail');

  if (!exam.subjects) exam.subjects = [];
  exam.subjects.push({ name, image: image || null, CHAPTERS: [], 'WEEKLY TESTS': [] });
  saveDB(db);
  console.log(`✅ Subject "${name}" added.`);
}

function addCoaching(db, exam) {
  hr(`Add Coaching → ${exam.name}`);
  const name = readline.question('Coaching / Institution name: ').trim().toUpperCase();
  if (!name) { console.log('❌ Cancelled.'); return; }
  const image = askImageInput('Coaching thumbnail');

  if (!exam.coachings) exam.coachings = [];
  exam.coachings.push({ name, image: image || null, CHAPTERS: [], 'WEEKLY TESTS': [] });
  saveDB(db);
  console.log(`✅ Coaching "${name}" added.`);
}

// ---------- Manage a subject or coaching ----------

function manageContainer(db, exam, container, kind) {
  hr(`${container.name} — ${kind}`);
  const opts = [
    '📖 Add / Update Chapters',
    '📝 Add / Update Mock Tests',
    '✏️  Edit name / image',
    '🔗 Set / Change Direct Redirect',
    `🗑️  Delete this ${kind}`
  ];
  const idx = readline.keyInSelect(opts, 'Choose:');
  if (idx === -1) return;
  if (idx === 0) addChapterOrTest(db, container, 'CHAPTERS');
  else if (idx === 1) addChapterOrTest(db, container, 'WEEKLY TESTS');
  else if (idx === 2) editContainer(db, container, kind);
  else if (idx === 3) setContainerDirectLink(db, container);
  else if (idx === 4) deleteContainer(db, exam, container, kind);
}

function editContainer(db, container, kind) {
  console.log(`\nEditing ${kind}: ${container.name}`);
  const name = readline.question(`New name [${container.name}]: `).trim().toUpperCase() || container.name;
  container.name = name;

  console.log(`Current image: ${container.image || '(none)'}`);
  if (readline.keyInYN('   Change image?')) {
    const img = askImageInput(`${kind} thumbnail`);
    if (img) container.image = img;
  }
  saveDB(db);
  console.log('✅ Updated.');
}

function setContainerDirectLink(db, container) {
  console.log(`\n🔗 Direct redirect for: ${container.name}`);
  console.log(`   Current: ${container.directLink || '(none)'}`);
  const link = readline.question('   New URL (blank = remove): ').trim();
  if (link) container.directLink = link;
  else delete container.directLink;
  saveDB(db);
  console.log('✅ Updated.');
}

function deleteContainer(db, exam, container, kind) {
  if (!confirmTwice(`${kind} "${container.name}"`)) { console.log('❌ Cancelled.'); return; }
  const arr = kind === 'subject' ? exam.subjects : exam.coachings;
  const i = arr.indexOf(container);
  if (i >= 0) arr.splice(i, 1);
  saveDB(db);
  console.log(`🗑️  ${kind} deleted.`);
}

// ---------- Chapters / Mock Tests ----------

function addChapterOrTest(db, container, cat) {
  const list = container[cat] || [];
  const titles = list.map(i => i.title);
  titles.push('➕ ADD NEW');

  const idx = readline.keyInSelect(titles, `Select ${cat} item:`);
  if (idx === -1) return;

  const isNew = idx === titles.length - 1;
  const existing = isNew ? null : list[idx];

  let title;
  if (isNew) {
    title = readline.question('Title: ').trim();
    if (!title) { console.log('❌ Cancelled.'); return; }
  } else {
    console.log(`\nEditing: ${existing.title}`);
    title = readline.question(`New title [${existing.title}]: `).trim() || existing.title;
  }

  let url = existing?.url || null;
  console.log(`\n📺 Lecture link or HTML code`);
  console.log(`   (leave blank to keep existing${existing?.url ? ' — currently set' : ''}; type SKIP to clear)`);
  const lectureInput = readMultiLine('   Lecture input:');
  if (lectureInput && lectureInput.toUpperCase() === 'SKIP') url = null;
  else if (lectureInput) url = lectureInput;

  let download_url = existing?.download_url || null;
  if (url && url.includes('<')) {
    const dl = readline.question(`Download link [${download_url || 'none'}]: `).trim();
    if (dl) download_url = dl;
  }

  const notes_en = readline.question(`English Notes [${existing?.notes_en || 'none'}]: `).trim() || existing?.notes_en || null;
  const notes_hi = readline.question(`Hindi Notes [${existing?.notes_hi || 'none'}]: `).trim() || existing?.notes_hi || null;
  const quiz     = readline.question(`Quiz [${existing?.quiz || 'none'}]: `).trim() || existing?.quiz || null;
  const ppt      = readline.question(`PPT / Other [${existing?.handwritten || 'none'}]: `).trim() || existing?.handwritten || null;

  const newItem = {
    title,
    url: url || null,
    download_url: download_url || null,
    notes_en: notes_en || null,
    notes_hi: notes_hi || null,
    quiz: quiz || null,
    handwritten: ppt || null
  };

  if (isNew) { if (!container[cat]) container[cat] = []; container[cat].push(newItem); }
  else container[cat][idx] = newItem;

  saveDB(db);
  console.log(`\n✅ ${cat} "${title}" ${isNew ? 'added' : 'updated'}.`);
}

// ---------- Edit exam metadata ----------

function editExam(db, exam) {
  hr(`Edit: ${exam.name}`);
  const name = readline.question(`New name [${exam.name}]: `).trim().toUpperCase() || exam.name;
  const icon = readline.question(`Icon [${exam.icon || 'graduation-cap'}]: `).trim() || exam.icon || 'graduation-cap';

  exam.name = name;
  exam.icon = icon;

  console.log(`Current image: ${exam.image || '(none)'}`);
  if (readline.keyInYN('   Change image?')) {
    const img = askImageInput('Exam thumbnail');
    if (img) exam.image = img;
  }

  saveDB(db);
  console.log('✅ Exam updated.');
}

function setDirectLink(db, exam) {
  hr(`Direct redirect for: ${exam.name}`);
  console.log(`   Current: ${exam.directLink || '(none)'}`);
  const link = readline.question('   New URL (blank = remove): ').trim();
  if (link) exam.directLink = link;
  else delete exam.directLink;
  saveDB(db);
  console.log('✅ Updated.');
}

function deleteExam(db, exam) {
  if (!confirmTwice(`Exam "${exam.name}" (with all subjects/coachings)`)) { console.log('❌ Cancelled.'); return; }
  const i = db.exams.indexOf(exam);
  if (i >= 0) db.exams.splice(i, 1);
  saveDB(db);
  console.log(`🗑️  Exam deleted.`);
}

// ============================================================
// MANAGE / DELETE (standalone delete menu)
// ============================================================

function manageData(db) {
  hr('MANAGE / DELETE DATA');
  const opts = [
    '🗑️  Delete an Exam',
    '🗑️  Delete a Subject',
    '🗑️  Delete a Coaching',
    '🗑️  Delete a Chapter / Test'
  ];
  const idx = readline.keyInSelect(opts, 'Choose:');
  if (idx === -1) return;
  if (idx === 0) standaloneDeleteExam(db);
  else if (idx === 1) standaloneDeleteContainer(db, 'subjects');
  else if (idx === 2) standaloneDeleteContainer(db, 'coachings');
  else if (idx === 3) standaloneDeleteChapter(db);
}

function standaloneDeleteExam(db) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('❌ No exams.'); return; }
  const idx = readline.keyInSelect(exams.map(e => e.name), 'Exam to delete:');
  if (idx === -1) return;
  const exam = exams[idx];
  if (!confirmTwice(`Exam "${exam.name}"`)) { console.log('❌ Cancelled.'); return; }
  db.exams.splice(idx, 1);
  saveDB(db);
  console.log('🗑️  Exam deleted.');
}

function standaloneDeleteContainer(db, key) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('❌ No exams.'); return; }

  const eIdx = readline.keyInSelect(exams.map(e => e.name), 'Exam:');
  if (eIdx === -1) return;
  const exam = exams[eIdx];
  const list = exam[key] || [];
  if (list.length === 0) { console.log(`❌ No ${key}.`); return; }

  const sIdx = readline.keyInSelect(list.map(s => s.name), `Select ${key}:`);
  if (sIdx === -1) return;
  const item = list[sIdx];

  if (!confirmTwice(`${key} "${item.name}"`)) { console.log('❌ Cancelled.'); return; }
  list.splice(sIdx, 1);
  saveDB(db);
  console.log(`🗑️  Deleted.`);
}

function standaloneDeleteChapter(db) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('❌ No exams.'); return; }

  const eIdx = readline.keyInSelect(exams.map(e => e.name), 'Exam:');
  if (eIdx === -1) return;
  const exam = exams[eIdx];

  const allContainers = [
    ...(exam.subjects || []).map(s => ({ label: '📚 ' + s.name, ref: s })),
    ...(exam.coachings || []).map(s => ({ label: '🏫 ' + s.name, ref: s }))
  ];
  if (allContainers.length === 0) { console.log('❌ No subjects or coachings.'); return; }

  const cIdx = readline.keyInSelect(allContainers.map(c => c.label), 'Pick subject / coaching:');
  if (cIdx === -1) return;
  const container = allContainers[cIdx].ref;

  const catIdx = readline.keyInSelect(['CHAPTERS', 'WEEKLY TESTS'], 'Category:');
  if (catIdx === -1) return;
  const cat = catIdx === 0 ? 'CHAPTERS' : 'WEEKLY TESTS';

  const list = container[cat] || [];
  if (list.length === 0) { console.log('❌ Nothing to delete.'); return; }

  const iIdx = readline.keyInSelect(list.map(i => i.title), 'Item to delete:');
  if (iIdx === -1) return;

  if (!confirmTwice(`"${list[iIdx].title}" from ${cat}`)) { console.log('❌ Cancelled.'); return; }
  list.splice(iIdx, 1);
  saveDB(db);
  console.log('🗑️  Deleted.');
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function addNotification(db) {
  hr('ADD NOTIFICATION');
  const tag = readline.question('Tag [UPDATE]: ').trim().toUpperCase() || 'UPDATE';

  console.log('\n📝 Message (multi-line, end with DONE):');
  const message = readMultiLine('   Message input:');
  if (!message) { console.log('❌ Message required.'); return; }

  console.log('\n🔗 Optional link — where should this open when tapped?');
  const link = readline.question('   Link URL (blank = no link): ').trim();

  let linkText = null;
  if (link) linkText = readline.question('   Link text [Open link]: ').trim() || 'Open link';

  const notif = {
    tag,
    message,
    date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  };
  if (link) { notif.link = link; notif.linkText = linkText; }

  if (!db.notifications) db.notifications = [];
  db.notifications.push(notif);
  saveDB(db);

  console.log('\n✅ Notification added.');
  if (link) console.log(`   🔗 Links to: ${link}`);
}

function deleteNotification(db) {
  const list = db.notifications || [];
  if (list.length === 0) { console.log('❌ No notifications.'); return; }

  const preview = list.map(n => `[${n.tag || 'UPDATE'}] ${(n.message || '').slice(0, 45)}...`);
  const idx = readline.keyInSelect(preview, 'Notification to delete:');
  if (idx === -1) return;

  const target = list[idx];
  if (!confirmTwice(`Notification: "${(target.message || '').slice(0, 60)}..."`)) {
    console.log('❌ Cancelled.');
    return;
  }
  list.splice(idx, 1);
  saveDB(db);
  console.log('🗑️  Notification deleted.');
}

// ============================================================
// MAIN
// ============================================================

function printSummary(db) {
  const e = (db.exams || []).length;
  const n = (db.notifications || []).length;
  const img = db.site?.image ? '✅' : '—';
  console.log(`   Exams: ${e}  |  Notifications: ${n}  |  Site image: ${img}`);
}

function main() {
  backupOnce();

  while (true) {
    const db = loadDB();
    migrateIfNeeded(db);

    hr('VIVID ACADEMY — CONTENT MANAGER');
    printSummary(db);

    const opts = [
      '📚 Add / Update Content',
      '🗑️  Manage / Delete Data',
      '🔔 Add Notification',
      '❌ Delete Notifications',
      '⚙️  Site Settings',
      '🚪 Exit'
    ];
    const idx = readline.keyInSelect(opts, 'What do you want to do?');

    if (idx === 0) addNewOrUpdate(db);
    else if (idx === 1) manageData(db);
    else if (idx === 2) addNotification(db);
    else if (idx === 3) deleteNotification(db);
    else if (idx === 4) manageSiteSettings(db);
    else break;
  }

  console.log('\n👋 Done.\n');
}

main();
