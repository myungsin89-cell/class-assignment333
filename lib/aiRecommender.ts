import { Student, AllocationResult } from './types';
import { calculateViolationScore } from './algorithm';

// 문제 타입 정의
export type IssueType =
    | 'duplicate_name'
    | 'similar_name'
    | 'sep_violation'
    | 'bind_violation'
    | 'problem_imbalance'
    | 'underachiever_imbalance'
    | 'gender_imbalance'
    | 'size_imbalance'
    | 'special_imbalance'
    | 'previous_class_imbalance'
    | 'origin_gender_imbalance' // 기존반 특정 성별 쏠림 (한 성별만 존재)
    | 'rank_imbalance'
    | 'optimization'; // 최적화 여지 (전체 균형)

export interface Issue {
    type: IssueType;
    severity: number; // 위반 점수
    description: string;
    affectedClasses: number[];
    studentIds?: number[]; // 관련 학생 ID 목록 (매칭용)
    details?: any; // 추가 정보
}

export interface SwapSolution {
    issue: Issue;
    studentA: Student;
    studentB: Student;
    fromClass: number;
    toClass: number;
    scoreImprovement: number;
    newIssues: Issue[];
    explanation?: string; // 추천 이유 및 효과 설명

    // 복합 교환을 위한 추가 필드
    complexSwapType?: '2:1' | 'triangle';
    subDescription?: string; // 복합 교환 상세 설명 (예: "A->B: 2명, B->A: 1명")
    additionalTransfers?: {
        student: Student;
        fromClass: number;
        toClass: number;
    }[];
    outcomes?: {
        gender: { from: string; to: string; avg: string };
        size: { from: string; to: string };
        rank: { from: string; to: string; avg: string };
        prevClass?: { from: string; fromAvg: string; to: string; toAvg: string };
    };
}

// 제약조건 파싱 함수 (algorithm.ts와 동일)
function parseConstraints(student: Student) {
    const groups = student.group_name ? student.group_name.split(',') : [];
    const sep = groups.filter(g => g.startsWith('SEP:')).map(g => g.replace('SEP:', '').trim());
    const bind = groups.filter(g => g.startsWith('BIND:')).map(g => g.replace('BIND:', '').trim());
    return { sep, bind };
}

// 이름 추출 (성 제외 - algorithm.ts나 page.tsx와 동일 로직)
function extractGivenName(fullName: string): string {
    const trimmed = fullName.trim();
    if (trimmed.length >= 2) {
        return trimmed.substring(1);
    }
    return trimmed;
}

// 문제 감지
export function detectIssues(allocation: AllocationResult): Issue[] {
    const issues: Issue[] = [];

    // 1. 동명이인 및 유사 이름 문제
    allocation.classes.forEach((cls, idx) => {
        const fullNameMap = new Map<string, Student[]>();
        const givenNameMap = new Map<string, Student[]>();

        cls.students.filter(s => !s.is_transferring_out).forEach(s => {
            const fName = s.name.trim();
            const gName = extractGivenName(s.name);

            if (!fullNameMap.has(fName)) fullNameMap.set(fName, []);
            fullNameMap.get(fName)!.push(s);

            if (!givenNameMap.has(gName)) givenNameMap.set(gName, []);
            givenNameMap.get(gName)!.push(s);
        });

        // 1-1. 완전 동명이인 보고
        fullNameMap.forEach((students, name) => {
            if (students.length > 1) {
                issues.push({
                    type: 'duplicate_name',
                    severity: (students.length - 1) * 5000,
                    description: `${idx + 1}반 동명이인 존재: ${name} (${students.length}명)`,
                    affectedClasses: [idx + 1],
                    studentIds: students.map(s => s.id),
                    details: { name, students }
                });
            }
        });

        // 1-2. 유사 이름 보고 (완전 동명이인이 아닌 경우만)
        givenNameMap.forEach((students, gName) => {
            if (students.length > 1) {
                // 이 중 완전 동명이인으로 이미 보고되지 않은 조합이 있는지 확인
                const nonFullDupStudents = students.filter(s =>
                    fullNameMap.get(s.name.trim())!.length === 1
                );

                if (nonFullDupStudents.length > 0) {
                    issues.push({
                        type: 'similar_name',
                        severity: (students.length - 1) * 2000,
                        description: `${idx + 1}반 유사 이름 존재: ${students.map(s => s.name).join(', ')}`,
                        affectedClasses: [idx + 1],
                        studentIds: students.map(s => s.id),
                        details: { gName, students }
                    });
                }
            }
        });
    });

    // 2. SEP 위반
    const sepGroupMap = new Map<string, Array<{ student: Student; classIndex: number }>>();
    allocation.classes.forEach((cls, classIndex) => {
        cls.students.forEach(student => {
            const { sep } = parseConstraints(student);
            sep.forEach(groupName => {
                if (!sepGroupMap.has(groupName)) sepGroupMap.set(groupName, []);
                sepGroupMap.get(groupName)!.push({ student, classIndex });
            });
        });
    });

    sepGroupMap.forEach((members, groupName) => {
        const classIndices = members.map(m => m.classIndex);
        const hasDuplicates = classIndices.some((idx, i) => classIndices.indexOf(idx) !== i);
        if (hasDuplicates) {
            const duplicateClass = classIndices.find((idx, i) => classIndices.indexOf(idx) !== i);
            issues.push({
                type: 'sep_violation',
                severity: 10000,
                description: `SEP 위반: ${groupName} 그룹 학생들이 ${duplicateClass! + 1}반에 함께 배정됨`,
                affectedClasses: [duplicateClass! + 1],
                studentIds: members.filter(m => m.classIndex === duplicateClass).map(m => m.student.id),
                details: { groupName, members, duplicateClass: duplicateClass! + 1 }
            });
        }
    });

    // 3. 문제행동 학생 편차
    const problemCounts = allocation.classes.map(cls =>
        cls.students.filter(s => s.is_problem_student && !s.is_transferring_out).length
    );
    const problemMax = Math.max(...problemCounts);
    const problemMin = Math.min(...problemCounts);
    if (problemMax - problemMin > 2) {
        const maxClass = problemCounts.indexOf(problemMax);
        const minClass = problemCounts.indexOf(problemMin);
        issues.push({
            type: 'problem_imbalance',
            severity: (problemMax - problemMin - 1) * 5000,
            description: `문제행동 학생 편차: ${maxClass + 1}반(${problemMax}명) vs ${minClass + 1}반(${problemMin}명) - 편차 ${problemMax - problemMin}명`,
            affectedClasses: [maxClass + 1],
            studentIds: allocation.classes[maxClass].students.filter(s => s.is_problem_student).map(s => s.id),
            details: { maxClass: maxClass + 1, minClass: minClass + 1, maxCount: problemMax, minCount: problemMin }
        });
    }

    // 4. 학습부진 학생 편차
    const underCounts = allocation.classes.map(cls =>
        cls.students.filter(s => s.is_underachiever && !s.is_transferring_out).length
    );
    const underMax = Math.max(...underCounts);
    const underMin = Math.min(...underCounts);
    if (underMax - underMin > 2) {
        const maxClass = underCounts.indexOf(underMax);
        const minClass = underCounts.indexOf(underMin);
        issues.push({
            type: 'underachiever_imbalance',
            severity: (underMax - underMin - 1) * 5000,
            description: `학습부진 학생 편차: ${maxClass + 1}반(${underMax}명) vs ${minClass + 1}반(${underMin}명) - 편차 ${underMax - underMin}명`,
            affectedClasses: [maxClass + 1],
            studentIds: allocation.classes[maxClass].students.filter(s => s.is_underachiever).map(s => s.id),
            details: { maxClass: maxClass + 1, minClass: minClass + 1, maxCount: underMax, minCount: underMin }
        });
    }

    // 5. 성비 불균형
    allocation.classes.forEach((cls, idx) => {
        const m = cls.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
        const f = cls.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;
        if (Math.abs(m - f) > 4) {
            issues.push({
                type: 'gender_imbalance',
                severity: (Math.abs(m - f) - 4) * 2000,
                description: `성비 불균형: ${idx + 1}반 - 남${m}명, 여${f}명 (편차 ${Math.abs(m - f)}명)`,
                affectedClasses: [idx + 1],
                studentIds: cls.students.filter(s => s.gender === (m > f ? 'M' : 'F')).map(s => s.id),
                details: { classId: idx + 1, male: m, female: f }
            });
        }
    });

    // 6. 인원 불균형
    const weightedSizes = allocation.classes.map(cls => {
        const actual = cls.students.filter(s => !s.is_transferring_out).length;
        const special = cls.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
        return actual + special;
    });
    const sizeMax = Math.max(...weightedSizes);
    const sizeMin = Math.min(...weightedSizes);
    if (sizeMax - sizeMin > 1) {
        const maxIdx = weightedSizes.indexOf(sizeMax);
        issues.push({
            type: 'size_imbalance',
            severity: (sizeMax - sizeMin - 1) * 500,
            description: `인원 불균형: ${maxIdx + 1}반(가중치 ${sizeMax})이 가장 많음 (편차 ${sizeMax - sizeMin})`,
            affectedClasses: [maxIdx + 1],
            studentIds: allocation.classes[maxIdx].students.map(s => s.id),
            details: { maxIdx: maxIdx + 1, maxVal: sizeMax, minVal: sizeMin }
        });
    }

    // 7. 특수학생 편차
    const specialCounts = allocation.classes.map(cls =>
        cls.students.filter(s => s.is_special_class && !s.is_transferring_out).length
    );
    const sMax = Math.max(...specialCounts);
    const sMin = Math.min(...specialCounts);
    if (sMax - sMin > 1) {
        const maxIdx = specialCounts.indexOf(sMax);
        issues.push({
            type: 'special_imbalance',
            severity: (sMax - sMin - 1) * 500,
            description: `특수학생 편차: ${maxIdx + 1}반(${sMax}명)이 가장 많음`,
            affectedClasses: [maxIdx + 1],
            studentIds: allocation.classes[maxIdx].students.filter(s => s.is_special_class).map(s => s.id),
            details: { maxIdx: maxIdx + 1, count: sMax }
        });
    }

    // 8. 기존반 쏠림
    const allStudents = allocation.classes.flatMap((cls, idx) =>
        cls.students.map(s => ({ ...s, newClassIdx: idx }))
    );
    const prevClasses = [...new Set(allStudents.map(s => s.section_number || 1))];
    prevClasses.forEach(prevNum => {
        const fromPrev = allStudents.filter(s => (s.section_number || 1) === prevNum && !s.is_transferring_out);
        if (fromPrev.length === 0) return;

        const dist = new Map<number, number>();
        fromPrev.forEach(s => {
            dist.set(s.newClassIdx, (dist.get(s.newClassIdx) || 0) + 1);
        });

        const counts = Array.from(dist.values());
        const maxC = Math.max(...counts);
        const minC = dist.size < allocation.classes.length ? 0 : Math.min(...counts);
        if (maxC - minC >= 3) {
            const maxIdx = Array.from(dist.entries()).find(([_, c]) => c === maxC)?.[0] || 0;
            issues.push({
                type: 'previous_class_imbalance',
                severity: (maxC - minC - 2) * 1500,
                description: `기존반 쏠림: ${prevNum}반(기존) 학생이 특정 반에 ${maxC}명 배정됨`,
                affectedClasses: [maxIdx + 1],
                studentIds: fromPrev.filter(s => s.newClassIdx === maxIdx).map(s => s.id),
                details: { prevNum, maxCount: maxC, minCount: minC }
            });
        }
    });

    // 9. BIND 위반 (추가)
    const bindGroupMap = new Map<string, Array<{ student: Student; classIndex: number }>>();
    allocation.classes.forEach((cls, classIndex) => {
        cls.students.forEach(student => {
            const { bind } = parseConstraints(student);
            bind.forEach(groupName => {
                if (!bindGroupMap.has(groupName)) bindGroupMap.set(groupName, []);
                bindGroupMap.get(groupName)!.push({ student, classIndex });
            });
        });
    });

    bindGroupMap.forEach((members, groupName) => {
        const uniqueClasses = new Set(members.map(m => m.classIndex));
        if (uniqueClasses.size > 1) {
            const firstClass = members[0].classIndex;
            issues.push({
                type: 'bind_violation',
                severity: (uniqueClasses.size - 1) * 10000,
                description: `BIND 위반: ${groupName} 그룹 학생들이 여러 반으로 분산됨`,
                affectedClasses: Array.from(uniqueClasses).map(c => c + 1),
                studentIds: members.map(m => m.student.id),
                details: { groupName, uniqueClasses: Array.from(uniqueClasses) }
            });
        }
    });

    // 10. 평균 석차 불균형 (추가)
    const rankStats = allocation.classes.map((c) => {
        const ranks = c.students.filter(s => s.rank && !s.is_transferring_out).map(s => s.rank!);
        return {
            avg: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0,
            ids: c.students.filter(s => s.rank && !s.is_transferring_out).map(s => s.id)
        };
    }).filter(s => s.avg > 0);

    const sortedRanks = [...rankStats].sort((a, b) => b.avg - a.avg);
    if (sortedRanks.length > 1) {
        const highRank = sortedRanks[0];
        const lowRank = sortedRanks[sortedRanks.length - 1];
        if (highRank.avg - lowRank.avg > 5.0) {
            const highClassIdx = rankStats.findIndex(s => s === highRank);
            issues.push({
                type: 'rank_imbalance',
                severity: (highRank.avg - lowRank.avg - 5.0) * 1000,
                description: `성적 불균형: ${highClassIdx + 1}반(평균 ${highRank.avg.toFixed(1)}등) vs 평균 ${lowRank.avg.toFixed(1)}등인 반과의 차이`,
                affectedClasses: [highClassIdx + 1],
                studentIds: highRank.ids,
                details: { highRank: highRank.avg, lowRank: lowRank.avg }
            });
        }
    }

    // 11. 전체 최적화 (Optimization) - 명시적 위반은 아니나 더 나은 균형이 가능한 경우
    const totalScore = calculateViolationScore(allocation);
    if (totalScore > 0) {
        // 주요 위반 사항(severity > 1000)이 하나라도 있는지 확인
        const hasMajorIssues = issues.some(i => i.severity >= 5000);

        issues.push({
            type: 'optimization',
            severity: Math.min(totalScore, 100), // 낮은 심각도 유지
            description: hasMajorIssues
                ? "💡 위 문제들을 해결하면서 인원/성비 균형을 더 완벽하게 맞출 수 있습니다."
                : "✨ 모든 규칙이 지켜졌습니다! 클릭 시 허용 범위 내에서 인원/성비 등 미세한 균형을 최대한 맞춰 완성도를 높입니다.",
            affectedClasses: allocation.classes.map((_, i) => i + 1),
            studentIds: allocation.classes.flatMap(c => c.students.filter(s => !s.is_transferring_out).map(s => s.id)),
            details: { totalScore }
        });
    }



    // 5. 기존반 성별 쏠림 (기존반 배분에서 특정 성별이 한명도 없으면)
    allocation.classes.forEach((cls, idx) => {
        const originMap = new Map<number, Student[]>();
        cls.students.filter(s => !s.is_transferring_out).forEach(s => {
            const origin = s.section_number || 0;
            if (origin === 0) return;
            if (!originMap.has(origin)) originMap.set(origin, []);
            originMap.get(origin)!.push(s);
        });

        originMap.forEach((students, origin) => {
            if (students.length >= 2) {
                const males = students.filter(s => s.gender === 'M').length;
                const females = students.filter(s => s.gender === 'F').length;

                // 해당 기존반 출신이 2명 이상인데, 한쪽 성별만 있는 경우
                if ((males > 0 && females === 0) || (females > 0 && males === 0)) {
                    issues.push({
                        type: 'origin_gender_imbalance',
                        severity: students.length * 2000,
                        description: `${idx + 1}반에 배정된 기존 ${origin}반 학생 ${students.length}명 모두가 ${males > 0 ? '남학생' : '여학생'}입니다.`,
                        affectedClasses: [idx + 1],
                        studentIds: students.map(s => s.id),
                        details: { origin, students, gender: males > 0 ? 'M' : 'F' }
                    });
                }
            }
        });
    });

    return issues.sort((a, b) => b.severity - a.severity);
}

// 교환 해결 방법 탐색
export function findSwapSolutions(
    allocation: AllocationResult,
    issues: Issue[],
    topN: number = 3
): SwapSolution[] {
    const solutions: SwapSolution[] = [];
    const currentScore = calculateViolationScore(allocation);
    const numClasses = allocation.classes.length;

    // 전체 통계 계산 (v2.4 평균값 용)
    const allStudents = allocation.classes.flatMap(c => c.students.filter(s => !s.is_transferring_out));
    const totalMales = allStudents.filter(s => s.gender === 'M').length;
    const totalFemales = allStudents.filter(s => s.gender === 'F').length;
    const avgMale = (totalMales / numClasses).toFixed(1);
    const avgFemale = (totalFemales / numClasses).toFixed(1);
    const avgRank = (allStudents.filter(s => s.rank).reduce((a, b) => a + (b.rank || 0), 0) / (allStudents.filter(s => s.rank).length || 1)).toFixed(1);

    const prevClassCounts = new Map<number, number>();
    allStudents.forEach(s => {
        const p = s.section_number || 1;
        prevClassCounts.set(p, (prevClassCounts.get(p) || 0) + 1);
    });

    // 각 이슈별로 해결 방법 탐색
    issues.forEach(issue => {
        const classSolutions: SwapSolution[] = [];

        // 문제가 있는 반의 학생들
        const affectedClassIdx = issue.affectedClasses[0] - 1; // 0-based index
        const affectedClass = allocation.classes[affectedClassIdx];

        // 해당 문제와 관련된 학생들만 선택 (studentIds가 있으면 우선 활용)
        let candidateStudents: Student[] = [];

        if (issue.studentIds && issue.studentIds.length > 0) {
            candidateStudents = affectedClass.students.filter(s =>
                issue.studentIds!.includes(s.id)
            );
        } else if (issue.type === 'duplicate_name' && issue.details?.students) {
            candidateStudents = issue.details.students.slice(1);
        } else if (issue.type === 'problem_imbalance') {
            candidateStudents = affectedClass.students.filter(s =>
                s.is_problem_student && !s.is_transferring_out
            );
        } else if (issue.type === 'underachiever_imbalance') {
            candidateStudents = affectedClass.students.filter(s =>
                s.is_underachiever && !s.is_transferring_out
            );
        } else if (issue.type === 'gender_imbalance' && issue.details) {
            const targetGender = issue.details.male > issue.details.female ? 'M' : 'F';
            candidateStudents = affectedClass.students.filter(s =>
                s.gender === targetGender && !s.is_transferring_out
            );
        } else {
            candidateStudents = affectedClass.students.filter(s => !s.is_transferring_out);
        }

        // 다른 반의 학생들과 교환 시뮬레이션
        allocation.classes.forEach((otherClass, otherIdx) => {
            if (otherIdx === affectedClassIdx) return;

            candidateStudents.forEach(studentA => {
                // 두 단계를 거쳐 탐색: 1. 성별이 같은 학생 우선, 2. 다른 성별 탐색
                // 단, 성비 불균형 문제 해결 시에는 성별이 다른 학생 교환이 필수적일 수 있음
                const otherStudents = otherClass.students.filter(s => !s.is_transferring_out);

                // 성비 불균형 이외의 문제라면 같은 성별 우선 탐색하여 통계적 균형 유지
                const prioritizedStudents = issue.type !== 'gender_imbalance'
                    ? [
                        ...otherStudents.filter(s => s.gender === studentA.gender),
                        ...otherStudents.filter(s => s.gender !== studentA.gender)
                    ]
                    : [
                        ...otherStudents.filter(s => s.gender !== studentA.gender),
                        ...otherStudents.filter(s => s.gender === studentA.gender)
                    ];

                prioritizedStudents.forEach(studentB => {
                    // 가상 교환 시뮬레이션
                    const simulatedAllocation = simulateSwap(
                        allocation,
                        studentA,
                        studentB,
                        affectedClassIdx,
                        otherIdx
                    );

                    const newScore = calculateViolationScore(simulatedAllocation);
                    const improvement = currentScore - newScore;

                    // 점수가 개선되었는지 확인
                    if (improvement > 0) {
                        const newIssues = detectIssues(simulatedAllocation);

                        // 해당 이슈의 심각도가 개선되었는지 확인 (반드시 완벽해결이 아니어도 됨)
                        const originalIssueSeverityBefore = issue.severity;
                        const originalIssueSeverityAfter = newIssues
                            .filter(ni => ni.type === issue.type && ni.affectedClasses.some(c => issue.affectedClasses.includes(c)))
                            .reduce((sum, ni) => sum + ni.severity, 0);

                        const isImproved = originalIssueSeverityAfter < originalIssueSeverityBefore;

                        if (isImproved) {
                            // 통계 계산 (설명용)
                            const classAAfter = simulatedAllocation.classes[affectedClassIdx];
                            const classBAfter = simulatedAllocation.classes[otherIdx];

                            const countA = classAAfter.students.filter(s => !s.is_transferring_out).length;
                            const countB = classBAfter.students.filter(s => !s.is_transferring_out).length;
                            const specialA = classAAfter.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
                            const specialB = classBAfter.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
                            const maleA = classAAfter.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const femaleA = classAAfter.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;
                            const maleB = classBAfter.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const femaleB = classBAfter.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;

                            // 설명 생성
                            let explanation = "";
                            const fromName = `${affectedClassIdx + 1}반`;
                            const toName = `${otherIdx + 1}반`;

                            if (issue.type === 'duplicate_name') {
                                explanation = `동명이인(${studentA.name}) 갈등을 해결합니다. 학생이 이동하여 각 반에 한 명씩만 배정되도록 조정됩니다.`;
                            } else if (issue.type === 'similar_name') {
                                explanation = `유사 이름(${studentA.name})으로 인한 혼란을 방지합니다. 학생을 분산하여 각 반에 한 명씩 배정합니다.`;
                            } else if (issue.type === 'sep_violation') {
                                explanation = `"분리 배정" 제약을 충족합니다. 함께 있으면 안 되는 학생들이 ${fromName}과 ${toName}으로 각각 떨어져 배치됩니다.`;
                            } else if (issue.type === 'bind_violation') {
                                explanation = `"함께 배정" 제약을 충족합니다. ${studentA.name} 학생을 ${toName}으로 보내 그룹원들과 같은 반이 되도록 합니다.`;
                            } else if (issue.type === 'problem_imbalance') {
                                const probA = classAAfter.students.filter(s => s.is_problem_student && !s.is_transferring_out).length;
                                const probB = classBAfter.students.filter(s => s.is_problem_student && !s.is_transferring_out).length;
                                explanation = `문제행동 학생 편차를 줄입니다. 교환 후 ${fromName}(${probA}명), ${toName}(${probB}명)으로 균형이 개선됩니다.`;
                            } else if (issue.type === 'underachiever_imbalance') {
                                const undA = classAAfter.students.filter(s => s.is_underachiever && !s.is_transferring_out).length;
                                const undB = classBAfter.students.filter(s => s.is_underachiever && !s.is_transferring_out).length;
                                explanation = `학습부진 학생 편차를 줄입니다. 교환 후 ${fromName}(${undA}명), ${toName}(${undB}명)으로 균형이 개선됩니다.`;
                            } else if (issue.type === 'gender_imbalance') {
                                explanation = `남녀 성비를 조정합니다. 결과적으로 ${fromName}(남${maleA}:여${femaleA}), ${toName}(남${maleB}:여${femaleB})로 성비 불균형이 해소됩니다.`;
                            } else if (issue.type === 'size_imbalance' || issue.type === 'special_imbalance') {
                                const weightA = countA + specialA;
                                const weightB = countB + specialB;
                                explanation = `반별 인원 편차를 줄입니다. 가중치 인원이 ${fromName}(${weightA}명), ${toName}(${weightB}명)으로 조정되어 균일해집니다.`;
                            } else if (issue.type === 'previous_class_imbalance') {
                                const prevNum = studentA.section_number || 1;
                                const pA = classAAfter.students.filter(s => (s.section_number || 1) === prevNum && !s.is_transferring_out).length;
                                const pB = classBAfter.students.filter(s => (s.section_number || 1) === prevNum && !s.is_transferring_out).length;
                                explanation = `기존 ${prevNum}반 학생 쏠림을 해결합니다. 교환 후 ${fromName}(${pA}명), ${toName}(${pB}명)으로 적절히 분산됩니다.`;

                            } else if (issue.type === 'origin_gender_imbalance') {
                                const prevNum = issue.details.origin;
                                explanation = `기존 ${prevNum}반 학생들의 성별 쏠림을 완화합니다. 다른 성별의 학생을 포함시켜 균형을 맞춥니다.`;
                            } else if (issue.type === 'rank_imbalance') {
                                const avgA = classAAfter.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (classAAfter.students.filter(s => s.rank && !s.is_transferring_out).length || 1);
                                const avgB = classBAfter.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (classBAfter.students.filter(s => s.rank && !s.is_transferring_out).length || 1);
                                explanation = `학급 간 성적 격차를 줄입니다. 교환 후 ${fromName}(평균 ${avgA.toFixed(1)}등), ${toName}(평균 ${avgB.toFixed(1)}등)으로 균형이 개선됩니다.`;
                            } else if (issue.type === 'optimization') {
                                explanation = `전체적인 균형을 한 단계 더 높입니다. (인원 ${countA}:${countB} / 성비 남${maleA}:여${femaleA} 등 미세 조정)`;
                            } else {
                                explanation = `${fromName}의 문제를 해결하고 전체적인 배정 완성도를 높입니다.`;
                            }

                            // 구체적 수치 변화 (v2.2)
                            const beforeMaleA = affectedClass.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const beforeFemaleA = affectedClass.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;
                            const beforeMaleB = otherClass.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const beforeFemaleB = otherClass.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;

                            const afterMaleA = classAAfter.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const afterFemaleA = classAAfter.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;
                            const afterMaleB = classBAfter.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
                            const afterFemaleB = classBAfter.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;

                            const beforeAvgA = affectedClass.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (affectedClass.students.filter(s => s.rank && !s.is_transferring_out).length || 1);
                            const beforeAvgB = otherClass.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (otherClass.students.filter(s => s.rank && !s.is_transferring_out).length || 1);

                            const afterAvgA = classAAfter.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (classAAfter.students.filter(s => s.rank && !s.is_transferring_out).length || 1);
                            const afterAvgB = classBAfter.students.filter(s => s.rank && !s.is_transferring_out).reduce((a, b) => a + (b.rank || 0), 0) / (classBAfter.students.filter(s => s.rank && !s.is_transferring_out).length || 1);

                            const beforeWeightA = affectedClass.students.filter(s => !s.is_transferring_out).length + affectedClass.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
                            const beforeWeightB = otherClass.students.filter(s => !s.is_transferring_out).length + otherClass.students.filter(s => s.is_special_class && !s.is_transferring_out).length;

                            const afterWeightA = classAAfter.students.filter(s => !s.is_transferring_out).length + classAAfter.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
                            const afterWeightB = classBAfter.students.filter(s => !s.is_transferring_out).length + classBAfter.students.filter(s => s.is_special_class && !s.is_transferring_out).length;

                            // 기존반 분산 정보 (v2.3)
                            const prevNumA = studentA.section_number || 1;
                            const prevNumB = studentB.section_number || 1;

                            const beforePrevAInA = affectedClass.students.filter(s => (s.section_number || 1) === prevNumA && !s.is_transferring_out).length;
                            const afterPrevAInA = classAAfter.students.filter(s => (s.section_number || 1) === prevNumA && !s.is_transferring_out).length;
                            const beforePrevBInB = otherClass.students.filter(s => (s.section_number || 1) === prevNumB && !s.is_transferring_out).length;
                            const afterPrevBInB = classBAfter.students.filter(s => (s.section_number || 1) === prevNumB && !s.is_transferring_out).length;

                            classSolutions.push({
                                issue,
                                studentA,
                                studentB,
                                fromClass: affectedClassIdx + 1,
                                toClass: otherIdx + 1,
                                scoreImprovement: improvement,
                                newIssues: newIssues.filter(ni => ni.severity > 0),
                                explanation,
                                outcomes: {
                                    gender: {
                                        from: `${fromName} 남${beforeMaleA}:여${beforeFemaleA} → 남${afterMaleA}:여${afterFemaleA}`,
                                        to: `${toName} 남${beforeMaleB}:여${beforeFemaleB} → 남${afterMaleB}:여${afterFemaleB}`,
                                        avg: `평균 남${avgMale}:여${avgFemale}`
                                    },
                                    size: {
                                        from: `${fromName} ${beforeWeightA}명 → ${afterWeightA}명`,
                                        to: `${toName} ${beforeWeightB}명 → ${afterWeightB}명`
                                    },
                                    rank: {
                                        from: `${fromName} ${beforeAvgA.toFixed(1)}등 → ${afterAvgA.toFixed(1)}등`,
                                        to: `${toName} ${beforeAvgB.toFixed(1)}등 → ${afterAvgB.toFixed(1)}등`,
                                        avg: `평균 ${avgRank}등`
                                    },
                                    prevClass: {
                                        from: `기존 ${prevNumA}반 학생: ${beforePrevAInA}명 → ${afterPrevAInA}명`,
                                        fromAvg: `평균 ${(prevClassCounts.get(prevNumA)! / numClasses).toFixed(1)}명`,
                                        to: `기존 ${prevNumB}반 학생: ${beforePrevBInB}명 → ${afterPrevBInB}명`,
                                        toAvg: `평균 ${(prevClassCounts.get(prevNumB)! / numClasses).toFixed(1)}명`
                                    }
                                }
                            });
                        }
                    }
                });
            });
        });

        // 상위 N개 선택
        solutions.push(...classSolutions
            .sort((a, b) => b.scoreImprovement - a.scoreImprovement)
            .slice(0, topN)
        );
    });

    // 복합 교환 탐색 (추가)
    const complexSolutions = findComplexSwapSolutions(allocation, issues, topN);
    solutions.push(...complexSolutions);

    return solutions.slice(0, topN * issues.length + 5); // 조금 더 여유있게 반환
}

// ----------------------------------------------------
// 복합 교환 시뮬레이션 (2:1, 3-way)
// ----------------------------------------------------

export function findComplexSwapSolutions(
    allocation: AllocationResult,
    issues: Issue[],
    topN: number = 2
): SwapSolution[] {
    const solutions: SwapSolution[] = [];
    const currentScore = calculateViolationScore(allocation);
    const numClasses = allocation.classes.length;

    // 전체 통계 (설명용)
    const allStudents = allocation.classes.flatMap(c => c.students.filter(s => !s.is_transferring_out));
    const totalMales = allStudents.filter(s => s.gender === 'M').length;
    const totalFemales = allStudents.filter(s => s.gender === 'F').length;
    const avgMale = (totalMales / numClasses).toFixed(1);
    const avgFemale = (totalFemales / numClasses).toFixed(1);

    // 심각한 이슈들만 대상으로 복합 해결책 탐색 (성능 고려)
    const criticalIssues = issues.filter(i => i.severity >= 5000 || i.type === 'origin_gender_imbalance');

    criticalIssues.forEach(issue => {
        const affectedClassIdx = issue.affectedClasses[0] - 1;
        const affectedClass = allocation.classes[affectedClassIdx];

        // 1. [2:1 트레이드] 
        // 문제 반에서 2명을 보내고 1명을 받아오거나, 1명을 보내고 2명을 받아오는 시나리오
        // 주로 인원 불균형이나, 쏠림 해소를 위해 사용됨
        allocation.classes.forEach((otherClass, otherIdx) => {
            if (otherIdx === affectedClassIdx) return;

            // Case A: 문제 반(A)에서 2명 -> 상대 반(B)에서 1명 (A 인원 -1 효과)
            // (A반이 과밀하거나, 특정 그룹이 쏠려있을 때 유효)
            const candidatesA = affectedClass.students.slice(0, 10); // 성능상 상위 10명만 샘플링 (실제론 더 정교한 타겟팅 필요)
            const candidatesB = otherClass.students.slice(0, 10);

            candidatesA.forEach((sA1, i) => {
                candidatesA.slice(i + 1).forEach(sA2 => {
                    candidatesB.forEach(sB => {
                        // 시뮬레이션
                        const simResult = simulateMultiSwap(allocation, [sA1, sA2], [sB], affectedClassIdx, otherIdx);
                        evaluateAndAddSolution(
                            simResult, currentScore, issue, solutions,
                            { type: '2:1', sA: sA1, sA2: sA2, sB: sB, idxA: affectedClassIdx, idxB: otherIdx },
                            { avgMale, avgFemale, allocation, numClasses }
                        );
                    });
                });
            });
        });

        // 2. [3각 트레이드] (Triangle Swap)
        // A -> B, B -> C, C -> A
        // 1:1 교환의 Deadlock을 해결
        allocation.classes.forEach((classB, idxB) => {
            if (idxB === affectedClassIdx) return;
            allocation.classes.forEach((classC, idxC) => {
                if (idxC === affectedClassIdx || idxC === idxB) return;

                const candidatesA = affectedClass.students.slice(0, 5);
                const candidatesB = classB.students.slice(0, 5);
                const candidatesC = classC.students.slice(0, 5);

                candidatesA.forEach(sA => {
                    candidatesB.forEach(sB => {
                        candidatesC.forEach(sC => {
                            const simResult = simulateTriangleSwap(allocation, sA, sB, sC, affectedClassIdx, idxB, idxC);
                            evaluateAndAddSolution(
                                simResult, currentScore, issue, solutions,
                                { type: 'triangle', sA, sB, sC, idxA: affectedClassIdx, idxB: idxB, idxC: idxC },
                                { avgMale, avgFemale, allocation, numClasses }
                            );
                        });
                    });
                });
            });
        });
    });

    return solutions.sort((a, b) => b.scoreImprovement - a.scoreImprovement).slice(0, topN);
}

// 헬퍼: 솔루션 평가 및 등록
function evaluateAndAddSolution(
    simResult: AllocationResult,
    currentScore: number,
    issue: Issue,
    solutions: SwapSolution[],
    context: any,
    stats: any
) {
    const newScore = calculateViolationScore(simResult);
    const improvement = currentScore - newScore;

    if (improvement > 2000) { // 유의미한 개선만
        const newIssues = detectIssues(simResult);
        // 설명 및 통계 생성 로직 (약식)
        // ... 실제 구현 시 상세 내용을 채워넣어야 함

        if (context.type === '2:1') {
            solutions.push({
                issue,
                studentA: context.sA,
                studentB: context.sB,
                fromClass: context.idxA + 1,
                toClass: context.idxB + 1,
                scoreImprovement: improvement,
                newIssues,
                explanation: `[2:1 교환] ${context.sA.name}, ${context.sA2.name} ➡️ ${context.idxB + 1}반 / ${context.sB.name} ⬅️ ${context.idxA + 1}반`,
                complexSwapType: '2:1',
                additionalTransfers: [
                    { student: context.sA2, fromClass: context.idxA + 1, toClass: context.idxB + 1 },
                ],
                // outcomes: ... (생략, 필요시 추가)
            });
        } else if (context.type === 'triangle') {
            solutions.push({
                issue,
                studentA: context.sA,
                studentB: context.sB, // 대표 표시용
                fromClass: context.idxA + 1,
                toClass: context.idxB + 1, // A -> B
                scoreImprovement: improvement,
                newIssues,
                explanation: `[삼각 교환] ${context.sA.name}→${context.idxB + 1}반, ${context.sB.name}→${context.idxC + 1}반, ${context.sC.name}→${context.idxA + 1}반`,
                complexSwapType: 'triangle',
                additionalTransfers: [
                    { student: context.sB, fromClass: context.idxB + 1, toClass: context.idxC + 1 },
                    { student: context.sC, fromClass: context.idxC + 1, toClass: context.idxA + 1 }
                ]
            });
        }
    }
}


function simulateMultiSwap(
    allocation: AllocationResult,
    studentsFromA: Student[],
    studentsFromB: Student[],
    classAIdx: number,
    classBIdx: number
): AllocationResult {
    const simulated: AllocationResult = {
        classId: allocation.classId,
        classes: allocation.classes.map((cls, idx) => {
            if (idx === classAIdx) {
                let newStudents = cls.students.filter(s => !studentsFromA.some(rm => rm.id === s.id));
                newStudents = newStudents.concat(studentsFromB);
                return { ...cls, students: newStudents };
            } else if (idx === classBIdx) {
                let newStudents = cls.students.filter(s => !studentsFromB.some(rm => rm.id === s.id));
                newStudents = newStudents.concat(studentsFromA);
                return { ...cls, students: newStudents };
            }
            return cls;
        })
    };
    return simulated;
}

function simulateTriangleSwap(
    allocation: AllocationResult,
    sA: Student,
    sB: Student,
    sC: Student,
    idxA: number,
    idxB: number,
    idxC: number
): AllocationResult {
    return {
        classId: allocation.classId,
        classes: allocation.classes.map((cls, idx) => {
            if (idx === idxA) {
                // A에서 sA 나가고, sC 들어옴
                return { ...cls, students: cls.students.filter(s => s.id !== sA.id).concat(sC) };
            } else if (idx === idxB) {
                // B에서 sB 나가고, sA 들어옴
                return { ...cls, students: cls.students.filter(s => s.id !== sB.id).concat(sA) };
            } else if (idx === idxC) {
                // C에서 sC 나가고, sB 들어옴
                return { ...cls, students: cls.students.filter(s => s.id !== sC.id).concat(sB) };
            }
            return cls;
        })
    };
}

// 교환 시뮬레이션
function simulateSwap(
    allocation: AllocationResult,
    studentA: Student,
    studentB: Student,
    classAIdx: number,
    classBIdx: number
): AllocationResult {
    const simulated: AllocationResult = {
        classId: allocation.classId,
        classes: allocation.classes.map((cls, idx) => {
            if (idx === classAIdx) {
                // A반: studentA 제거, studentB 추가
                return {
                    ...cls,
                    students: cls.students
                        .filter(s => s.id !== studentA.id)
                        .concat(studentB)
                };
            } else if (idx === classBIdx) {
                // B반: studentB 제거, studentA 추가
                return {
                    ...cls,
                    students: cls.students
                        .filter(s => s.id !== studentB.id)
                        .concat(studentA)
                };
            }
            return cls;
        })
    };

    return simulated;
}
