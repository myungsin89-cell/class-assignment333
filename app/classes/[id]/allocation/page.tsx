'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Student, ClassData, AllocationResult } from '../../../../lib/types';
import { allocateStudents } from '../../../../lib/algorithm';
import StepCard from '../../../components/StepCard';
import Toast, { ToastType } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import * as XLSX from 'xlsx';

// 제약조건 파싱 함수
function parseConstraints(student: Student) {
    const groups = student.group_name ? student.group_name.split(',') : [];
    const sep = groups.filter(g => g.startsWith('SEP:')).map(g => g.replace('SEP:', '').trim());
    const bind = groups.filter(g => g.startsWith('BIND:')).map(g => g.replace('BIND:', '').trim());
    return { sep, bind };
}

// 동명이인 감지
function detectDuplicateNames(students: Student[]): Set<string> {
    const nameCount = new Map<string, number>();
    students.forEach(s => {
        const name = s.name.trim();
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
    });

    const duplicates = new Set<string>();
    nameCount.forEach((count, name) => {
        if (count > 1) duplicates.add(name);
    });

    return duplicates;
}

// 이름 추출 (성 제외)
function extractGivenName(fullName: string): string {
    const trimmed = fullName.trim();
    // 한글 이름: 첫 글자를 성으로 간주하고 나머지를 이름으로
    if (trimmed.length >= 2) {
        return trimmed.substring(1);
    }
    return trimmed;
}

// 동명이인 및 이름 분산 분석
function analyzeDuplicateNames(allocation: AllocationResult | null) {
    if (!allocation) return { fullDuplicates: [], givenNameDuplicates: [], hasIssues: false };

    const allStudents = allocation.classes.flatMap(cls =>
        cls.students.map(s => ({ ...s, sectionId: cls.id }))
    );

    // 1. 완전 동명이인 (전체 이름 같음)
    const fullNameMap = new Map<string, typeof allStudents>();
    allStudents.forEach(student => {
        const name = student.name.trim();
        if (!fullNameMap.has(name)) {
            fullNameMap.set(name, []);
        }
        fullNameMap.get(name)!.push(student);
    });

    const fullDuplicates = Array.from(fullNameMap.entries())
        .filter(([_, students]) => students.length > 1)
        .map(([name, students]) => {
            const sections = students.map(s => s.sectionId);
            const uniqueSections = new Set(sections);
            const hasSameSectionConflict = uniqueSections.size < students.length;
            return { name, students, hasSameSectionConflict };
        });

    // 2. 이름만 같은 학생들 (성 제외)
    const givenNameMap = new Map<string, typeof allStudents>();
    allStudents.forEach(student => {
        const givenName = extractGivenName(student.name);
        if (givenName) {
            if (!givenNameMap.has(givenName)) {
                givenNameMap.set(givenName, []);
            }
            givenNameMap.get(givenName)!.push(student);
        }
    });

    const givenNameDuplicates = Array.from(givenNameMap.entries())
        .filter(([_, students]) => students.length > 1)
        .map(([givenName, students]) => {
            const sections = students.map(s => s.sectionId);
            const uniqueSections = new Set(sections);
            const hasSameSectionConflict = uniqueSections.size < students.length;
            return { givenName, students, hasSameSectionConflict };
        });

    const hasIssues = fullDuplicates.some(d => d.hasSameSectionConflict) ||
        givenNameDuplicates.some(d => d.hasSameSectionConflict);

    return { fullDuplicates, givenNameDuplicates, hasIssues };
}

// 한글 정렬 함수 (전출예정 학생은 가장 아래로)
function koreanSort(a: Student, b: Student): number {
    // 전출예정 학생은 가장 아래로
    if (a.is_transferring_out && !b.is_transferring_out) return 1;
    if (!a.is_transferring_out && b.is_transferring_out) return -1;
    // 둘 다 전출예정이거나 둘 다 아니면 이름순
    return a.name.localeCompare(b.name, 'ko-KR');
}

// 학생 배열을 2개 열로 분할
function splitIntoColumns(students: Student[], columns: number = 2): Student[][] {
    const result: Student[][] = Array.from({ length: columns }, () => []);
    const itemsPerColumn = Math.ceil(students.length / columns);

    students.forEach((student, index) => {
        const columnIndex = Math.floor(index / itemsPerColumn);
        if (columnIndex < columns) {
            result[columnIndex].push(student);
        }
    });

    return result;
}

// 반별 색상 팔레트 함수
function getSectionColor(index: number): { bg: string, border: string, text: string } {
    const colors = [
        { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'rgba(102, 126, 234, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', border: 'rgba(240, 147, 251, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', border: 'rgba(79, 172, 254, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', border: 'rgba(67, 233, 123, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', border: 'rgba(250, 112, 154, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', border: 'rgba(48, 207, 208, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', border: 'rgba(168, 237, 234, 0.5)', text: '#333' },
        { bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', border: 'rgba(255, 154, 158, 0.5)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', border: 'rgba(255, 236, 210, 0.5)', text: '#333' },
        { bg: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)', border: 'rgba(255, 110, 127, 0.5)', text: '#fff' }
    ];
    return colors[index % colors.length];
}

export default function AllocationPage() {
    const params = useParams();
    const router = useRouter();
    const classId = params.id as string;

    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [classData, setClassData] = useState<ClassData | null>(null);
    const [allocation, setAllocation] = useState<AllocationResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [hoveredStudentId, setHoveredStudentId] = useState<number | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [clickedSepStudent, setClickedSepStudent] = useState<Student | null>(null);

    // 학생 교환 관련 상태
    const [studentA, setStudentA] = useState<Student | null>(null);
    const [studentB, setStudentB] = useState<Student | null>(null);
    const [searchA, setSearchA] = useState('');
    const [searchB, setSearchB] = useState('');
    const [isMoveMode, setIsMoveMode] = useState(false); // 단독 이동 모드
    const [targetSection, setTargetSection] = useState<number>(0); // 목표 반 인덱스
    const [swapHistory, setSwapHistory] = useState<Array<{
        studentA: Student;
        studentB?: Student; // 단독 이동일 때는 없음
        originSectionIndex?: number; // 단독 이동일 때 원래 반
        targetSectionIndex?: number; // 단독 이동일 때 목표 반
        timestamp: number;
    }>>([]);
    const [highlightedStudents, setHighlightedStudents] = useState<Set<number>>(new Set());
    const [expandedOldClass, setExpandedOldClass] = useState<{ sectionIndex: number; oldSection: number } | null>(null);
    const [reAllocating, setReAllocating] = useState(false);
    const [isSavedAllocation, setIsSavedAllocation] = useState(false); // 저장된 배정인지 여부

    // 토스트 알림 상태
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

    // 저장된 배정 안내 배너 상태
    const [showSavedAllocationBanner, setShowSavedAllocationBanner] = useState(false);

    // 확인 모달 상태
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'warning' | 'danger' | 'info';
    } | null>(null);

    // 통계 모달 상태
    const [showClassSizeModal, setShowClassSizeModal] = useState(false);
    const [showRankModal, setShowRankModal] = useState(false);
    const [showSepModal, setShowSepModal] = useState(false);
    const [showBindModal, setShowBindModal] = useState(false);
    const [showSpecialModal, setShowSpecialModal] = useState(false);
    const [showDuplicateNamesModal, setShowDuplicateNamesModal] = useState(false);

    // 데이터 로드
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [studentsRes, classRes] = await Promise.all([
                    fetch(`/api/students/all?classId=${classId}`),
                    fetch(`/api/classes/${classId}`)
                ]);

                if (!studentsRes.ok || !classRes.ok) throw new Error('Fetch failed');
                const sData = await studentsRes.json();
                const cData = await classRes.json();

                setAllStudents(sData);
                setClassData(Array.isArray(cData) ? cData[0] : cData);
            } catch (err) {
                console.error('Error fetching data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [classId]);

    // DB에서 저장된 배정 불러오기 또는 자동 배정 실행
    useEffect(() => {
        if (!loading && allStudents.length > 0 && classData && !allocation) {
            // new_section_count (조건설정에서 설정한 분반 개수) 우선 사용, 없으면 section_count 사용
            const sectionCount = classData.new_section_count || classData.section_count || 1;

            // 1. DB에 저장된 배정이 있는지 확인 (next_section이 있는 학생이 있는지)
            let hasSavedAllocation = allStudents.some(s => s.next_section !== null && s.next_section !== undefined);

            // 반 개수가 변경되었으면 저장된 배정 무시하고 재배정
            if (hasSavedAllocation) {
                const maxStoredSection = allStudents.reduce((max, s) => Math.max(max, s.next_section || 0), 0);
                // 저장된 배정의 반 개수가 설정된 반 개수와 다르면 재배정 (단, 저장된 배정이 있는 경우에만)
                if (maxStoredSection > 0 && maxStoredSection !== sectionCount) {
                    console.log(`반 개수 변경 감지: ${maxStoredSection} -> ${sectionCount}. 저장된 배정 무시하고 재배정.`);
                    hasSavedAllocation = false;
                }
            }

            if (hasSavedAllocation) {
                console.log('📂 저장된 배정 불러오는 중...');

                // 2. 저장된 배정을 AllocationResult 형식으로 변환
                const classes: AllocationResult['classes'] = [];
                for (let i = 0; i < sectionCount; i++) {
                    const sectionStudents = allStudents.filter(s => s.next_section === (i + 1));

                    const genderStats = {
                        male: sectionStudents.filter(s => s.gender === 'M').length,
                        female: sectionStudents.filter(s => s.gender === 'F').length
                    };

                    const specialFactors = {
                        problem: sectionStudents.filter(s => s.is_problem_student).length,
                        special: sectionStudents.filter(s => s.is_special_class).length,
                        underachiever: sectionStudents.filter(s => s.is_underachiever).length,
                        transfer: sectionStudents.filter(s => s.is_transferring_out).length
                    };

                    classes.push({
                        id: i + 1,
                        students: sectionStudents,
                        gender_stats: genderStats,
                        special_factors: specialFactors
                    });
                }

                const savedAllocation: AllocationResult = {
                    classId: parseInt(classId),
                    classes
                };

                setAllocation(savedAllocation);
                setIsSavedAllocation(true); // 저장된 배정 플래그 설정
                setShowSavedAllocationBanner(true); // 안내 배너 표시
                console.log('✅ 저장된 배정 불러오기 완료!');
            } else {
                console.log('🔄 새로운 배정 생성 중...');

                // 3. 저장된 배정이 없으면 새로 배정
                const result = allocateStudents(allStudents, sectionCount, {
                    specialReductionCount: classData.special_reduction_count || 0,
                    specialReductionMode: classData.special_reduction_mode || 'flexible'
                });
                setAllocation(result);
                setIsSavedAllocation(false); // 새로 생성된 배정
                setShowSummary(true);
                console.log('✅ 새로운 배정 생성 완료!');

                // 자동 저장 실행
                setTimeout(() => {
                    const allocations = result.classes.flatMap(cls =>
                        cls.students.map(s => ({
                            studentId: s.id,
                            nextSection: cls.id
                        }))
                    );

                    fetch(`/api/classes/${classId}/save-allocation`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ allocations })
                    })
                        .then(res => {
                            if (res.ok) {
                                console.log('💾 배정 자동 저장 완료');
                                setIsSavedAllocation(true);
                            }
                        })
                        .catch(err => console.error('Auto-save failed:', err));
                }, 500);
            }
        }
    }, [loading, allStudents, classData, allocation, classId]);

    // 동명이인 목록
    const duplicateNames = useMemo(() => {
        return detectDuplicateNames(allStudents);
    }, [allStudents]);

    // 동명이인 및 이름 분산 분석
    const duplicateAnalysis = useMemo(() => {
        return analyzeDuplicateNames(allocation);
    }, [allocation]);

    // SEP 그룹별 학생 매핑
    const sepGroupMap = useMemo(() => {
        const map = new Map<string, Student[]>();
        if (!allocation) return map;

        allocation.classes.forEach(cls => {
            cls.students.forEach(s => {
                const { sep } = parseConstraints(s);
                sep.forEach(groupName => {
                    if (!map.has(groupName)) map.set(groupName, []);
                    map.get(groupName)!.push(s);
                });
            });
        });

        return map;
    }, [allocation]);

    // BIND 그룹별 학생 매핑
    const bindGroupMap = useMemo(() => {
        const map = new Map<string, Student[]>();
        if (!allocation) return map;

        allocation.classes.forEach(cls => {
            cls.students.forEach(s => {
                const { bind } = parseConstraints(s);
                bind.forEach(groupName => {
                    if (!map.has(groupName)) map.set(groupName, []);
                    map.get(groupName)!.push(s);
                });
            });
        });

        return map;
    }, [allocation]);

    // 제약조건 위반 검사
    const constraintViolations = useMemo(() => {
        if (!allocation) return { sepViolations: [], bindViolations: [] };

        const sepViolations: string[] = [];
        const bindViolations: string[] = [];

        // SEP 그룹 검증: 같은 그룹 학생이 같은 반에 있으면 안됨
        sepGroupMap.forEach((members, groupName) => {
            const sectionMap = new Map<number, Student[]>();
            members.forEach(s => {
                const sectionId = allocation.classes.findIndex(c => c.students.some(st => st.id === s.id));
                if (!sectionMap.has(sectionId)) sectionMap.set(sectionId, []);
                sectionMap.get(sectionId)!.push(s);
            });

            sectionMap.forEach((students, sectionId) => {
                if (students.length > 1) {
                    const sectionName = getSectionName(sectionId);
                    sepViolations.push(`분리 그룹 "${groupName}": ${students.map(s => s.name).join(', ')}이(가) ${sectionName}에 함께 배정됨`);
                }
            });
        });

        // BIND 그룹 검증: 같은 그룹 학생이 다른 반에 있으면 안됨
        bindGroupMap.forEach((members, groupName) => {
            const sections = new Set<number>();
            members.forEach(s => {
                const sectionId = allocation.classes.findIndex(c => c.students.some(st => st.id === s.id));
                sections.add(sectionId);
            });

            if (sections.size > 1) {
                const sectionNames = Array.from(sections).map(id => getSectionName(id)).join(', ');
                bindViolations.push(`같은 반 그룹 "${groupName}": ${members.map(s => s.name).join(', ')}이(가) ${sectionNames}에 분산됨`);
            }
        });

        return { sepViolations, bindViolations };
    }, [allocation, sepGroupMap, bindGroupMap]);

    // 전체 통계
    const overallStats = useMemo(() => {
        if (!allocation) return null;

        const totalStudents = allocation.classes.reduce((sum, c) => sum + c.students.length, 0);
        const maleCount = allocation.classes.reduce((sum, c) => sum + c.gender_stats.male, 0);
        const femaleCount = allocation.classes.reduce((sum, c) => sum + c.gender_stats.female, 0);
        const sepGroupCount = sepGroupMap.size;
        const bindGroupCount = bindGroupMap.size;
        const duplicateCount = duplicateNames.size;

        return {
            totalStudents,
            maleCount,
            femaleCount,
            sepGroupCount,
            bindGroupCount,
            duplicateCount,
            sectionCount: allocation.classes.length
        };
    }, [allocation, sepGroupMap, bindGroupMap, duplicateNames]);

    // 학생 타입 결정 (우선순위: SEP > BIND > 동명이인 > 일반)
    function getStudentType(student: Student): 'sep' | 'bind' | 'duplicate' | 'normal' {
        const { sep, bind } = parseConstraints(student);
        if (sep.length > 0) return 'sep';
        if (bind.length > 0) return 'bind';
        if (duplicateNames.has(student.name.trim())) return 'duplicate';
        return 'normal';
    }

    // 학생 색상 스타일
    function getStudentStyle(student: Student): React.CSSProperties {
        const type = getStudentType(student);
        switch (type) {
            case 'sep':
                return {
                    backgroundColor: '#fecaca',
                    borderColor: '#f87171',
                    color: '#7f1d1d',
                    fontWeight: 600
                };
            case 'bind':
                return {
                    backgroundColor: '#bbf7d0',
                    borderColor: '#4ade80',
                    color: '#14532d',
                    fontWeight: 600
                };
            case 'duplicate':
                return {
                    backgroundColor: '#fde68a',
                    borderColor: '#fbbf24',
                    color: '#78350f',
                    fontWeight: 600
                };
            default:
                return {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    color: '#e2e8f0'
                };
        }
    }

    // 호버시 하이라이트할 학생 ID 목록
    const highlightedIds = useMemo(() => {
        if (!hoveredStudentId || !allocation) return new Set<number>();

        const hoveredStudent = allocation.classes
            .flatMap(c => c.students)
            .find(s => s.id === hoveredStudentId);

        if (!hoveredStudent) return new Set<number>();

        const { bind } = parseConstraints(hoveredStudent);

        // BIND 그룹이 있으면 같은 그룹 멤버들 하이라이트
        if (bind.length > 0) {
            const ids = new Set<number>();
            bind.forEach(groupName => {
                const members = bindGroupMap.get(groupName) || [];
                members.forEach(m => {
                    if (m.id !== hoveredStudentId) ids.add(m.id);
                });
            });
            return ids;
        }

        return new Set<number>();
    }, [hoveredStudentId, allocation, bindGroupMap]);

    // SEP 학생 분리 정보 가져오기
    function getSepInfo(student: Student): Array<{ name: string, section: string, groupName: string }> {
        const { sep } = parseConstraints(student);
        if (sep.length === 0) return [];

        const separatedStudents: Array<{ name: string, section: string, groupName: string }> = [];
        sep.forEach(groupName => {
            const members = sepGroupMap.get(groupName) || [];
            const others = members.filter(m => m.id !== student.id);

            others.forEach(other => {
                const classIndex = allocation!.classes.findIndex(c =>
                    c.students.some(s => s.id === other.id)
                );
                const sectionName = getSectionName(classIndex);
                separatedStudents.push({
                    name: other.name,
                    section: sectionName,
                    groupName: groupName
                });
            });
        });

        return separatedStudents;
    }

    // 반 이름 가져오기
    function getSectionName(classIndex: number): string {
        if (!classData) return `${classIndex + 1}반`;

        try {
            const sectionNames = classData.section_names
                ? JSON.parse(classData.section_names)
                : null;

            if (sectionNames && Array.isArray(sectionNames) && sectionNames[classIndex]) {
                return `${sectionNames[classIndex]}반`;
            }
        } catch (e) {
            console.error('Failed to parse section names:', e);
        }

        return `${classIndex + 1}반`;
    }

    // 학생 교환 검증
    const validateSwap = (stA: Student, stB: Student) => {
        const warnings: string[] = [];
        const errors: string[] = [];

        if (!allocation) return { warnings, errors, canSwap: false };

        // 같은 반 체크 (에러)
        const classA = allocation.classes.findIndex(c => c.students.some(s => s.id === stA.id));
        const classB = allocation.classes.findIndex(c => c.students.some(s => s.id === stB.id));

        if (classA === classB) {
            errors.push('같은 반 학생끼리는 교환할 수 없습니다');
            return { warnings, errors, canSwap: false };
        }

        // 성별 체크 (경고)
        if (stA.gender !== stB.gender) {
            warnings.push(`성별 불일치 (${stA.gender === 'M' ? '남' : '여'} ↔ ${stB.gender === 'M' ? '남' : '여'})`);
        }

        // 석차 차이 체크 (경고)
        if (stA.rank && stB.rank) {
            const rankDiff = Math.abs(stA.rank - stB.rank);
            if (rankDiff > 5) {
                warnings.push(`석차 차이 ${rankDiff}등 (권장: 5등 이내)`);
            }
        }

        // SEP 제약조건 체크 (경고)
        const { sep: sepA } = parseConstraints(stA);
        const { sep: sepB } = parseConstraints(stB);

        // stA가 stB와 분리되어야 하는지 확인
        sepA.forEach(groupName => {
            const groupMembers = sepGroupMap.get(groupName) || [];
            if (groupMembers.some(m => m.id === stB.id)) {
                warnings.push(`⚠️ ${stA.name}와 ${stB.name}는 분리되어야 합니다 (그룹: ${groupName})`);
            }
        });

        // stA의 분리 그룹 멤버들이 classB에 있는지 확인
        sepA.forEach(groupName => {
            const groupMembers = sepGroupMap.get(groupName) || [];
            const membersInClassB = groupMembers.filter(m =>
                m.id !== stA.id && allocation.classes[classB].students.some(s => s.id === m.id)
            );
            if (membersInClassB.length > 0) {
                warnings.push(`⚠️ ${stA.name}가 이동할 반에 분리 대상 학생이 있습니다: ${membersInClassB.map(m => m.name).join(', ')}`);
            }
        });

        // stB의 분리 그룹 멤버들이 classA에 있는지 확인
        sepB.forEach(groupName => {
            const groupMembers = sepGroupMap.get(groupName) || [];
            const membersInClassA = groupMembers.filter(m =>
                m.id !== stB.id && allocation.classes[classA].students.some(s => s.id === m.id)
            );
            if (membersInClassA.length > 0) {
                warnings.push(`⚠️ ${stB.name}가 이동할 반에 분리 대상 학생이 있습니다: ${membersInClassA.map(m => m.name).join(', ')}`);
            }
        });

        // BIND 제약조건 체크 (경고)
        const { bind: bindA } = parseConstraints(stA);
        const { bind: bindB } = parseConstraints(stB);

        // stA의 BIND 그룹 멤버들이 classA에 남아있는지 확인
        bindA.forEach(groupName => {
            const groupMembers = bindGroupMap.get(groupName) || [];
            const membersInClassA = groupMembers.filter(m =>
                m.id !== stA.id && allocation.classes[classA].students.some(s => s.id === m.id)
            );
            if (membersInClassA.length > 0) {
                warnings.push(`⚠️ ${stA.name}가 이동하면 같은반 그룹에서 분리됩니다: ${membersInClassA.map(m => m.name).join(', ')} (그룹: ${groupName})`);
            }
        });

        // stB의 BIND 그룹 멤버들이 classB에 남아있는지 확인
        bindB.forEach(groupName => {
            const groupMembers = bindGroupMap.get(groupName) || [];
            const membersInClassB = groupMembers.filter(m =>
                m.id !== stB.id && allocation.classes[classB].students.some(s => s.id === m.id)
            );
            if (membersInClassB.length > 0) {
                warnings.push(`⚠️ ${stB.name}가 이동하면 같은반 그룹에서 분리됩니다: ${membersInClassB.map(m => m.name).join(', ')} (그룹: ${groupName})`);
            }
        });

        // 동명이인 체크 (경고)
        if (duplicateNames.has(stA.name.trim())) {
            const duplicatesInClassB = allocation.classes[classB].students.filter(s =>
                s.name.trim() === stA.name.trim() && s.id !== stA.id
            );
            if (duplicatesInClassB.length > 0) {
                warnings.push(`⚠️ ${stA.name}가 이동할 반에 동명이인이 있습니다`);
            }
        }

        if (duplicateNames.has(stB.name.trim())) {
            const duplicatesInClassA = allocation.classes[classA].students.filter(s =>
                s.name.trim() === stB.name.trim() && s.id !== stB.id
            );
            if (duplicatesInClassA.length > 0) {
                warnings.push(`⚠️ ${stB.name}가 이동할 반에 동명이인이 있습니다`);
            }
        }

        return { warnings, errors, canSwap: true };
    };

    // 학생 교환 실행
    const executeSwap = () => {
        if (!studentA || !allocation) return;

        // 단독 이동 모드
        if (isMoveMode) {
            // 학생 A를 목표 반으로 이동
            const newAllocation = { ...allocation };
            const classAIndex = newAllocation.classes.findIndex(c => c.students.some(s => s.id === studentA.id));

            // 같은 반으로 이동하려는 경우 경고
            if (classAIndex === targetSection) {
                setToast({ message: '같은 반으로는 이동할 수 없습니다.', type: 'warning' });
                return;
            }

            // 학생 제거
            newAllocation.classes[classAIndex].students = newAllocation.classes[classAIndex].students.filter(s => s.id !== studentA.id);

            // 목표 반에 추가
            newAllocation.classes[targetSection].students.push(studentA);

            // 통계 재계산
            [classAIndex, targetSection].forEach(idx => {
                const cls = newAllocation.classes[idx];
                cls.gender_stats.male = cls.students.filter(s => s.gender === 'M').length;
                cls.gender_stats.female = cls.students.filter(s => s.gender === 'F').length;
                cls.special_factors.problem = cls.students.filter(s => s.is_problem_student).length;
                cls.special_factors.special = cls.students.filter(s => s.is_special_class).length;
                cls.special_factors.underachiever = cls.students.filter(s => s.is_underachiever).length;
                cls.special_factors.transfer = cls.students.filter(s => s.is_transferring_out).length;
            });

            setAllocation(newAllocation);

            // 하이라이트 설정
            setHighlightedStudents(new Set([studentA.id]));
            setTimeout(() => setHighlightedStudents(new Set()), 3000);

            // 이동 기록 추가
            setSwapHistory([{ studentA, originSectionIndex: classAIndex, targetSectionIndex: targetSection, timestamp: Date.now() }, ...swapHistory]);

            // 초기화
            setStudentA(null);
            setSearchA('');
            return;
        }

        // 1:1 교환 모드
        if (!studentB) return;

        const validation = validateSwap(studentA, studentB);

        if (!validation.canSwap) {
            setToast({ message: validation.errors.join('\n'), type: 'error' });
            return;
        }

        if (validation.warnings.length > 0) {
            // 경고가 있으면 모달 표시
            setConfirmModal({
                title: '경고사항 확인',
                message: '다음 경고사항이 있습니다:\n\n' + validation.warnings.join('\n') + '\n\n계속 진행하시겠습니까?',
                type: 'warning',
                onConfirm: () => {
                    setConfirmModal(null);
                    performSwap(studentA, studentB);
                }
            });
            return;
        }

        // 경고가 없으면 바로 교환 실행
        performSwap(studentA, studentB);
    };

    // 실제 교환 수행 함수
    const performSwap = (stA: Student, stB: Student) => {
        if (!allocation) return;

        // 교환 실행
        const newAllocation = { ...allocation };

        // 각 학생이 속한 반 찾기
        const classAIndex = newAllocation.classes.findIndex(c => c.students.some(s => s.id === stA.id));
        const classBIndex = newAllocation.classes.findIndex(c => c.students.some(s => s.id === stB.id));

        // 학생 제거
        newAllocation.classes[classAIndex].students = newAllocation.classes[classAIndex].students.filter(s => s.id !== stA.id);
        newAllocation.classes[classBIndex].students = newAllocation.classes[classBIndex].students.filter(s => s.id !== stB.id);

        // 학생 추가
        newAllocation.classes[classAIndex].students.push(stB);
        newAllocation.classes[classBIndex].students.push(stA);

        // 통계 재계산
        [classAIndex, classBIndex].forEach(idx => {
            const cls = newAllocation.classes[idx];
            cls.gender_stats.male = cls.students.filter(s => s.gender === 'M').length;
            cls.gender_stats.female = cls.students.filter(s => s.gender === 'F').length;
            cls.special_factors.problem = cls.students.filter(s => s.is_problem_student).length;
            cls.special_factors.special = cls.students.filter(s => s.is_special_class).length;
            cls.special_factors.underachiever = cls.students.filter(s => s.is_underachiever).length;
            cls.special_factors.transfer = cls.students.filter(s => s.is_transferring_out).length;
        });

        setAllocation(newAllocation);

        // 하이라이트 설정
        setHighlightedStudents(new Set([stA.id, stB.id]));
        setTimeout(() => setHighlightedStudents(new Set()), 3000);

        // 교환 기록 추가
        setSwapHistory([{ studentA: stA, studentB: stB, timestamp: Date.now() }, ...swapHistory]);

        // 초기화
        setStudentA(null);
        setStudentB(null);
        setSearchA('');
        setSearchB('');
    };

    // 교환/이동 취소
    const undoSwap = (index: number) => {
        const swap = swapHistory[index];
        const isMoveRecord = !swap.studentB;

        if (isMoveRecord) {
            // 단독 이동 취소
            setConfirmModal({
                title: '이동 취소',
                message: `${swap.studentA.name}의 이동을 취소하시겠습니까?`,
                type: 'info',
                onConfirm: () => {
                    setConfirmModal(null);
                    performUndoMove(swap, index);
                }
            });
            return;
        } else {
            // 1:1 교환 취소
            setConfirmModal({
                title: '교환 취소',
                message: `${swap.studentA.name} ↔ ${swap.studentB!.name} 교환을 취소하시겠습니까?`,
                type: 'info',
                onConfirm: () => {
                    setConfirmModal(null);
                    performUndoSwap(swap, index);
                }
            });
        }
    };

    // 단독 이동 취소 수행
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const performUndoMove = (swap: any, index: number) => {
        if (!allocation) return;
        const newAllocation = { ...allocation };
        const currentClassIdx = newAllocation.classes.findIndex(c => c.students.some(s => s.id === swap.studentA.id));
        const originalClassIdx = swap.originSectionIndex!;

        // 학생을 원래 위치로 복원
        newAllocation.classes[currentClassIdx].students = newAllocation.classes[currentClassIdx].students.filter(s => s.id !== swap.studentA.id);
        newAllocation.classes[originalClassIdx].students.push(swap.studentA);

        // 통계 재계산
        [currentClassIdx, originalClassIdx].forEach(idx => {
            const cls = newAllocation.classes[idx];
            cls.gender_stats.male = cls.students.filter(s => s.gender === 'M').length;
            cls.gender_stats.female = cls.students.filter(s => s.gender === 'F').length;
            cls.special_factors.problem = cls.students.filter(s => s.is_problem_student).length;
            cls.special_factors.special = cls.students.filter(s => s.is_special_class).length;
            cls.special_factors.underachiever = cls.students.filter(s => s.is_underachiever).length;
            cls.special_factors.transfer = cls.students.filter(s => s.is_transferring_out).length;
        });

        setAllocation(newAllocation);

        // 하이라이트 설정
        setHighlightedStudents(new Set([swap.studentA.id]));
        setTimeout(() => setHighlightedStudents(new Set()), 3000);

        // 기록에서 제거
        setSwapHistory(swapHistory.filter((_, i) => i !== index));
    };

    // 1:1 교환 취소 수행
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const performUndoSwap = (swap: any, index: number) => {
        // 다시 교환 (원복)
        const tempA = studentA;
        const tempB = studentB;
        setStudentA(swap.studentA);
        setStudentB(swap.studentB);
        executeSwap();
        setStudentA(tempA);
        setStudentB(tempB);

        // 기록에서 제거
        setSwapHistory(swapHistory.filter((_, i) => i !== index));
    };

    const handleSave = async (showConfirm: boolean = true) => {
        if (!allocation) return;

        // 확정 저장 시에만 confirm 표시
        if (showConfirm) {
            setConfirmModal({
                title: '최종 확정',
                message: '현재 배정 결과를 최종 확정하시겠습니까?',
                type: 'info',
                onConfirm: () => {
                    setConfirmModal(null);
                    performSave(true);
                }
            });
            return;
        }

        // 자동 저장은 바로 실행
        performSave(false);
    };

    const performSave = async (isManual: boolean) => {
        if (!allocation) return;

        try {
            const allocations = allocation.classes.flatMap(cls =>
                cls.students.map(s => ({
                    studentId: s.id,
                    nextSection: cls.id
                }))
            );

            const res = await fetch(`/api/classes/${classId}/save-allocation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allocations })
            });

            if (!res.ok) throw new Error('Failed to save');
            setIsSavedAllocation(true); // 저장 완료 플래그 설정

            if (isManual) {
                // 확정 저장 시 토스트 알림
                setToast({ message: '배정 결과가 최종 확정되었습니다!', type: 'success' });
            } else {
                // 자동 저장 시 콘솔 로그만
                console.log('💾 배정 자동 저장 완료');
            }
        } catch (error) {
            console.error(error);
            setToast({ message: '저장 중 오류가 발생했습니다.', type: 'error' });
        }
    };

    // 엑셀 다운로드
    const handleExportExcel = () => {
        if (!allocation || !classData) return;

        const workbook = XLSX.utils.book_new();

        allocation.classes.forEach((cls, idx) => {
            const sortedStudents = [...cls.students].sort((a, b) =>
                a.name.localeCompare(b.name, 'ko')
            );

            // 향후 반 이름 가져오기
            const sectionName = getSectionName(idx);

            // 엑셀 데이터 준비
            const excelData = sortedStudents.map((student, studentIndex) => {
                // 특기사항 생성
                const specialItems: string[] = [];
                if (student.is_special_class) specialItems.push('특수교육대상');
                if (student.is_problem_student) specialItems.push('문제행동');
                if (student.is_underachiever) specialItems.push('학습부진');
                if (student.is_transferring_out) specialItems.push('전출예정');

                return {
                    '번호': studentIndex + 1,
                    '이름': student.name,
                    '성별': student.gender === 'M' ? '남' : '여',
                    '생년월일': student.birth_date || '',
                    '특기사항': specialItems.join(', '),
                    '연락처': student.contact || '',
                    '기존반': student.section_number ? `${student.section_number}반` : '',
                    '비고': student.notes || ''
                };
            });

            // 워크시트 생성
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // 열 너비 설정
            worksheet['!cols'] = [
                { wch: 5 },   // 번호
                { wch: 10 },  // 이름
                { wch: 5 },   // 성별
                { wch: 12 },  // 생년월일
                { wch: 20 },  // 특기사항
                { wch: 15 },  // 연락처
                { wch: 8 },   // 기존반
                { wch: 20 }   // 비고
            ];

            // 워크북에 시트 추가
            XLSX.utils.book_append_sheet(workbook, worksheet, sectionName);
        });

        // 파일 다운로드
        const fileName = `반배정결과_${classData.grade}학년_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        setToast({ message: '엑셀 파일이 다운로드되었습니다!', type: 'success' });
    };

    // 다시 편성
    const handleReAllocate = () => {
        if (!classData || !allStudents.length) return;

        setConfirmModal({
            title: '다시 편성',
            message: '반편성을 다시 실행하시겠습니까?\n\n⚠️ 주의:\n- 현재 수동으로 변경한 내용은 초기화됩니다.\n- 완전히 새로운 배정 결과가 생성됩니다.\n- 저장된 배정도 재편성 후 다시 저장해야 합니다.',
            type: 'danger',
            onConfirm: () => {
                setConfirmModal(null);
                performReAllocate();
            }
        });
    };

    const performReAllocate = () => {
        setReAllocating(true);
        setShowSavedAllocationBanner(false); // 배너 제거

        // 약간의 지연 후 재편성 (UI 반응성)
        setTimeout(() => {
            // new_section_count (조건설정에서 설정한 분반 개수) 우선 사용, 없으면 section_count 사용
            const sectionCount = classData?.new_section_count || classData?.section_count || 1;
            const result = allocateStudents(allStudents, sectionCount, {
                specialReductionCount: classData?.special_reduction_count || 0,
                specialReductionMode: classData?.special_reduction_mode || 'flexible'
            });
            setAllocation(result);
            setIsSavedAllocation(false); // 재편성 후에는 저장되지 않은 상태

            // 교환 기록 초기화
            setSwapHistory([]);
            setStudentA(null);
            setStudentB(null);
            setSearchA('');
            setSearchB('');
            setHighlightedStudents(new Set());

            setReAllocating(false);
            setShowSummary(true);

            // 재편성 후 자동 저장
            const allocations = result.classes.flatMap(cls =>
                cls.students.map(s => ({
                    studentId: s.id,
                    nextSection: cls.id
                }))
            );

            fetch(`/api/classes/${classId}/save-allocation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allocations })
            })
                .then(res => {
                    if (res.ok) {
                        console.log('💾 재편성 후 자동 저장 완료');
                        setIsSavedAllocation(true);
                    }
                })
                .catch(err => console.error('Auto-save after reallocation failed:', err));
        }, 300);
    };

    // 학생 검색 필터링
    const getFilteredStudents = (search: string) => {
        if (!allocation || !search) return [];
        return allocation.classes
            .flatMap(c => c.students)
            .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 10); // 최대 10개만
    };

    // 스마트 추천 (학생 A 선택 시)
    const getRecommendedStudents = () => {
        if (!studentA || !allocation) return [];

        const classAIndex = allocation.classes.findIndex(c =>
            c.students.some(s => s.id === studentA.id)
        );

        return allocation.classes
            .flatMap((c, idx) => idx !== classAIndex ? c.students : [])
            .filter(s => {
                // 같은 성별 우선
                if (s.gender !== studentA.gender) return false;
                // 석차 비슷한 학생
                if (studentA.rank && s.rank) {
                    return Math.abs(studentA.rank - s.rank) <= 5;
                }
                return true;
            })
            .slice(0, 5);
    };

    if (loading) return <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading"></div></div>;

    const filteredStudentsA = getFilteredStudents(searchA);
    const filteredStudentsB = getFilteredStudents(searchB);
    const recommendedStudents = getRecommendedStudents();

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem', display: 'flex', gap: '2rem' }}>
            <div className="container" style={{ flex: 1, maxWidth: 'none' }}>
                {/* Summary Modal - 반배정 결과 요약 */}
                {showSummary && allocation && overallStats && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowSummary(false)}>
                        <div className="card" style={{ maxWidth: '650px', width: '95%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🎉 반배정 완료!
                            </h2>

                            {/* 전체 요약 */}
                            <div style={{
                                padding: '1.25rem',
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.15) 100%)',
                                borderRadius: '12px',
                                marginBottom: '1.25rem',
                                border: '1px solid rgba(99, 102, 241, 0.3)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', gap: '2rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>{overallStats.totalStudents}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>전체 학생</div>
                                    </div>
                                    <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#8b5cf6' }}>{overallStats.sectionCount}개</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>반</div>
                                    </div>
                                    <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#a855f7' }}>
                                            {(overallStats.totalStudents / overallStats.sectionCount).toFixed(1)}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>평균 인원</div>
                                    </div>
                                </div>
                            </div>

                            {/* 상세 통계 그리드 */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                {/* 석차 평균 */}
                                <div style={{
                                    padding: '1rem',
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>📊 석차 평균</div>
                                    {(() => {
                                        const allRanks = allocation.classes.flatMap(c => c.students.filter(s => s.rank).map(s => s.rank!));
                                        const avgRank = allRanks.length > 0 ? (allRanks.reduce((a, b) => a + b, 0) / allRanks.length).toFixed(1) : '-';
                                        const classAvgs = allocation.classes.map(c => {
                                            const ranks = c.students.filter(s => s.rank).map(s => s.rank!);
                                            return ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
                                        }).filter(a => a > 0);
                                        const maxDiff = classAvgs.length > 1 ? (Math.max(...classAvgs) - Math.min(...classAvgs)).toFixed(1) : '0';
                                        return (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>{avgRank}등</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>반간 편차 {maxDiff}등</span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* 반별 인원 편차 */}
                                {(() => {
                                    const classSizes = allocation.classes.map(c => c.students.length);
                                    const minSize = Math.min(...classSizes);
                                    const maxSize = Math.max(...classSizes);
                                    const diff = maxSize - minSize;
                                    const isBalanced = diff <= 1;
                                    return (
                                        <div style={{
                                            padding: '1rem',
                                            background: isBalanced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                            borderRadius: '10px',
                                            border: `1px solid ${isBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`
                                        }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>👥 반별 인원</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold' }}>{minSize}~{maxSize}명</span>
                                                {isBalanced ? (
                                                    <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ 균등</span>
                                                ) : (
                                                    <span style={{ color: '#eab308', fontSize: '0.85rem' }}>⚠ 편차 {diff}명</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 분리 그룹 */}
                                <div style={{
                                    padding: '1rem',
                                    background: constraintViolations.sepViolations.length > 0
                                        ? 'rgba(239, 68, 68, 0.1)'
                                        : sepGroupMap.size > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '10px',
                                    border: `1px solid ${constraintViolations.sepViolations.length > 0 ? 'rgba(239, 68, 68, 0.3)' : sepGroupMap.size > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'}`
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>🔴 분리 그룹</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>{sepGroupMap.size}개 그룹</span>
                                        {constraintViolations.sepViolations.length > 0 ? (
                                            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠ {constraintViolations.sepViolations.length}건 확인 필요</span>
                                        ) : sepGroupMap.size > 0 ? (
                                            <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ 모두 분리됨</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>설정 없음</span>
                                        )}
                                    </div>
                                </div>

                                {/* 같은반 그룹 */}
                                <div style={{
                                    padding: '1rem',
                                    background: constraintViolations.bindViolations.length > 0
                                        ? 'rgba(239, 68, 68, 0.1)'
                                        : bindGroupMap.size > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '10px',
                                    border: `1px solid ${constraintViolations.bindViolations.length > 0 ? 'rgba(239, 68, 68, 0.3)' : bindGroupMap.size > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'}`
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>🟢 같은반 그룹</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>{bindGroupMap.size}개 그룹</span>
                                        {constraintViolations.bindViolations.length > 0 ? (
                                            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠ {constraintViolations.bindViolations.length}건 확인 필요</span>
                                        ) : bindGroupMap.size > 0 ? (
                                            <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ 모두 같은반</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>설정 없음</span>
                                        )}
                                    </div>
                                </div>

                                {/* 특별관리대상 */}
                                {(() => {
                                    const specialCounts = allocation.classes.map(c =>
                                        c.special_factors.special + c.special_factors.problem + c.special_factors.underachiever
                                    );
                                    const totalSpecial = specialCounts.reduce((a, b) => a + b, 0);
                                    const minCount = Math.min(...specialCounts);
                                    const maxCount = Math.max(...specialCounts);
                                    const diff = maxCount - minCount;
                                    const isBalanced = diff <= 1;
                                    return (
                                        <div style={{
                                            padding: '1rem',
                                            background: totalSpecial > 0 ? (isBalanced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)') : 'rgba(30, 41, 59, 0.5)',
                                            borderRadius: '10px',
                                            border: `1px solid ${totalSpecial > 0 ? (isBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)') : 'rgba(255,255,255,0.1)'}`
                                        }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>🔶 특별관리대상</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold' }}>{totalSpecial}명</span>
                                                {totalSpecial > 0 ? (
                                                    isBalanced ? (
                                                        <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ 균등 분배</span>
                                                    ) : (
                                                        <span style={{ color: '#eab308', fontSize: '0.85rem' }}>⚠ 편차 {diff}명</span>
                                                    )
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>없음</span>
                                                )}
                                            </div>
                                            {totalSpecial > 0 && (
                                                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    최소 {minCount}명 ~ 최대 {maxCount}명
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* 동명이인 */}
                                <div style={{
                                    padding: '1rem',
                                    background: duplicateAnalysis.fullDuplicates.some(d => d.hasSameSectionConflict)
                                        ? 'rgba(239, 68, 68, 0.1)'
                                        : duplicateAnalysis.fullDuplicates.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '10px',
                                    border: `1px solid ${duplicateAnalysis.fullDuplicates.some(d => d.hasSameSectionConflict) ? 'rgba(239, 68, 68, 0.3)' : duplicateAnalysis.fullDuplicates.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'}`
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>👥 동명이인</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>{duplicateAnalysis.fullDuplicates.length}그룹</span>
                                        {duplicateAnalysis.fullDuplicates.some(d => d.hasSameSectionConflict) ? (
                                            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠ 같은반 배정됨</span>
                                        ) : duplicateAnalysis.fullDuplicates.length > 0 ? (
                                            <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✓ 모두 분산됨</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>없음</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 경고 사항 */}
                            {(constraintViolations.sepViolations.length > 0 || constraintViolations.bindViolations.length > 0 ||
                                duplicateAnalysis.fullDuplicates.some(d => d.hasSameSectionConflict)) && (
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        marginBottom: '1.25rem'
                                    }}>
                                        <div style={{ fontWeight: 'bold', color: '#ef4444', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            ⚠️ 확인이 필요한 사항
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {constraintViolations.sepViolations.length > 0 && (
                                                <div>• 분리 그룹 중 같은반에 배정된 학생이 있습니다.</div>
                                            )}
                                            {constraintViolations.bindViolations.length > 0 && (
                                                <div>• 같은반 그룹 중 분산 배정된 학생이 있습니다.</div>
                                            )}
                                            {duplicateAnalysis.fullDuplicates.some(d => d.hasSameSectionConflict) && (
                                                <div>• 동명이인이 같은반에 배정되었습니다.</div>
                                            )}
                                            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                                                → 아래 통계 카드를 클릭하여 상세 내용을 확인하세요.
                                            </div>
                                        </div>
                                    </div>
                                )}

                            {/* 안내 문구 */}
                            <div style={{
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                marginBottom: '1.25rem',
                                padding: '0.75rem',
                                background: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: '8px',
                                borderLeft: '3px solid #3b82f6'
                            }}>
                                💡 배정 결과를 검토 후, 필요 시 학생 교환 기능으로 수동 조정하세요.
                            </div>

                            <button onClick={() => setShowSummary(false)} className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }}>
                                확인하고 결과 보기
                            </button>
                        </div>
                    </div>
                )}

                {/* SEP 학생 분리 정보 팝오버 */}
                {clickedSepStudent && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1001, backdropFilter: 'blur(3px)'
                    }} onClick={() => setClickedSepStudent(null)}>
                        <div className="card" style={{ maxWidth: '400px', width: '90%', padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
                            <h3 style={{ marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🔴 분리 대상 학생
                            </h3>
                            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                                    {clickedSepStudent.name}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    이 학생과 분리되어 배정된 학생들:
                                </div>
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                {getSepInfo(clickedSepStudent).map((info, idx) => (
                                    <div key={idx} style={{
                                        padding: '0.75rem',
                                        background: 'rgba(30, 41, 59, 0.4)',
                                        borderRadius: '6px',
                                        marginBottom: '0.5rem',
                                        border: '1px solid var(--border)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                    {info.name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    그룹: {info.groupName}
                                                </div>
                                            </div>
                                            <div style={{
                                                padding: '0.25rem 0.75rem',
                                                background: 'rgba(59, 130, 246, 0.2)',
                                                color: '#60a5fa',
                                                borderRadius: '4px',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold'
                                            }}>
                                                {info.section}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {getSepInfo(clickedSepStudent).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem' }}>
                                        분리 대상 학생이 없습니다.
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setClickedSepStudent(null)} className="btn btn-secondary" style={{ width: '100%' }}>
                                닫기
                            </button>
                        </div>
                    </div>
                )}

                {/* 반인원 상세 모달 */}
                {showClassSizeModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowClassSizeModal(false)}>
                        <div className="card" style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem' }}>👥 반별 인원 현황</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {allocation.classes.map((cls, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '1rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px'
                                    }}>
                                        <span style={{ fontWeight: 600 }}>{getSectionName(idx)}</span>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <span style={{ color: '#3b82f6' }}>남 {cls.gender_stats.male}명</span>
                                            <span style={{ color: '#ec4899' }}>여 {cls.gender_stats.female}명</span>
                                            <span style={{ fontWeight: 'bold', color: '#6366f1' }}>총 {cls.students.length}명</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>평균: </span>
                                <span style={{ fontWeight: 'bold', color: '#6366f1' }}>{overallStats ? (overallStats.totalStudents / overallStats.sectionCount).toFixed(1) : '-'}명</span>
                            </div>
                            <button onClick={() => setShowClassSizeModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 석차 평균 상세 모달 */}
                {showRankModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowRankModal(false)}>
                        <div className="card" style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem' }}>📊 반별 석차 평균</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {allocation.classes.map((cls, idx) => {
                                    const ranks = cls.students.filter(s => s.rank).map(s => s.rank!);
                                    const avgRank = ranks.length > 0 ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : '-';
                                    return (
                                        <div key={idx} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '1rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px'
                                        }}>
                                            <span style={{ fontWeight: 600 }}>{getSectionName(idx)}</span>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>석차 있는 학생: {ranks.length}명</span>
                                                <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>평균 {avgRank}등</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <button onClick={() => setShowRankModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 분리그룹 상세 모달 */}
                {showSepModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowSepModal(false)}>
                        <div className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem' }}>🔴 분리그룹 배정 현황</h2>
                            {constraintViolations.sepViolations.length > 0 && (
                                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                    <div style={{ fontWeight: 'bold', color: '#ef4444', marginBottom: '0.5rem' }}>⚠ 수정 필요</div>
                                    {constraintViolations.sepViolations.map((v, i) => (
                                        <div key={i} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{v}</div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {Array.from(sepGroupMap.entries()).map(([groupName, members]) => {
                                    const sectionSet = new Set<string>();
                                    members.forEach(m => {
                                        const sectionIdx = allocation.classes.findIndex(c => c.students.some(s => s.id === m.id));
                                        if (sectionIdx !== -1) sectionSet.add(getSectionName(sectionIdx));
                                    });
                                    const isValid = sectionSet.size === members.length;
                                    return (
                                        <div key={groupName} style={{
                                            padding: '1rem',
                                            background: isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            borderRadius: '8px',
                                            border: `1px solid ${isValid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                        }}>
                                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{isValid ? '✓' : '✗'} {groupName}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {members.map((m, i) => {
                                                    const sectionIdx = allocation.classes.findIndex(c => c.students.some(s => s.id === m.id));
                                                    return (
                                                        <span key={i} style={{ padding: '0.25rem 0.5rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '4px', fontSize: '0.85rem' }}>
                                                            {m.name} ({getSectionName(sectionIdx)})
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {sepGroupMap.size === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>분리그룹이 없습니다.</div>
                                )}
                            </div>
                            <button onClick={() => setShowSepModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 같은반 그룹 상세 모달 */}
                {showBindModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowBindModal(false)}>
                        <div className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>🟢 같은반 그룹 배정 현황</h2>
                            {constraintViolations.bindViolations.length > 0 && (
                                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                    <div style={{ fontWeight: 'bold', color: '#ef4444', marginBottom: '0.5rem' }}>⚠ 수정 필요</div>
                                    {constraintViolations.bindViolations.map((v, i) => (
                                        <div key={i} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{v}</div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {Array.from(bindGroupMap.entries()).map(([groupName, members]) => {
                                    const sections = new Set<number>();
                                    members.forEach(m => {
                                        const sectionIdx = allocation.classes.findIndex(c => c.students.some(s => s.id === m.id));
                                        if (sectionIdx !== -1) sections.add(sectionIdx);
                                    });
                                    const isValid = sections.size === 1;
                                    const sectionName = isValid ? getSectionName(Array.from(sections)[0]) : '분산됨';
                                    return (
                                        <div key={groupName} style={{
                                            padding: '1rem',
                                            background: isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            borderRadius: '8px',
                                            border: `1px solid ${isValid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                        }}>
                                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{isValid ? '✓' : '✗'} {groupName}</span>
                                                <span style={{ color: isValid ? '#10b981' : '#ef4444' }}>{sectionName}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {members.map((m, i) => (
                                                    <span key={i} style={{ padding: '0.25rem 0.5rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '4px', fontSize: '0.85rem' }}>{m.name}</span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {bindGroupMap.size === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>같은반 그룹이 없습니다.</div>
                                )}
                            </div>
                            <button onClick={() => setShowBindModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 특별관리대상 현황 모달 */}
                {showSpecialModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowSpecialModal(false)}>
                        <div className="card" style={{ maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>🔶 특별관리대상 현황</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {allocation.classes.map((cls, idx) => (
                                    <div key={idx} style={{ padding: '1rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{getSectionName(idx)}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>총 {cls.special_factors.special + cls.special_factors.problem + cls.special_factors.underachiever}명</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.85rem' }}>
                                            <div style={{ padding: '0.5rem', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '4px', textAlign: 'center' }}>
                                                <div style={{ color: '#a855f7' }}>특수교육</div>
                                                <div style={{ fontWeight: 'bold' }}>{cls.special_factors.special}명</div>
                                            </div>
                                            <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', textAlign: 'center' }}>
                                                <div style={{ color: '#ef4444' }}>문제행동</div>
                                                <div style={{ fontWeight: 'bold' }}>{cls.special_factors.problem}명</div>
                                            </div>
                                            <div style={{ padding: '0.5rem', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px', textAlign: 'center' }}>
                                                <div style={{ color: '#eab308' }}>학습부진</div>
                                                <div style={{ fontWeight: 'bold' }}>{cls.special_factors.underachiever}명</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setShowSpecialModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 동명이인 분산 현황 모달 */}
                {showDuplicateNamesModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowDuplicateNamesModal(false)}>
                        <div className="card" style={{ maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>👥 동명이인 및 이름 분산 현황</h2>

                            {/* 완전 동명이인 섹션 */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📌 완전 동명이인 ({duplicateAnalysis.fullDuplicates.length}그룹)
                                </h3>
                                {duplicateAnalysis.fullDuplicates.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {duplicateAnalysis.fullDuplicates.map((dup, idx) => (
                                            <div key={idx} style={{
                                                padding: '0.75rem',
                                                background: dup.hasSameSectionConflict ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                borderRadius: '6px',
                                                border: `1px solid ${dup.hasSameSectionConflict ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span>{dup.hasSameSectionConflict ? '❌' : '✅'}</span>
                                                    <span>{dup.name} ({dup.students.length}명)</span>
                                                    {dup.hasSameSectionConflict && <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>⚠️ 같은 반에 배치됨</span>}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                    {dup.students.map((student, i) => {
                                                        const sectionIdx = allocation.classes.findIndex(c => c.students.some(s => s.id === student.id));
                                                        return (
                                                            <span key={i} style={{
                                                                padding: '0.25rem 0.5rem',
                                                                background: 'rgba(30, 41, 59, 0.6)',
                                                                borderRadius: '4px',
                                                                color: '#fff'
                                                            }}>
                                                                {getSectionName(sectionIdx)} - {student.name}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '6px' }}>
                                        완전 동명이인이 없습니다.
                                    </div>
                                )}
                            </div>

                            {/* 이름만 같은 학생 섹션 */}
                            <div>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📌 이름만 같은 학생들 ({duplicateAnalysis.givenNameDuplicates.length}그룹)
                                </h3>
                                {duplicateAnalysis.givenNameDuplicates.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {duplicateAnalysis.givenNameDuplicates.map((dup, idx) => (
                                            <div key={idx} style={{
                                                padding: '0.75rem',
                                                background: dup.hasSameSectionConflict ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                borderRadius: '6px',
                                                border: `1px solid ${dup.hasSameSectionConflict ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span>{dup.hasSameSectionConflict ? '⚠️' : '✅'}</span>
                                                    <span>&quot;{dup.givenName}&quot; ({dup.students.length}명)</span>
                                                    {dup.hasSameSectionConflict && <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>같은 반 {dup.students.filter((s, i, arr) => arr.findIndex(x => x.sectionId === s.sectionId) !== i).length}명</span>}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                    {dup.students.map((student, i) => {
                                                        const sectionIdx = allocation.classes.findIndex(c => c.students.some(s => s.id === student.id));
                                                        return (
                                                            <span key={i} style={{
                                                                padding: '0.25rem 0.5rem',
                                                                background: 'rgba(30, 41, 59, 0.6)',
                                                                borderRadius: '4px',
                                                                color: '#fff'
                                                            }}>
                                                                {getSectionName(sectionIdx)} - {student.name}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '6px' }}>
                                        이름만 같은 학생이 없습니다.
                                    </div>
                                )}
                            </div>

                            <button onClick={() => setShowDuplicateNamesModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }}>닫기</button>
                        </div>
                    </div>
                )}

                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary-light)' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>반배정 결과</span>
                            <span>/</span>
                            <span style={{ fontSize: '0.9rem' }}>Step 3</span>
                        </div>
                        <h1 style={{ margin: 0 }}>반편성 결과 확인</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => router.push(`/conditions?classId=${classId}`)} className="btn btn-secondary">
                            ← 이전 단계
                        </button>
                        <button
                            onClick={handleReAllocate}
                            className="btn btn-secondary"
                            disabled={reAllocating}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: reAllocating ? 0.6 : 1,
                                cursor: reAllocating ? 'not-allowed' : 'pointer',
                                ...(showSavedAllocationBanner && {
                                    border: '2px solid #f59e0b',
                                    boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.2)',
                                    animation: 'gentlePulse 2s ease-in-out infinite'
                                })
                            }}
                        >
                            {reAllocating ? '🔄 편성 중...' : '🔄 다시 편성'}
                        </button>
                        <button onClick={() => handleSave()} className="btn btn-primary">
                            💾 확정 및 저장
                        </button>
                        <button
                            onClick={handleExportExcel}
                            disabled={!isSavedAllocation}
                            style={{
                                padding: '0.75rem 1.25rem',
                                background: isSavedAllocation
                                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                    : 'rgba(100, 116, 139, 0.3)',
                                border: 'none',
                                borderRadius: '8px',
                                color: isSavedAllocation ? '#fff' : 'rgba(255,255,255,0.5)',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: isSavedAllocation ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                                opacity: isSavedAllocation ? 1 : 0.6
                            }}
                        >
                            📥 엑셀 다운로드
                        </button>
                    </div>
                </div>

                {/* 저장된 배정 안내 배너 */}
                {showSavedAllocationBanner && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)',
                        border: '2px solid rgba(59, 130, 246, 0.4)',
                        borderRadius: '12px',
                        padding: '1rem 1.5rem',
                        marginBottom: '2rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
                        position: 'relative'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 0.25rem 0', color: '#3b82f6', fontSize: '0.95rem', fontWeight: '600' }}>
                                저장된 배정을 불러왔습니다
                            </h4>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                제약조건을 변경한 경우 <strong style={{ color: '#f59e0b' }}>&apos;다시 편성&apos;</strong>을 클릭하여 새로운 조건을 반영해주세요.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSavedAllocationBanner(false)}
                            style={{
                                background: 'rgba(255, 255, 255, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#3b82f6',
                                fontSize: '1.2rem',
                                lineHeight: 1,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                            }}
                            aria-label="배너 닫기"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* 워크플로우 카드 */}
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '3rem' }}>
                    <StepCard
                        step={1}
                        title="학생 정보 입력"
                        description="모든 학생 정보 입력 완료"
                        icon="📝"
                        status="completed"
                        iconBg="#3b82f6"
                        bgGradient="linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)"
                    />
                    <StepCard
                        step={2}
                        title="조건 설정"
                        description="분리/결합 조건 설정 완료"
                        icon="⚙️"
                        status="completed"
                        iconBg="#10b981"
                        bgGradient="linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)"
                        onClick={() => router.push(`/conditions?classId=${classId}`)}
                    />
                    <StepCard
                        step={3}
                        title="반편성 결과"
                        description="알고리즘 배정 결과 확인 중"
                        icon="🎯"
                        status="active"
                        iconBg="#a855f7"
                        bgGradient="linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)"
                    />
                </div>

                {/* 제약조건 위반 경고 */}
                {(constraintViolations.sepViolations.length > 0 || constraintViolations.bindViolations.length > 0) && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)',
                        border: '2px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        marginBottom: '2rem',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                    }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            ⚠️ 제약조건 위반 경고
                        </h3>
                        {constraintViolations.sepViolations.length > 0 && (
                            <div style={{ marginBottom: constraintViolations.bindViolations.length > 0 ? '1rem' : 0 }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#dc2626' }}>분리 조건 위반:</h4>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                                    {constraintViolations.sepViolations.map((v, i) => (
                                        <li key={i} style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>{v}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {constraintViolations.bindViolations.length > 0 && (
                            <div>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#dc2626' }}>같은 반 조건 위반:</h4>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                                    {constraintViolations.bindViolations.map((v, i) => (
                                        <li key={i} style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>{v}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* 전체 통계 요약 카드 */}
                {overallStats && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(79, 70, 229, 0.05) 100%)',
                        border: '2px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '12px',
                        padding: '2rem',
                        marginBottom: '2rem',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                    }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            📊 전체 배정 통계
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
                            {/* 반인원 평균 */}
                            <div
                                onClick={() => setShowClassSizeModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>반인원 평균</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#6366f1' }}>
                                    {(overallStats.totalStudents / overallStats.sectionCount).toFixed(1)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>명</div>
                            </div>

                            {/* 반 석차 평균 */}
                            <div
                                onClick={() => setShowRankModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>반 석차 평균</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6' }}>
                                    {(() => {
                                        if (!allocation) return '-';
                                        const allRanks = allocation.classes.flatMap(c => c.students.filter(s => s.rank).map(s => s.rank!));
                                        return allRanks.length > 0 ? (allRanks.reduce((a, b) => a + b, 0) / allRanks.length).toFixed(1) : '-';
                                    })()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>등</div>
                            </div>

                            {/* 분리그룹 */}
                            <div
                                onClick={() => setShowSepModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: constraintViolations.sepViolations.length === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: `1px solid ${constraintViolations.sepViolations.length === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>분리그룹</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: constraintViolations.sepViolations.length === 0 ? '#10b981' : '#ef4444' }}>
                                    {constraintViolations.sepViolations.length === 0 ? '✓ 완료' : '⚠ 수정필요'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{overallStats.sepGroupCount}개 그룹</div>
                            </div>

                            {/* 같은반 그룹 */}
                            <div
                                onClick={() => setShowBindModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: constraintViolations.bindViolations.length === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: `1px solid ${constraintViolations.bindViolations.length === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>같은반 그룹</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: constraintViolations.bindViolations.length === 0 ? '#10b981' : '#ef4444' }}>
                                    {constraintViolations.bindViolations.length === 0 ? '✓ 완료' : '⚠ 수정필요'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{overallStats.bindGroupCount}개 그룹</div>
                            </div>

                            {/* 특별관리대상 현황 */}
                            <div
                                onClick={() => setShowSpecialModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)';
                                    e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>특별관리대상</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f97316' }}>현황 보기</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {allocation ? allocation.classes.reduce((sum, c) => sum + c.special_factors.special + c.special_factors.problem + c.special_factors.underachiever, 0) : 0}명
                                </div>
                            </div>

                            {/* 동명이인 분산 */}
                            <div
                                onClick={() => setShowDuplicateNamesModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1.25rem',
                                    background: duplicateAnalysis.hasIssues ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: `1px solid ${duplicateAnalysis.hasIssues ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>동명이인 분산</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: duplicateAnalysis.hasIssues ? '#ef4444' : '#10b981' }}>
                                    {duplicateAnalysis.hasIssues ? '⚠ 수정필요' : '✓ 완료'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {duplicateAnalysis.fullDuplicates.length}개 / {duplicateAnalysis.givenNameDuplicates.length}개
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 범례 */}
                <div style={{
                    background: 'rgba(99, 102, 241, 0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        marginBottom: '1rem',
                        color: 'var(--text-primary)'
                    }}>
                        비고 배지 안내
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '4px',
                                color: '#ef4444',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                textDecoration: 'underline',
                                flexShrink: 0
                            }}>분리 (클릭)</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>클릭시 분리 대상 확인</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '4px',
                                color: '#22c55e',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>같은반</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>호버시 그룹 표시</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(234, 179, 8, 0.1)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                borderRadius: '4px',
                                color: '#eab308',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>동명이인</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>이름 중복 학생</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(249, 115, 22, 0.1)',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                borderRadius: '4px',
                                color: '#f97316',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>문제행동</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>문제행동 학생</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(168, 85, 247, 0.1)',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                borderRadius: '4px',
                                color: '#a855f7',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>특수교육</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>특수교육대상</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '4px',
                                color: '#3b82f6',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>학습부진</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>학습부진아</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(148, 163, 184, 0.1)',
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                borderRadius: '4px',
                                color: '#94a3b8',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                flexShrink: 0
                            }}>전출예정</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>전출예정 학생</span>
                        </div>
                    </div>
                </div>

                {/* 명렬표 + 사이드바 레이아웃 */}
                <div style={{ display: 'flex', gap: '2rem' }}>
                    {/* 반별 명렷표 - 구분선 리스트 형식 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                        {allocation?.classes.map((cls, classIndex) => {
                            const sortedStudents = [...cls.students].sort(koreanSort);

                            // 기존 반별 학생 수 계산
                            const oldClassDistribution = new Map<number, Student[]>();
                            cls.students.forEach(student => {
                                if (student.section_number) {
                                    if (!oldClassDistribution.has(student.section_number)) {
                                        oldClassDistribution.set(student.section_number, []);
                                    }
                                    oldClassDistribution.get(student.section_number)!.push(student);
                                }
                            });
                            const sortedOldClasses = Array.from(oldClassDistribution.entries()).sort((a, b) => a[0] - b[0]);

                            // 석차 평균 계산
                            const studentsWithRank = cls.students.filter(s => s.rank !== undefined && s.rank !== null);
                            const averageRank = studentsWithRank.length > 0
                                ? (studentsWithRank.reduce((sum, s) => sum + (s.rank || 0), 0) / studentsWithRank.length).toFixed(1)
                                : null;

                            return (
                                <div key={cls.id} style={{
                                    borderTop: classIndex === 0 ? '2px solid var(--border)' : 'none',
                                    paddingTop: classIndex === 0 ? '2rem' : 0,
                                    borderBottom: '2px solid var(--border)',
                                    paddingBottom: '2rem'
                                }}>
                                    {/* 반 헤더 - 간소화 */}
                                    <div style={{
                                        marginBottom: '1.5rem',
                                        paddingBottom: '1rem',
                                        borderBottom: '1px solid var(--border)'
                                    }}>
                                        <h2 style={{
                                            margin: '0 0 0.5rem 0',
                                            fontSize: '1.5rem',
                                            fontWeight: '700',
                                            color: 'var(--text-primary)'
                                        }}>
                                            {getSectionName(classIndex)}
                                        </h2>
                                        <div style={{
                                            display: 'flex',
                                            gap: '1.5rem',
                                            fontSize: '0.9rem',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            <div>
                                                <span style={{ fontWeight: '600' }}>총원:</span> {cls.students.length}명
                                                {cls.special_factors.transfer > 0 && (
                                                    <span style={{ marginLeft: '0.3rem', color: 'var(--text-muted)' }}>
                                                        (전출예정 {cls.special_factors.transfer}명)
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <span style={{ fontWeight: '600' }}>남:</span> {cls.gender_stats.male}명
                                            </div>
                                            <div>
                                                <span style={{ fontWeight: '600' }}>여:</span> {cls.gender_stats.female}명
                                            </div>
                                        </div>
                                    </div>

                                    {/* 테이블 + 정보 카드 레이아웃 (80:20) */}
                                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                                        {/* 왼쪽: 명렬표 - 80% */}
                                        <div style={{ flex: '0 0 78%', overflowX: 'auto' }}>
                                            <table style={{
                                                width: '100%',
                                                fontSize: '0.8rem',
                                                borderCollapse: 'separate',
                                                borderSpacing: '0 0.3rem',
                                                minWidth: '800px'
                                            }}>
                                                <thead>
                                                    <tr style={{
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        borderBottom: '1px solid var(--border)'
                                                    }}>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '5%' }}>번호</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'left', width: '12%' }}>이름</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '6%' }}>성별</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '12%' }}>생년월일</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'left', width: '20%' }}>특기사항</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '15%' }}>연락처</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '8%' }}>기존반</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'left', width: '22%' }}>비고</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedStudents.map((student, index) => {
                                                        const { sep, bind } = parseConstraints(student);
                                                        const isDuplicate = duplicateNames.has(student.name.trim());
                                                        const isHighlighted = highlightedIds.has(student.id);
                                                        const hasSep = sep.length > 0;
                                                        const hasBind = bind.length > 0;

                                                        return (
                                                            <tr
                                                                key={student.id}
                                                                style={{
                                                                    backgroundColor: highlightedStudents.has(student.id) ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                                                                    borderRadius: '6px',
                                                                    border: highlightedStudents.has(student.id) ? '2px solid rgba(34, 197, 94, 0.5)' : '1px solid var(--border)',
                                                                    boxShadow: isHighlighted ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : 'none',
                                                                    transition: 'all 0.3s ease'
                                                                }}
                                                                onMouseEnter={() => hasBind ? setHoveredStudentId(student.id) : null}
                                                                onMouseLeave={() => setHoveredStudentId(null)}
                                                            >
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '600',
                                                                    color: 'var(--text-secondary)'
                                                                }}>
                                                                    {index + 1}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    fontWeight: 600,
                                                                    fontSize: '0.9rem',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.name}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '600',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.gender === 'M' ? '남' : '여'}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.8rem',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.birth_date || '-'}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'left',
                                                                    fontSize: '0.8rem',
                                                                    maxWidth: '180px',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.notes || '-'}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.8rem',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.contact || '-'}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '600',
                                                                    color: 'var(--text-primary)'
                                                                }}>
                                                                    {student.section_number ? `${student.section_number}반` : '-'}
                                                                </td>
                                                                <td style={{
                                                                    padding: '0.6rem 0.5rem',
                                                                    textAlign: 'left',
                                                                    fontSize: '0.75rem'
                                                                }}>
                                                                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                        {hasSep && (
                                                                            <span
                                                                                onClick={() => setClickedSepStudent(student)}
                                                                                style={{
                                                                                    display: 'inline-block',
                                                                                    padding: '0.2rem 0.5rem',
                                                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                                    borderRadius: '4px',
                                                                                    color: '#ef4444',
                                                                                    fontWeight: '600',
                                                                                    cursor: 'pointer',
                                                                                    textDecoration: 'underline',
                                                                                    fontSize: '0.75rem'
                                                                                }}
                                                                                title="클릭하여 분리 대상 확인"
                                                                            >
                                                                                분리 (클릭)
                                                                            </span>
                                                                        )}
                                                                        {hasBind && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(34, 197, 94, 0.1)',
                                                                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#22c55e',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                같은반
                                                                            </span>
                                                                        )}
                                                                        {isDuplicate && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(234, 179, 8, 0.1)',
                                                                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#eab308',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                동명이인
                                                                            </span>
                                                                        )}
                                                                        {student.is_problem_student && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(249, 115, 22, 0.1)',
                                                                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#f97316',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                문제행동
                                                                            </span>
                                                                        )}
                                                                        {student.is_special_class && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(168, 85, 247, 0.1)',
                                                                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#a855f7',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                특수교육
                                                                            </span>
                                                                        )}
                                                                        {student.is_underachiever && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(59, 130, 246, 0.1)',
                                                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#3b82f6',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                학습부진
                                                                            </span>
                                                                        )}
                                                                        {student.is_transferring_out && (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                padding: '0.2rem 0.5rem',
                                                                                background: 'rgba(148, 163, 184, 0.1)',
                                                                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                                                                borderRadius: '4px',
                                                                                color: '#94a3b8',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem'
                                                                            }}>
                                                                                전출예정
                                                                            </span>
                                                                        )}
                                                                        {!hasSep && !hasBind && !isDuplicate && !student.is_problem_student && !student.is_special_class && !student.is_underachiever && !student.is_transferring_out && (
                                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 오른쪽: 정보 카드 - 20% */}
                                        <div style={{
                                            flex: '0 0 20%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1rem'
                                        }}>
                                            {/* 석차 평균 카드 */}
                                            {averageRank !== null && (
                                                <div style={{
                                                    background: 'var(--bg-secondary)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    padding: '1rem'
                                                }}>
                                                    <h4 style={{
                                                        margin: '0 0 0.75rem 0',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        color: 'var(--text-primary)'
                                                    }}>
                                                        📊 석차 평균
                                                    </h4>
                                                    <div style={{
                                                        fontSize: '1.8rem',
                                                        fontWeight: 'bold',
                                                        color: '#6366f1',
                                                        textAlign: 'center',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        {averageRank}등
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-muted)',
                                                        textAlign: 'center'
                                                    }}>
                                                        석차 보유 학생 {studentsWithRank.length}명
                                                    </div>
                                                </div>
                                            )}

                                            {/* 특별관리 학생 카드 */}
                                            <div style={{
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '1rem'
                                            }}>
                                                <h4 style={{
                                                    margin: '0 0 0.75rem 0',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    📌 특별관리 학생
                                                </h4>
                                                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {cls.special_factors.problem > 0 && (
                                                        <div style={{ color: 'var(--text-secondary)' }}>
                                                            문제행동: <span style={{ fontWeight: '600', color: '#f97316' }}>{cls.special_factors.problem}명</span>
                                                        </div>
                                                    )}
                                                    {cls.special_factors.special > 0 && (
                                                        <div style={{ color: 'var(--text-secondary)' }}>
                                                            특수교육: <span style={{ fontWeight: '600', color: '#a855f7' }}>{cls.special_factors.special}명</span>
                                                        </div>
                                                    )}
                                                    {cls.special_factors.underachiever > 0 && (
                                                        <div style={{ color: 'var(--text-secondary)' }}>
                                                            학습부진: <span style={{ fontWeight: '600', color: '#3b82f6' }}>{cls.special_factors.underachiever}명</span>
                                                        </div>
                                                    )}
                                                    {cls.special_factors.problem === 0 && cls.special_factors.special === 0 && cls.special_factors.underachiever === 0 && (
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                            없음
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 기존 반 구성 현황 카드 */}
                                            <div style={{
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '1rem'
                                            }}>
                                                <h4 style={{
                                                    margin: '0 0 0.75rem 0',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    🔄 기존 반 구성
                                                </h4>
                                                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {sortedOldClasses.length > 0 ? (
                                                        sortedOldClasses.map(([oldSection, students]) => {
                                                            const isExpanded = expandedOldClass?.sectionIndex === classIndex && expandedOldClass?.oldSection === oldSection;
                                                            // 남녀 인원수 계산
                                                            const maleCount = students.filter(s => s.gender === 'M').length;
                                                            const femaleCount = students.filter(s => s.gender === 'F').length;
                                                            return (
                                                                <div key={oldSection}>
                                                                    <div
                                                                        onClick={() => setExpandedOldClass(
                                                                            isExpanded ? null : { sectionIndex: classIndex, oldSection }
                                                                        )}
                                                                        style={{
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            color: 'var(--text-secondary)',
                                                                            cursor: 'pointer',
                                                                            padding: '0.4rem',
                                                                            borderRadius: '4px',
                                                                            background: isExpanded ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            if (!isExpanded) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            if (!isExpanded) e.currentTarget.style.background = 'transparent';
                                                                        }}
                                                                    >
                                                                        <span>기존 {oldSection}반:</span>
                                                                        <span style={{
                                                                            fontWeight: '600',
                                                                            color: 'var(--text-primary)',
                                                                            padding: '0.2rem 0.5rem',
                                                                            background: 'rgba(59, 130, 246, 0.2)',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.75rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.3rem'
                                                                        }}>
                                                                            <span style={{ color: '#3b82f6' }}>남{maleCount}</span>
                                                                            <span style={{ color: '#ec4899' }}>여{femaleCount}</span>
                                                                            <span>{students.length}명</span>
                                                                            <span>{isExpanded ? '▲' : '▼'}</span>
                                                                        </span>
                                                                    </div>
                                                                    {isExpanded && (
                                                                        <div style={{
                                                                            marginTop: '0.5rem',
                                                                            marginLeft: '0.5rem',
                                                                            paddingLeft: '0.5rem',
                                                                            borderLeft: '2px solid rgba(59, 130, 246, 0.3)',
                                                                            fontSize: '0.75rem'
                                                                        }}>
                                                                            {students.sort(koreanSort).map(s => (
                                                                                <div key={s.id} style={{
                                                                                    padding: '0.25rem 0',
                                                                                    color: 'var(--text-secondary)'
                                                                                }}>
                                                                                    • {s.name} ({s.gender === 'M' ? '남' : '여'}{s.rank && `, ${s.rank}등`})
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                            정보 없음
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 학생 교환 사이드바 */}
                    <div style={{
                        width: '350px',
                        flexShrink: 0,
                        position: 'sticky',
                        top: '2rem',
                        height: 'fit-content',
                        maxHeight: 'calc(100vh - 4rem)',
                        overflowY: 'auto'
                    }}>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '1.5rem'
                        }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                {isMoveMode ? '➡️ 학생 단독 이동' : '🔄 학생 이동'}
                            </h3>

                            {/* 단독 이동 모드 체크박스 */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    padding: '0.75rem',
                                    background: isMoveMode ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    transition: 'all 0.2s'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isMoveMode}
                                        onChange={(e) => {
                                            setIsMoveMode(e.target.checked);
                                            // 모드 변경 시 학생 B 초기화
                                            if (e.target.checked) {
                                                setStudentB(null);
                                                setSearchB('');
                                            }
                                        }}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontWeight: isMoveMode ? '600' : '400' }}>
                                        단독 이동 모드
                                    </span>
                                </label>
                            </div>

                            {/* 학생 A 검색 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                    학생 A
                                </label>
                                <input
                                    type="text"
                                    value={searchA}
                                    onChange={(e) => setSearchA(e.target.value)}
                                    placeholder="이름 검색..."
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                {searchA && filteredStudentsA.length > 0 && !studentA && (
                                    <div style={{
                                        marginTop: '0.5rem',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        background: 'var(--bg-primary)',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}>
                                        {filteredStudentsA.map(s => {
                                            const classIndex = allocation!.classes.findIndex(c => c.students.some(st => st.id === s.id));
                                            return (
                                                <div
                                                    key={s.id}
                                                    onClick={() => { setStudentA(s); setSearchA(''); }}
                                                    style={{
                                                        padding: '0.75rem',
                                                        borderBottom: '1px solid var(--border)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{ fontWeight: '600' }}>{s.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                        {getSectionName(classIndex)} · {s.gender === 'M' ? '남' : '여'} {s.rank && `· ${s.rank}등`}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {studentA && (
                                    <div style={{
                                        marginTop: '0.5rem',
                                        padding: '0.75rem',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem'
                                    }}>
                                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{studentA.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {getSectionName(allocation!.classes.findIndex(c => c.students.some(s => s.id === studentA.id)))} ·{' '}
                                            {studentA.gender === 'M' ? '남' : '여'} {studentA.rank && `· ${studentA.rank}등`}
                                        </div>
                                        <button
                                            onClick={() => setStudentA(null)}
                                            style={{
                                                marginTop: '0.5rem',
                                                padding: '0.25rem 0.5rem',
                                                fontSize: '0.75rem',
                                                background: 'transparent',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                color: 'var(--text-secondary)'
                                            }}
                                        >
                                            취소
                                        </button>
                                    </div>
                                )}
                            </div>

                            {!isMoveMode && (
                                <div style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.5rem' }}>⇅</div>
                            )}

                            {/* 단독 이동 모드: 목표 반 선택 */}
                            {isMoveMode ? (
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                        목표 반
                                    </label>
                                    <select
                                        value={targetSection}
                                        onChange={(e) => setTargetSection(Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            background: '#1e293b',
                                            color: '#f1f5f9',
                                            fontSize: '0.9rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {allocation?.classes.map((cls, idx) => (
                                            <option
                                                key={idx}
                                                value={idx}
                                                style={{
                                                    background: '#1e293b',
                                                    color: '#f1f5f9',
                                                    padding: '0.5rem'
                                                }}
                                            >
                                                {getSectionName(idx)} ({cls.students.filter(s => !s.is_transferring_out).length}명)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                /* 학생 B 검색 */
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                        학생 B
                                    </label>
                                    {studentA && recommendedStudents.length > 0 && !studentB && (
                                        <div style={{
                                            marginBottom: '0.75rem',
                                            padding: '0.75rem',
                                            background: 'rgba(34, 197, 94, 0.1)',
                                            border: '1px solid rgba(34, 197, 94, 0.3)',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem'
                                        }}>
                                            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>💡 추천 학생 (같은 성별, 비슷한 석차)</div>
                                            {recommendedStudents.map(s => {
                                                const classIndex = allocation!.classes.findIndex(c => c.students.some(st => st.id === s.id));
                                                return (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => setStudentB(s)}
                                                        style={{
                                                            padding: '0.5rem',
                                                            marginBottom: '0.25rem',
                                                            background: 'rgba(255, 255, 255, 0.1)',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                                    >
                                                        {s.name} · {getSectionName(classIndex)} · {s.rank}등
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        value={searchB}
                                        onChange={(e) => setSearchB(e.target.value)}
                                        placeholder="이름 검색..."
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                    {searchB && filteredStudentsB.length > 0 && !studentB && (
                                        <div style={{
                                            marginTop: '0.5rem',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            background: 'var(--bg-primary)',
                                            maxHeight: '200px',
                                            overflowY: 'auto'
                                        }}>
                                            {filteredStudentsB.map(s => {
                                                const classIndex = allocation!.classes.findIndex(c => c.students.some(st => st.id === s.id));
                                                return (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => { setStudentB(s); setSearchB(''); }}
                                                        style={{
                                                            padding: '0.75rem',
                                                            borderBottom: '1px solid var(--border)',
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <div style={{ fontWeight: '600' }}>{s.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                            {getSectionName(classIndex)} · {s.gender === 'M' ? '남' : '여'} {s.rank && `· ${s.rank}등`}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {studentB && (
                                        <div style={{
                                            marginTop: '0.5rem',
                                            padding: '0.75rem',
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem'
                                        }}>
                                            <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{studentB.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {getSectionName(allocation!.classes.findIndex(c => c.students.some(s => s.id === studentB.id)))} ·{' '}
                                                {studentB.gender === 'M' ? '남' : '여'} {studentB.rank && `· ${studentB.rank}등`}
                                            </div>
                                            <button
                                                onClick={() => setStudentB(null)}
                                                style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.25rem 0.5rem',
                                                    fontSize: '0.75rem',
                                                    background: 'transparent',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)'
                                                }}
                                            >
                                                취소
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 검증 결과 */}
                            {!isMoveMode && studentA && studentB && (() => {
                                const validation = validateSwap(studentA, studentB);
                                return (
                                    <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                                        {validation.errors.length > 0 && (
                                            <div style={{
                                                padding: '0.75rem',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                borderRadius: '8px',
                                                marginBottom: '0.5rem'
                                            }}>
                                                {validation.errors.map((err, i) => (
                                                    <div key={i} style={{ color: '#ef4444' }}>❌ {err}</div>
                                                ))}
                                            </div>
                                        )}
                                        {validation.warnings.length > 0 && (
                                            <div style={{
                                                padding: '0.75rem',
                                                background: 'rgba(234, 179, 8, 0.1)',
                                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                                borderRadius: '8px',
                                                marginBottom: '0.5rem',
                                                maxHeight: '150px',
                                                overflowY: 'auto'
                                            }}>
                                                {validation.warnings.map((warn, i) => (
                                                    <div key={i} style={{ color: '#eab308', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                                                        {warn}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {validation.errors.length === 0 && validation.warnings.length === 0 && (
                                            <div style={{
                                                padding: '0.75rem',
                                                background: 'rgba(34, 197, 94, 0.1)',
                                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                                borderRadius: '8px',
                                                color: '#22c55e'
                                            }}>
                                                ✅ 모든 조건 충족
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* 버튼 */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={executeSwap}
                                    disabled={isMoveMode ? !studentA : (!studentA || !studentB)}
                                    className="btn btn-primary"
                                    style={{
                                        flex: 1,
                                        opacity: (isMoveMode ? !studentA : (!studentA || !studentB)) ? 0.5 : 1,
                                        cursor: (isMoveMode ? !studentA : (!studentA || !studentB)) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isMoveMode ? '이동하기' : '교환하기'}
                                </button>
                                <button
                                    onClick={() => {
                                        setStudentA(null);
                                        setStudentB(null);
                                        setSearchA('');
                                        setSearchB('');
                                    }}
                                    className="btn btn-secondary"
                                >
                                    초기화
                                </button>
                            </div>

                            {/* 교환 기록 */}
                            {swapHistory.length > 0 && (
                                <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                        📝 이동 기록 ({swapHistory.length}건)
                                    </h4>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        {swapHistory.map((swap, index) => {
                                            const classAIdx = allocation!.classes.findIndex(c => c.students.some(s => s.id === swap.studentA.id));
                                            const isMoveRecord = !swap.studentB; // 단독 이동인지 확인

                                            return (
                                                <div
                                                    key={swap.timestamp}
                                                    style={{
                                                        padding: '0.75rem',
                                                        background: 'rgba(30, 41, 59, 0.3)',
                                                        borderRadius: '8px',
                                                        marginBottom: '0.5rem',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    <div style={{ marginBottom: '0.5rem' }}>
                                                        {isMoveRecord ? (
                                                            // 단독 이동 기록
                                                            <>
                                                                <span style={{ fontWeight: '600' }}>{swap.studentA.name}</span>
                                                                <span style={{ color: 'var(--text-secondary)' }}> ({getSectionName(swap.originSectionIndex!)})</span>
                                                                <span> → </span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>{getSectionName(swap.targetSectionIndex!)}</span>
                                                                <span style={{
                                                                    marginLeft: '0.5rem',
                                                                    padding: '0.1rem 0.4rem',
                                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.7rem'
                                                                }}>
                                                                    단독이동
                                                                </span>
                                                            </>
                                                        ) : (
                                                            // 1:1 교환 기록
                                                            <>
                                                                <span style={{ fontWeight: '600' }}>{swap.studentA.name}</span>
                                                                <span style={{ color: 'var(--text-secondary)' }}> ({getSectionName(allocation!.classes.findIndex(c => c.students.some(s => s.id === swap.studentB!.id)))})</span>
                                                                <span> ↔ </span>
                                                                <span style={{ fontWeight: '600' }}>{swap.studentB!.name}</span>
                                                                <span style={{ color: 'var(--text-secondary)' }}> ({getSectionName(classAIdx)})</span>
                                                                <span style={{
                                                                    marginLeft: '0.5rem',
                                                                    padding: '0.1rem 0.4rem',
                                                                    background: 'rgba(34, 197, 94, 0.2)',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.7rem'
                                                                }}>
                                                                    교환
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => undoSwap(index)}
                                                        style={{
                                                            padding: '0.25rem 0.5rem',
                                                            fontSize: '0.7rem',
                                                            background: 'rgba(239, 68, 68, 0.2)',
                                                            border: '1px solid rgba(239, 68, 68, 0.4)',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            color: '#ef4444'
                                                        }}
                                                    >
                                                        취소
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.05);
                        opacity: 0.9;
                    }
                }

                @keyframes gentlePulse {
                    0%, 100% {
                        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
                    }
                    50% {
                        box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.35);
                    }
                }
            `}</style>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    type={confirmModal.type}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </div>
    );
}
