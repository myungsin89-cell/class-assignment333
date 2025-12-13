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
    section_number?: number;
}

interface SectionStats {
    students: Student[];
    oldClassCount: Map<number, number>; // 기존 반별 학생 수 추적
    rankSum: number; // 석차 합계
    rankCount: number; // 석차 보유 학생 수
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
        const classInfo = classInfoResult[0] as Record<string, unknown> | undefined;

        if (!classInfo) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // 모든 반의 학생 가져오기
        const allStudents = await sql`SELECT * FROM students WHERE class_id = ${classId} ORDER BY section_number, gender, rank ASC, name` as Student[];

        if (allStudents.length === 0) {
            return NextResponse.json({ error: 'No students found' }, { status: 400 });
        }

        // 특수반 학생과 일반 학생 분리
        const specialStudents = allStudents.filter(s => s.is_special_class === 1);
        const normalStudents = allStudents.filter(s => s.is_special_class === 0);

        // 반별로 그룹화 (모든 학생 포함)
        const studentsBySection: { [key: number]: Student[] } = {};
        allStudents.forEach(student => {
            const sectionNum = student.section_number || 1;
            if (!studentsBySection[sectionNum]) {
                studentsBySection[sectionNum] = [];
            }
            studentsBySection[sectionNum].push(student);
        });

        // 반별 통계 초기화
        const sectionStats: SectionStats[] = Array.from({ length: newSectionCount }, () => ({
            students: [],
            oldClassCount: new Map<number, number>(),
            rankSum: 0,
            rankCount: 0
        }));

        // 목표 석차 평균 계산
        const studentsWithRank = normalStudents.filter(s => s.rank !== null);
        const totalRankSum = studentsWithRank.reduce((sum, s) => sum + (s.rank || 0), 0);
        const targetAvgRank = studentsWithRank.length > 0 ? totalRankSum / studentsWithRank.length : 0;

        // 기존 반별 목표 분배 수 계산 (개선)
        const oldSectionNumbers = Object.keys(studentsBySection).map(Number);
        const targetDistribution = new Map<number, { min: number; max: number }>();

        oldSectionNumbers.forEach(oldSection => {
            const count = studentsBySection[oldSection].length;
            const baseCount = Math.floor(count / newSectionCount);
            const remainder = count % newSectionCount;

            // 나머지가 있으면 일부 반은 +1명 허용
            targetDistribution.set(oldSection, {
                min: baseCount,
                max: baseCount + (remainder > 0 ? 1 : 0)
            });
        });

        // 스마트 배치 함수 (개선: 하드 제약 추가)
        function findBestSection(student: Student, preferredSection: number): number {
            const candidates: { section: number; score: number }[] = [];
            const oldSection = student.section_number || 1;
            const target = targetDistribution.get(oldSection);

            for (let i = 0; i < newSectionCount; i++) {
                const sectionIdx = (preferredSection + i) % newSectionCount;
                const stats = sectionStats[sectionIdx];
                let score = 0;
                let hasConflict = false;

                // 1. 그룹 충돌 체크 (필수)
                if (student.group_name) {
                    hasConflict = stats.students.some(s => s.group_name === student.group_name);
                }

                // 2. 동명이인 체크 (필수)
                if (!hasConflict) {
                    hasConflict = stats.students.some(s => s.name === student.name);
                }

                if (hasConflict) continue; // 충돌 시 제외

                // 3. 기존 반 균등 분배 하드 제약 체크
                const currentOldClassCount = stats.oldClassCount.get(oldSection) || 0;

                // 최대치를 초과하면 제외 (하드 제약)
                if (target && currentOldClassCount >= target.max + 1) {
                    continue; // 이 반은 이미 너무 많음
                }

                // 4. 우선순위별 점수 계산 (낮을수록 좋음)

                // 4-1. 기존 반 균등 분배 (가중치: 1000 - 최우선)
                if (target) {
                    const targetMid = (target.min + target.max) / 2;
                    const deviation = Math.abs(currentOldClassCount - targetMid);
                    score += deviation * 1000;
                }

                // 4-2. 석차 평균 균형 (가중치: 50)
                if (student.rank !== null && stats.rankCount > 0) {
                    const currentAvg = stats.rankSum / stats.rankCount;
                    const newAvg = (stats.rankSum + student.rank) / (stats.rankCount + 1);
                    const currentDeviation = Math.abs(currentAvg - targetAvgRank);
                    const newDeviation = Math.abs(newAvg - targetAvgRank);
                    const rankImprovement = currentDeviation - newDeviation;
                    score -= rankImprovement * 50; // 개선되면 점수 감소
                }

                // 4-3. 성별 균형 (가중치: 30)
                const maleCount = stats.students.filter(s => s.gender === 'M').length;
                const femaleCount = stats.students.filter(s => s.gender === 'F').length;
                const genderImbalance = Math.abs(maleCount - femaleCount);
                const wouldImprove = student.gender === 'M' ? maleCount < femaleCount : femaleCount < maleCount;
                score += wouldImprove ? -30 : genderImbalance * 10;

                // 4-4. 반 인원 균형 (가중치: 20)
                const avgStudentCount = normalStudents.length / newSectionCount;
                const sizeDeviation = Math.abs(stats.students.length - avgStudentCount);
                score += sizeDeviation * 20;

                // 4-5. 우선 배치 보너스 (원래 배정된 반에 가까울수록 좋음)
                const distanceFromPreferred = Math.min(
                    Math.abs(sectionIdx - preferredSection),
                    newSectionCount - Math.abs(sectionIdx - preferredSection)
                );
                score += distanceFromPreferred * 5;

                candidates.push({ section: sectionIdx, score });
            }

            // 점수가 가장 낮은 반 선택
            if (candidates.length === 0) {
                // 모든 반이 하드 제약 위반 - fallback: 가장 적은 반 찾기
                console.warn(`No valid section for student ${student.name} from old section ${oldSection}`);
                const counts = sectionStats.map((s, idx) => ({
                    idx,
                    count: s.oldClassCount.get(oldSection) || 0
                }));
                counts.sort((a, b) => a.count - b.count);
                return counts[0].idx;
            }

            candidates.sort((a, b) => a.score - b.score);
            return candidates[0].section;
        }

        // 학생 배치 함수
        function placeStudent(student: Student, sectionIdx: number) {
            const stats = sectionStats[sectionIdx];
            stats.students.push(student);

            // 기존 반 카운트 업데이트
            const oldSection = student.section_number || 1;
            stats.oldClassCount.set(oldSection, (stats.oldClassCount.get(oldSection) || 0) + 1);

            // 석차 통계 업데이트
            if (student.rank !== null) {
                stats.rankSum += student.rank;
                stats.rankCount += 1;
            }
        }

        // Serpentine 배치 (개선된 버전)
        function distributeWithSerpentine(students: Student[], startOffset: number = 0) {
            let currentIndex = 0;
            let forward = true;

            students.forEach((student) => {
                let preferredSection;

                if (forward) {
                    preferredSection = (startOffset + currentIndex) % newSectionCount;
                } else {
                    preferredSection = (startOffset + (newSectionCount - 1 - currentIndex)) % newSectionCount;
                }

                // 최적의 반 찾기
                const bestSection = findBestSection(student, preferredSection);
                placeStudent(student, bestSection);

                // 다음 인덱스로 이동
                currentIndex++;
                if (currentIndex >= newSectionCount) {
                    currentIndex = 0;
                    forward = !forward;
                }
            });
        }

        // 반별로 학생 배치

        // 일반 학생만 먼저 배치
        const normalStudentsBySection: { [key: number]: Student[] } = {};
        normalStudents.forEach(student => {
            const sectionNum = student.section_number || 1;
            if (!normalStudentsBySection[sectionNum]) {
                normalStudentsBySection[sectionNum] = [];
            }
            normalStudentsBySection[sectionNum].push(student);
        });

        Object.keys(normalStudentsBySection).map(Number).sort((a, b) => a - b).forEach((sectionNum, sectionIndex) => {
            const sectionStudents = normalStudentsBySection[sectionNum];

            // 성별로 분리하고 등수순 정렬
            const maleStudents = sectionStudents
                .filter(s => s.gender === 'M')
                .sort((a, b) => {
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

            // 남자: 기존 반마다 다른 오프셋
            const maleOffset = sectionIndex % newSectionCount;
            distributeWithSerpentine(maleStudents, maleOffset);

            // 여자: 기존 반마다 다른 오프셋
            const femaleOffset = (sectionIndex + 1) % newSectionCount;
            distributeWithSerpentine(femaleStudents, femaleOffset);
        });

        // 특수반 학생 배치 (기존 반 분배 최우선 고려)
        specialStudents.forEach(student => {
            const oldSection = student.section_number || 1;
            const target = targetDistribution.get(oldSection);

            const candidates = sectionStats.map((stats, idx) => {
                const oldClassCount = stats.oldClassCount.get(oldSection) || 0;
                const totalCount = stats.students.length;

                // 기존 반 목표치 초과 여부 체크
                const exceedsTarget = target && oldClassCount >= target.max + 1;

                return {
                    section: idx,
                    oldClassCount,
                    totalCount,
                    exceedsTarget,
                    score: exceedsTarget ? 999999 : (oldClassCount * 1000 + totalCount * 10)
                };
            });

            // 목표치를 초과하지 않는 반 중에서 가장 적은 반 선택
            candidates.sort((a, b) => a.score - b.score);
            placeStudent(student, candidates[0].section);
        });

        // 최종 배열로 변환
        const sections = sectionStats.map(stats => stats.students);

        // 새로운 클래스 생성
        const result = await sql`INSERT INTO classes (school_id, grade, section_count, is_distributed, parent_class_id) VALUES (${schoolId}, ${classInfo.grade}, ${newSectionCount}, ${1}, ${classId}) RETURNING id`;
        const newClassId = result[0].id;

        // 학생들을 새 클래스에 배치
        for (const [sectionIndex, sectionStudents] of sections.entries()) {
            for (const student of sectionStudents) {
                await sql`INSERT INTO students (class_id, section_number, name, gender, is_problem_student, is_special_class, group_name, rank, previous_section)
                         VALUES (${newClassId}, ${sectionIndex + 1}, ${student.name}, ${student.gender}, ${student.is_problem_student}, ${student.is_special_class}, ${student.group_name}, ${student.rank}, ${student.section_number})`;
            }
        }

        // 반별 통계 생성 (석차 평균 포함)
        const stats = sections.map((students, index) => {
            const studentsWithRank = students.filter(s => s.rank !== null);
            const avgRank = studentsWithRank.length > 0
                ? studentsWithRank.reduce((sum, s) => sum + (s.rank || 0), 0) / studentsWithRank.length
                : null;

            return {
                section: index + 1,
                total: students.length,
                male: students.filter(s => s.gender === 'M').length,
                female: students.filter(s => s.gender === 'F').length,
                problem: students.filter(s => s.is_problem_student === 1).length,
                special: students.filter(s => s.is_special_class === 1).length,
                avgRank: avgRank ? avgRank.toFixed(1) : null
            };
        });

        return NextResponse.json({
            success: true,
            newClassId,
            stats,
            message: `${newSectionCount}개 반으로 편성 완료 (석차 평균 균형 적용)`
        });

    } catch (error) {
        console.error('Error distributing students:', error);
        return NextResponse.json({
            error: 'Failed to distribute students',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
