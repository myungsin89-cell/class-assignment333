import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: classId } = await params; // classId - Next.js 15에서는 await 필요
        const { allocations } = await request.json(); // { studentId, nextSection }[]

        if (!allocations || !Array.isArray(allocations)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        // Neon DB는 sql.begin을 지원하지 않으므로 개별 UPDATE로 처리
        // class_id 조건 추가하여 해당 클래스의 학생만 업데이트 (보안 강화)
        for (const alloc of allocations) {
            await sql`
                UPDATE students
                SET next_section = ${alloc.nextSection}
                WHERE id = ${alloc.studentId} AND class_id = ${classId}
            `;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save allocation:', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}
