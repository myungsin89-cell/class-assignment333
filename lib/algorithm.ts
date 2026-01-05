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
 * 스네이크 방식으로 학생 배정
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
 * 스네이크 방식 초기 배정 생성
 */
function createSnakeAllocation(students: Student[], classCount: number): ClassAllocation {
    const allocation: ClassAllocation = {};
    for (let i = 0; i < classCount; i++) {
        allocation[i] = [];
    }

    console.log(`🐍 스네이크 방식 배정 시작 - 학생 수: ${students.length}명, 반 수: ${classCount}개`);

    // 1. BIND 그룹 수집
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

    // 2. BIND 블록을 먼저 각 반에 균등 배정
    const assignedBindStudentIds = new Set<number>();
    const bindBlocks: Student[][] = [];
    bindMap.forEach(members => {
        bindBlocks.push(members);
    });
    bindBlocks.sort((a, b) => b.length - a.length);

    bindBlocks.forEach((block, idx) => {
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

    // 3. 나머지 학생을 기존반별, 성별별로 스네이크 배정
    const sectionNumbers = [...new Set(students.map(s => s.section_number || 0))].sort((a, b) => a - b);
    console.log(`📋 기존반 수: ${sectionNumbers.length}개`);

    sectionNumbers.forEach(sectionNum => {
        const sectionStudents = students.filter(s =>
            s.section_number === sectionNum && !assignedBindStudentIds.has(s.id)
        );

        // 남학생
        const males = sectionStudents.filter(s => s.gender === 'M').sort((a, b) => (a.rank || 999) - (b.rank || 999));
        // 여학생 
        const females = sectionStudents.filter(s => s.gender === 'F').sort((a, b) => (a.rank || 999) - (b.rank || 999));

        const startOffset = (sectionNum - 1) % classCount;

        // 남학생 스네이크 배정
        const maleAssignments = snakeDistribute(males, classCount, startOffset);
        males.forEach((student, i) => {
            allocation[maleAssignments[i]].push(student);
        });

        // 여학생 스네이크 배정 (시작점 살짝 다르게)
        const femaleAssignments = snakeDistribute(females, classCount, (startOffset + 1) % classCount);
        females.forEach((student, i) => {
            allocation[femaleAssignments[i]].push(student);
        });

        console.log(`   기존 ${sectionNum}반: 남 ${males.length}명, 여 ${females.length}명 배정 완료`);
    });

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
                // 한 명을 다른 반으로 교환
                const studentToMove = members[0];
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

    if (mode === 'force') {
        // 강제 모드: 모든 특수교육 반에서 정확히 reductionCount만큼 감소
        console.log('   강제 적용: 모든 특수교육 반에서 정확히 감소');

        for (const specialIdx of specialClassIndices) {
            const movableStudents = allocation[specialIdx].filter(s => {
                // 이동 가능한 학생: 일반 학생, BIND 없음, 전출예정 아님
                const { bind } = parseConstraints(s);
                return !s.is_special_class && !s.is_problem_student && !s.is_underachiever &&
                    !s.is_transferring_out && bind.length === 0;
            });

            const toMove = movableStudents.slice(0, reductionCount);
            let movedCount = 0;

            for (const student of toMove) {
                // 인원이 가장 적은 일반 반으로 이동
                let minIdx = normalClassIndices[0];
                let minCount = allocation[minIdx].filter(s => !s.is_transferring_out).length;

                for (const idx of normalClassIndices) {
                    const count = allocation[idx].filter(s => !s.is_transferring_out).length;
                    if (count < minCount) {
                        minCount = count;
                        minIdx = idx;
                    }
                }

                // SEP 위배 확인
                const { sep } = parseConstraints(student);
                let canMove = true;
                for (const groupName of sep) {
                    const members = sepGroupMap.get(groupName) || [];
                    if (members.some(m => m.id !== student.id && allocation[minIdx].some(st => st.id === m.id))) {
                        canMove = false;
                        break;
                    }
                }

                if (canMove) {
                    allocation[specialIdx] = allocation[specialIdx].filter(s => s.id !== student.id);
                    allocation[minIdx].push(student);
                    movedCount++;
                }
            }

            console.log(`   ${specialIdx + 1}반: ${movedCount}명 이동`);
        }
    } else {
        // 유연 모드: 전체 균형 유지 (최대 차이 ≤ 2)
        console.log('   유연 적용: 전체 균형 유지하며 감소');

        const getCurrentClassSizes = () => {
            const sizes: number[] = [];
            for (let c = 0; c < classCount; c++) {
                sizes.push(allocation[c].filter(s => !s.is_transferring_out).length);
            }
            return sizes;
        };

        // 반복적으로 조정
        for (let iter = 0; iter < 20; iter++) {
            const sizes = getCurrentClassSizes();
            const maxSize = Math.max(...sizes);
            const minSize = Math.min(...sizes);

            // 균형 체크
            if (maxSize - minSize <= 2) {
                const specialSizes = specialClassIndices.map(idx => sizes[idx]);
                const normalSizes = normalClassIndices.map(idx => sizes[idx]);
                const avgNormal = normalSizes.length > 0 ? normalSizes.reduce((a, b) => a + b, 0) / normalSizes.length : 0;
                const avgSpecial = specialSizes.reduce((a, b) => a + b, 0) / specialSizes.length;

                // 특수교육 반이 충분히 작으면 종료
                if (avgSpecial <= avgNormal - reductionCount * 0.5) {
                    break;
                }
            }

            // 가장 큰 특수교육 반에서 학생 이동
            let maxSpecialIdx = -1;
            let maxSpecialSize = 0;
            for (const idx of specialClassIndices) {
                if (sizes[idx] > maxSpecialSize) {
                    maxSpecialSize = sizes[idx];
                    maxSpecialIdx = idx;
                }
            }

            if (maxSpecialIdx === -1) break;

            // 이동 가능한 학생 찾기
            const movableStudents = allocation[maxSpecialIdx].filter(s => {
                const { bind } = parseConstraints(s);
                return !s.is_special_class && !s.is_problem_student && !s.is_underachiever &&
                    !s.is_transferring_out && bind.length === 0;
            });

            if (movableStudents.length === 0) break;

            const student = movableStudents[0];

            // 가장 작은 일반 반으로 이동
            let minNormalIdx = normalClassIndices[0];
            let minNormalSize = sizes[minNormalIdx];
            for (const idx of normalClassIndices) {
                if (sizes[idx] < minNormalSize) {
                    minNormalSize = sizes[idx];
                    minNormalIdx = idx;
                }
            }

            // 이동 후 균형 체크
            if (maxSpecialSize - 1 - (minNormalSize + 1) > 2) {
                // 이동하면 균형이 더 나빠지므로 중단
                break;
            }

            // SEP 위배 확인
            const { sep } = parseConstraints(student);
            let canMove = true;
            for (const groupName of sep) {
                const members = sepGroupMap.get(groupName) || [];
                if (members.some(m => m.id !== student.id && allocation[minNormalIdx].some(st => st.id === m.id))) {
                    canMove = false;
                    break;
                }
            }

            if (canMove) {
                allocation[maxSpecialIdx] = allocation[maxSpecialIdx].filter(s => s.id !== student.id);
                allocation[minNormalIdx].push(student);
            } else {
                break;
            }
        }

        // 결과 출력
        const finalSizes = getCurrentClassSizes();
        for (const idx of specialClassIndices) {
            console.log(`   ${idx + 1}반: ${finalSizes[idx]}명`);
        }
    }

    console.log('✅ 특수교육 반 인원 조정 완료\n');
}


// ========================================
// 메인 함수
// ========================================

export function allocateStudents(
    students: Student[],
    classCount: number,
    options?: {
        specialReductionCount?: number;
        specialReductionMode?: 'force' | 'flexible';
    }
): AllocationResult {
    console.log(`\n🚀 반배정 알고리즘 시작 (스네이크 방식)`);
    console.log(`📊 학생 수: ${students.length}명, 반 수: ${classCount}개`);

    // 0. 전출예정 학생 분리
    const transferringStudents = students.filter(s => s.is_transferring_out);
    const normalStudents = students.filter(s => !s.is_transferring_out);

    console.log(`🚌 전출예정 학생: ${transferringStudents.length}명 (배정에서 제외)`);
    console.log(`👨‍🎓 일반 학생: ${normalStudents.length}명 (배정 대상)`);

    // 1. 동명이인 감지
    const sameNames = detectSameNames(normalStudents);
    console.log(`👥 완전 동명이인: ${sameNames.exactDuplicates.length}개`);
    console.log(`👥 이름만 같은 학생: ${sameNames.similarNames.length}개`);

    // 2. 스네이크 방식으로 초기 배정
    const allocation = createSnakeAllocation(normalStudents, classCount);

    // 3. 전출예정 학생을 각 반에 균등 배정
    console.log(`\n🚌 전출예정 학생 배정:`);
    let transferIdx = 0;
    for (const student of transferringStudents) {
        allocation[transferIdx % classCount].push(student);
        console.log(`   ${student.name} → ${(transferIdx % classCount) + 1}반`);
        transferIdx++;
    }

    // 4. 제약 조건 해결
    resolveConstraintViolations(allocation, classCount, sameNames);

    // 5. 특수교육 반 인원 조정
    const specialReductionCount = options?.specialReductionCount || 0;
    const specialReductionMode = options?.specialReductionMode || 'flexible';

    if (specialReductionCount > 0) {
        console.log(`📚 특수교육 배려 인원: -${specialReductionCount}명 (${specialReductionMode === 'force' ? '강제' : '유연'} 적용)`);

        // SEP, BIND 그룹 맵 생성 (adjustSpecialClassSize에서 필요)
        const sepGroupMap = new Map<string, Student[]>();
        const bindGroupMap = new Map<string, Student[]>();

        Object.values(allocation).forEach(students => {
            students.forEach(s => {
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

        adjustSpecialClassSize(allocation, classCount, specialReductionCount, specialReductionMode, sepGroupMap, bindGroupMap);
    }

    // 6. AllocationResult 형식으로 변환
    const classes: AllocationResult['classes'] = [];
    for (let i = 0; i < classCount; i++) {
        const classStudents = sortClassStudents(allocation[i]);

        const genderStats = {
            male: classStudents.filter(s => s.gender === 'M').length,
            female: classStudents.filter(s => s.gender === 'F').length
        };

        const specialFactors = {
            problem: classStudents.filter(s => s.is_problem_student).length,
            special: classStudents.filter(s => s.is_special_class).length,
            underachiever: classStudents.filter(s => s.is_underachiever).length,
            transfer: classStudents.filter(s => s.is_transferring_out).length
        };

        classes.push({
            id: i + 1,
            students: classStudents,
            gender_stats: genderStats,
            special_factors: specialFactors
        });

        console.log(`${i + 1}반: ${classStudents.length}명 (남${genderStats.male}, 여${genderStats.female})`);
    }

    console.log('\n✅ 반배정 완료!\n');

    return {
        classId: 0,
        classes
    };
}
