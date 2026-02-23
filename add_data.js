const fs = require('fs');
const readline = require('readline-sync');

function loadDB() { return JSON.parse(fs.readFileSync('db.json', 'utf8')); }
function saveDB(db) { fs.writeFileSync('db.json', JSON.stringify(db, null, 2)); }

function main() {
    let db = loadDB();
    const options = ['Add/Update Content', 'Manage/Delete Data'];
    const index = readline.keyInSelect(options, 'What do you want to do?');
    if (index === 0) addNewOrUpdate(db);
    else if (index === 1) manageData(db);
}

function addNewOrUpdate(db) {
    let courseNames = db.courses.map(c => c.name);
    courseNames.push("ADD ANOTHER COURSE (+)");
    let cIndex = readline.keyInSelect(courseNames, 'Select Course:');
    if (cIndex === -1) return;

    if (cIndex === courseNames.length - 1) {
        let newCourseName = readline.question('Enter New Course Name: ').toUpperCase();
        let teacherName = readline.question('Enter Teacher Name: ').toUpperCase();
        const subOptions = ['ADD SUB (Regular System)', 'ADD LINK (Direct Redirect)'];
        let subChoice = readline.keyInSelect(subOptions, 'Mode for ' + newCourseName + ':');
        
        if (subChoice === 0) {
            let subName = readline.question('Enter First Subject Name: ').toUpperCase();
            db.courses.push({ name: newCourseName, teacher: teacherName, subjects: [{ name: subName, CHAPTERS: [], "WEEKLY TESTS": [] }] });
            saveDB(db);
            console.log('✅ Course Added!');
        } else if (subChoice === 1) {
            let directLink = readline.question('Enter Redirect Link: ');
            db.courses.push({ name: newCourseName, teacher: teacherName, directLink: directLink, subjects: [] });
            saveDB(db);
            console.log('✅ Redirect Course Added!');
        }
        return;
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

    console.log("\nTIP: Link section mein aap Direct Link ya poora <video> tag daal sakte hain.");
    let link = readline.question('Lecture Link/HTML: ', {defaultInput: existing ? existing.url : ''});
    let nEn = readline.question('Eng Notes: ', {defaultInput: existing ? existing.notes_en : ''});
    let nHi = readline.question('Hindi Notes: ', {defaultInput: existing ? existing.notes_hi : ''});
    let quiz = readline.question('Quiz: ', {defaultInput: existing ? existing.quiz : ''});
    let ppt = readline.question('PPT/Other: ', {defaultInput: existing ? existing.handwritten : ''});

    let newData = { title, url: link || null, notes_en: nEn || null, notes_hi: nHi || null, quiz: quiz || null, handwritten: ppt || null };
    if (existing) sub[cat][itemIndex] = newData; else sub[cat].push(newData);
    saveDB(db);
    console.log('\n✅ Saved!');
}

function manageData(db) {
    let cIndex = readline.keyInSelect(db.courses.map(c => c.name), 'Select Course:');
    if (cIndex === -1) return;

    if (readline.keyInYN('Are you sure you want to delete "' + db.courses[cIndex].name + '"?')) {
        if (readline.keyInYN('FINAL WARNING: Delete ALL subjects inside this course?')) {
            db.courses.splice(cIndex, 1);
            saveDB(db);
            console.log('🗑️ Course Deleted!');
            return;
        }
    }

    let sIndex = readline.keyInSelect(db.courses[cIndex].subjects.map(s => s.name), 'Select Subject:');
    if (sIndex === -1) return;
    let sub = db.courses[cIndex].subjects[sIndex];
    let catIndex = readline.keyInSelect(['CHAPTERS', 'WEEKLY TESTS'], 'Select Category:');
    if (catIndex === -1) return;
    let cat = catIndex === 0 ? 'CHAPTERS' : 'WEEKLY TESTS';

    let itemIndex = readline.keyInSelect(sub[cat].map(i => i.title), 'Delete which one?');
    if (itemIndex !== -1) {
        if (readline.keyInYN('Delete this specific item?')) {
            if (readline.keyInYN('RE-CONFIRM: This action cannot be undone. Delete?')) {
                sub[cat].splice(itemIndex, 1);
                saveDB(db);
                console.log('🗑️ Item Deleted!');
            }
        }
    }
}
main();
