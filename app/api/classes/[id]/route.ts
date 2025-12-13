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

        // conditions_completed만 업데이트하는 경우 (마감/해제)
        if (conditions_completed !== undefined && new_section_count === undefined) {
            // conditions_completed 컬럼 확인/추가
            try {
                await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS conditions_completed BOOLEAN DEFAULT FALSE`;
            } catch (_e) {
                console.log('conditions_completed column already exists or cannot be added');
            }

            await sql`
                UPDATE classes
                SET conditions_completed = ${conditions_completed}
                WHERE id = ${id}
            `;

            return NextResponse.json({
                success: true,
                conditions_completed
            });
        }

        // 기존 로직: 반 구성 저장
        if (!new_section_count || !section_names) {
            return NextResponse.json({ error: 'new_section_count and section_names are required' }, { status: 400 });
        }

        // 반 이름 유효성 검사
        if (!Array.isArray(section_names) || section_names.length !== new_section_count) {
            return NextResponse.json({ error: 'section_names must be an array with length equal to new_section_count' }, { status: 400 });
        }

        // new_section_count 컬럼 추가 시도 (없으면 추가)
        try {
            await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_count INTEGER`;
            await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_names TEXT`;
        } catch (e) {
            console.log('Column already exists or cannot be added:', e);
        }

        // new_section_count, new_section_names 업데이트 (section_count는 변경하지 않음!)
        await sql`
            UPDATE classes
            SET new_section_count = ${new_section_count},
                new_section_names = ${JSON.stringify(section_names)}
            WHERE id = ${id}
        `;

        // 특수교육 설정 컬럼이 있는지 확인하고 업데이트 시도
        try {
            await sql`
                UPDATE classes
                SET special_reduction_count = ${special_reduction_count || 0},
                    special_reduction_mode = ${special_reduction_mode || 'flexible'}
                WHERE id = ${id}
            `;
        } catch (_columnError) {
            // 컬럼이 없으면 추가 시도
            console.log('Special reduction columns not found, attempting to add...');
            try {
                await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_count INTEGER DEFAULT 0`;
                await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_mode TEXT DEFAULT 'flexible'`;

                // 다시 업데이트 시도
                await sql`
                    UPDATE classes
                    SET special_reduction_count = ${special_reduction_count || 0},
                        special_reduction_mode = ${special_reduction_mode || 'flexible'}
                WHERE id = ${id}
                `;
            } catch (alterError) {
                console.error('Failed to add special reduction columns:', alterError);
                // 컬럼 추가 실패해도 기본 저장은 성공했으므로 계속 진행
            }
        }

        return NextResponse.json({
            success: true,
            new_section_count,
            section_names,
            special_reduction_count: special_reduction_count || 0,
            special_reduction_mode: special_reduction_mode || 'flexible'
        });
    } catch (error) {
        console.error('Error updating class configuration:', error);
        return NextResponse.json({ error: 'Failed to update class configuration' }, { status: 500 });
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
