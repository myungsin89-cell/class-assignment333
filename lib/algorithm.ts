import { Student, ClassData, AllocationResult } from './types';

// ========================================
// 유틸리티 함수
// ========================================

/**
 * 제약조건 파싱
 */
function parseConstraints(student: Student) {
    const groups = student.group_name ? student.group_name.split(',') : [];
    const sep = groups.filter(g => g.startsWith('SEP:')).map(g => g.replace('SEP:', '').trim());
    const bind = groups.filter(g => g.startsWith('BIND:')).map(g => g.replace('BIND:', '').trim());
    return { sep, bind };
}

/**
 * 이름 추출 (성 제외)
 */
function extractGivenName(fullName: string): string {
    const trimmed = fullName.trim();
    // 한글 이름: 첫 글자를 성으로 간주하고 나머지를 이름으로
    if (trimmed.length >= 2) {
        return trimmed.substring(1);
    }
    return trimmed;
}

/**
 * 동명이인 감지
 */
function detectSameNames(students: Student[]) {
    const nameMap = new Map<string, Student[]>();
    const givenNameMap = new Map<string, Student[]>();

    students.forEach(s => {
        const fullName = s.name.trim();
        // 완전 동명이인
        if (!nameMap.has(fullName)) {
            nameMap.set(fullName, []);
        }
        nameMap.get(fullName)!.push(s);

        // 이름만 같은 학생 (성 제외)
        const givenName = extractGivenName(fullName);
        if (givenName) {
            if (!givenNameMap.has(givenName)) {
                givenNameMap.set(givenName, []);
            }
            givenNameMap.get(givenName)!.push(s);
        }
    });

    const exactDuplicates: string[] = []; // 완전 동명이인 (성+이름 동일)
    const similarNames: string[] = []; // 이름만 같음

    // 완전 동명이인 추출
    nameMap.forEach((students, name) => {
        if (students.length > 1) {
            exactDuplicates.push(name);
        }
    });

    // 이름만 같은 학생 추출 (완전 동명이인 제외)
    givenNameMap.forEach((students, givenName) => {
        if (students.length > 1) {
            // 모두 같은 전체 이름인지 확인 (완전 동명이인인지)
            const uniqueFullNames = new Set(students.map(s => s.name.trim()));
            // 전체 이름이 다르면 (이름만 같은 경우)
            if (uniqueFullNames.size > 1) {
                similarNames.push(givenName);
            }
        }
    });

    return { exactDuplicates, similarNames };
}

/**
 * BIND 그룹별로 학생들을 묶기
 */
function groupBindStudents(students: Student[]) {
    const bindMap = new Map<string, Student[]>();
    const processed = new Set<number>();
    const blocks: Student[][] = [];

    // BIND 그룹 수집
    students.forEach(s => {
        const { bind } = parseConstraints(s);
        bind.forEach(groupName => {
            if (!bindMap.has(groupName)) {
                bindMap.set(groupName, []);
            }
            bindMap.get(groupName)!.push(s);
        });
    });

    // BIND 그룹을 블록으로 변환
    bindMap.forEach((members, groupName) => {
        const blockStudents = members.filter(s => !processed.has(s.id));
        if (blockStudents.length > 0) {
            blockStudents.forEach(s => processed.add(s.id));
            blocks.push(blockStudents);
        }
    });

    // 나머지 개별 학생들
    students.forEach(s => {
        if (!processed.has(s.id)) {
            blocks.push([s]);
        }
    });

    return blocks;
}

// ========================================
// 평가 함수 (Cost Function)
// ========================================

interface ClassAllocation {
    [classIndex: number]: Student[];
}

/**
 * 배정안의 제약 위반을 점수화
 * 점수가 낮을수록 좋은 배정
 */
function calculateCost(allocation: ClassAllocation, classCount: number, sameNames: { exactDuplicates: string[], similarNames: string[] }): number {
    let cost = 0;

    // 1. 필수 분리 위반 (SEP) - 최우선 하드 제약
    // 반내부분리, 반외부분리는 반드시 지켜져야 하는 교육적 제약
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const sepGroups = new Map<string, number>();

        classStudents.forEach(s => {
            const { sep } = parseConstraints(s);
            sep.forEach(g => {
                sepGroups.set(g, (sepGroups.get(g) || 0) + 1);
            });
        });

        sepGroups.forEach(count => {
            if (count > 1) {
                cost += 10000 * (count - 1); // 같은 SEP 그룹이 n명 있으면 (n-1)*10000점 (하드 제약)
            }
        });
    }

    // 2. 완전 동명이인 분리 위반 - 최우선 (하드 제약)
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const nameCount = new Map<string, number>();

        classStudents.forEach(s => {
            const name = s.name.trim();
            if (sameNames.exactDuplicates.includes(name)) {
                nameCount.set(name, (nameCount.get(name) || 0) + 1);
            }
        });

        nameCount.forEach(count => {
            if (count > 1) {
                cost += 10000 * (count - 1); // 완전 동명이인이 같은 반에 있으면 매우 큰 패널티
            }
        });
    }

    // 2-1. 이름만 같은 학생들 분산 (소프트 제약)
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const givenNameCount = new Map<string, number>();

        classStudents.forEach(s => {
            const givenName = extractGivenName(s.name.trim());
            if (sameNames.similarNames.includes(givenName)) {
                givenNameCount.set(givenName, (givenNameCount.get(givenName) || 0) + 1);
            }
        });

        givenNameCount.forEach(count => {
            if (count > 1) {
                // 이름만 같은 학생이 같은 반에 여러 명 있으면 패널티
                // 2명: 500, 3명: 1000, 4명: 1500...
                cost += 500 * (count - 1);
            }
        });
    }

    // 3. 남녀 1등 같은 반 배정 위반
    const maleTop = allocation[0]?.concat(...Object.values(allocation))
        .filter(s => s.gender === 'M')
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))[0];
    const femaleTop = allocation[0]?.concat(...Object.values(allocation))
        .filter(s => s.gender === 'F')
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))[0];

    if (maleTop && femaleTop) {
        for (let c = 0; c < classCount; c++) {
            const classStudents = allocation[c] || [];
            if (classStudents.includes(maleTop) && classStudents.includes(femaleTop)) {
                cost += 500; // 남녀 1등이 같은 반
            }
        }
    }

    // 4. 특수교육 학생 분리 - 최우선 (하드 제약)
    // 특수교육 학생은 무조건 다른 반에 배치되어야 함
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const specialCount = classStudents.filter(s => s.is_special_class).length;
        if (specialCount > 1) {
            cost += 10000 * (specialCount - 1); // 특수교육 학생이 같은 반에 2명 이상이면 매우 큰 패널티
        }
    }

    // 5. 문제행동 학생 균등 분산 (최우선 소프트 제약)
    // 각 반의 문제행동 학생 수가 평균에서 벗어날수록 큰 패널티
    const allStudents = Object.values(allocation).flat();
    const totalProblem = allStudents.filter(s => s.is_problem_student).length;
    const avgProblem = totalProblem / classCount;

    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const problemCount = classStudents.filter(s => s.is_problem_student).length;
        const deviation = Math.abs(problemCount - avgProblem);
        // 편차 1당 3000점 (예: 평균 1명인데 2명이면 3000점, 0명이면 3000점)
        // 기존반 균등 분배(2000점)보다 높은 우선순위
        cost += deviation * 3000;
    }

    // 6. 학습부진 학생 균등 분산 (최우선 소프트 제약)
    // 각 반의 학습부진 학생 수가 평균에서 벗어날수록 큰 패널티
    const totalUnder = allStudents.filter(s => s.is_underachiever).length;
    const avgUnder = totalUnder / classCount;

    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const underCount = classStudents.filter(s => s.is_underachiever).length;
        const deviation = Math.abs(underCount - avgUnder);
        // 편차 1당 3000점 (예: 평균 1명인데 2명이면 3000점, 0명이면 3000점)
        // 기존반 균등 분배(2000점)보다 높은 우선순위
        cost += deviation * 3000;
    }

    // 7. 성별 균형
    const classSizes = Object.values(allocation).map(students => students.length);
    const avgSize = classSizes.reduce((a, b) => a + b, 0) / classCount;

    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const maleCount = classStudents.filter(s => s.gender === 'M').length;
        const femaleCount = classStudents.filter(s => s.gender === 'F').length;
        const imbalance = Math.abs(maleCount - femaleCount);
        cost += imbalance * 50;
    }

    // 8. 정원 균형 (전출예정 제외)
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        const actualSize = classStudents.filter(s => !s.is_transferring_out).length;
        const deviation = Math.abs(actualSize - avgSize);
        cost += deviation * 30;
    }

    // 9. 기존반 균등 분배 (최우선 제약) ⭐ 새로 추가
    // 각 기존반 학생들이 새 반에 균등하게 배정되었는지 확인
    const sectionDistribution = new Map<number, Map<number, number>>();

    // 기존반별로 각 새 반에 몇 명씩 배정되었는지 계산
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c] || [];
        classStudents.forEach(s => {
            const oldSection = s.section_number || 0;
            if (!sectionDistribution.has(oldSection)) {
                sectionDistribution.set(oldSection, new Map());
            }
            const sectionMap = sectionDistribution.get(oldSection)!;
            sectionMap.set(c, (sectionMap.get(c) || 0) + 1);
        });
    }

    // 각 기존반에서 새 반으로의 분배가 균등한지 평가
    sectionDistribution.forEach((newClassCounts, oldSection) => {
        const counts = Array.from(newClassCounts.values());
        const totalCount = counts.reduce((a, b) => a + b, 0);
        const targetPerClass = totalCount / classCount;

        // 각 새 반의 인원수가 목표치에서 얼마나 벗어났는지 계산
        counts.forEach(count => {
            const deviation = Math.abs(count - targetPerClass);
            cost += deviation * 2000; // 최우선 가중치 (SEP, 동명이인보다 더 중요)
        });
    });

    return cost;
}

// ========================================
// 초기 해 생성
// ========================================

/**
 * 기존반별 균등 배정 + BIND 그룹 필수 적용
 * 
 * 핵심 원칙:
 * 1. BIND 그룹은 절대로 분리되지 않음 (블록 단위로 배정)
 * 2. 기존 반 학생들이 새 반에 균등하게 배정됨
 */
function createInitialAllocation(students: Student[], classCount: number): ClassAllocation {
    const allocation: ClassAllocation = {};
    for (let i = 0; i < classCount; i++) {
        allocation[i] = [];
    }

    // 1. BIND 그룹 수집 및 블록 생성
    const bindMap = new Map<string, Student[]>();
    const bindStudentIds = new Set<number>();

    students.forEach(s => {
        const { bind } = parseConstraints(s);
        bind.forEach(groupName => {
            if (!bindMap.has(groupName)) {
                bindMap.set(groupName, []);
            }
            bindMap.get(groupName)!.push(s);
            bindStudentIds.add(s.id);
        });
    });

    // BIND 블록 목록 (크기 순으로 정렬 - 큰 블록 먼저 배정)
    const bindBlocks: Student[][] = [];
    bindMap.forEach(members => {
        bindBlocks.push(members);
    });
    bindBlocks.sort((a, b) => b.length - a.length);

    console.log(`🔗 BIND 그룹: ${bindBlocks.length}개, 총 ${bindStudentIds.size}명`);

    // 2. BIND 블록을 먼저 각 반에 균등 배정
    const assignedBindStudentIds = new Set<number>();
    bindBlocks.forEach((block, idx) => {
        // 가장 인원이 적은 반에 블록 배정
        let minIdx = 0;
        let minCount = allocation[0].length;
        for (let c = 1; c < classCount; c++) {
            if (allocation[c].length < minCount) {
                minCount = allocation[c].length;
                minIdx = c;
            }
        }

        block.forEach(s => {
            if (!assignedBindStudentIds.has(s.id)) {
                allocation[minIdx].push(s);
                assignedBindStudentIds.add(s.id);
            }
        });

        console.log(`   BIND 블록 ${idx + 1} (${block.length}명) → ${minIdx + 1}반`);
    });

    // 3. 나머지 학생을 기존반 기준으로 균등 배정
    // 기존반별로 학생 그룹화
    const sectionMap = new Map<number, Student[]>();
    students.forEach(s => {
        if (assignedBindStudentIds.has(s.id)) return; // BIND 학생은 이미 배정됨

        const section = s.section_number || 0;
        if (!sectionMap.has(section)) {
            sectionMap.set(section, []);
        }
        sectionMap.get(section)!.push(s);
    });

    console.log(`📋 기존반 수: ${sectionMap.size}개`);

    // 각 기존반에서 학생들을 새 반에 균등 배정 (라운드 로빈 방식)
    let sectionIndex = 0;
    sectionMap.forEach((sectionStudents, sectionNum) => {
        // 성별로 분리하고 성적순 정렬
        const males = sectionStudents.filter(s => s.gender === 'M')
            .sort((a, b) => (a.rank || 999) - (b.rank || 999));
        const females = sectionStudents.filter(s => s.gender === 'F')
            .sort((a, b) => (a.rank || 999) - (b.rank || 999));

        // 각 기존반마다 다른 시작 위치로 라운드 로빈 배정 (공정성 향상)
        const startOffset = sectionIndex % classCount;

        // 남학생을 새 반에 라운드 로빈 방식으로 배정
        males.forEach((s, idx) => {
            const targetIdx = (startOffset + idx) % classCount;
            allocation[targetIdx].push(s);
        });

        // 여학생도 라운드 로빈 방식으로 배정 (남학생과 다른 시작점)
        const femaleStartOffset = (startOffset + 1) % classCount;
        females.forEach((s, idx) => {
            const targetIdx = (femaleStartOffset + idx) % classCount;
            allocation[targetIdx].push(s);
        });

        sectionIndex++;

        // 기존반별 배정 통계 출력
        const distribution = [];
        for (let c = 0; c < classCount; c++) {
            const countFromSection = allocation[c].filter(s =>
                s.section_number === sectionNum && !assignedBindStudentIds.has(s.id)
            ).length;
            distribution.push(countFromSection);
        }
        console.log(`   기존 ${sectionNum}반 (${sectionStudents.length}명) → 새 반 배정: [${distribution.join(', ')}]`);
    });

    return allocation;
}

// ========================================
// 시뮬레이티드 어닐링
// ========================================

/**
 * 이웃 해 생성 (임의로 두 학생을 교환)
 * BIND 그룹 학생은 교환에서 제외하여 분리 방지
 */
function getNeighbor(allocation: ClassAllocation, classCount: number): ClassAllocation {
    const newAllocation = JSON.parse(JSON.stringify(allocation)) as ClassAllocation;

    // BIND 학생 ID 수집 (교환에서 제외)
    const bindStudentIds = new Set<number>();
    Object.values(newAllocation).forEach((students: Student[]) => {
        students.forEach((s: Student) => {
            const { bind } = parseConstraints(s);
            if (bind.length > 0) {
                bindStudentIds.add(s.id);
            }
        });
    });

    // 랜덤하게 두 반 선택
    const class1 = Math.floor(Math.random() * classCount);
    let class2 = Math.floor(Math.random() * classCount);
    while (class2 === class1 && classCount > 1) {
        class2 = Math.floor(Math.random() * classCount);
    }

    // 교환 가능한 학생만 필터링 (BIND 학생 제외)
    const swappable1 = newAllocation[class1].filter(s => !bindStudentIds.has(s.id));
    const swappable2 = newAllocation[class2].filter(s => !bindStudentIds.has(s.id));

    if (swappable1.length === 0 || swappable2.length === 0) {
        return newAllocation;
    }

    // 교환 가능한 학생 중에서 랜덤 선택
    const student1 = swappable1[Math.floor(Math.random() * swappable1.length)];
    const student2 = swappable2[Math.floor(Math.random() * swappable2.length)];

    // 원래 배열에서의 인덱스 찾기
    const idx1 = newAllocation[class1].findIndex(s => s.id === student1.id);
    const idx2 = newAllocation[class2].findIndex(s => s.id === student2.id);

    if (idx1 === -1 || idx2 === -1) {
        return newAllocation;
    }

    // 교환 실행
    newAllocation[class1][idx1] = student2;
    newAllocation[class2][idx2] = student1;

    return newAllocation;
}

/**
 * 시뮬레이티드 어닐링 알고리즘
 */
function simulatedAnnealing(
    students: Student[],
    classCount: number,
    sameNames: { exactDuplicates: string[], similarNames: string[] },
    maxIterations: number = 10000
): ClassAllocation {
    let current = createInitialAllocation(students, classCount);
    let currentCost = calculateCost(current, classCount, sameNames);
    let best = JSON.parse(JSON.stringify(current));
    let bestCost = currentCost;

    let temperature = 1000;
    const coolingRate = 0.995;
    const minTemperature = 0.1;

    console.log(`🔥 시뮬레이티드 어닐링 시작 - 초기 비용: ${currentCost}`);

    for (let i = 0; i < maxIterations && temperature > minTemperature; i++) {
        const neighbor = getNeighbor(current, classCount);
        const neighborCost = calculateCost(neighbor, classCount, sameNames);

        const delta = neighborCost - currentCost;

        // 더 좋은 해이거나, 확률적으로 나쁜 해도 수용
        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            current = neighbor;
            currentCost = neighborCost;

            // 최적해 갱신
            if (currentCost < bestCost) {
                best = JSON.parse(JSON.stringify(current));
                bestCost = currentCost;
                console.log(`✨ 새로운 최적해 발견! 비용: ${bestCost} (반복: ${i})`);
            }
        }

        // 온도 감소
        temperature *= coolingRate;

        // 진행 상황 출력
        if (i % 1000 === 0) {
            console.log(`🔄 반복 ${i} - 온도: ${temperature.toFixed(2)} - 현재 비용: ${currentCost} - 최적 비용: ${bestCost}`);
        }
    }

    console.log(`✅ 최종 비용: ${bestCost}`);
    return best;
}

// ========================================
// 최종 정리
// ========================================

/**
 * 각 반 학생들을 정렬 (전출예정 학생은 맨 마지막)
 */
function sortClassStudents(students: Student[]): Student[] {
    return students.sort((a, b) => {
        // 1순위: 전출예정 학생은 무조건 뒤로
        if (a.is_transferring_out && !b.is_transferring_out) return 1;
        if (!a.is_transferring_out && b.is_transferring_out) return -1;

        // 2순위: 일반 학생끼리는 성적순
        return (a.rank || 999) - (b.rank || 999);
    });
}

// ========================================
// 메인 함수
// ========================================

export function allocateStudents(
    students: Student[],
    classCount: number,
    options?: {
        specialReductionCount?: number;  // 특수교육 반 감소 인원
        specialReductionMode?: 'force' | 'flexible';  // 강제/유연 적용
    }
): AllocationResult {
    console.log(`\n🚀 반배정 알고리즘 시작`);
    console.log(`📊 학생 수: ${students.length}명, 반 수: ${classCount}개`);

    const specialReduction = options?.specialReductionCount || 0;
    const reductionMode = options?.specialReductionMode || 'flexible';
    if (specialReduction > 0) {
        console.log(`📚 특수교육대상 반 인원 감소: ${specialReduction}명 (${reductionMode === 'force' ? '강제' : '유연'} 적용)`);
    }

    // 1. 동명이인 감지
    const sameNames = detectSameNames(students);
    console.log(`👥 완전 동명이인: ${sameNames.exactDuplicates.length}개`);

    // 2. 시뮬레이티드 어닐링으로 최적 배정 찾기
    const allocation = simulatedAnnealing(students, classCount, sameNames);

    // 3. 특수교육대상 학생 있는 반 확인 및 인원 조정
    const specialClassIndices: number[] = [];
    for (let c = 0; c < classCount; c++) {
        const hasSpecial = (allocation[c] || []).some(s => s.is_special_class);
        if (hasSpecial) {
            specialClassIndices.push(c);
        }
    }

    if (specialReduction > 0 && specialClassIndices.length > 0) {
        console.log(`🎯 특수교육대상 반: ${specialClassIndices.map(i => i + 1).join(', ')}반`);

        // 불균형 기준: 전체 반 중 최대 인원과 최소 인원 차이가 2명 초과시 불균형
        const IMBALANCE_THRESHOLD = 2;

        // 일반 반 인덱스 목록
        const normalClassIndices: number[] = [];
        for (let c = 0; c < classCount; c++) {
            if (!specialClassIndices.includes(c)) {
                normalClassIndices.push(c);
            }
        }

        // 현재 각 반의 인원수
        const getCurrentSizes = () => {
            const sizes: { [key: number]: number } = {};
            for (let c = 0; c < classCount; c++) {
                sizes[c] = allocation[c]?.length || 0;
            }
            return sizes;
        };

        // 전체 반 간 균형 확인 (최대 - 최소 <= IMBALANCE_THRESHOLD)
        const isOverallBalanced = (sizes: { [key: number]: number }) => {
            const allSizes = Object.values(sizes);
            const maxSize = Math.max(...allSizes);
            const minSize = Math.min(...allSizes);
            return (maxSize - minSize) <= IMBALANCE_THRESHOLD;
        };

        if (reductionMode === 'force') {
            // 강제적용: 균형 무시하고 설정된 감소 인원만큼 무조건 이동
            for (const specialIdx of specialClassIndices) {
                const movableStudents = (allocation[specialIdx] || [])
                    .filter(s => {
                        // BIND 그룹 학생은 이동 불가 (그룹 분리됨)
                        const { bind } = parseConstraints(s);
                        return !s.is_special_class && !s.is_problem_student && !s.is_underachiever && !s.is_transferring_out && bind.length === 0;
                    })
                    .slice(0, specialReduction);

                let movedCount = 0;
                for (const student of movableStudents) {
                    let minIdx = -1;
                    let minCount = Infinity;
                    for (let c = 0; c < classCount; c++) {
                        if (specialClassIndices.includes(c)) continue;
                        const count = allocation[c]?.length || 0;
                        if (count < minCount) {
                            minCount = count;
                            minIdx = c;
                        }
                    }
                    if (minIdx !== -1) {
                        allocation[specialIdx] = allocation[specialIdx].filter(s => s !== student);
                        allocation[minIdx].push(student);
                        movedCount++;
                    }
                }
                if (movedCount > 0) {
                    console.log(`   ${specialIdx + 1}반에서 ${movedCount}명 이동 완료 (강제)`);
                }
            }
        } else {
            // 유연적용: 목표 인원 기반으로 양방향 이동
            // 목표: 특수교육 반이 일반 반보다 '감소인원'만큼 적되, 전체 반 차이 <= 2
            console.log(`📊 유연적용 시작: 요청 감소인원 ${specialReduction}명`);

            const initialSizes = getCurrentSizes();
            const totalStudents = Object.values(initialSizes).reduce((a, b) => a + b, 0);
            const avgSize = totalStudents / classCount;

            console.log(`   초기 인원: ${Object.entries(initialSizes).map(([idx, size]) => `${parseInt(idx) + 1}반:${size}명`).join(', ')}`);
            console.log(`   평균 인원: ${avgSize.toFixed(1)}명`);

            // 목표 인원 계산
            // 특수교육 반: 평균 - (감소인원 비율) / 일반 반: 평균 + (증가인원 비율)
            // 하지만 유연적용이므로 균형을 최우선으로

            // 반복적으로 균형 맞추기 (최대 인원 반 → 최소 인원 반으로 이동)
            let iterations = 0;
            const maxIterations = 100; // 무한루프 방지
            let totalMoved = 0;

            while (iterations < maxIterations) {
                iterations++;
                const currentSizes = getCurrentSizes();
                const allSizes = Object.values(currentSizes);
                const currentMax = Math.max(...allSizes);
                const currentMin = Math.min(...allSizes);
                const gap = currentMax - currentMin;

                // 이미 균형이면 종료
                if (gap <= IMBALANCE_THRESHOLD) {
                    console.log(`   균형 달성: 최대 ${currentMax}명 - 최소 ${currentMin}명 = ${gap}명 차이`);
                    break;
                }

                // 최대 인원인 반 찾기
                let maxIdx = -1;
                for (let c = 0; c < classCount; c++) {
                    if (currentSizes[c] === currentMax) {
                        maxIdx = c;
                        break;
                    }
                }

                // 최소 인원인 반 찾기
                let minIdx = -1;
                for (let c = 0; c < classCount; c++) {
                    if (currentSizes[c] === currentMin) {
                        minIdx = c;
                        break;
                    }
                }

                if (maxIdx === -1 || minIdx === -1 || maxIdx === minIdx) break;

                // 이동 가능한 학생 찾기 (최대 인원 반에서) - BIND 그룹 학생은 제외
                const movableStudents = (allocation[maxIdx] || [])
                    .filter(s => {
                        const { bind } = parseConstraints(s);
                        return !s.is_special_class && !s.is_problem_student && !s.is_underachiever && !s.is_transferring_out && bind.length === 0;
                    });

                if (movableStudents.length === 0) {
                    console.log(`   ${maxIdx + 1}반에서 이동 가능한 학생 없음`);
                    break;
                }

                // 이동 실행
                const student = movableStudents[0];
                allocation[maxIdx] = allocation[maxIdx].filter(s => s !== student);
                allocation[minIdx].push(student);
                totalMoved++;

                console.log(`   ${maxIdx + 1}반(${currentMax}명) → ${minIdx + 1}반(${currentMin}명) 1명 이동`);
            }

            // 균형 맞춘 후, 특수교육 반 감소 시도 (여유가 있으면)
            // 현재 상태에서 특수교육 반이 일반 반보다 크거나 같으면 감소 적용 시도
            const postBalanceSizes = getCurrentSizes();
            const specialSizes = specialClassIndices.map(idx => postBalanceSizes[idx]);
            const normalSizes = normalClassIndices.map(idx => postBalanceSizes[idx]);
            const specialMax = Math.max(...specialSizes);
            const normalMin = Math.min(...normalSizes);

            if (specialMax > normalMin && (specialMax - normalMin) > 1) {
                console.log(`   추가 조정: 특수교육 반(최대 ${specialMax}명)이 일반 반(최소 ${normalMin}명)보다 큼`);

                for (const specialIdx of specialClassIndices) {
                    const currentSize = postBalanceSizes[specialIdx];
                    const targetMinNormal = Math.min(...normalClassIndices.map(idx => allocation[idx]?.length || 0));

                    // 특수교육 반이 일반 반 최소보다 크면 1명 이동
                    if (currentSize > targetMinNormal + 1) {
                        const movableStudents = (allocation[specialIdx] || [])
                            .filter(s => {
                                const { bind } = parseConstraints(s);
                                return !s.is_special_class && !s.is_problem_student && !s.is_underachiever && !s.is_transferring_out && bind.length === 0;
                            });

                        if (movableStudents.length > 0) {
                            // 가장 적은 일반 반 찾기
                            let minNormalIdx = -1;
                            let minNormalSize = Infinity;
                            for (const normalIdx of normalClassIndices) {
                                const size = allocation[normalIdx]?.length || 0;
                                if (size < minNormalSize) {
                                    minNormalSize = size;
                                    minNormalIdx = normalIdx;
                                }
                            }

                            if (minNormalIdx !== -1) {
                                // 이동 후 균형 확인
                                const newCurrentMax = Math.max(currentSize - 1, Math.max(...normalClassIndices.map(idx => allocation[idx]?.length || 0)) + (minNormalIdx === normalClassIndices[0] ? 1 : 0));
                                const newCurrentMin = Math.min(...Object.values(getCurrentSizes())) - 1;

                                // 균형이 깨지지 않으면 이동
                                const allCurrentSizes = Object.values(getCurrentSizes());
                                const worstCase = Math.max(...allCurrentSizes) - Math.min(...allCurrentSizes);

                                if (worstCase <= IMBALANCE_THRESHOLD + 1) {
                                    const student = movableStudents[0];
                                    allocation[specialIdx] = allocation[specialIdx].filter(s => s !== student);
                                    allocation[minNormalIdx].push(student);
                                    totalMoved++;
                                    console.log(`   ${specialIdx + 1}반 → ${minNormalIdx + 1}반 1명 추가 이동`);
                                }
                            }
                        }
                    }
                }
            }

            // 결과 로그
            const finalSizes = getCurrentSizes();
            const finalAllSizes = Object.values(finalSizes);
            const finalMax = Math.max(...finalAllSizes);
            const finalMin = Math.min(...finalAllSizes);
            console.log(`   최종 인원: ${Object.entries(finalSizes).map(([idx, size]) => `${parseInt(idx) + 1}반:${size}명`).join(', ')}`);
            console.log(`   최종 차이: ${finalMax}명 - ${finalMin}명 = ${finalMax - finalMin}명`);
            console.log(`   총 ${totalMoved}명 이동 완료`);
        }
    }




    // 4. 결과 정리
    const resultClasses = [];

    for (let c = 0; c < classCount; c++) {
        const classStudents = sortClassStudents(allocation[c] || []);

        // 통계 계산
        const stats = {
            problem: classStudents.filter(s => s.is_problem_student).length,
            special: classStudents.filter(s => s.is_special_class).length,
            underachiever: classStudents.filter(s => s.is_underachiever).length,
            transfer: classStudents.filter(s => s.is_transferring_out).length
        };

        const genderStats = {
            male: classStudents.filter(s => s.gender === 'M').length,
            female: classStudents.filter(s => s.gender === 'F').length
        };

        resultClasses.push({
            id: c + 1,
            students: classStudents,
            special_factors: stats,
            gender_stats: genderStats
        });

        console.log(`\n📌 ${c + 1}반: ${classStudents.filter(s => !s.is_transferring_out).length}명 (전출 제외) / 전체 ${classStudents.length}명`);
        console.log(`   남: ${genderStats.male}명, 여: ${genderStats.female}명`);
        console.log(`   특수: ${stats.special}명, 문제: ${stats.problem}명, 부진: ${stats.underachiever}명, 전출: ${stats.transfer}명`);
    }

    return {
        classId: 0,
        classes: resultClasses
    };
}
