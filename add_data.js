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
        let newCourse = { name: newCourseName, subjects: [] };
        const subOptions = ['ADD SUB', 'ADD LINK'];
        let subChoice = readline.keyInSelect(subOptions, 'What to add in ' + newCourseName + '?');
        if (subChoice === 0) {
            let subName = readline.question('Enter Subject Name: ').toUpperCase();
            newCourse.subjects.push({ name: subName, CHAPTERS: [], "WEEKLY TESTS": [] });
            db.courses.push(newCourse);
            saveDB(db);
            console.log('✅ Course and Subject added!');
        } else if (subChoice === 1) {
            let title = readline.question('Enter Title: ');
            let link = readline.question('Enter Link: ');
            newCourse.subjects.push({ name: "GENERAL", CHAPTERS: [{title, url: link}], "WEEKLY TESTS": [] });
            db.courses.push(newCourse);
            saveDB(db);
            console.log('✅ Course and Link added!');
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

    let link = readline.question('Lecture Link (Leave blank to hide box): ', {defaultInput: existing ? existing.url : ''});
    let nEn = readline.question('Eng Notes: ', {defaultInput: existing ? existing.notes_en : ''});
    let nHi = readline.question('Hindi Notes: ', {defaultInput: existing ? existing.notes_hi : ''});
    let quiz = readline.question('Quiz: ', {defaultInput: existing ? existing.quiz : ''});
    let ppt = readline.question('PPT/Other: ', {defaultInput: existing ? existing.handwritten : ''});

    let newData = { title, url: link || null, notes_en: nEn || null, notes_hi: nHi || null, quiz: quiz || null, handwritten: ppt || null };
    if (existing) sub[cat][itemIndex] = newData;
    else sub[cat].push(newData);
    saveDB(db);
    console.log('\n✅ Saved!');
}

function manageData(db) {
    let cIndex = readline.keyInSelect(db.courses.map(c => c.name), 'Select Course:');
    if (cIndex === -1) return;
    let sIndex = readline.keyInSelect(db.courses[cIndex].subjects.map(s => s.name), 'Select Subject:');
    if (sIndex === -1) return;
    let sub = db.courses[cIndex].subjects[sIndex];
    let catIndex = readline.keyInSelect(['CHAPTERS', 'WEEKLY TESTS'], 'Select Category:');
    if (catIndex === -1) return;
    let cat = catIndex === 0 ? 'CHAPTERS' : 'WEEKLY TESTS';
    let itemIndex = readline.keyInSelect(sub[cat].map(i => i.title), 'Delete which one?');
    if (itemIndex !== -1 && readline.keyInYN('Delete it?')) {
        sub[cat].splice(itemIndex, 1);
        saveDB(db);
        console.log('🗑️ Deleted!');
    }
}
main();
