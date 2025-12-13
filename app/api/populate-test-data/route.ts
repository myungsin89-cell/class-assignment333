/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const firstNames = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '지유', '서윤', '서연', '민서', '지우', '하은', '지아', '서현', '지민', '수빈'];

function generateName() {
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    return last + first;
}

export async function GET() {
    let db: ReturnType<typeof Database> | undefined;
    try {
        const dbPath = path.join(process.cwd(), 'students.db');
        console.log('Opening DB at:', dbPath);
        db = new Database(dbPath);

        // 1. Ensure School "test" exists or get its ID
        const schools = db.prepare('SELECT * FROM schools').all();
        let schoolId;

        const testSchool = schools.find((s: any) => s.name === 'test') as { id: number; name: string } | undefined;
        if (testSchool) {
            schoolId = testSchool.id;
        } else if (schools.length > 0) {
            schoolId = (schools[0] as any).id;
        } else {
            const info = db.prepare('INSERT INTO schools (name, password) VALUES (?, ?)').run('test', 'test');
            schoolId = info.lastInsertRowid;
        }
        console.log('School ID:', schoolId);

        // 2. Ensure Class (Grade 2) exists
        const grade = 2;
        const sectionCount = 3;

        let classRow: any = db.prepare('SELECT * FROM classes WHERE school_id = ? AND grade = ?').get(schoolId, grade);

        if (!classRow) {
            const info = db.prepare(`
                INSERT INTO classes (school_id, grade, section_count, section_statuses) 
                VALUES (?, ?, ?, ?)
            `).run(schoolId, grade, sectionCount, JSON.stringify({
                1: 'in_progress',
                2: 'in_progress',
                3: 'in_progress'
            }));
            classRow = { id: info.lastInsertRowid, section_count: sectionCount };
            console.log('Created Class ID:', classRow.id);
        } else {
            console.log('Found Class ID:', classRow.id);
            // Update section count if different
            if (classRow.section_count !== sectionCount) {
                db.prepare('UPDATE classes SET section_count = ? WHERE id = ?').run(sectionCount, classRow.id);
            }
        }
        const classId = classRow.id;

        // 3. Populate Students
        const studentsPerSection = 15;
        const insertStudent = db.prepare(`
            INSERT INTO students (
                class_id, section, name, gender, 
                is_problem_student, is_special_class, is_underachiever, 
                group_name, rank
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Clear existing students
        db.prepare('DELETE FROM students WHERE class_id = ?').run(classId);

        let totalStudents = 0;
        for (let section = 1; section <= sectionCount; section++) {
            for (let i = 1; i <= studentsPerSection; i++) {
                const name = generateName();
                const gender = Math.random() > 0.5 ? 'M' : 'F';

                // Random attributes
                const isProblem = Math.random() < 0.1 ? 1 : 0;
                const isSpecial = Math.random() < 0.05 ? 1 : 0;

                // Separation Groups: Assign first 3 and last 3 to groups
                let groupName = '';
                if (i <= 3) groupName = '그룹1';
                else if (i >= 13) groupName = '그룹2';

                // Strictly assign rank 1..15
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
                totalStudents++;
            }
        }

        // 4. Mark as Completed ("마감")
        const statuses: Record<string, string> = {};
        for (let s = 1; s <= sectionCount; s++) statuses[s] = 'completed';

        db.prepare('UPDATE classes SET section_statuses = ? WHERE id = ?')
            .run(JSON.stringify(statuses), classId);

        return NextResponse.json({
            success: true,
            message: `Populated ${totalStudents} students in Grade ${grade} (${sectionCount} sections).`,
            details: { schoolId, classId, totalStudents }
        });

    } catch (error) {
        console.error('Population Error:', error);
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    } finally {
        if (db) db.close();
    }
}
