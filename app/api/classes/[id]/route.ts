import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const classDataResult = await sql`SELECT * FROM classes WHERE id = ${id}`;
        const classData = classDataResult[0] as Record<string, unknown> | undefined;

        if (!classData) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // 이 클래스로부터 생성된 분산 클래스(자식 클래스)가 있는지 확인
        const childClassResult = await sql`SELECT id FROM classes WHERE parent_class_id = ${id} ORDER BY id DESC LIMIT 1`;
        const childClass = childClassResult[0] as { id: string } | undefined;

        if (childClass) {
            classData.child_class_id = childClass.id;
        }

        return NextResponse.json(classData);
    } catch (error) {
        console.error('Error fetching class:', error);
        return NextResponse.json({ error: 'Failed to fetch class' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const body = await request.json();
        const {
            new_section_count,  // 분반 개수 (반편성 결과로 생성할 반 개수)
            section_names,      // 분반 이름
            special_reduction_count,
            special_reduction_mode,
            conditions_completed  // 조건 설정 마감 상태
        } = body;

        // 1. 마감 상태 업데이트 (마감/해제 전용 또는 공통)
        if (conditions_completed !== undefined) {
            console.log(`[PUT /classes/${id}] Updating conditions_completed to ${conditions_completed}`);
            try {
                await sql`
                    UPDATE classes
                    SET conditions_completed = ${conditions_completed}
                    WHERE id = ${id}
                `;
            } catch (err) {
                console.error(`[PUT /classes/${id}] Failed to update conditions_completed:`, err);
                throw new Error(`Failed to update conditions_completed: ${(err as Error).message}`);
            }
        }

        // 2. 반 구성 정보 업데이트 (데이터가 있는 경우에만)
        if (new_section_count !== undefined && section_names !== undefined) {
            console.log(`[PUT /classes/${id}] Updating class config: count=${new_section_count}`);
            // 반 이름 유효성 검사
            if (!Array.isArray(section_names) || section_names.length !== new_section_count) {
                return NextResponse.json({ error: 'section_names must be an array with length equal to new_section_count' }, { status: 400 });
            }

            try {
                await sql`
                    UPDATE classes
                    SET new_section_count = ${new_section_count},
                        new_section_names = ${JSON.stringify(section_names)},
                        special_reduction_count = ${special_reduction_count || 0},
                        special_reduction_mode = ${special_reduction_mode || 'flexible'}
                    WHERE id = ${id}
                `;
            } catch (err) {
                console.error(`[PUT /classes/${id}] Failed to update class config:`, err);
                throw new Error(`Failed to update class config: ${(err as Error).message}`);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating class configuration:', error);
        // 에러 메시지를 상세하게 반환 (보안상 민감한 정보는 제외되지만 SQL 에러 힌트 포함)
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const body = await request.json();
        const { section, status } = body;

        if (!section || !status) {
            return NextResponse.json({ error: 'Section and status are required' }, { status: 400 });
        }

        // 현재 section_statuses 가져오기
        const classDataResult = await sql`SELECT section_statuses FROM classes WHERE id = ${id}`;
        const classData = classDataResult[0] as { section_statuses?: string } | undefined;

        if (!classData) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // JSON 파싱
        let statuses: Record<string, string> = {};
        try {
            statuses = JSON.parse(classData.section_statuses || '{}');
        } catch (_e) {
            statuses = {};
        }

        // 상태 업데이트
        statuses[section.toString()] = status;

        // DB 업데이트
        await sql`UPDATE classes SET section_statuses = ${JSON.stringify(statuses)} WHERE id = ${id}`;

        return NextResponse.json({ success: true, section_statuses: statuses });
    } catch (error) {
        console.error('Error updating section status:', error);
        return NextResponse.json({ error: 'Failed to update section status' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;

        // 먼저 해당 반의 학생들 삭제
        await sql`DELETE FROM students WHERE class_id = ${id}`;

        // 그 다음 반 정보 삭제
        await sql`DELETE FROM classes WHERE id = ${id}`;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting class:', error);
        return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 });
    }
}
