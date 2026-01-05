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
        if (!nameMap.has(fullName)) {
            nameMap.set(fullName, []);
        }
        nameMap.get(fullName)!.push(s);

        const givenName = extractGivenName(fullName);
        if (givenName) {
            if (!givenNameMap.has(givenName)) {
                givenNameMap.set(givenName, []);
            }
            givenNameMap.get(givenName)!.push(s);
        }
    });

    const exactDuplicates: string[] = [];
    const similarNames: string[] = [];

    nameMap.forEach((students, name) => {
        if (students.length > 1) {
            exactDuplicates.push(name);
        }
    });

    givenNameMap.forEach((students, givenName) => {
        if (students.length > 1) {
            const uniqueFullNames = new Set(students.map(s => s.name.trim()));
            if (uniqueFullNames.size > 1) {
                similarNames.push(givenName);
            }
        }
    });

    return { exactDuplicates, similarNames };
}

// ========================================
// 스네이크 배정
// ========================================

interface ClassAllocation {
    [classIndex: number]: Student[];
}

/**
 * 스네이크 방식으로 학생 배정 (허수 인원 고려 - Skip-Over-Full 방식)
 * 스네이크 순서를 따르되, 인원이 많은 반은 건너뛰고 다음 반에 배정
 */
function snakeDistributeWithPhantom(
    students: Student[],
    classCount: number,
    startOffset: number = 0,
    allocation: ClassAllocation,
    phantomCounts: number[]
): number[] {
    const assignments: number[] = [];

    // 각 반의 목표 인원 계산 (허수 인원 고려)
    const getEffectiveCount = (classIdx: number) => allocation[classIdx].length + phantomCounts[classIdx];

    // 1. 전체 최소 Effective Count 계산
    let overallMinCount = Infinity;
    for (let c = 0; c < classCount; c++) {
        overallMinCount = Math.min(overallMinCount, getEffectiveCount(c));
    }

    let idx = startOffset % classCount;
    let direction = 1;

    for (let i = 0; i < students.length; i++) {
        // 현재 스네이크 타겟
        let targetIdx = idx;

        // 2. 균형 체크: 유연한 Skip-Over-Full
        // 현재 전체 최소값 다시 계산
        let currentMin = getEffectiveCount(0);
        for (let c = 1; c < classCount; c++) currentMin = Math.min(currentMin, getEffectiveCount(c));

        // 타겟 반이 최소값보다 크면 (즉, 더 채워진 반이면)
        if (getEffectiveCount(targetIdx) > currentMin) {
            // 스네이크 방향으로 다음 후보들을 탐색하여 "덜 채워진 반"을 찾음
            const step = direction;
            for (let offset = 1; offset < classCount; offset++) {
                let candidateIdx = (targetIdx + (step * offset)) % classCount;
                if (candidateIdx < 0) candidateIdx += classCount;

                if (getEffectiveCount(candidateIdx) <= currentMin) {
                    targetIdx = candidateIdx; // 더 적은 반 발견 -> 여기로 배정
                    break;
                }
            }
        }

        assignments.push(targetIdx);
        allocation[targetIdx].push(students[i]);

        // 다음 스네이크 인덱스 갱신 (배정 결과와 무관하게 패턴 유지)
        if (direction === 1) {
            if (idx === classCount - 1) {
                direction = -1;
            } else {
                idx += 1;
            }
        } else {
            if (idx === 0) {
                direction = 1;
            } else {
                idx -= 1;
            }
        }
    }

    // 가상 배정 롤백
    for (let i = students.length - 1; i >= 0; i--) {
        allocation[assignments[i]].pop();
    }

    return assignments;
}

/**
 * 스네이크 방식으로 학생 배정 (단순 버전, 이전 호환용)
 */
function snakeDistribute(students: Student[], classCount: number, startOffset: number = 0): number[] {
    const assignments: number[] = [];
    let idx = startOffset % classCount;
    let direction = 1; // 1: 정방향, -1: 역방향

    for (let i = 0; i < students.length; i++) {
        assignments.push(idx);

        // 다음 인덱스 계산
        if (direction === 1) {
            if (idx === classCount - 1) {
                direction = -1;
            } else {
                idx += 1;
            }
        } else {
            if (idx === 0) {
                direction = 1;
            } else {
                idx -= 1;
            }
        }
    }

    return assignments;
}

/**
 * 스네이크 방식 초기 배정 생성 (허수 인원 방식)
 * @param students 모든 학생
 * @param classCount 반 개수
 * @param specialReductionCount 특수교육 반 인원 보정 (예: 2명 감소)
 */
function createSnakeAllocation(
    students: Student[],
    classCount: number,
    specialReductionCount: number = 0
): ClassAllocation {
    const allocation: ClassAllocation = {};
    for (let i = 0; i < classCount; i++) {
        allocation[i] = [];
    }

    console.log(`🐍 스네이크 방식 배정 시작 - 학생 수: ${students.length}명, 반 수: ${classCount}개`);

    // 0. 특수교육 학생 파악 및 허수 인원 계산
    const specialStudents = students.filter(s => s.is_special_class && !s.is_transferring_out);
    const phantomCounts: number[] = new Array(classCount).fill(0); // 반별 허수 인원 수
    const assignedStudentIds = new Set<number>(); // 배정 완료된 학생 ID

    // 1. BIND 그룹 수집 (모든 학생 대상, 특수학생 포함)
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

    console.log(`🔗 BIND 그룹: ${bindMap.size}개, 총 ${bindStudentIds.size}명`);

    // 2. BIND 블록 배정 (허수 인원 고려하여 가장 적은 반에)
    const assignedBindStudentIds = new Set<number>();
    const bindBlocks: Student[][] = [];
    bindMap.forEach(members => {
        bindBlocks.push(members);
    });
    bindBlocks.sort((a, b) => b.length - a.length);

    bindBlocks.forEach((block, idx) => {
        // 허수 인원 포함 계산
        let minIdx = 0;
        let minCount = allocation[0].length + phantomCounts[0];
        for (let c = 1; c < classCount; c++) {
            const effectiveCount = allocation[c].length + phantomCounts[c];
            if (effectiveCount < minCount) {
                minCount = effectiveCount;
                minIdx = c;
            }
        }

        // BIND 블록에 특수학생이 포함되어 있으면 해당 반에 허수 인원 적용
        const hasSpecialStudent = block.some(s => s.is_special_class && !s.is_transferring_out);
        if (hasSpecialStudent && specialReductionCount > 0) {
            phantomCounts[minIdx] = specialReductionCount;
            console.log(`   ⚡ BIND 블록에 특수학생 포함 → ${minIdx + 1}반에 허수 ${specialReductionCount}명 적용`);
        }

        block.forEach(s => {
            if (!assignedBindStudentIds.has(s.id) && !assignedStudentIds.has(s.id)) {
                allocation[minIdx].push(s);
                assignedBindStudentIds.add(s.id);
                assignedStudentIds.add(s.id);
            }
        });

        console.log(`   BIND 블록 ${idx + 1} (${block.length}명) → ${minIdx + 1}반`);
    });

    // 3. 나머지 특수교육 학생 배정 (BIND 그룹에 포함되지 않은 특수학생만)
    if (specialReductionCount > 0 && specialStudents.length > 0) {
        const unassignedSpecialStudents = specialStudents.filter(s => !assignedStudentIds.has(s.id));

        if (unassignedSpecialStudents.length > 0) {
            console.log(`👻 허수 인원 방식 적용: 미배정 특수학생 ${unassignedSpecialStudents.length}명, 보정 ${specialReductionCount}명/반`);

            // 특수교육 학생을 순서대로 1, 2, 3... 반에 배정
            unassignedSpecialStudents.forEach((student, idx) => {
                const classIdx = idx % classCount; // 0, 1, 2... 순서대로

                allocation[classIdx].push(student);
                assignedStudentIds.add(student.id);
                // 해당 반에 허수 인원 추가
                phantomCounts[classIdx] = specialReductionCount;
                console.log(`   특수학생 ${student.name} → ${classIdx + 1}반 (허수 ${specialReductionCount}명 추가)`);
            });
        }
    }

    // 3. 나머지 학생 스네이크 배정 (허수 인원 고려)
    const sectionNumbers = [...new Set(students.map(s => s.section_number || 0))].sort((a, b) => a - b);
    console.log(`📋 기존반 수: ${sectionNumbers.length}개`);

    // 모든 배정된 학생 ID 수집
    const allAssignedIds = new Set([...assignedStudentIds, ...assignedBindStudentIds]);

    sectionNumbers.forEach(sectionNum => {
        const sectionStudents = students.filter(s =>
            s.section_number === sectionNum && !allAssignedIds.has(s.id)
        );

        // 남학생
        const males = sectionStudents.filter(s => s.gender === 'M').sort((a, b) => (a.rank || 999) - (b.rank || 999));
        // 여학생 
        const females = sectionStudents.filter(s => s.gender === 'F').sort((a, b) => (a.rank || 999) - (b.rank || 999));

        // 스네이크 방식으로 배정 (허수 인원 고려)
        const startOffset = (sectionNum - 1) % classCount;

        // 남학생 스네이크 배정 (허수 인원 고려)
        const maleAssignments = snakeDistributeWithPhantom(males, classCount, startOffset, allocation, phantomCounts);
        males.forEach((student, i) => {
            allocation[maleAssignments[i]].push(student);
        });

        // 여학생 스네이크 배정 (허수 인원 고려)
        const femaleAssignments = snakeDistributeWithPhantom(females, classCount, (startOffset + 1) % classCount, allocation, phantomCounts);
        females.forEach((student, i) => {
            allocation[femaleAssignments[i]].push(student);
        });

        console.log(`   기존 ${sectionNum}반: 남 ${males.length}명, 여 ${females.length}명 스네이크 배정 완료`);
    });

    // 4. 최종 인원 확인 (허수 인원은 실제 학생이 아니므로 제거할 필요 없음)
    console.log(`📊 배정 결과 (허수 인원 제외):`);
    for (let c = 0; c < classCount; c++) {
        const realCount = allocation[c].length;
        const phantom = phantomCounts[c];
        console.log(`   ${c + 1}반: 실제 ${realCount}명${phantom > 0 ? ` (허수 ${phantom}명 적용됨)` : ''}`);
    }

    return allocation;
}


// ========================================
// 제약 조건 해결
// ========================================

/**
 * 최적 교환 파트너 찾기
 */
function findSwapPartner(
    student: Student,
    sourceClassIdx: number,
    targetClassIdx: number,
    allocation: ClassAllocation,
    sepGroupMap: Map<string, Student[]>,
    bindGroupMap: Map<string, Student[]>
): Student | null {
    const candidates = allocation[targetClassIdx].filter(s => {
        // 1. 같은 성별만
        if (s.gender !== student.gender) return false;

        // 2. BIND 그룹 학생은 제외
        const { bind } = parseConstraints(s);
        if (bind.length > 0) return false;

        // 3. 특수교육 학생은 교환 대상에서 제외 (허수 인원 배정 반 유지)
        if (s.is_special_class) return false;

        // 3. SEP 위배하지 않는지 확인
        const { sep: studentSep } = parseConstraints(student);
        const { sep: candidateSep } = parseConstraints(s);

        // student가 sourceClass로 이동 시 SEP 위배 확인
        for (const groupName of candidateSep) {
            const members = sepGroupMap.get(groupName) || [];
            const hasViolation = members.some(m =>
                m.id !== s.id && allocation[sourceClassIdx].some(st => st.id === m.id)
            );
            if (hasViolation) return false;
        }

        // candidate가 targetClass로 이동 시 SEP 위배 확인
        for (const groupName of studentSep) {
            const members = sepGroupMap.get(groupName) || [];
            const hasViolation = members.some(m =>
                m.id !== student.id && allocation[targetClassIdx].some(st => st.id === m.id)
            );
            if (hasViolation) return false;
        }

        return true;
    });

    if (candidates.length === 0) return null;

    // 석차 차이 최소화, 같은 기존반 우선
    candidates.sort((a, b) => {
        const sameOldSection = (a.section_number === student.section_number ? 0 : 1) -
            (b.section_number === student.section_number ? 0 : 1);
        if (sameOldSection !== 0) return sameOldSection;

        const rankDiffA = Math.abs((a.rank || 999) - (student.rank || 999));
        const rankDiffB = Math.abs((b.rank || 999) - (student.rank || 999));
        return rankDiffA - rankDiffB;
    });

    return candidates[0];
}

/**
 * 제약 조건 위배 해결
 */
function resolveConstraintViolations(
    allocation: ClassAllocation,
    classCount: number,
    sameNames: { exactDuplicates: string[], similarNames: string[] }
): void {
    console.log('\n🔧 제약 조건 위배 해결 시작');

    // SEP, BIND 그룹 맵 생성
    const sepGroupMap = new Map<string, Student[]>();
    const bindGroupMap = new Map<string, Student[]>();

    Object.values(allocation).forEach((students: Student[]) => {
        students.forEach((s: Student) => {
            const { sep, bind } = parseConstraints(s);
            sep.forEach(groupName => {
                if (!sepGroupMap.has(groupName)) sepGroupMap.set(groupName, []);
                sepGroupMap.get(groupName)!.push(s);
            });
            bind.forEach(groupName => {
                if (!bindGroupMap.has(groupName)) bindGroupMap.set(groupName, []);
                bindGroupMap.get(groupName)!.push(s);
            });
        });
    });

    // 1. SEP 위배 해결
    console.log('  1️⃣ SEP 위배 해결');
    let sepFixed = 0;
    for (let c = 0; c < classCount; c++) {
        const classStudents = allocation[c];
        const sepGroups = new Map<string, Student[]>();

        classStudents.forEach(s => {
            const { sep } = parseConstraints(s);
            sep.forEach(groupName => {
                if (!sepGroups.has(groupName)) sepGroups.set(groupName, []);
                sepGroups.get(groupName)!.push(s);
            });
        });

        sepGroups.forEach((members, groupName) => {
            if (members.length > 1) {
                // BIND 그룹에 속하지 않은 학생 중에서 이동 대상 선택
                const movableMember = members.find(m => {
                    const { bind } = parseConstraints(m);
                    return bind.length === 0; // BIND 그룹에 속하지 않은 학생
                });

                if (!movableMember) {
                    console.log(`     ⚠️ SEP "${groupName}": 모든 멤버가 BIND 그룹에 속함 - 이동 불가`);
                    return; // BIND 그룹 학생은 이동하지 않음
                }

                const studentToMove = movableMember;
                for (let targetClass = 0; targetClass < classCount; targetClass++) {
                    if (targetClass === c) continue;

                    const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                    if (partner) {
                        // 교환 실행
                        allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                        allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                        allocation[c].push(partner);
                        allocation[targetClass].push(studentToMove);
                        sepFixed++;
                        console.log(`     SEP "${groupName}" 해결: ${studentToMove.name} ↔ ${partner.name}`);
                        break;
                    }
                }
            }
        });
    }
    console.log(`     ✅ ${sepFixed}건 해결`);

    // 2. 특수교육 학생 분리
    console.log('  2️⃣ 특수교육 학생 분리');
    let specialFixed = 0;
    for (let c = 0; c < classCount; c++) {
        const specialStudents = allocation[c].filter(s => s.is_special_class);
        if (specialStudents.length > 1) {
            const studentToMove = specialStudents[0];
            for (let targetClass = 0; targetClass < classCount; targetClass++) {
                if (targetClass === c) continue;
                if (allocation[targetClass].some(s => s.is_special_class)) continue;

                const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                if (partner) {
                    allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                    allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                    allocation[c].push(partner);
                    allocation[targetClass].push(studentToMove);
                    specialFixed++;
                    console.log(`     특수교육 분리: ${studentToMove.name} ↔ ${partner.name}`);
                    break;
                }
            }
        }
    }
    console.log(`     ✅ ${specialFixed}건 해결`);

    // 3. 완전 동명이인 분리
    console.log('  3️⃣ 완전 동명이인 분리');
    let duplicateFixed = 0;
    for (let c = 0; c < classCount; c++) {
        const nameCount = new Map<string, Student[]>();
        allocation[c].forEach(s => {
            const name = s.name.trim();
            if (sameNames.exactDuplicates.includes(name)) {
                if (!nameCount.has(name)) nameCount.set(name, []);
                nameCount.get(name)!.push(s);
            }
        });

        nameCount.forEach((students, name) => {
            if (students.length > 1) {
                const studentToMove = students[0];
                for (let targetClass = 0; targetClass < classCount; targetClass++) {
                    if (targetClass === c) continue;
                    if (allocation[targetClass].some(s => s.name.trim() === name)) continue;

                    const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                    if (partner) {
                        allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                        allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                        allocation[c].push(partner);
                        allocation[targetClass].push(studentToMove);
                        duplicateFixed++;
                        console.log(`     동명이인 분리: ${studentToMove.name} ↔ ${partner.name}`);
                        break;
                    }
                }
            }
        });
    }
    console.log(`     ✅ ${duplicateFixed}건 해결`);

    // 4. 이름만 같은 학생 분산
    console.log('  4️⃣ 이름만 같은 학생 분산');
    let similarFixed = 0;
    for (let c = 0; c < classCount; c++) {
        const givenNameCount = new Map<string, Student[]>();
        allocation[c].forEach(s => {
            const givenName = extractGivenName(s.name.trim());
            if (sameNames.similarNames.includes(givenName)) {
                if (!givenNameCount.has(givenName)) givenNameCount.set(givenName, []);
                givenNameCount.get(givenName)!.push(s);
            }
        });

        givenNameCount.forEach((students, givenName) => {
            if (students.length > 1) {
                const studentToMove = students[0];
                for (let targetClass = 0; targetClass < classCount; targetClass++) {
                    if (targetClass === c) continue;

                    const targetGivenNames = allocation[targetClass].map(s => extractGivenName(s.name.trim()));
                    if (targetGivenNames.includes(givenName)) continue;

                    const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                    if (partner) {
                        allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                        allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                        allocation[c].push(partner);
                        allocation[targetClass].push(studentToMove);
                        similarFixed++;
                        console.log(`     이름 분산: ${studentToMove.name} ↔ ${partner.name}`);
                        break;
                    }
                }
            }
        });
    }
    console.log(`     ✅ ${similarFixed}건 해결`);

    // 5. 문제행동 학생 균등화
    console.log('  5️⃣ 문제행동 학생 균등화');
    const allStudents = Object.values(allocation).flat();
    const totalProblem = allStudents.filter(s => s.is_problem_student).length;
    const avgProblem = totalProblem / classCount;
    let problemFixed = 0;

    for (let iter = 0; iter < 10; iter++) {
        let improved = false;
        for (let c = 0; c < classCount; c++) {
            const problemCount = allocation[c].filter(s => s.is_problem_student).length;
            if (problemCount > Math.ceil(avgProblem)) {
                const studentToMove = allocation[c].find(s => s.is_problem_student);
                if (!studentToMove) continue;

                for (let targetClass = 0; targetClass < classCount; targetClass++) {
                    if (targetClass === c) continue;
                    const targetProblemCount = allocation[targetClass].filter(s => s.is_problem_student).length;
                    if (targetProblemCount >= Math.ceil(avgProblem)) continue;

                    const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                    if (partner) {
                        allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                        allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                        allocation[c].push(partner);
                        allocation[targetClass].push(studentToMove);
                        problemFixed++;
                        improved = true;
                        break;
                    }
                }
            }
        }
        if (!improved) break;
    }
    console.log(`     ✅ ${problemFixed}건 조정`);

    // 6. 학습부진 학생 균등화
    console.log('  6️⃣ 학습부진 학생 균등화');
    const totalUnder = allStudents.filter(s => s.is_underachiever).length;
    const avgUnder = totalUnder / classCount;
    let underFixed = 0;

    for (let iter = 0; iter < 10; iter++) {
        let improved = false;
        for (let c = 0; c < classCount; c++) {
            const underCount = allocation[c].filter(s => s.is_underachiever).length;
            if (underCount > Math.ceil(avgUnder)) {
                const studentToMove = allocation[c].find(s => s.is_underachiever);
                if (!studentToMove) continue;

                for (let targetClass = 0; targetClass < classCount; targetClass++) {
                    if (targetClass === c) continue;
                    const targetUnderCount = allocation[targetClass].filter(s => s.is_underachiever).length;
                    if (targetUnderCount >= Math.ceil(avgUnder)) continue;

                    const partner = findSwapPartner(studentToMove, c, targetClass, allocation, sepGroupMap, bindGroupMap);
                    if (partner) {
                        allocation[c] = allocation[c].filter(s => s.id !== studentToMove.id);
                        allocation[targetClass] = allocation[targetClass].filter(s => s.id !== partner.id);
                        allocation[c].push(partner);
                        allocation[targetClass].push(studentToMove);
                        underFixed++;
                        improved = true;
                        break;
                    }
                }
            }
        }
        if (!improved) break;
    }
    console.log(`     ✅ ${underFixed}건 조정`);

    console.log('✅ 제약 조건 해결 완료\n');
}

// ========================================
// 최종 정리
// ========================================


/**
 * 각 반 학생들을 정렬 (전출예정 학생은 맨 마지막)
 */
function sortClassStudents(students: Student[]): Student[] {
    return students.sort((a, b) => {
        if (a.is_transferring_out && !b.is_transferring_out) return 1;
        if (!a.is_transferring_out && b.is_transferring_out) return -1;
        return (a.rank || 999) - (b.rank || 999);
    });
}

/**
 * 특수교육 학생이 있는 반의 인원 조정
 */
function adjustSpecialClassSize(
    allocation: ClassAllocation,
    classCount: number,
    reductionCount: number,
    mode: 'force' | 'flexible',
    sepGroupMap: Map<string, Student[]>,
    bindGroupMap: Map<string, Student[]>
): void {
    if (reductionCount <= 0) return;

    console.log(`\n📚 특수교육 반 인원 조정 (${mode === 'force' ? '강제' : '유연'} 모드, -${reductionCount}명)`);

    // 1. 특수교육 학생이 있는 반 찾기
    const specialClassIndices: number[] = [];
    const normalClassIndices: number[] = [];

    for (let c = 0; c < classCount; c++) {
        const hasSpecial = allocation[c].some(s => s.is_special_class && !s.is_transferring_out);
        if (hasSpecial) {
            specialClassIndices.push(c);
        } else {
            normalClassIndices.push(c);
        }
    }

    if (specialClassIndices.length === 0) {
        console.log('   특수교육 학생 없음 - 조정 생략');
        return;
    }

    console.log(`   특수교육 반: ${specialClassIndices.length}개 (${specialClassIndices.map(i => i + 1).join(', ')}반)`);

    // 2. 맞교환 기반 조정 (인원 균형 유지)
    // 특수교육 반에서 일반 학생을 빼고, 일반 반에서 같은 성별+비슷한 석차 학생을 교환
    console.log('   맞교환 방식으로 인원 균형 유지');

    let totalSwaps = 0;
    const targetReductionPerClass = mode === 'force' ? reductionCount : Math.ceil(reductionCount * 0.5);

    for (const specialIdx of specialClassIndices) {
        let swapsForThisClass = 0;

        // 특수교육 반에서 이동 가능한 학생들 찾기
        const movableStudents = allocation[specialIdx].filter(s => {
            const { bind } = parseConstraints(s);
            return !s.is_special_class && !s.is_problem_student && !s.is_underachiever &&
                !s.is_transferring_out && bind.length === 0;
        });

        // 석차순 정렬 (석차가 낮은 학생부터)
        movableStudents.sort((a, b) => (b.rank || 0) - (a.rank || 0));

        for (const student of movableStudents) {
            if (swapsForThisClass >= targetReductionPerClass) break;

            // 일반 반 중에서 교환 파트너 찾기 (인원이 가장 많은 반 우선)
            const normalClassesBySize = [...normalClassIndices].sort((a, b) =>
                allocation[b].filter(s => !s.is_transferring_out).length -
                allocation[a].filter(s => !s.is_transferring_out).length
            );

            for (const normalIdx of normalClassesBySize) {
                const partner = findSwapPartner(student, specialIdx, normalIdx, allocation, sepGroupMap, bindGroupMap);

                if (partner) {
                    // 맞교환 실행
                    allocation[specialIdx] = allocation[specialIdx].filter(s => s.id !== student.id);
                    allocation[normalIdx] = allocation[normalIdx].filter(s => s.id !== partner.id);
                    allocation[specialIdx].push(partner);
                    allocation[normalIdx].push(student);

                    swapsForThisClass++;
                    totalSwaps++;
                    console.log(`     ${specialIdx + 1}반 ↔ ${normalIdx + 1}반: ${student.name} ↔ ${partner.name}`);
                    break;
                }
            }
        }

        console.log(`   ${specialIdx + 1}반: ${swapsForThisClass}건 교환 완료`);
    }

    // 3. 최종 인원 확인 및 미세 조정
    const getCurrentClassSizes = () => {
        const sizes: number[] = [];
        for (let c = 0; c < classCount; c++) {
            sizes.push(allocation[c].filter(s => !s.is_transferring_out).length);
        }
        return sizes;
    };

    const sizes = getCurrentClassSizes();
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);

    console.log(`   📊 인원 편차: ${maxSize - minSize}명 (max ${maxSize}, min ${minSize})`);

    // 편차가 2명을 초과하면 추가 조정
    if (maxSize - minSize > 2) {
        console.log('   ⚠️ 편차 초과, 추가 균형 조정 시도');

        for (let iter = 0; iter < 10; iter++) {
            const currentSizes = getCurrentClassSizes();
            const maxIdx = currentSizes.indexOf(Math.max(...currentSizes));
            const minIdx = currentSizes.indexOf(Math.min(...currentSizes));

            if (currentSizes[maxIdx] - currentSizes[minIdx] <= 2) break;

            // 가장 큰 반에서 가장 작은 반으로 교환
            const movable = allocation[maxIdx].find(s => {
                const { bind } = parseConstraints(s);
                return !s.is_special_class && !s.is_transferring_out && bind.length === 0;
            });

            if (movable) {
                const partner = findSwapPartner(movable, maxIdx, minIdx, allocation, sepGroupMap, bindGroupMap);
                if (partner) {
                    allocation[maxIdx] = allocation[maxIdx].filter(s => s.id !== movable.id);
                    allocation[minIdx] = allocation[minIdx].filter(s => s.id !== partner.id);
                    allocation[maxIdx].push(partner);
                    allocation[minIdx].push(movable);
                    console.log(`     균형 조정: ${movable.name} ↔ ${partner.name}`);
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        const finalSizes = getCurrentClassSizes();
        console.log(`   📊 최종 편차: ${Math.max(...finalSizes) - Math.min(...finalSizes)}명`);
    }

    console.log(`✅ 특수교육 반 인원 조정 완료 (총 ${totalSwaps}건 교환)\n`);
}



// ========================================
// 메인 함수
// ========================================

export function allocateStudents(
    students: Student[],
    classCount: number,
    specialReductionCount: number = 0,
    specialReductionMode: 'force' | 'flexible' = 'flexible'
): AllocationResult {
    // 1. 스네이크 방식으로 초기 배정
    const allocation = createSnakeAllocation(students, classCount, specialReductionCount);

    // 2. 동명이인 탐지 (필요시 사용)
    const sameNames = detectSameNames(students);

    // 3. 제약 조건 해결
    resolveConstraintViolations(allocation, classCount, sameNames);

    // 4. 최종 정렬 및 반환 포맷 변환
    const classes = [];
    for (let c = 0; c < classCount; c++) {
        const sortedStudents = sortClassStudents(allocation[c]);

        // 통계 계산
        const genderStats = {
            male: sortedStudents.filter(s => s.gender === 'M').length,
            female: sortedStudents.filter(s => s.gender === 'F').length
        };

        const specialFactors = {
            problem: sortedStudents.filter(s => s.is_problem_student).length,
            special: sortedStudents.filter(s => s.is_special_class).length,
            underachiever: sortedStudents.filter(s => s.is_underachiever).length,
            transfer: sortedStudents.filter(s => s.is_transferring_out).length
        };

        classes.push({
            id: c + 1,
            students: sortedStudents,
            gender_stats: genderStats,
            special_factors: specialFactors
        });
    }

    return {
        classId: 0, // 임시 ID
        classes
    };
}
