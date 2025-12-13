/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST() {
    try {
        // 1. Get Class ID for '테스트학교' 3rd Grade
        const schools = await sql`SELECT id FROM schools WHERE name = '테스트학교' LIMIT 1`;
        if (schools.length === 0) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }
        const schoolId = schools[0].id;

        const classes = await sql`SELECT id FROM classes WHERE school_id = ${schoolId} AND grade = 3 LIMIT 1`;
        if (classes.length === 0) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }
        const classId = classes[0].id;

        // 2. Fetch all students in this class
        const students = await sql`
        SELECT id, section_number, gender 
        FROM students 
        WHERE class_id = ${classId}
        ORDER BY section_number, gender, id
    `;

        // 3. Prepare updates
        let updateCount = 0;

        // Group by section and gender
        const sections: Record<string, any[]> = {};
        for (const s of students) {
            const key = `${s.section_number}-${s.gender}`;
            if (!sections[key]) sections[key] = [];
            sections[key].push(s);
        }

        // Assign Ranks and Groups
        for (const key in sections) {
            const groupStudents = sections[key];

            for (let i = 0; i < groupStudents.length; i++) {
                const student = groupStudents[i];
                const rank = i + 1;

                // Randomly assign group (20% chance)
                // Groups: '그룹1', '그룹2', '그룹3'
                let groupName = null;
                if (Math.random() < 0.2) {
                    const groupNum = Math.floor(Math.random() * 3) + 1;
                    groupName = `그룹${groupNum}`;
                }

                // Update DB
                await sql`
                UPDATE students 
                SET rank = ${rank}, group_name = ${groupName}
                WHERE id = ${student.id}
            `;
                updateCount++;
            }
        }

        return NextResponse.json({
            message: 'Student data updated successfully',
            updatedCount: updateCount
        });

    } catch (error) {
        console.error('Update seeding error:', error);
        return NextResponse.json({ error: 'Failed to update database', details: error }, { status: 500 });
    }
}
