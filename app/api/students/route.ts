import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const { students, classId, section } = await request.json();

        // 타입 검증
        if (!classId || !students || !Array.isArray(students)) {
            return NextResponse.json({
                error: 'Invalid request data. classId and students array are required.'
            }, { status: 400 });
        }

        // classId를 정수로 변환
        const classIdInt = parseInt(classId, 10);
        const sectionInt = parseInt(section || '1', 10);

        if (isNaN(classIdInt) || isNaN(sectionInt)) {
            return NextResponse.json({
                error: 'classId and section must be valid numbers.'
            }, { status: 400 });
        }

        // class가 존재하는지 확인
        const classCheck = await sql`SELECT id, section_statuses FROM classes WHERE id = ${classIdInt}`;
        if (classCheck.length === 0) {
            return NextResponse.json({
                error: `Class with id ${classIdInt} does not exist.`
            }, { status: 404 });
        }

        // 마감 상태 확인 - 마감된 반은 수정 불가
        try {
            const statuses = JSON.parse(classCheck[0].section_statuses || '{}');
            if (statuses[sectionInt] === 'completed') {
                return NextResponse.json({
                    error: '마감된 학급은 수정할 수 없습니다. 마감 해제 후 다시 시도해주세요.'
                }, { status: 403 });
            }
        } catch (_e) {
            // section_statuses 파싱 실패 시 무시
        }

        // 기존 학생 데이터 삭제
        await sql`DELETE FROM students WHERE class_id = ${classIdInt} AND section_number = ${sectionInt}`;

        // 새로운 학생 데이터 삽입
        console.log('💾 저장할 학생 데이터:', students.map(s => ({
            name: s.name,
            group_name: s.group_name,
            is_underachiever: s.is_underachiever,
            is_special_class: s.is_special_class,
            is_problem_student: s.is_problem_student,
            is_transferring_out: s.is_transferring_out
        })));

        for (const student of students) {
            await sql`INSERT INTO students (class_id, section_number, name, gender, is_problem_student, is_special_class, group_name, rank, birth_date, contact, notes, is_underachiever, is_transferring_out)
                     VALUES (${classIdInt}, ${sectionInt}, ${student.name}, ${student.gender}, ${student.is_problem_student || false}, ${student.is_special_class || false}, ${student.group_name || null}, ${student.rank || null}, ${student.birth_date || null}, ${student.contact || null}, ${student.notes || null}, ${student.is_underachiever || false}, ${student.is_transferring_out || false})`;
        }

        return NextResponse.json({ success: true, count: students.length });
    } catch (error) {
        console.error('Error creating students:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({
            error: 'Failed to create students',
            details: errorMessage
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const classId = searchParams.get('classId');
        const section = searchParams.get('section');

        if (!classId) {
            return NextResponse.json({ error: 'classId is required' }, { status: 400 });
        }

        let students;

        if (section) {
            students = await sql`SELECT * FROM students WHERE class_id = ${classId} AND section_number = ${section} ORDER BY id`;
        } else {
            students = await sql`SELECT * FROM students WHERE class_id = ${classId} ORDER BY id`;
        }

        return NextResponse.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const classId = searchParams.get('classId');
        const section = searchParams.get('section');

        // Section-based deletion (delete all students in a section)
        if (classId && section) {
            const classIdInt = parseInt(classId, 10);
            const sectionInt = parseInt(section, 10);

            if (isNaN(classIdInt) || isNaN(sectionInt)) {
                return NextResponse.json({
                    error: 'classId and section must be valid numbers'
                }, { status: 400 });
            }

            // Get current class data
            const classData = await sql`SELECT section_count, section_statuses FROM classes WHERE id = ${classIdInt}`;
            if (classData.length === 0) {
                return NextResponse.json({
                    error: 'Class not found'
                }, { status: 404 });
            }

            // 마감 상태 확인 - 마감된 반은 삭제 불가
            try {
                const statuses = JSON.parse(classData[0].section_statuses || '{}');
                if (statuses[sectionInt] === 'completed') {
                    return NextResponse.json({
                        error: '마감된 학급은 삭제할 수 없습니다. 마감 해제 후 다시 시도해주세요.'
                    }, { status: 403 });
                }
            } catch (_e) {
                // section_statuses 파싱 실패 시 무시
            }

            const _currentSectionCount = classData[0].section_count;

            // Delete all students in this section
            await sql`DELETE FROM students WHERE class_id = ${classIdInt} AND section_number = ${sectionInt}`;

            // Reorganize sections: shift all sections after the deleted one down by 1
            // Example: deleting section 3 → section 4 becomes 3, section 5 becomes 4, etc.
            await sql`
                UPDATE students 
                SET section_number = section_number - 1 
                WHERE class_id = ${classIdInt} AND section_number > ${sectionInt}
            `;

            // Decrease section_count by 1
            await sql`
                UPDATE classes 
                SET section_count = section_count - 1 
                WHERE id = ${classIdInt}
            `;

            // Update section_statuses JSON to remove the deleted section
            const classInfo = await sql`SELECT section_statuses FROM classes WHERE id = ${classIdInt}`;
            if (classInfo.length > 0 && classInfo[0].section_statuses) {
                try {
                    const statuses = JSON.parse(classInfo[0].section_statuses);
                    const newStatuses: Record<string, string> = {};

                    // Reorganize status keys
                    Object.keys(statuses).forEach(key => {
                        const keyNum = parseInt(key);
                        if (keyNum < sectionInt) {
                            newStatuses[key] = statuses[key];
                        } else if (keyNum > sectionInt) {
                            newStatuses[(keyNum - 1).toString()] = statuses[key];
                        }
                        // Skip the deleted section
                    });

                    await sql`
                        UPDATE classes 
                        SET section_statuses = ${JSON.stringify(newStatuses)} 
                        WHERE id = ${classIdInt}
                    `;
                } catch (e) {
                    console.error('Error updating section_statuses:', e);
                }
            }

            return NextResponse.json({
                success: true,
                message: `${section}반이 삭제되었습니다. 이후 반들의 번호가 자동으로 조정되었습니다.`
            });
        }

        // Individual student deletion by ID (legacy support)
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({
                error: 'Either (classId + section) or id is required'
            }, { status: 400 });
        }

        await sql`DELETE FROM students WHERE id = ${id}`;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting student(s):', error);
        return NextResponse.json({ error: 'Failed to delete student(s)' }, { status: 500 });
    }
}
