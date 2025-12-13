import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params; // classId - Next.js 15에서는 await 필요
        const { allocations } = await request.json(); // { studentId, nextSection }[]

        if (!allocations || !Array.isArray(allocations)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        // Neon DB는 sql.begin을 지원하지 않으므로 개별 UPDATE로 처리
        for (const alloc of allocations) {
            await sql`
                UPDATE students
                SET next_section = ${alloc.nextSection}
                WHERE id = ${alloc.studentId}
            `;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save allocation:', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}
