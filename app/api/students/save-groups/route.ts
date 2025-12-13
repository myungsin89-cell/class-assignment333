import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        // 트랜잭션으로 처리하는 것이 안전하지만, Neon 호환성 문제로 개별 업데이트 수행
        // 성능 최적화를 위해 Promise.all 사용
        const updatePromises = students.map(student =>
            db`
                UPDATE students 
                SET group_name = ${student.group_name} 
                WHERE name = ${student.name} AND section_number = ${student.section || student.section_number}
            `
        );

        await Promise.all(updatePromises);

        return NextResponse.json({ success: true, count: students.length });
    } catch (error) {
        console.error('Error saving groups:', error);
        return NextResponse.json({ error: 'Failed to save groups' }, { status: 500 });
    }
}
