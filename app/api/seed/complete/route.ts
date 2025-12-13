
import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST() {
    try {
        const schools = await sql`SELECT id FROM schools WHERE name = '테스트학교' LIMIT 1`;
        if (schools.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 });
        const schoolId = schools[0].id;

        const classes = await sql`SELECT id, section_count FROM classes WHERE school_id = ${schoolId} AND grade = 3 LIMIT 1`;
        if (classes.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        const classId = classes[0].id;
        const sectionCount = classes[0].section_count || 15;

        // Create status object: {"1": "completed", "2": "completed", ...}
        const statuses: Record<string, string> = {};
        for (let i = 1; i <= sectionCount; i++) {
            statuses[i.toString()] = 'completed';
        }

        await sql`
        UPDATE classes 
        SET section_statuses = ${JSON.stringify(statuses)}
        WHERE id = ${classId}
    `;

        return NextResponse.json({
            message: 'All sections marked as completed',
            classId,
            sectionCount
        });

    } catch (error) {
        console.error('Completion error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
