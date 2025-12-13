import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    if (!classId) {
        return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    try {
        const classIdNum = parseInt(classId);

        // 해당 학급의 모든 반의 학생 데이터 가져오기
        const students = await db`
            SELECT * FROM students 
            WHERE class_id = ${classIdNum}
            ORDER BY section_number ASC, rank ASC, name ASC
        `;

        return NextResponse.json(students);
    } catch (error) {
        console.error('Error fetching all students:', error);
        return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }
}
