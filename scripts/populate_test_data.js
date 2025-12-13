const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../students.db');
const db = new Database(dbPath);

// Sample Korean Names
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
const firstNames = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '지유', '서윤', '서연', '민서', '지우', '하은', '지아', '서현'];

function generateName() {
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    return last + first;
}

function run() {
    try {
        console.log('Starting population script...');

        // 1. Ensure School "test" exists or get its ID
        // Since we don't know the real password hash, we'll try to find a school or create one mostly for ID reference.
        // If the user already created a school, let's find it.
        // We'll search for ANY school first to be safe, or assume 'test' if user said so.
        // Actually, the user's browser tried 'test'.

        // Let's list schools to be sure
        const schools = db.prepare('SELECT * FROM schools').all();
        console.log('Existing schools:', schools);

        let schoolId;
        if (schools.length > 0) {
            schoolId = schools[0].id; // Use the first available school
            console.log(`Using existing school: ${schools[0].name} (ID: ${schoolId})`);
        } else {
            // Create "test" school
            const info = db.prepare('INSERT INTO schools (name, password) VALUES (?, ?)').run('test', 'test'); // Plain text password for dev/test simplified
            schoolId = info.lastInsertRowid;
            console.log(`Created new school: test (ID: ${schoolId})`);
        }

        // 2. Ensure Class (Grade 2) exists
        // User asked for "2학년 3개반"
        const grade = 2;
        const sectionCount = 3;

        let classRow = db.prepare('SELECT * FROM classes WHERE school_id = ? AND grade = ?').get(schoolId, grade);

        if (!classRow) {
            // Create class
            const info = db.prepare(`
                INSERT INTO classes (school_id, grade, section_count, section_statuses) 
                VALUES (?, ?, ?, ?)
            `).run(schoolId, grade, sectionCount, JSON.stringify({
                1: 'in_progress',
                2: 'in_progress',
                3: 'in_progress'
            }));
            classRow = { id: info.lastInsertRowid, section_count: sectionCount };
            console.log(`Created grade ${grade} class with ${sectionCount} sections (ID: ${classRow.id})`);
        } else {
            console.log(`Found existing grade ${grade} class (ID: ${classRow.id})`);
            // Update section count if different? User said "currently created", so assume it matches or update it.
            if (classRow.section_count !== sectionCount) {
                db.prepare('UPDATE classes SET section_count = ? WHERE id = ?').run(sectionCount, classRow.id);
                console.log(`Updated section count to ${sectionCount}`);
            }
        }

        const classId = classRow.id;

        // 3. Populate Students for each section
        const studentsPerSection = 15;
        const insertStudent = db.prepare(`
            INSERT INTO students (
                class_id, section, name, gender, 
                is_problem_student, is_special_class, is_underachiever, 
                group_name, rank
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Clear existing students for this class? User said "fill", maybe clear first to be clean.
        db.prepare('DELETE FROM students WHERE class_id = ?').run(classId);
        console.log('Cleared existing students for this class.');

        for (let section = 1; section <= sectionCount; section++) {
            console.log(`Populating Section ${section}...`);

            for (let i = 1; i <= studentsPerSection; i++) {
                const name = generateName();
                const gender = Math.random() > 0.5 ? 'M' : 'F';

                // Random attributes
                const isProblem = Math.random() < 0.1 ? 1 : 0; // 10% chance
                const isSpecial = Math.random() < 0.05 ? 1 : 0; // 5% chance

                // Separation Groups: Assign some students to groups
                // "반 내부 분리 적절하게" -> Let's make 2 groups per section with 2-3 students each
                let groupName = '';
                if (i <= 3) {
                    groupName = '그룹1';
                } else if (i >= 13) {
                    groupName = '그룹2';
                }

                // Rank: simply assign logic 1..15 based on loop?
                // Or randomize?
                // User said "석차 배정". Let's assign strict 1 to 15 ranks.
                const rank = i;

                insertStudent.run(
                    classId,
                    section,
                    name,
                    gender,
                    isProblem,
                    isSpecial,
                    0,
                    groupName,
                    rank
                );
            }
        }

        // 4. Mark as Completed ("마감까지 해줘")
        const completed statuses = {};
        for (let s = 1; s <= sectionCount; s++) statuses[s] = 'completed';

        db.prepare('UPDATE classes SET section_statuses = ? WHERE id = ?')
            .run(JSON.stringify(statuses), classId);

        console.log('Marked all sections as completed.');

        console.log('Done!');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        db.close();
    }
}

run();
