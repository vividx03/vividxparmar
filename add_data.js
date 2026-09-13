const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');

function loadDB() { return JSON.parse(fs.readFileSync('db.json', 'utf8')); }
function saveDB(db) { fs.writeFileSync('db.json', JSON.stringify(db, null, 2)); }

function main() {
    let db = loadDB();
    const options = [
        'Add/Update Content',
        'Add Custom HTML Course (from file path)',
        'Auto-Import HTML Files (from incoming/ folder)',
        'Manage/Delete Data',
        'Add Notification',
        'Delete Notifications'
    ];

    const index = readline.keyInSelect(options, 'What do you want to do?');

    if (index === 0) addNewOrUpdate(db);
    else if (index === 1) addCustomHtmlCourse(db);
    else if (index === 2) autoImportFromFolder(db);
    else if (index === 3) manageData(db);
    else if (index === 4) addNotification(db);
    else if (index === 5) deleteNotification(db);
}

// --- CUSTOM HTML COURSE HELPERS ---

function slugify(str) {
    return String(str).toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'course-' + Date.now();
}

function importHtmlFile(db, htmlFilePath, courseName, teacherName) {
    if (!fs.existsSync(htmlFilePath)) {
        console.log(`❌ File not found: ${htmlFilePath}`);
        return false;
    }

    const pagesDir = 'pages';
    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

    const slug = slugify(courseName);
    const destPath = path.join(pagesDir, slug + '.html');

    fs.copyFileSync(htmlFilePath, destPath);

    const existing = db.courses.find(c => c.name === courseName);
    if (existing) {
        existing.directLink = `pages/${slug}.html`;
        existing.teacher = teacherName || existing.teacher;
        console.log(`♻️  Updated existing course: ${courseName}`);
    } else {
        db.courses.push({
            name: courseName,
            teacher: teacherName || 'Vivid Faculty',
            directLink: `pages/${slug}.html`,
            subjects: []
        });
        console.log(`✅ Added course: ${courseName}`);
    }
    return true;
}

function addCustomHtmlCourse(db) {
    console.log("\n--- ADD CUSTOM HTML COURSE ---");
    const filePath = readline.question('HTML file ka full path do: ').trim().replace(/^["']|["']$/g, '');

    if (!fs.existsSync(filePath)) {
        console.log(`❌ File nahi mili: ${filePath}`);
        return;
    }

    const defaultName = path.basename(filePath, '.html').toUpperCase().replace(/[-_]+/g, ' ');
    const courseName = (readline.question(`Course name [${defaultName}]: `) || defaultName).toUpperCase();
    const teacherName = (readline.question('Teacher name [Vivid Faculty]: ') || 'Vivid Faculty').toUpperCase();

    if (importHtmlFile(db, filePath, courseName, teacherName)) {
        saveDB(db);
        console.log('\n🎉 Done! Ab ye command chala:');
        console.log('   git add . && git commit -m "Add course" && git push');
    }
}

function autoImportFromFolder(db) {
    const srcDir = 'incoming';
    if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
        console.log(`\n📁 'incoming/' folder bana diya. Usme HTML files daal ke script dobara chala.`);
        return;
    }

    const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.html'));
    if (files.length === 0) {
        console.log(`\n📭 'incoming/' folder khaali hai. Pehle HTML files daal.`);
        return;
    }

    console.log(`\n🔍 ${files.length} HTML file(s) mili:`);
    files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));

    if (!readline.keyInYN('Sabko import karna hai?')) return;

    let count = 0;
    files.forEach(file => {
        const fullPath = path.join(srcDir, file);
        const courseName = path.basename(file, '.html').toUpperCase().replace(/[-_]+/g, ' ');
        if (importHtmlFile(db, fullPath, courseName, 'Vivid Faculty')) {
            fs.unlinkSync(fullPath);
            count++;
        }
    });

    saveDB(db);
    console.log(`\n🎉 ${count} course(s) import ho gaye!`);
    console.log('   git add . && git commit -m "Add courses" && git push');
}

// --- NOTIFICATION LOGIC (Fixed for Long Messages with DONE) ---

function addNotification(db) {
    console.log("\n--- ADD NEW NOTIFICATION ---");

    let titleInput = readline.question('Enter Notification Title (e.g., TESTING, ALERT): ');
    if (!titleInput) titleInput = "UPDATE";

    console.log("\n[ENTER NOTIFICATION MESSAGE]");
    console.log("Write your message, press ENTER for new lines.");
    console.log("Type 'DONE' on a new line and press ENTER to save.");

    let lines = [];
    while (true) {
        let line = readline.question('>');
        if (line.trim().toUpperCase() === 'DONE') break;
        lines.push(line);
    }

    let msg = lines.join(" ").replace(/(\r\n|\n|\r)/gm, " ").trim();

    if (!msg) {
        console.log("❌ Message cannot be empty!");
        return;
    }

    if (!db.notifications) db.notifications = [];

    db.notifications.push({
        tag: titleInput.toUpperCase(),
        message: msg,
        date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    });

    saveDB(db);
    console.log('\n✅ Notification Added Successfully!');
    console.log(`Label (Tag): ${titleInput.toUpperCase()}`);
    console.log(`Message: ${msg}`);
}

function deleteNotification(db) {
    if (!db.notifications || db.notifications.length === 0) {
        console.log("❌ No notifications found.");
        return;
    }

    let notifList = db.notifications.map(n => `[${n.tag || 'NOTIF'}] ${n.message.substring(0, 30)}...`);
    let index = readline.keyInSelect(notifList, 'Select Notification to Delete:');

    if (index !== -1) {
        db.notifications.splice(index, 1);
        saveDB(db);
        console.log('🗑️ Notification Deleted!');
    }
}

// --- ORIGINAL CONTENT LOGIC (Exactly Same to Same) ---

function addNewOrUpdate(db) {
    let courseNames = db.courses.map(c => c.name);
    courseNames.push("ADD ANOTHER COURSE (+)");
    let cIndex = readline.keyInSelect(courseNames, 'Select Course:');
    if (cIndex === -1) return;

    if (cIndex === courseNames.length - 1) {
        let newCourseName = readline.question('Enter New Course Name: ').toUpperCase();
        let teacherName = readline.question('Enter Teacher Name: ').toUpperCase();

        const modeOptions = ['Regular Course (with Subjects/Chapters)', 'Direct Link (Redirect to URL)'];
        let modeIndex = readline.keyInSelect(modeOptions, 'Select Mode for ' + newCourseName + ':');

        if (modeIndex === 1) {
            let directLink = readline.question('Enter Direct Redirect Link: ');
            db.courses.push({ name: newCourseName, teacher: teacherName, directLink: directLink, subjects: [] });
            saveDB(db);
            console.log('✅ Redirect Course Added!');
            return;
        } else {
            db.courses.push({ name: newCourseName, teacher: teacherName, subjects: [] });
            saveDB(db);
            console.log('✅ Regular Course Added!');
            return;
        }
    }

    let course = db.courses[cIndex];
    let subjectNames = course.subjects.map(s => s.name);
    subjectNames.push("ADD NEW SUBJECT (+)");
    let sIndex = readline.keyInSelect(subjectNames, 'Select Subject:');
    if (sIndex === -1) return;

    if (sIndex === subjectNames.length - 1) {
        let newSubName = readline.question('Enter New Subject Name: ').toUpperCase();
        course.subjects.push({ name: newSubName, CHAPTERS: [], "WEEKLY TESTS": [] });
        saveDB(db);
        console.log('✅ Subject added!');
        return;
    }

    let sub = course.subjects[sIndex];
    const types = ['CHAPTERS', 'WEEKLY TESTS'];
    let tIndex = readline.keyInSelect(types, 'Select Category:');
    if (tIndex === -1) return;
    let cat = types[tIndex];

    let list = sub[cat].map(item => item.title);
    list.push("ADD NEW " + cat);
    let itemIndex = readline.keyInSelect(list, 'Select Item:');
    if (itemIndex === -1) return;

    let title, existing = null;
    if (itemIndex === list.length - 1) title = readline.question('Enter Title: ');
    else { existing = sub[cat][itemIndex]; title = existing.title; }

    console.log("\n[LECTURE LINK / HTML CODE]");
    console.log("Paste code, press ENTER, type 'DONE' and press ENTER.");
    let lines = [];
    while (true) {
        let line = readline.question('>');
        if (line.trim().toUpperCase() === 'DONE') break;
        lines.push(line);
    }
    let link = lines.join(" ").replace(/(\r\n|\n|\r)/gm, " ").trim();
    if (!link && existing) link = existing.url;

    let dLink = existing ? existing.download_url : null;
    if (link && link.includes('<')) {
        dLink = readline.question('Lecture Download Link: ');
    }

    let nEn = readline.question('Eng Notes: ', {defaultInput: existing ? existing.notes_en : ''});
    let nHi = readline.question('Hindi Notes: ', {defaultInput: existing ? existing.notes_hi : ''});
    let quiz = readline.question('Quiz: ', {defaultInput: existing ? existing.quiz : ''});
    let ppt = readline.question('PPT/Other: ', {defaultInput: existing ? existing.handwritten : ''});

    let newData = { title, url: link || null, download_url: dLink || null, notes_en: nEn || null, notes_hi: nHi || null, quiz: quiz || null, handwritten: ppt || null };
    if (existing) sub[cat][itemIndex] = newData; else sub[cat].push(newData);
    saveDB(db);
    console.log('\n✅ Saved Successfully!');
}

function manageData(db) {
    let cIndex = readline.keyInSelect(db.courses.map(c => c.name), 'Select Course:');
    if (cIndex === -1) return;

    if (readline.keyInYN('Delete FULL Course "' + db.courses[cIndex].name + '"? (Confirm 1/2)')) {
        if (readline.keyInYN('WARNING: Final Confirmation. Confirm? (Confirm 2/2)')) {
            db.courses.splice(cIndex, 1);
            saveDB(db);
            console.log('🗑️ Course Deleted!');
            return;
        }
    }

    if (db.courses[cIndex].subjects.length === 0) return;

    let sIndex = readline.keyInSelect(db.courses[cIndex].subjects.map(s => s.name), 'Select Subject:');
    if (sIndex === -1) return;

    let sub = db.courses[cIndex].subjects[sIndex];
    if (readline.keyInYN('Delete Subject "' + sub.name + '"? (Confirm 1/2)')) {
        if (readline.keyInYN('Confirm Deletion? (Confirm 2/2)')) {
            db.courses[cIndex].subjects.splice(sIndex, 1);
            saveDB(db);
            console.log('🗑️ Subject Deleted!');
            return;
        }
    }

    let catIndex = readline.keyInSelect(['CHAPTERS', 'WEEKLY TESTS'], 'Select Category:');
    if (catIndex === -1) return;
    let cat = catIndex === 0 ? 'CHAPTERS' : 'WEEKLY TESTS';

    let itemIndex = readline.keyInSelect(sub[cat].map(i => i.title), 'Delete item?');
    if (itemIndex !== -1) {
        if (readline.keyInYN('Confirm 1/2?')) {
            if (readline.keyInYN('Final Confirm 2/2?')) {
                sub[cat].splice(itemIndex, 1);
                saveDB(db);
                console.log('🗑️ Item Deleted!');
            }
        }
    }
}

main();
