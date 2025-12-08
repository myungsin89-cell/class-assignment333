import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

interface Student {
    id: number;
    name: string;
    gender: 'M' | 'F';
    is_problem_student: number;
    is_special_class: number;
    group_name: string | null;
    rank: number | null;
}

export async function POST(request: NextRequest) {
    try {
        const { classId, newSectionCount, schoolId } = await request.json();

        if (!classId || !newSectionCount || !schoolId) {
            return NextResponse.json({
                error: 'classId, newSectionCount, and schoolId are required'
            }, { status: 400 });
        }

        // 기존 클래스 정보 가져오기
        const classInfoResult = await sql`SELECT * FROM classes WHERE id = ${classId} AND school_id = ${schoolId}`;
        const classInfo: any = classInfoResult[0];

        if (!classInfo) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // 모든 반의 학생 가져오기 (반별로 그룹화)
        const allStudents: Student[] = await sql`SELECT * FROM students WHERE class_id = ${classId} ORDER BY section_number, gender, rank ASC, name`;

        if (allStudents.length === 0) {
            return NextResponse.json({ error: 'No students found' }, { status: 400 });
        }

        // 특수반 학생과 일반 학생 분리
        const specialStudents = allStudents.filter(s => s.is_special_class === 1);
        const normalStudents = allStudents.filter(s => s.is_special_class === 0);

        // 반별로 그룹화
        const studentsBySection: { [key: number]: Student[] } = {};
        normalStudents.forEach(student => {
            const sectionNum = (student as any).section_number || 1;
            if (!studentsBySection[sectionNum]) {
                studentsBySection[sectionNum] = [];
            }
            studentsBySection[sectionNum].push(student);
        });

        // 반별 학생 배열 초기화
        const sections: Student[][] = Array.from({ length: newSectionCount }, () => []);

        // Serpentine(왕복) 배치 함수
        function distributeSerpentine(students: Student[], startOffset: number = 0) {
            let currentIndex = 0;
            let forward = true;

            students.forEach((student) => {
                let baseSection;

                if (forward) {
                    // 정방향: 0, 1, 2, 3, 4
                    baseSection = (startOffset + currentIndex) % newSectionCount;
                } else {
                    // 역방향: 4, 3, 2, 1, 0
                    baseSection = (startOffset + (newSectionCount - 1 - currentIndex)) % newSectionCount;
                }

                // 그룹 충돌 및 동명이인 체크
                let targetSection = baseSection;
                let attempts = 0;
                while (attempts < newSectionCount) {
                    let hasConflict = false;

                    // 그룹 충돌 체크
                    if (student.group_name) {
                        hasConflict = sections[targetSection].some(
                            s => s.group_name === student.group_name
                        );
                    }

                    // 동명이인 체크
                    if (!hasConflict) {
                        hasConflict = sections[targetSection].some(
                            s => s.name === student.name
                        );
                    }

                    if (!hasConflict) {
                        break;
                    }

                    // 충돌 시 한 칸 밀기
                    targetSection = (targetSection + 1) % newSectionCount;
                    attempts++;
                }

                sections[targetSection].push(student);

                // 다음 인덱스로 이동
                currentIndex++;
                if (currentIndex >= newSectionCount) {
                    currentIndex = 0;
                    forward = !forward; // 방향 전환 (왕복)
                }
            });
        }

        // 반별로 학생 배치
        const sectionNumbers = Object.keys(studentsBySection).map(Number).sort((a, b) => a - b);

        sectionNumbers.forEach((sectionNum, sectionIndex) => {
            const sectionStudents = studentsBySection[sectionNum];

            // 성별로 분리하고 등수순 정렬
            const maleStudents = sectionStudents
                .filter(s => s.gender === 'M')
                .sort((a, b) => {
                    // rank가 null인 경우 맨 뒤로
                    if (a.rank === null) return 1;
                    if (b.rank === null) return -1;
                    return a.rank - b.rank;
                });

            const femaleStudents = sectionStudents
                .filter(s => s.gender === 'F')
                .sort((a, b) => {
                    if (a.rank === null) return 1;
                    if (b.rank === null) return -1;
                    return a.rank - b.rank;
                });

            // 남자: 1반은 0번부터, 2반은 1번부터, 3반은 2번부터...
            const maleOffset = sectionIndex % newSectionCount;
            distributeSerpentine(maleStudents, maleOffset);

            // 여자: 1반은 1번부터, 2반은 2번부터, 3반은 3번부터...
            const femaleOffset = (sectionIndex + 1) % newSectionCount;
            distributeSerpentine(femaleStudents, femaleOffset);
        });

        // 특수반 학생은 가장 적은 반에 배치
        specialStudents.forEach(student => {
            const sectionCounts = sections.map(s => s.length);
            const minCount = Math.min(...sectionCounts);
            const targetSection = sectionCounts.indexOf(minCount);
            sections[targetSection].push(student);
        });

        // 새로운 클래스 생성 (반편성 표시 및 원본 클래스 ID 저장)
        const result = await sql`INSERT INTO classes (school_id, grade, section_count, is_distributed, parent_class_id) VALUES (${schoolId}, ${classInfo.grade}, ${newSectionCount}, ${1}, ${classId}) RETURNING id`;
        const newClassId = result[0].id;

        // 학생들을 새 클래스에 배치 (이전 반 번호 저장)
        // PostgreSQL에서는 transaction을 사용하여 모든 INSERT를 한번에 처리
        await sql.begin(async (sql) => {
            for (const [sectionIndex, sectionStudents] of sections.entries()) {
                for (const student of sectionStudents) {
                    await sql`INSERT INTO students (class_id, section_number, name, gender, is_problem_student, is_special_class, group_name, rank, previous_section)
                             VALUES (${newClassId}, ${sectionIndex + 1}, ${student.name}, ${student.gender}, ${student.is_problem_student}, ${student.is_special_class}, ${student.group_name}, ${student.rank}, ${(student as any).section_number})`;
                }
            }
        });

        // 반별 통계 생성
        const stats = sections.map((students, index) => ({
            section: index + 1,
            total: students.length,
            male: students.filter(s => s.gender === 'M').length,
            female: students.filter(s => s.gender === 'F').length,
            problem: students.filter(s => s.is_problem_student === 1).length,
            special: students.filter(s => s.is_special_class === 1).length,
        }));

        return NextResponse.json({
            success: true,
            newClassId,
            stats,
            message: `${newSectionCount}개 반으로 편성 완료`
        });

    } catch (error) {
        console.error('Error distributing students:', error);
        return NextResponse.json({
            error: 'Failed to distribute students',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
