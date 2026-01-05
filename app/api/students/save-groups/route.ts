import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { students, classId } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        const classIdInt = parseInt(classId, 10);
        if (isNaN(classIdInt)) {
            return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
        }

        console.log(`[save-groups] Start saving ${students.length} students for class ${classIdInt}`);
        const startTime = Date.now();

        // 유효한 업데이트 데이터 필터링
        const updates = students
            .filter(s => s.id !== undefined && s.id !== null)
            .map(s => ({
                id: Number(s.id),
                group_name: s.group_name || ''
            }));

        if (updates.length === 0) {
            console.log('[save-groups] No valid students to update.');
            return NextResponse.json({ success: true, count: 0 });
        }

        // 병렬 Promise.all 방식 (안정적이고 적당히 빠름)
        // 한 번에 50개씩 배치 처리하여 연결 부하 감소
        const BATCH_SIZE = 50;
        const batches = [];

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            batches.push(updates.slice(i, i + BATCH_SIZE));
        }

        for (const batch of batches) {
            await Promise.all(
                batch.map(u =>
                    db`UPDATE students SET group_name = ${u.group_name} WHERE id = ${u.id} AND class_id = ${classIdInt}`
                )
            );
        }

        const elapsed = Date.now() - startTime;
        console.log(`[save-groups] ✅ Updated ${updates.length} students in ${elapsed}ms (${batches.length} batches)`);

        return NextResponse.json({ success: true, count: updates.length, elapsed });
    } catch (error) {
        console.error('[save-groups] Error:', error);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
