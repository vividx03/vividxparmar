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
  if (!fs.existsSync(DB_FILE)) {
    return { site: {}, exams: [], notifications: [], _legacy_courses: [] };
  }
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) {
    console.error('\n❌ db.json is corrupted. Fix it manually before running.\n');
    process.exit(1);
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function backupOnce() {
  if (fs.existsSync(DB_FILE) && !fs.existsSync(BACKUP_FILE)) {
    try { fs.copyFileSync(DB_FILE, BACKUP_FILE); }
    catch (e) {}
  }
}

function slugify(str) {
  return String(str).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'item-' + Date.now();
}

function hr(title) {
  console.log('\n' + '═'.repeat(58));
  if (title) console.log('  ' + title);
  console.log('═'.repeat(58));
}

function sub(title) {
  console.log('\n' + '─'.repeat(58));
  if (title) console.log('  ' + title);
  console.log('─'.repeat(58));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pause() {
  readline.question('\n   Press ENTER to continue...');
}

// ============================================================
// IMAGE / FILE RESOLVER
// ============================================================

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
  if (!fs.existsSync(cleaned)) { console.log(`\n❌ File not found: ${cleaned}`); return null; }
  ensureDir(PAGES_DIR);
  const dest = path.join(PAGES_DIR, slugify(nameHint) + '.html');
  fs.copyFileSync(cleaned, dest);
  return `${PAGES_DIR}/${slugify(nameHint)}.html`;
}

// ============================================================
// INTERACTIVE HELPERS
// ============================================================

function askImageInput(label) {
  console.log(`\n🖼️  ${label} — thumbnail (optional)`);
  console.log('   → Paste an image URL  (https://...)');
  console.log('   → Or a local file path  (/sdcard/Pictures/x.jpg)');
  console.log('   → Press ENTER to skip');
  const input = readline.question('   > ').trim();
  if (!input) return null;
  return resolveImage(input, label);
}

function readMultiLine(promptText) {
  console.log(`\n${promptText}`);
  console.log("   (Type each line, then 'DONE' on a new line to finish.)");
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
// MENU HELPERS (cleaner cancel option)
// ============================================================

function menuSelect(options, prompt) {
  // Always append "Cancel" at the end and shift selection back.
  const opts = [...options, '↩  Cancel / Back'];
  const idx = readline.keyInSelect(opts, prompt);
  if (idx === -1 || idx === opts.length - 1) return -1;
  return idx;
}

// ============================================================
// LEGACY MIGRATION
// ============================================================

function detectLegacy(db) {
  return (db.courses || []).length > 0 || (db._legacy_courses || []).length > 0;
}

function getLegacyCourses(db) {
  if (db.courses && db.courses.length) return db.courses;
  if (db._legacy_courses && db._legacy_courses.length) return db._legacy_courses;
  return [];
}

// ============================================================
// SITE SETTINGS
// ============================================================

function manageSiteSettings(db) {
  hr('SITE SETTINGS');
  console.log(`   Current site image: ${db.site?.image || '(not set)'}`);

  const idx = menuSelect(
    ['🖼️  Set / change site image', '🗑️  Clear site image'],
    'Choose action:'
  );
  if (idx === -1) return;

  if (idx === 0) {
    const img = askImageInput('Site image');
    if (!img) { console.log('\n❌ Cancelled.'); return; }
    if (!db.site) db.site = {};
    db.site.image = img;
    saveDB(db);
    console.log(`\n✅ Site image set → ${img}`);
  } else if (idx === 1) {
    if (db.site) db.site.image = null;
    saveDB(db);
    console.log('\n✅ Site image cleared.');
  }
}

// ============================================================
// MANAGE PREVIOUS COURSES (LEGACY PATH)
// ============================================================

function manageLegacyCourses(db) {
  hr('MANAGE PREVIOUS COURSES  (Legacy)');

  const legacy = getLegacyCourses(db);

  if (legacy.length === 0) {
    console.log('\n   ✅ No legacy courses found.');
    console.log('   Nothing to migrate — everything already in the new format.');
    pause();
    return;
  }

  console.log(`\n   Found ${legacy.length} legacy course(s):\n`);
  legacy.forEach((c, i) => {
    const subCount = (c.subjects || []).length;
    const linkFlag = c.directLink ? ' 🔗' : '';
    console.log(`   ${i + 1}. ${c.name}  —  ${subCount} subject(s)${linkFlag}`);
  });

  console.log('\n   What would you like to do?');

  const idx = menuSelect(
    [
      '🔄 Convert ALL legacy courses → exams structure',
      '👁️  Just view a legacy course',
      '🗑️  Delete a legacy course',
      '🗑️  Delete ALL legacy courses'
    ],
    'Choose:'
  );
  if (idx === -1) return;

  if (idx === 0) migrateAllLegacy(db);
  else if (idx === 1) viewLegacy(db, legacy);
  else if (idx === 2) deleteOneLegacy(db, legacy);
  else if (idx === 3) deleteAllLegacy(db);
}

function migrateAllLegacy(db) {
  const legacy = getLegacyCourses(db);
  if (legacy.length === 0) { console.log('\n❌ Nothing to migrate.'); return; }

  if (!db.exams) db.exams = [];

  console.log(`\n🔄 Migrating ${legacy.length} legacy course(s)...`);

  let migrated = 0;
  let skipped = 0;

  legacy.forEach(c => {
    const exists = db.exams.some(e => e.name === c.name);
    if (exists) {
      console.log(`   ⏭️  Skipped "${c.name}" — already exists in exams`);
      skipped++;
      return;
    }

    db.exams.push({
      name: c.name || 'Untitled',
      icon: c.icon || 'graduation-cap',
      image: c.image || c.cover || null,
      directLink: c.directLink || null,
      subjects: (c.subjects || []).map(s => ({
        name: s.name || 'Untitled',
        image: s.image || null,
        directLink: s.directLink || null,
        'CHAPTERS': s.CHAPTERS || [],
        'WEEKLY TESTS': s['WEEKLY TESTS'] || []
      })),
      coachings: []
    });
    console.log(`   ✅ Migrated: ${c.name}`);
    migrated++;
  });

  // Clear legacy data
  delete db.courses;
  db._legacy_courses = [];

  saveDB(db);
  console.log(`\n🎉 Done — ${migrated} migrated, ${skipped} skipped.`);
  pause();
}

function viewLegacy(db, legacy) {
  const names = legacy.map(c => c.name || 'Untitled');
  const idx = menuSelect(names, 'Pick a course to view:');
  if (idx === -1) return;

  const c = legacy[idx];
  console.log(`\n📚 ${c.name}`);
  console.log(`   Teacher: ${c.teacher || '(none)'}`);
  console.log(`   Image:   ${c.image || c.cover || '(none)'}`);
  console.log(`   Direct:  ${c.directLink || '(none)'}`);
  console.log(`   Subjects (${(c.subjects || []).length}):`);
  (c.subjects || []).forEach((s, i) => {
    const ch = (s.CHAPTERS || []).length;
    const ts = (s['WEEKLY TESTS'] || []).length;
    console.log(`     ${i + 1}. ${s.name}  —  ${ch} ch · ${ts} tests`);
  });
  pause();
}

function deleteOneLegacy(db, legacy) {
  const names = legacy.map(c => c.name || 'Untitled');
  const idx = menuSelect(names, 'Pick a course to DELETE:');
  if (idx === -1) return;

  const c = legacy[idx];
  if (!confirmTwice(`Legacy course "${c.name}"`)) {
    console.log('\n❌ Cancelled.');
    return;
  }

  const source = db.courses && db.courses.length ? db.courses : db._legacy_courses;
  const i = source.indexOf(c);
  if (i >= 0) source.splice(i, 1);
  saveDB(db);
  console.log(`\n🗑️  Legacy course "${c.name}" deleted.`);
  pause();
}

function deleteAllLegacy(db) {
  const legacy = getLegacyCourses(db);
  if (legacy.length === 0) return;

  if (!confirmTwice(`ALL ${legacy.length} legacy course(s)`)) {
    console.log('\n❌ Cancelled.');
    return;
  }

  delete db.courses;
  db._legacy_courses = [];
  saveDB(db);
  console.log(`\n🗑️  All legacy courses deleted.`);
  pause();
}

// ============================================================
// ADD / UPDATE CONTENT  (ONLY new exams hierarchy)
// ============================================================

function addNewOrUpdate(db) {
  hr('ADD / UPDATE CONTENT');

  const exams = db.exams || [];

  if (exams.length === 0) {
    console.log('\n   No exams yet. Let\'s create one.\n');
    addNewExam(db);
    return;
  }

  const names = exams.map(e => {
    const s = (e.subjects || []).length;
    const c = (e.coachings || []).length;
    return `${e.name}  ·  ${s} sub · ${c} inst`;
  });
  names.push('➕  ADD NEW EXAM');

  const idx = menuSelect(names, 'Select an exam:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addNewExam(db); return; }

  manageExam(db, exams[idx]);
}

// ---------- Add new exam ----------

function addNewExam(db) {
  hr('ADD NEW EXAM');

  const name = readline.question('   Exam name (e.g. SSC, JEE, NEET): ').trim().toUpperCase();
  if (!name) { console.log('\n❌ Cancelled.'); return; }

  const exists = (db.exams || []).some(e => e.name === name);
  if (exists) {
    console.log(`\n❌ Exam "${name}" already exists.`);
    pause();
    return;
  }

  console.log('\n💡 Common icons: landmark · train · atom · dna · brain · bank ·');
  console.log('   shield · graduation-cap · book · flask · language · earth · laptop-code');
  const icon = readline.question('   Icon name [graduation-cap]: ').trim() || 'graduation-cap';

  const image = askImageInput('Exam thumbnail');

  console.log('\nMode:');
  const modeIdx = menuSelect(
    [
      '📚 Full hierarchy (Subjects / Coachings)',
      '🔗 Direct Link (redirect to URL)',
      '📄 HTML File (self-hosted page)'
    ],
    'Choose mode:'
  );
  if (modeIdx === -1) return;

  const exam = { name, icon, image: image || null, subjects: [], coachings: [] };

  if (modeIdx === 1) {
    const link = readline.question('\n   Redirect URL: ').trim();
    if (!link) { console.log('\n❌ URL required.'); pause(); return; }
    exam.directLink = link;
  } else if (modeIdx === 2) {
    const p = readline.question('\n   HTML file path: ').trim();
    const rel = copyHtmlToPages(p, name);
    if (!rel) { pause(); return; }
    exam.directLink = rel;
  }

  if (!db.exams) db.exams = [];
  db.exams.push(exam);
  saveDB(db);
  console.log(`\n✅ Exam "${name}" added.`);
  pause();
}

// ---------- Manage existing exam ----------

function manageExam(db, exam) {
  hr(`Exam: ${exam.name}`);
  const subC = (exam.subjects || []).length;
  const coaC = (exam.coachings || []).length;
  console.log(`   ${subC} subjects · ${coaC} coachings`);
  if (exam.directLink) console.log(`   🔗 Direct link: ${exam.directLink}`);
  if (exam.image) console.log(`   🖼️  Image: ${exam.image}`);

  const idx = menuSelect(
    [
      '📚 By Subject',
      '🏫 By Institution (Coaching)',
      '✏️  Edit Exam (name / icon / image)',
      '🔗 Set / Change Direct Redirect',
      '🗑️  Delete this Exam'
    ],
    'Choose:'
  );
  if (idx === -1) return;
  if (idx === 0) bySubjectFlow(db, exam);
  else if (idx === 1) byInstitutionFlow(db, exam);
  else if (idx === 2) editExam(db, exam);
  else if (idx === 3) setDirectLink(db, exam);
  else if (idx === 4) deleteExam(db, exam);
}

function bySubjectFlow(db, exam) {
  const subjects = exam.subjects || [];
  const names = subjects.map(s => {
    const ch = (s.CHAPTERS || []).length;
    const ts = (s['WEEKLY TESTS'] || []).length;
    return `${s.name}  ·  ${ch} ch · ${ts} tests`;
  });
  names.push('➕  ADD NEW SUBJECT');

  const idx = menuSelect(names, 'Select subject:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addSubject(db, exam); return; }
  manageContainer(db, exam, subjects[idx], 'subject');
}

function byInstitutionFlow(db, exam) {
  const coachings = exam.coachings || [];
  const names = coachings.map(s => {
    const ch = (s.CHAPTERS || []).length;
    const ts = (s['WEEKLY TESTS'] || []).length;
    return `${s.name}  ·  ${ch} ch · ${ts} tests`;
  });
  names.push('➕  ADD NEW COACHING / INSTITUTION');

  const idx = menuSelect(names, 'Select coaching:');
  if (idx === -1) return;
  if (idx === names.length - 1) { addCoaching(db, exam); return; }
  manageContainer(db, exam, coachings[idx], 'coaching');
}

// ---------- Add subject / coaching ----------

function addSubject(db, exam) {
  hr(`Add Subject → ${exam.name}`);

  const name = readline.question('   Subject name: ').trim().toUpperCase();
  if (!name) { console.log('\n❌ Cancelled.'); return; }

  if (!exam.subjects) exam.subjects = [];
  if (exam.subjects.some(s => s.name === name)) {
    console.log(`\n❌ Subject "${name}" already exists.`);
    pause();
    return;
  }

  const image = askImageInput('Subject thumbnail');

  exam.subjects.push({
    name,
    image: image || null,
    CHAPTERS: [],
    'WEEKLY TESTS': []
  });
  saveDB(db);
  console.log(`\n✅ Subject "${name}" added.`);
  pause();
}

function addCoaching(db, exam) {
  hr(`Add Coaching → ${exam.name}`);

  const name = readline.question('   Coaching / Institution name: ').trim().toUpperCase();
  if (!name) { console.log('\n❌ Cancelled.'); return; }

  if (!exam.coachings) exam.coachings = [];
  if (exam.coachings.some(c => c.name === name)) {
    console.log(`\n❌ Coaching "${name}" already exists.`);
    pause();
    return;
  }

  const image = askImageInput('Coaching thumbnail');

  exam.coachings.push({
    name,
    image: image || null,
    CHAPTERS: [],
    'WEEKLY TESTS': []
  });
  saveDB(db);
  console.log(`\n✅ Coaching "${name}" added.`);
  pause();
}

// ---------- Manage subject / coaching ----------

function manageContainer(db, exam, container, kind) {
  hr(`${container.name}  ·  ${kind}`);

  const ch = (container.CHAPTERS || []).length;
  const ts = (container['WEEKLY TESTS'] || []).length;
  console.log(`   ${ch} chapters · ${ts} tests`);
  if (container.image) console.log(`   🖼️  ${container.image}`);
  if (container.directLink) console.log(`   🔗 ${container.directLink}`);

  const idx = menuSelect(
    [
      '📖 Add / Update Chapters',
      '📝 Add / Update Mock Tests',
      '✏️  Edit name / image',
      '🔗 Set / Change Direct Redirect',
      `🗑️  Delete this ${kind}`
    ],
    'Choose:'
  );
  if (idx === -1) return;
  if (idx === 0) addChapterOrTest(db, container, 'CHAPTERS');
  else if (idx === 1) addChapterOrTest(db, container, 'WEEKLY TESTS');
  else if (idx === 2) editContainer(db, container, kind);
  else if (idx === 3) setContainerDirectLink(db, container);
  else if (idx === 4) deleteContainer(db, exam, container, kind);
}

function editContainer(db, container, kind) {
  hr(`Edit ${kind}: ${container.name}`);

  const name = readline.question(`   New name [${container.name}]: `).trim().toUpperCase() || container.name;
  container.name = name;

  console.log(`   Current image: ${container.image || '(none)'}`);
  if (readline.keyInYN('   Change image?')) {
    const img = askImageInput(`${kind} thumbnail`);
    if (img) container.image = img;
  }

  saveDB(db);
  console.log('\n✅ Updated.');
  pause();
}

function setContainerDirectLink(db, container) {
  hr(`Direct redirect → ${container.name}`);
  console.log(`   Current: ${container.directLink || '(none)'}`);
  const link = readline.question('   New URL (blank = remove): ').trim();
  if (link) container.directLink = link;
  else delete container.directLink;
  saveDB(db);
  console.log('\n✅ Updated.');
  pause();
}

function deleteContainer(db, exam, container, kind) {
  if (!confirmTwice(`${kind} "${container.name}"`)) {
    console.log('\n❌ Cancelled.');
    return;
  }
  const arr = kind === 'subject' ? exam.subjects : exam.coachings;
  const i = arr.indexOf(container);
  if (i >= 0) arr.splice(i, 1);
  saveDB(db);
  console.log(`\n🗑️  ${kind} deleted.`);
  pause();
}

// ---------- Chapters / Mock Tests ----------

function addChapterOrTest(db, container, cat) {
  const list = container[cat] || [];
  const label = cat === 'CHAPTERS' ? 'Chapter' : 'Test';

  const titles = list.map((it, i) => `${i + 1}. ${it.title}`);
  titles.push(`➕  ADD NEW ${label.toUpperCase()}`);

  const idx = menuSelect(titles, `Select ${label}:`);
  if (idx === -1) return;

  const isNew = idx === titles.length - 1;
  const existing = isNew ? null : list[idx];

  hr(isNew ? `Add ${label}` : `Edit ${label}: ${existing.title}`);

  let title;
  if (isNew) {
    title = readline.question(`   ${label} title: `).trim();
    if (!title) { console.log('\n❌ Cancelled.'); return; }
  } else {
    title = readline.question(`   New title [${existing.title}]: `).trim() || existing.title;
  }

  // Lecture link / HTML
  let url = existing?.url || null;
  console.log(`\n   📺 Lecture link or HTML code`);
  if (existing?.url) {
    console.log(`   Current: ${existing.url.slice(0, 60)}${existing.url.length > 60 ? '...' : ''}`);
  }
  console.log(`   (Enter new value, blank = keep, or type CLEAR to remove)`);
  const lecture = readMultiLine('   Lecture input:');
  if (lecture) {
    if (lecture.toUpperCase() === 'CLEAR') url = null;
    else url = lecture;
  }

  // Download link only if HTML code
  let download_url = existing?.download_url || null;
  if (url && url.includes('<')) {
    const dl = readline.question(`\n   Download link [${download_url || 'none'}]: `).trim();
    if (dl) download_url = dl;
  }

  const notes_en = readline.question(`\n   English notes [${existing?.notes_en || 'none'}]: `).trim() || existing?.notes_en || null;
  const notes_hi = readline.question(`   Hindi notes [${existing?.notes_hi || 'none'}]: `).trim() || existing?.notes_hi || null;
  const quiz     = readline.question(`   Quiz [${existing?.quiz || 'none'}]: `).trim() || existing?.quiz || null;
  const ppt      = readline.question(`   PPT / Other [${existing?.handwritten || 'none'}]: `).trim() || existing?.handwritten || null;

  const newItem = {
    title,
    url: url || null,
    download_url: download_url || null,
    notes_en: notes_en || null,
    notes_hi: notes_hi || null,
    quiz: quiz || null,
    handwritten: ppt || null
  };

  if (isNew) {
    if (!container[cat]) container[cat] = [];
    container[cat].push(newItem);
  } else {
    container[cat][idx] = newItem;
  }

  saveDB(db);
  console.log(`\n✅ ${label} "${title}" ${isNew ? 'added' : 'updated'}.`);
  pause();
}

// ---------- Edit exam metadata ----------

function editExam(db, exam) {
  hr(`Edit Exam: ${exam.name}`);

  const name = readline.question(`   New name [${exam.name}]: `).trim().toUpperCase() || exam.name;
  const icon = readline.question(`   Icon [${exam.icon || 'graduation-cap'}]: `).trim() || exam.icon || 'graduation-cap';

  exam.name = name;
  exam.icon = icon;

  console.log(`   Current image: ${exam.image || '(none)'}`);
  if (readline.keyInYN('   Change image?')) {
    const img = askImageInput('Exam thumbnail');
    if (img) exam.image = img;
  }

  saveDB(db);
  console.log('\n✅ Exam updated.');
  pause();
}

function setDirectLink(db, exam) {
  hr(`Direct redirect → ${exam.name}`);
  console.log(`   Current: ${exam.directLink || '(none)'}`);
  const link = readline.question('   New URL (blank = remove): ').trim();
  if (link) exam.directLink = link;
  else delete exam.directLink;
  saveDB(db);
  console.log('\n✅ Updated.');
  pause();
}

function deleteExam(db, exam) {
  if (!confirmTwice(`Exam "${exam.name}" with all subjects & coachings`)) {
    console.log('\n❌ Cancelled.');
    return;
  }
  const i = db.exams.indexOf(exam);
  if (i >= 0) db.exams.splice(i, 1);
  saveDB(db);
  console.log(`\n🗑️  Exam deleted.`);
  pause();
}

// ============================================================
// MANAGE / DELETE DATA (only new hierarchy)
// ============================================================

function manageData(db) {
  hr('MANAGE / DELETE DATA');

  const idx = menuSelect(
    [
      '🗑️  Delete an Exam',
      '🗑️  Delete a Subject',
      '🗑️  Delete a Coaching',
      '🗑️  Delete a Chapter / Test'
    ],
    'Choose:'
  );
  if (idx === -1) return;
  if (idx === 0) standaloneDeleteExam(db);
  else if (idx === 1) standaloneDeleteContainer(db, 'subjects');
  else if (idx === 2) standaloneDeleteContainer(db, 'coachings');
  else if (idx === 3) standaloneDeleteChapter(db);
}

function standaloneDeleteExam(db) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('\n❌ No exams.'); pause(); return; }

  const idx = menuSelect(exams.map(e => e.name), 'Exam to delete:');
  if (idx === -1) return;

  const exam = exams[idx];
  if (!confirmTwice(`Exam "${exam.name}"`)) { console.log('\n❌ Cancelled.'); return; }
  db.exams.splice(idx, 1);
  saveDB(db);
  console.log('\n🗑️  Exam deleted.');
  pause();
}

function standaloneDeleteContainer(db, key) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('\n❌ No exams.'); pause(); return; }

  const eIdx = menuSelect(exams.map(e => e.name), 'Exam:');
  if (eIdx === -1) return;

  const exam = exams[eIdx];
  const list = exam[key] || [];
  if (list.length === 0) { console.log(`\n❌ No ${key}.`); pause(); return; }

  const sIdx = menuSelect(list.map(s => s.name), `Select ${key}:`);
  if (sIdx === -1) return;

  const item = list[sIdx];
  if (!confirmTwice(`${key} "${item.name}"`)) { console.log('\n❌ Cancelled.'); return; }
  list.splice(sIdx, 1);
  saveDB(db);
  console.log('\n🗑️  Deleted.');
  pause();
}

function standaloneDeleteChapter(db) {
  const exams = db.exams || [];
  if (exams.length === 0) { console.log('\n❌ No exams.'); pause(); return; }

  const eIdx = menuSelect(exams.map(e => e.name), 'Exam:');
  if (eIdx === -1) return;

  const exam = exams[eIdx];
  const allContainers = [
    ...(exam.subjects || []).map(s => ({ label: '📚 ' + s.name, ref: s })),
    ...(exam.coachings || []).map(s => ({ label: '🏫 ' + s.name, ref: s }))
  ];
  if (allContainers.length === 0) { console.log('\n❌ No subjects or coachings.'); pause(); return; }

  const cIdx = menuSelect(allContainers.map(c => c.label), 'Pick subject / coaching:');
  if (cIdx === -1) return;

  const container = allContainers[cIdx].ref;

  const catIdx = menuSelect(['CHAPTERS', 'WEEKLY TESTS'], 'Category:');
  if (catIdx === -1) return;
  const cat = catIdx === 0 ? 'CHAPTERS' : 'WEEKLY TESTS';

  const list = container[cat] || [];
  if (list.length === 0) { console.log('\n❌ Nothing to delete.'); pause(); return; }

  const iIdx = menuSelect(list.map(i => i.title), 'Item to delete:');
  if (iIdx === -1) return;

  if (!confirmTwice(`"${list[iIdx].title}" from ${cat}`)) {
    console.log('\n❌ Cancelled.');
    return;
  }
  list.splice(iIdx, 1);
  saveDB(db);
  console.log('\n🗑️  Deleted.');
  pause();
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function addNotification(db) {
  hr('ADD NOTIFICATION');

  const tag = readline.question('   Tag [UPDATE]: ').trim().toUpperCase() || 'UPDATE';

  const message = readMultiLine('   📝 Message (multi-line, end with DONE):');
  if (!message) { console.log('\n❌ Message required.'); return; }

  console.log('\n   🔗 Optional link — where should it open when tapped?');
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
  pause();
}

function deleteNotification(db) {
  const list = db.notifications || [];
  if (list.length === 0) { console.log('\n❌ No notifications.'); pause(); return; }

  const preview = list.map(n => `[${n.tag || 'UPDATE'}] ${(n.message || '').slice(0, 45)}...`);
  const idx = menuSelect(preview, 'Notification to delete:');
  if (idx === -1) return;

  const target = list[idx];
  if (!confirmTwice(`Notification: "${(target.message || '').slice(0, 60)}..."`)) {
    console.log('\n❌ Cancelled.');
    return;
  }
  list.splice(idx, 1);
  saveDB(db);
  console.log('\n🗑️  Notification deleted.');
  pause();
}

// ============================================================
// SUMMARY PRINTER
// ============================================================

function printSummary(db) {
  const e = (db.exams || []).length;
  const n = (db.notifications || []).length;
  const img = db.site?.image ? '✅' : '—';
  const legacy = getLegacyCourses(db).length;

  const parts = [
    `Exams: ${e}`,
    `Notifs: ${n}`,
    `Site image: ${img}`
  ];
  if (legacy > 0) parts.push(`⚠️  Legacy: ${legacy}`);

  console.log('   ' + parts.join('  |  '));
}

// ============================================================
// MAIN
// ============================================================

function main() {
  backupOnce();

  while (true) {
    const db = loadDB();

    hr('VIVID ACADEMY — CONTENT MANAGER');
    printSummary(db);

    const idx = menuSelect(
      [
        '📚 Add / Update Content',
        '🗑️  Manage / Delete Data',
        '🔔 Add Notification',
        '❌ Delete Notifications',
        '⚙️  Site Settings',
        '📦 Manage Previous Courses (Legacy)',
        '🚪 Exit'
      ],
      'What do you want to do?'
    );

    if (idx === -1) { console.log('\n👋 Bye.\n'); break; }
    if (idx === 0) addNewOrUpdate(db);
    else if (idx === 1) manageData(db);
    else if (idx === 2) addNotification(db);
    else if (idx === 3) deleteNotification(db);
    else if (idx === 4) manageSiteSettings(db);
    else if (idx === 5) manageLegacyCourses(db);
    else if (idx === 6) { console.log('\n👋 Bye.\n'); break; }
  }
}

main();
