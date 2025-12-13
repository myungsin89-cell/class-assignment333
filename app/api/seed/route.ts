
import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST() {
  try {
    // 1. Ensure School exists
    let schoolId;
    const schools = await sql`SELECT id FROM schools WHERE name = '테스트학교' LIMIT 1`;
    if (schools.length > 0) {
      schoolId = schools[0].id;
    } else {
      const newSchool = await sql`
        INSERT INTO schools (name, password) 
        VALUES ('테스트학교', '1234') 
        RETURNING id
      `;
      schoolId = newSchool[0].id;
    }

    // 2. Ensure Class (Grade 3) exists with 15 sections
    let classId;
    const classes = await sql`
        SELECT id FROM classes 
        WHERE school_id = ${schoolId} AND grade = 3
        LIMIT 1
    `;

    if (classes.length > 0) {
        classId = classes[0].id;
        // Update section count to 15
        await sql`UPDATE classes SET section_count = 15 WHERE id = ${classId}`;
    } else {
        const newClass = await sql`
            INSERT INTO classes (school_id, grade, section_count)
            VALUES (${schoolId}, 3, 15)
            RETURNING id
        `;
        classId = newClass[0].id;
    }

    // 3. Clear existing students for this class (to avoid duplicates/mess on re-run)
    await sql`DELETE FROM students WHERE class_id = ${classId}`;

    // 4. Generate 225 Students (15 sections * 15 students)
    const students = [];
    const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
    const namesM = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '주원', '지후', '준우', '도현', '성현', '건우', '현우', '민재'];
    const namesF = ['서연', '서윤', '지우', '지유', '하윤', '민서', '서현', '예은', '유진', '수빈', '하은', '소윤', '채원', '지아', '지민'];

    for (let section = 1; section <= 15; section++) {
        for (let i = 0; i < 15; i++) {
            const isMale = Math.random() < 0.5;
            const surname = surnames[Math.floor(Math.random() * surnames.length)];
            const name = isMale 
                ? namesM[Math.floor(Math.random() * namesM.length)]
                : namesF[Math.floor(Math.random() * namesF.length)];
            
            students.push({
                class_id: classId,
                section_number: section,
                name: surname + name,
                gender: isMale ? 'M' : 'F',
                birth_date: '2016-01-01', 
            });
        }
    }

    // 5. Insert Students
    // A simple loop is safe and sufficient for 225 records.
    for (const s of students) {
        await sql`
            INSERT INTO students (class_id, section_number, name, gender, birth_date)
            VALUES (${s.class_id}, ${s.section_number}, ${s.name}, ${s.gender}, ${s.birth_date})
        `;
    }

    return NextResponse.json({ 
        message: 'Seeding completed successfully', 
        schoolId, 
        classId, 
        studentsCreated: students.length 
    });

  } catch (error) {
    console.error('Seeding error:', error);
    return NextResponse.json({ error: 'Failed to seed database', details: error }, { status: 500 });
  }
}
