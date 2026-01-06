import { Student, AllocationResult } from './types';

// ========================================
// 타입 확장 및 정의
// ========================================

interface StudentWithLock extends Student {
    is_locked?: boolean;
}

interface ClassAllocation {
    [classIndex: number]: StudentWithLock[];
}

interface AlgorithmConfig {
    specialReductionCount: number; // 특수학생 가중치 (기본 2.0 = 1명 추가 공간 차지)
    maxClassSizeDifference: number;
    maxGenderDifference: number;
}

// ========================================
// 유틸리티 함수
// ========================================

function normalizeGender(gender: any): 'M' | 'F' {
    if (!gender) return 'M';
    const g = String(gender).trim().toLowerCase();
    if (g === 'm' || g === 'male' || g === '남' || g.includes('남')) return 'M';
    if (g === 'f' || g === 'female' || g === '여' || g.includes('여')) return 'F';
    return 'M';
}

function parseConstraints(student: Student) {
    const groups = student.group_name ? student.group_name.split(',') : [];
    const sep = groups.filter(g => g.startsWith('SEP:')).map(g => g.replace('SEP:', '').trim());
    const bind = groups.filter(g => g.startsWith('BIND:')).map(g => g.replace('BIND:', '').trim());
    return { sep, bind };
}

function getGenderCounts(classStudents: Student[]): { male: number; female: number } {
    const activeStudents = classStudents.filter(s => !s.is_transferring_out);
    return {
        male: activeStudents.filter(s => normalizeGender(s.gender) === 'M').length,
        female: activeStudents.filter(s => normalizeGender(s.gender) === 'F').length
    };
}

/**
 * 가중치가 반영된 유효 학급 인원을 계산합니다. (V7.1)
 */
function getWeightedClassSize(classStudents: Student[], reductionWeight: number): number {
    const actualCount = classStudents.filter(s => !s.is_transferring_out).length;
    const specialCount = classStudents.filter(s => s.is_special_class && !s.is_transferring_out).length;
    // 특수학생 1명이 reductionWeight 만큼의 공간을 차지함
    return actualCount + (specialCount * (reductionWeight - 1));
}

/**
 * 학급의 평균 석차를 계산합니다.
 */
function getClassAverageRank(classStudents: Student[]): number {
    const studentsWithRank = classStudents.filter(s => s.rank !== undefined && s.rank !== null && !s.is_transferring_out);
    if (studentsWithRank.length === 0) return 15; // 기본 중간값 (보통 1~30위 기준)
    return studentsWithRank.reduce((sum, s) => sum + (s.rank || 0), 0) / studentsWithRank.length;
}

// ========================================
// 벌점 계산 공식 (V7.1 핵심)
// ========================================

function calculatePenalty(
    student: Student,
    targetClass: StudentWithLock[],
    config: AlgorithmConfig,
    minWeightedSize: number = 0
): number {
    let penalty = 0;

    const weightedSize = getWeightedClassSize(targetClass, config.specialReductionCount);
    // 특수학생인 경우 가중치 추가 (미래 상태 예측)
    const studentWeight = (student.is_special_class && !student.is_transferring_out) ? config.specialReductionCount : 1;
    const projectedSize = weightedSize + studentWeight;

    // 최소 사이즈와의 편차
    const sizeDiff = projectedSize - minWeightedSize;

    // 1. [Layer 1] 동명이인 분리 (10^12) - 절대적 최우선
    const duplicateNameCount = targetClass.filter(s =>
        s.name === student.name && !s.is_transferring_out
    ).length;
    if (duplicateNameCount > 0) penalty += 1_000_000_000_000; // 10^12

    // 2. [Layer 2] 인원 편차 2명 이상 (10^9) - 강한 정원 억제 (Hard Limit)
    // 편차가 2 이상 벌어지는 것은 절대 허용하지 않으려 함
    if (sizeDiff >= 2) penalty += 1_000_000_000; // 10^9

    // 3. [Layer 3] 기존반 + 성별 뭉침 방지 (10^7) - 주된 분산 목표 (Priority High)
    // 동일 반 & 동일 성별 뭉침 회피
    const gender = normalizeGender(student.gender);
    const originClass = student.section_number || 0;
    const clumpingGenderCount = targetClass.filter(s =>
        (s.section_number || 0) === originClass &&
        normalizeGender(s.gender) === gender &&
        !s.is_transferring_out
    ).length;
    if (clumpingGenderCount > 0) penalty += clumpingGenderCount * 10_000_000; // 10^7 (개당)

    // 4. [Layer 4] 인원 편차 1명 (10^5) - 약한 정원 억제 (Soft Limit)
    // 뭉침 방지(Layer 3)를 위해서라면 1명 차이는 감수할 수 있음 (10^7 > 10^5)
    // 하지만 그 외의 경우(단순 기존반 분산)보다는 균형이 우선 (10^5 > 10^4)
    if (sizeDiff >= 1) penalty += 100_000; // 10^5

    // 5. [Layer 5] 기존반 분산 (10^4) - 성별 달라도 가급적 분리
    const sameOriginCount = targetClass.filter(s =>
        (s.section_number || 0) === originClass && !s.is_transferring_out
    ).length;
    if (sameOriginCount > 0) penalty += sameOriginCount * 10_000; // 10^4

    // 6. [Layer 6] 성별 균형 (10^3)
    const counts = getGenderCounts(targetClass);
    const sameGenderCount = gender === 'M' ? counts.male : counts.female;
    penalty += sameGenderCount * 1_000; // 10^3

    // 7. [Layer 7] 특별관리대상 분산 (10^2)
    if (student.is_problem_student) {
        const problemCount = targetClass.filter(s => s.is_problem_student && !s.is_transferring_out).length;
        penalty += problemCount * 100;
    }
    if (student.is_underachiever) {
        const underachieverCount = targetClass.filter(s => s.is_underachiever && !s.is_transferring_out).length;
        penalty += underachieverCount * 100;
    }

    // 8. [Layer 8] 학업 수준 평탄화 (10^1)
    if (student.rank !== undefined && student.rank !== null) {
        const avgRank = getClassAverageRank(targetClass);
        penalty += Math.abs(avgRank - student.rank) * 10;
    }

    return penalty;
}

// ========================================
// 배정 로직 (Phase System V7.1)
// ========================================

/**
 * Phase 1: 고정 배정 (특수, BIND, SEP)
 */
function assignFixedStudents(
    students: Student[],
    allocation: ClassAllocation,
    classCount: number,
    config: AlgorithmConfig
): Set<number> {
    const assignedIds = new Set<number>();

    // 1. 특수학생 분산 배치 및 Lock (랜덤 시작)
    const special = students.filter(s => s.is_special_class && !s.is_transferring_out);
    const startIdx = Math.floor(Math.random() * classCount);
    special.forEach((s, idx) => {
        const target = (startIdx + idx) % classCount;
        const studentWithLock: StudentWithLock = { ...s, is_locked: true };
        allocation[target].push(studentWithLock);
        assignedIds.add(s.id);
    });

    // 2. BIND 그룹 (반드시 같은 반)
    const bindMap = new Map<string, Student[]>();
    students.forEach(s => {
        if (assignedIds.has(s.id)) return;
        const { bind } = parseConstraints(s);
        bind.forEach(g => {
            if (!bindMap.has(g)) bindMap.set(g, []);
            bindMap.get(g)!.push(s);
        });
    });

    Array.from(bindMap.entries()).forEach(([name, members]) => {
        // 현재 가중치 인원이 가장 적은 반 선택
        let minIdx = 0;
        let minSize = Infinity;
        for (let i = 0; i < classCount; i++) {
            const size = getWeightedClassSize(allocation[i], config.specialReductionCount);
            if (size < minSize) { minSize = size; minIdx = i; }
        }

        members.filter(m => !assignedIds.has(m.id)).forEach(m => {
            const studentWithLock: StudentWithLock = { ...m, is_locked: true };
            allocation[minIdx].push(studentWithLock);
            assignedIds.add(m.id);
        });
    });

    // 3. SEP 그룹 (반드시 다른 반)
    const sepMap = new Map<string, Student[]>();
    students.forEach(s => {
        if (assignedIds.has(s.id)) return;
        const { sep } = parseConstraints(s);
        sep.forEach(g => {
            if (!sepMap.has(g)) sepMap.set(g, []);
            sepMap.get(g)!.push(s);
        });
    });

    Array.from(sepMap.entries()).forEach(([name, members]) => {
        const usedClasses = new Set<number>();
        members.forEach(m => {
            if (assignedIds.has(m.id)) return;
            // 이미 사용된 반 제외하고 가장 적은 반 선택
            let minIdx = -1;
            let minSize = Infinity;
            // 현재 전체 반 중 최소 사이즈 계산 (비교용)
            // 여기서는 '가상으로 넣었을 때 최소가 되는 곳'을 찾아야 하므로 약간 다름.
            // 하지만 BIND/SEP은 Forced Assignment에 가까우므로 단순 Size 비교
            for (let i = 0; i < classCount; i++) {
                if (usedClasses.has(i)) continue;
                const size = getWeightedClassSize(allocation[i], config.specialReductionCount);
                if (size < minSize) { minSize = size; minIdx = i; }
            }
            if (minIdx === -1) minIdx = 0; // 예외 발생 시 0번반 (거의 없음)

            const studentWithLock: StudentWithLock = { ...m, is_locked: true };
            allocation[minIdx].push(studentWithLock);
            assignedIds.add(m.id);
            usedClasses.add(minIdx);
        });
    });

    return assignedIds;
}

/**
 * Phase 2: 일반 학생 벌점 기반 Greedy 배정
 */
function assignGeneralStudents(
    students: Student[],
    allocation: ClassAllocation,
    classCount: number,
    assignedIds: Set<number>,
    config: AlgorithmConfig
): void {
    // 1. 전출생 제외 및 무작위 셔플 후 석차 순 정렬
    const remaining = students
        .filter(s => !assignedIds.has(s.id) && !s.is_transferring_out)
        .sort(() => Math.random() - 0.5) // 1차 셔플
        .sort((a, b) => (a.rank || 999) - (b.rank || 999)); // 2차 석차순 (동일 석차 내에서 셔플 유지)

    // 2. Greedy 배정
    remaining.forEach(student => {
        let minPenalty = Infinity;
        let candidates: number[] = [];

        const currentSizes = Array.from({ length: classCount }, (_, i) =>
            getWeightedClassSize(allocation[i], config.specialReductionCount)
        );
        const minS = Math.min(...currentSizes);

        // 모든 반에 대해 벌점 계산
        for (let i = 0; i < classCount; i++) {
            const penalty = calculatePenalty(student, allocation[i], config, minS);
            if (penalty < minPenalty) {
                minPenalty = penalty;
                candidates = [i];
            } else if (penalty === minPenalty) {
                candidates.push(i);
            }
        }

        // 벌점이 같은 반들 중 무작위 선택
        const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)];
        allocation[chosenIdx].push(student);
        assignedIds.add(student.id);
    });
}

/**
 * Phase 3: 스마트 스왑 (최종 균형 최적화)
 */
function optimizeAllocation(
    allocation: ClassAllocation,
    classCount: number,
    config: AlgorithmConfig
): void {
    // 성비 불균형 및 인원 불균형 수정을 위한 안전한 스왑 시도
    // V7.1에서는 뭉침 현상 악화 시 스택/취소 로직 포함
    for (let iter = 0; iter < 50; iter++) {
        let foundSwap = false;

        for (let c1 = 0; c1 < classCount; c1++) {
            for (let c2 = 0; c2 < classCount; c2++) {
                if (c1 === c2) continue;

                const s1List = allocation[c1].filter(s => !s.is_locked && !s.is_transferring_out);
                const s2List = allocation[c2].filter(s => !s.is_locked && !s.is_transferring_out);

                for (const s1 of s1List) {
                    for (const s2 of s2List) {
                        // 같은 성별끼리 인원수 조절을 위한 스왑은 나중에
                        // 여기서는 성비 불균형 해소를 위한 성별 다른 스왑 위주
                        if (normalizeGender(s1.gender) === normalizeGender(s2.gender)) continue;

                        // 현재 상태 벌점
                        const currentSizes = Array.from({ length: classCount }, (_, i) =>
                            getWeightedClassSize(allocation[i], config.specialReductionCount)
                        );
                        const minS = Math.min(...currentSizes);

                        const currentP1 = calculatePenalty(s1, allocation[c1], config, minS);
                        const currentP2 = calculatePenalty(s2, allocation[c2], config, minS);

                        // 가상 스왑 후 벌점 계산
                        const nextC1 = allocation[c1].filter(s => s.id !== s1.id);
                        const nextC2 = allocation[c2].filter(s => s.id !== s2.id);

                        // 가상 스약 후의 minSize 재계산은 복잡하므로 current minS 유지하거나 정밀 재계산
                        // 여기서는 단순함을 위해 기존 minS 사용 (전체적인 계층 구조는 유지됨)
                        const nextP1 = calculatePenalty(s2, nextC1, config, minS);
                        const nextP2 = calculatePenalty(s1, nextC2, config, minS);

                        // 전체 벌점합이 감소하면 스왑 실행
                        if ((nextP1 + nextP2) < (currentP1 + currentP2) - 10) { // 최소 10점 개선시
                            allocation[c1] = [...nextC1, s2];
                            allocation[c2] = [...nextC2, s1];
                            foundSwap = true;
                            break;
                        }
                    }
                    if (foundSwap) break;
                }
                if (foundSwap) break;
            }
            if (foundSwap) break;
        }
        if (!foundSwap) break;
    }
}

// ========================================
// 메인 호출 함수
// ========================================

export function allocateStudents(
    students: Student[],
    classCount: number,
    options: any = {}
): AllocationResult {
    // 설정 구성 (기본 가중치 2.0 권장)
    const config: AlgorithmConfig = {
        specialReductionCount: options.specialReductionCount || 2,
        maxClassSizeDifference: 1,
        maxGenderDifference: 1
    };

    const allocation: ClassAllocation = {};
    for (let i = 0; i < classCount; i++) allocation[i] = [];

    // 전출생 완전 분리
    const mainList = students.filter(s => !s.is_transferring_out);
    const outboundList = students.filter(s => s.is_transferring_out);

    // [Step 1] 고정 배정 (Locked)
    const assignedIds = assignFixedStudents(mainList, allocation, classCount, config);

    // [Step 2] 벌점 기반 Greedy 배정 (석차순)
    assignGeneralStudents(mainList, allocation, classCount, assignedIds, config);

    // [Step 3] 스마트 스왑 최적화
    optimizeAllocation(allocation, classCount, config);

    // [Step 4] 전출생 최종 합류 (끝 번호)
    outboundList.forEach((s, idx) => {
        allocation[idx % classCount].push(s);
    });

    // 결과 조립
    const classes = Array.from({ length: classCount }, (_, i) => {
        // 기본 한국어 이름순 정렬 (전출생은 마지막)
        const sortedStudents = [...allocation[i]].sort((a, b) => {
            if (a.is_transferring_out && !b.is_transferring_out) return 1;
            if (!a.is_transferring_out && b.is_transferring_out) return -1;
            return a.name.localeCompare(b.name, 'ko');
        });

        return {
            id: i + 1,
            students: sortedStudents,
            gender_stats: getGenderCounts(allocation[i]),
            special_factors: {
                problem: allocation[i].filter(s => s.is_problem_student && !s.is_transferring_out).length,
                special: allocation[i].filter(s => s.is_special_class && !s.is_transferring_out).length,
                underachiever: allocation[i].filter(s => s.is_underachiever && !s.is_transferring_out).length,
                transfer: allocation[i].filter(s => s.is_transferring_out).length
            }
        };
    });

    return {
        classId: 0,
        classes,
        report: {
            success: true,
            warnings: [],
            errors: [],
            statistics: {
                totalStudents: mainList.length,
                classCount,
                genderBalance: [],
                prevClassDistribution: [],
                constraintViolations: []
            }
        }
    };
}
