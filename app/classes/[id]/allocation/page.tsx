'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Student, ClassData, AllocationResult } from '../../../../lib/types';
import { allocateStudents, allocateStudentsOptimized } from '../../../../lib/algorithm';
import { detectIssues, findSwapSolutions, Issue, SwapSolution } from '../../../../lib/aiRecommender';
import StepCard from '../../../components/StepCard';
import Toast, { ToastType } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import * as XLSX from 'xlsx-js-style';

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
    const [isAllocating, setIsAllocating] = useState(false); // 배정 진행 중 로딩 상태
    const [isSavedAllocation, setIsSavedAllocation] = useState(false); // 저장된 배정인지 여부

    // AI 추천 상태
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiIssues, setAiIssues] = useState<Issue[]>([]);
    const [aiSolutions, setAiSolutions] = useState<SwapSolution[]>([]);
    const [selectedSolutions, setSelectedSolutions] = useState<Set<number>>(new Set());

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
    const [showGenderRatioModal, setShowGenderRatioModal] = useState(false);
    const [showDistributionMatrixModal, setShowDistributionMatrixModal] = useState(false);
    const [showWorkCompleteModal, setShowWorkCompleteModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // 저장 로딩 상태

    // 클릭된 분리/결합 학생 정보
    const [clickedBindStudent, setClickedBindStudent] = useState<Student | null>(null);

    // 다운로드 드롭다운 상태
    const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);

    // 모달 열릴 때 배경 스크롤 방지
    useEffect(() => {
        if (showGenderRatioModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showGenderRatioModal]);

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
                setIsAllocating(true); // 로딩 시작

                // 3. 저장된 배정이 없으면 새로 배정 (100회 시도 후 최적 결과 선택)
                setTimeout(() => {
                    const optimized = allocateStudentsOptimized(allStudents, sectionCount, {
                        specialReductionCount: classData.special_reduction_count || 0,
                        specialReductionMode: classData.special_reduction_mode || 'flexible'
                    }, 100);

                    const result = optimized.result;
                    setAllocation(result);
                    setIsSavedAllocation(false); // 새로 생성된 배정
                    setIsAllocating(false); // 로딩 종료
                    setShowSummary(true);
                    console.log('✅ 새로운 배정 생성 완료!');

                    // 자동 저장 실행
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
                            }
                        })
                        .catch(err => console.error('Auto-save failed:', err));
                }, 100);
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

    // 전체 위반 사항 통합 (체크리스트용)
    const allViolations = useMemo(() => {
        if (!allocation) return [];

        const violations: Array<{
            id: string;
            type: 'sep' | 'bind' | 'duplicate' | 'similar';
            message: string;
            studentIds: number[];
            studentNames: string[];
        }> = [];

        // 1. SEP 위반
        constraintViolations.sepViolations.forEach((v, i) => {
            // 메시지에서 학생 이름 추출 시도 (간단하게)
            const namesMatch = v.match(/:\s*(.+)\s*이\(가\)/);
            const studentNames = namesMatch ? namesMatch[1].split(',').map(n => n.trim()) : [];
            const studentIds = allStudents.filter(s => studentNames.includes(s.name)).map(s => s.id);

            violations.push({
                id: `sep-${i}`,
                type: 'sep',
                message: v,
                studentIds,
                studentNames
            });
        });

        // 2. BIND 위반
        constraintViolations.bindViolations.forEach((v, i) => {
            const namesMatch = v.match(/:\s*(.+)\s*이\(가\)/);
            const studentNames = namesMatch ? namesMatch[1].split(',').map(n => n.trim()) : [];
            const studentIds = allStudents.filter(s => studentNames.includes(s.name)).map(s => s.id);

            violations.push({
                id: `bind-${i}`,
                type: 'bind',
                message: v,
                studentIds,
                studentNames
            });
        });

        // 3. 완전 동명이인 갈등
        duplicateAnalysis.fullDuplicates.filter(d => d.hasSameSectionConflict).forEach((d, i) => {
            const sections = d.students.map(s => getSectionName(allocation.classes.findIndex(c => c.id === s.sectionId)));
            const conflictingSection = sections.find((s, idx, arr) => arr.indexOf(s) !== idx);

            violations.push({
                id: `dup-${i}`,
                type: 'duplicate',
                message: `동명이인 "${d.name}": 같은 반(${conflictingSection})에 배정되었습니다.`,
                studentIds: d.students.map(s => s.id),
                studentNames: d.students.map(s => s.name)
            });
        });

        // 4. 이름 유사성 (이름만 같은 학생) 갈등
        duplicateAnalysis.givenNameDuplicates.filter(d => d.hasSameSectionConflict).forEach((d, i) => {
            // 어느 반에서 겹치는지 찾기
            const sectionCounts = new Map<number, number>();
            d.students.forEach(s => {
                sectionCounts.set(s.sectionId, (sectionCounts.get(s.sectionId) || 0) + 1);
            });

            sectionCounts.forEach((count, sectionId) => {
                if (count > 1) {
                    const sectionName = getSectionName(allocation.classes.findIndex(c => c.id === sectionId));
                    const conflictingStudents = d.students.filter(s => s.sectionId === sectionId);
                    violations.push({
                        id: `sim-${i}-${sectionId}`,
                        type: 'similar',
                        message: `이름 유사성 "${d.givenName}": ${conflictingStudents.map(s => s.name).join(', ')}이(가) ${sectionName}에 함께 배정됨`,
                        studentIds: conflictingStudents.map(s => s.id),
                        studentNames: conflictingStudents.map(s => s.name)
                    });
                }
            });
        });

        // 5. 반별 인원 불균형 (특수학생 가중치 반영 V7.1)
        const v71Weight = 2.0; // 알고리즘 명세 V7.1 기준
        const weightedClassSizes = allocation.classes.map((c, i) => {
            const actualCount = c.students.filter(s => !s.is_transferring_out).length;
            const specialCount = c.students.filter(s => s.is_special_class && !s.is_transferring_out).length;
            return {
                idx: i,
                name: getSectionName(i),
                actualCount,
                weightedCount: actualCount + (specialCount * (v71Weight - 1)),
                specialCount
            };
        });

        const sortedByWeighted = [...weightedClassSizes].sort((a, b) => b.weightedCount - a.weightedCount);
        const maxW = sortedByWeighted[0];
        const minW = sortedByWeighted[sortedByWeighted.length - 1];

        // 가중치 적용 인원 차이가 1명보다 클 때(2명 이상)만 경고
        if (maxW.weightedCount - minW.weightedCount > 1) {
            const diff = maxW.weightedCount - minW.weightedCount;
            const message = `인원 쏠림: ${maxW.name}과 ${minW.name}의 가중치 편차가 ${diff}명입니다. (특수학생 2.0 가중치 반영)`;

            violations.push({
                id: 'imbalance-size-weighted',
                type: 'imbalance' as any,
                message: message,
                studentIds: allocation.classes[maxW.idx].students.map(s => s.id),
                studentNames: []
            });
        }

        // 6. 성비 불균형
        allocation.classes.forEach((c, i) => {
            const male = c.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length;
            const female = c.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length;
            if (Math.abs(male - female) > 4) { // 한 반 내부의 성비 편차가 큰 경우
                violations.push({
                    id: `imbalance-gender-inner-${i}`,
                    type: 'imbalance' as any,
                    message: `성비 불균형: ${getSectionName(i)}에 ${male > female ? '남학생' : '여학생'}이 과다 배정됨 (${male} vs ${female})`,
                    studentIds: c.students.filter(s => s.gender === (male > female ? 'M' : 'F')).map(s => s.id),
                    studentNames: []
                });
            }
        });

        // 7. 특별관리대상 불균형
        const specialImbalance = allocation.classes.map((c, i) => ({
            name: getSectionName(i),
            count: c.students.filter(s => (s.is_special_class || s.is_problem_student || s.is_underachiever) && !s.is_transferring_out).length,
            ids: c.students.filter(s => (s.is_special_class || s.is_problem_student || s.is_underachiever) && !s.is_transferring_out).map(s => s.id)
        }));
        const maxSpecial = [...specialImbalance].sort((a, b) => b.count - a.count)[0];
        const minSpecial = [...specialImbalance].sort((a, b) => a.count - b.count)[0];

        if (maxSpecial.count - minSpecial.count > 1) {
            violations.push({
                id: 'imbalance-special',
                type: 'imbalance' as any,
                message: `특별학생 쏠림: ${maxSpecial.name}(${maxSpecial.count}명)에 집중됨 (최소 ${minSpecial.count}명인 반과 큰 차이)`,
                studentIds: maxSpecial.ids,
                studentNames: []
            });
        }

        // 8. 평균 석차 불균형
        const rankStats = allocation.classes.map((c, i) => {
            const ranks = c.students.filter(s => s.rank && !s.is_transferring_out).map(s => s.rank!);
            return {
                name: getSectionName(i),
                avg: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0,
                ids: c.students.filter(s => s.rank && !s.is_transferring_out).map(s => s.id)
            };
        }).filter(s => s.avg > 0);

        const sortedRanks = [...rankStats].sort((a, b) => b.avg - a.avg);
        if (sortedRanks.length > 1) {
            const highRank = sortedRanks[0];
            const lowRank = sortedRanks[sortedRanks.length - 1];
            if (highRank.avg - lowRank.avg > 5.0) {
                violations.push({
                    id: 'imbalance-rank',
                    type: 'imbalance' as any,
                    message: `성적 불균형: ${highRank.name}(평균 ${highRank.avg.toFixed(1)}등) vs ${lowRank.name}(평균 ${lowRank.avg.toFixed(1)}등)`,
                    studentIds: highRank.ids,
                    studentNames: []
                });
            }
        }

        // 9. 기존 반 배정 불균형 (사용자 요청 반영: 더욱 상세하게)
        const prevClasses = Array.from(new Set(allStudents.map(s => s.section_number || 1))).sort((a, b) => {
            const numA = parseInt(String(a));
            const numB = parseInt(String(b));
            return numA - numB;
        });

        prevClasses.forEach(prevNum => {
            const studentsFromPrev = allStudents.filter(s => (s.section_number || 1) === prevNum && !s.is_transferring_out);
            const dist = new Map<number, number>();
            studentsFromPrev.forEach(s => {
                const nIdx = allocation.classes.findIndex(c => c.students.some(st => st.id === s.id));
                if (nIdx !== -1) dist.set(nIdx, (dist.get(nIdx) || 0) + 1);
            });

            const counts = Array.from(dist.values());
            if (counts.length > 0) {
                const maxC = Math.max(...counts);
                const minC = dist.size < allocation.classes.length ? 0 : Math.min(...counts);

                // 쏠림 기준: 최대 인원과 최소 인원의 차이가 3명 이상일 때
                if (maxC - minC >= 3) {
                    const avg = studentsFromPrev.length / allocation.classes.length;
                    const maxSName = getSectionName(Array.from(dist.entries()).find(([_, c]) => c === maxC)?.[0] ?? 0);
                    const minSName = getSectionName(Array.from({ length: allocation.classes.length }, (_, i) => i).find(idx => (dist.get(idx) || 0) === minC) ?? 0);

                    violations.push({
                        id: `imbalance-prev-${prevNum}`,
                        type: 'imbalance' as any,
                        message: `기존 ${prevNum}반: 과다 ${maxSName}(${maxC}명) vs 부족 ${minSName}(${minC}명), 평균 ${avg.toFixed(1)}명`,
                        studentIds: studentsFromPrev.map(s => s.id),
                        studentNames: []
                    });
                }
            }
        });

        return violations;
    }, [allocation, constraintViolations, duplicateAnalysis, allStudents, classData]);

    // AI 미세 최적화 제안 (체크리스트와 별도로 표시)
    const aiOptimizationTip = useMemo(() => {
        if (!allocation || allViolations.length > 0) return null;

        const aiIssues = detectIssues(allocation);
        return aiIssues.find(i => i.type === 'optimization');
    }, [allocation, allViolations]);

    // 전체 통계
    const overallStats = useMemo(() => {
        if (!allocation) return null;

        const totalStudents = allocation.classes.reduce((sum, c) => sum + c.students.filter(s => !s.is_transferring_out).length, 0);
        const maleCount = allocation.classes.reduce((sum, c) => sum + c.students.filter(s => s.gender === 'M' && !s.is_transferring_out).length, 0);
        const femaleCount = allocation.classes.reduce((sum, c) => sum + c.students.filter(s => s.gender === 'F' && !s.is_transferring_out).length, 0);
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
            // 1. 새 반 이름 (사용자가 조건 설정에서 입력한 이름) 우선
            const newNames = classData.new_section_names
                ? JSON.parse(classData.new_section_names)
                : null;

            if (newNames && Array.isArray(newNames) && newNames[classIndex]) {
                const name = newNames[classIndex].trim();
                return name.endsWith('반') ? name : `${name}반`;
            }

            // 2. 기존 반 이름 (동기화된 경우)
            const sectionNames = classData.section_names
                ? JSON.parse(classData.section_names)
                : null;

            if (sectionNames && Array.isArray(sectionNames) && sectionNames[classIndex]) {
                const name = sectionNames[classIndex].trim();
                return name.endsWith('반') ? name : `${name}반`;
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

        // 특수 조건 학생 체크 (경고)
        const specialWarnings: string[] = [];
        if (stA.is_special_class) specialWarnings.push(`${stA.name}: 특수교육대상`);
        if (stA.is_problem_student) specialWarnings.push(`${stA.name}: 문제행동`);
        if (stA.is_underachiever) specialWarnings.push(`${stA.name}: 학습부진`);
        if (stA.is_transferring_out) specialWarnings.push(`${stA.name}: 전출예정`);

        if (stB.is_special_class) specialWarnings.push(`${stB.name}: 특수교육대상`);
        if (stB.is_problem_student) specialWarnings.push(`${stB.name}: 문제행동`);
        if (stB.is_underachiever) specialWarnings.push(`${stB.name}: 학습부진`);
        if (stB.is_transferring_out) specialWarnings.push(`${stB.name}: 전출예정`);

        if (specialWarnings.length > 0) {
            warnings.push(`⚠️ 특별관리 대상 학생 포함: ${specialWarnings.join(', ')}`);
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

            // 하이라이트 설정 (확정 및 저장까지 유지)
            setHighlightedStudents(prev => new Set([...prev, studentA.id]));

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

        // 하이라이트 설정 (확정 및 저장까지 유지)
        setHighlightedStudents(prev => new Set([...prev, stA.id, stB.id]));

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

        // 하이라이트 설정 (확정 및 저장까지 유지)
        setHighlightedStudents(prev => new Set([...prev, swap.studentA.id]));

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

        // Optimistic UI Update: 즉시 성공한 것처럼 처리하여 모달을 바로 띄움
        if (isManual) {
            setIsSaving(true);
            // 1. 하이라이트 초기화
            setHighlightedStudents(new Set());
            // 2. 다른 모달 닫기
            setShowSummary(false);
            setConfirmModal(null);
            // 3. 저장 완료 플래그 (즉시 활성화)
            setIsSavedAllocation(true);
            // 4. 작업 완료 모달만 표시 (즉시)
            setShowWorkCompleteModal(true);
            setIsSaving(false); // 모달이 떴으니 로딩 종료
        }

        try {
            const allocations = allocation.classes.flatMap(cls =>
                cls.students.map(s => ({
                    studentId: s.id,
                    nextSection: cls.id
                }))
            );

            // 서버 저장은 백그라운드에서 실행
            const res = await fetch(`/api/classes/${classId}/save-allocation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allocations })
            });

            if (!res.ok) throw new Error('Failed to save');

            if (!isManual) {
                // 자동 저장의 경우에만 로그 (수동 저장은 이미 UI 처리됨)
                console.log('💾 배정 자동 저장 완료');
                // setIsSavedAllocation(true); // 제거: 명시적 저장 시에만 활성화
            }
        } catch (error) {
            console.error(error);
            // 수동 저장 실패 시 사용자에게 알림 및 상태 롤백
            if (isManual) {
                setToast({ message: '서버 저장에 실패했습니다. (인터넷 연결 확인)', type: 'error' });
                // 롤백은 하지 않음 (엑셀 다운로드는 가능하게 유지) - 사용자 경험 우선
            } else {
                setToast({ message: '자동 저장 실패', type: 'error' });
            }
        }
    };

    // 데이터 삭제 (작업 완료)
    const handleDeleteData = async () => {
        if (!confirm('엑셀 파일을 다운로드 하셨나요?\n다운로드하지 않은 데이터는 복구할 수 없습니다.\n\n정말 현재 학년의 모든 데이터를 삭제하시겠습니까?')) {
            return;
        }

        try {
            const res = await fetch(`/api/classes/${classId}`, { method: 'DELETE' });
            if (res.ok) {
                alert('모든 데이터가 안전하게 삭제되었습니다.\n초기 화면으로 이동합니다.');
                router.push('/');
            } else {
                throw new Error('Deletion failed');
            }
        } catch (error) {
            console.error(error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    // 엑셀 다운로드
    const handleExportExcel = () => {
        if (!allocation || !classData) return;

        const workbook = XLSX.utils.book_new();

        allocation.classes.forEach((cls, idx) => {
            const sortedStudents = [...cls.students].sort((a, b) => {
                // 1순위: 전출예정 학생은 무조건 뒤로
                if (a.is_transferring_out && !b.is_transferring_out) return 1;
                if (!a.is_transferring_out && b.is_transferring_out) return -1;

                // 2순위: 일반 학생끼리는 이름 가나다순
                return a.name.localeCompare(b.name, 'ko');
            });

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
                    '특이사항': student.notes || '',  // 비고 내용을 특이사항으로
                    '연락처': student.contact || '',
                    '기존반': student.section_number ? `${student.section_number}반` : '',
                    '비고': specialItems.join(', ')  // 특기사항 내용을 비고로
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
                { wch: 20 },  // 특이사항
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

    // 선생님용 검토자료 엑셀 다운로드 (3개 반씩 가로 배치)
    const handleExportTeacherReview = () => {
        if (!allocation || !classData) return;

        try {
            const workbook = XLSX.utils.book_new();
            const originalClassNumbers = Array.from(new Set(allStudents.map(s => s.section_number || 1))).sort((a, b) => a - b);

            originalClassNumbers.forEach((origClassNum) => {
                const grid: any[][] = [];

                // 제목
                grid.push([{ v: `[기존 ${origClassNum}반] 선생님 검토용 반배정 자료`, s: { font: { bold: true, sz: 14 } } }]);
                grid.push([]);

                // 요약표
                grid.push([{ v: '📊 우리 반 학생 배분 현황', s: { font: { bold: true, sz: 12 } } }]);
                grid.push([]);

                const summaryHeader = ['새로운 반', '배정 인원', '학생 명단'].map(h => ({
                    v: h,
                    s: { font: { bold: true }, fill: { fgColor: { rgb: 'E0E0E0' } }, alignment: { horizontal: 'center' } }
                }));
                grid.push(summaryHeader);

                allocation.classes.forEach((newClass, idx) => {
                    const ourStudents = newClass.students.filter(s => (s.section_number || 1) === origClassNum);
                    if (ourStudents.length > 0) {
                        grid.push([
                            getSectionName(idx),
                            ourStudents.length + '명',
                            ourStudents.map(s => s.name).join(', ')
                        ]);
                    }
                });

                grid.push([]);
                grid.push([]);

                // 3개 반씩 묶어서 가로 배치
                const classesPerRow = 3;
                const totalClasses = allocation.classes.length;

                for (let groupStart = 0; groupStart < totalClasses; groupStart += classesPerRow) {
                    const groupEnd = Math.min(groupStart + classesPerRow, totalClasses);
                    const classesInGroup = allocation.classes.slice(groupStart, groupEnd);

                    // 반 제목 행
                    const titleRow: any[] = [];
                    classesInGroup.forEach((newClass, idx) => {
                        const actualIdx = groupStart + idx;
                        const sectionName = getSectionName(actualIdx);
                        const ourCount = newClass.students.filter(s => (s.section_number || 1) === origClassNum).length;

                        titleRow.push({
                            v: `【${sectionName}】 (우리반 ${ourCount}명)`,
                            s: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: 'D0E0F0' } }, alignment: { horizontal: 'center' } }
                        });
                        titleRow.push('', '', ''); // 나머지 컬럼
                        if (idx < classesInGroup.length - 1) titleRow.push(''); // 간격
                    });
                    grid.push(titleRow);

                    // 컬럼 헤더
                    const headerRow: any[] = [];
                    classesInGroup.forEach((_, idx) => {
                        ['번호', '이름', '기존반', '비고'].forEach(h => {
                            headerRow.push({ v: h, s: { font: { bold: true }, fill: { fgColor: { rgb: 'F0F0F0' } }, alignment: { horizontal: 'center' } } });
                        });
                        if (idx < classesInGroup.length - 1) headerRow.push('');
                    });
                    grid.push(headerRow);

                    // 각 반의 학생 데이터 준비
                    const groupData = classesInGroup.map(newClass => {
                        const ourStudents = newClass.students.filter(s => (s.section_number || 1) === origClassNum);
                        const otherStudents = newClass.students.filter(s => (s.section_number || 1) !== origClassNum);

                        return [...ourStudents].sort(koreanSort).concat([...otherStudents].sort(koreanSort)).map((student, sIdx) => {
                            const isOurs = (student.section_number || 1) === origClassNum;
                            const specialTags = [];
                            if (student.is_special_class) specialTags.push('특수');
                            if (student.is_problem_student) specialTags.push('문제');
                            if (student.is_underachiever) specialTags.push('부진');
                            if (student.is_transferring_out) specialTags.push('전출');

                            const cellStyle = isOurs ? {
                                fill: { fgColor: { rgb: 'FFFF99' } },
                                font: { bold: true }
                            } : {};

                            return [
                                { v: sIdx + 1, s: cellStyle },
                                { v: student.name, s: cellStyle },
                                { v: student.section_number || 1, s: cellStyle },
                                { v: specialTags.join(', '), s: cellStyle }
                            ];
                        });
                    });

                    // 최대 학생 수
                    const maxStudents = Math.max(...groupData.map(d => d.length));

                    // 학생 데이터 행 생성
                    for (let i = 0; i < maxStudents; i++) {
                        const row: any[] = [];
                        groupData.forEach((classData, idx) => {
                            if (i < classData.length) {
                                row.push(...classData[i]);
                            } else {
                                row.push('', '', '', '');
                            }
                            if (idx < groupData.length - 1) row.push('');
                        });
                        grid.push(row);
                    }

                    // 그룹 사이 구분선
                    if (groupEnd < totalClasses) {
                        grid.push([]);
                        const separatorRow = [];
                        for (let i = 0; i < classesInGroup.length; i++) {
                            separatorRow.push('─────', '─────', '─────', '─────');
                            if (i < classesInGroup.length - 1) separatorRow.push('');
                        }
                        grid.push(separatorRow);
                        grid.push([]);
                    }
                }

                const worksheet = XLSX.utils.aoa_to_sheet(grid);

                // 열 너비 설정
                const colWidths: any[] = [];
                for (let i = 0; i < classesPerRow; i++) {
                    colWidths.push({ wch: 6 });   // 번호
                    colWidths.push({ wch: 10 });  // 이름
                    colWidths.push({ wch: 7 });   // 기존반
                    colWidths.push({ wch: 12 });  // 비고
                    if (i < classesPerRow - 1) colWidths.push({ wch: 2 }); // 간격
                }
                worksheet['!cols'] = colWidths;

                XLSX.utils.book_append_sheet(workbook, worksheet, `기존${origClassNum}반`);
            });

            const fileName = `선생님용_검토자료_${classData.grade}학년_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            setToast({ message: '선생님용 검토자료가 다운로드되었습니다!', type: 'success' });
        } catch (error) {
            console.error('Excel export error:', error);
            setToast({ message: 'Excel 파일 생성 중 오류가 발생했습니다.', type: 'error' });
        }
    };

    // 기존반 기준 엑셀 다운로드
    // 기존반 기준 엑셀 다운로드
    const handleExportByOriginalClass = () => {
        if (!allocation || !classData) return;

        const workbook = XLSX.utils.book_new();

        // 1. 모든 학생과 배정된 반 정보를 수집
        const allStudentsWithAssignment = allocation.classes.flatMap((cls, classIndex) =>
            cls.students.map(student => ({
                ...student,
                // 배정된 반 이름에서 '반' 제거 (가반 → 가)
                assignedSection: getSectionName(classIndex).replace('반', '')
            }))
        );

        // 2. 기존반별로 그룹화 (section_number 기준)
        const sectionNumbers = [...new Set(allStudentsWithAssignment.map(s => s.section_number || 1))].sort((a, b) => a - b);

        // 3. 각 기존반에 대해 시트 생성
        sectionNumbers.forEach(sectionNum => {
            const studentsInSection = allStudentsWithAssignment
                .filter(s => (s.section_number || 1) === sectionNum)
                .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

            const excelData = studentsInSection.map((student, idx) => {
                // 특이사항 생성 (기존 비고 내용 사용)
                const specialItems: string[] = [];
                if (student.is_special_class) specialItems.push('특수교육대상');
                if (student.is_problem_student) specialItems.push('문제행동');
                if (student.is_underachiever) specialItems.push('학습부진');
                if (student.is_transferring_out) specialItems.push('전출예정');

                // 비고 내용을 특이사항에 추가
                const notesText = student.notes || '';
                const specialText = specialItems.join(', ');
                const combinedSpecial = [specialText, notesText].filter(Boolean).join(', ');

                return {
                    '번호': idx + 1,
                    '이름': student.name,
                    '성별': student.gender === 'M' ? '남' : '여',
                    '생년월일': student.birth_date || '',
                    '배정학급': student.assignedSection,
                    '특이사항': combinedSpecial  // 비고 내용 포함
                };
            });

            // 워크시트 생성
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            worksheet['!cols'] = [
                { wch: 5 },   // 번호
                { wch: 10 },  // 이름
                { wch: 5 },   // 성별
                { wch: 12 },  // 생년월일
                { wch: 10 },  // 배정학급
                { wch: 30 }   // 특이사항 (더 넓게)
            ];

            // 워크북에 시트 추가
            XLSX.utils.book_append_sheet(workbook, worksheet, `${sectionNum}반`);
        });

        // 파일 다운로드
        const fileName = `기존반_배정결과_${classData.grade}학년_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        setToast({ message: '기존반 기준 엑셀 파일이 다운로드되었습니다!', type: 'success' });
        setShowDownloadDropdown(false);
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

            // 100회 반복 실행하여 최적 결과 선택
            const optimized = allocateStudentsOptimized(allStudents, sectionCount, {
                specialReductionCount: classData?.special_reduction_count || 0,
                specialReductionMode: classData?.special_reduction_mode || 'flexible'
            }, 100);

            const result = optimized.result;
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
                    }
                })
                .catch(err => console.error('Auto-save after reallocation failed:', err));
        }, 300);
    };

    // AI 추천 실행
    const handleAiRecommendation = () => {
        if (!allocation) return;

        const issues = detectIssues(allocation);
        if (issues.length === 0) {
            setToast({ message: '해결할 문제가 없습니다! ✅', type: 'success' });
            return;
        }

        // 최상의 해결책 1개만 가져오기 (v2.1)
        const solutions = findSwapSolutions(allocation, issues, 1);
        setAiIssues(issues);
        setAiSolutions(solutions);
        setSelectedSolutions(new Set());
        setShowAiModal(true);
    };


    // AI 솔루션 선택/해제
    const toggleSolution = (index: number) => {
        const newSelected = new Set(selectedSolutions);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedSolutions(newSelected);
    };

    // 선택된 솔루션 적용
    // 선택된 솔루션 적용 (일괄 처리)
    const applySelectedSolutions = () => {
        if (selectedSolutions.size === 0) {
            setToast({ message: '적용할 솔루션을 선택해주세요', type: 'error' });
            return;
        }

        if (!allocation) return;

        // 1. 배정 상태 복제 (Batch Update를 위해)
        const newAllocation = JSON.parse(JSON.stringify(allocation)) as typeof allocation;
        const newHistory = [...swapHistory];
        const solutionsToApply = Array.from(selectedSolutions)
            .map(idx => aiSolutions[idx])
            .filter(Boolean);

        let appliedCount = 0;

        solutionsToApply.forEach(solution => {
            // 학생 찾기 헬퍼
            const findStudentClassIdx = (sId: number) => newAllocation.classes.findIndex(c => c.students.some(s => s.id === sId));

            // A. 기본 1:1 교환 (또는 대표 교환)
            const idxA = findStudentClassIdx(solution.studentA.id);
            const idxB = findStudentClassIdx(solution.studentB.id);

            if (idxA !== -1 && idxB !== -1) {
                // A반에서 학생A 제거, B반에 추가
                newAllocation.classes[idxA].students = newAllocation.classes[idxA].students.filter(s => s.id !== solution.studentA.id);
                newAllocation.classes[idxB].students.push(solution.studentA);

                // B반에서 학생B 제거, A반에 추가
                newAllocation.classes[idxB].students = newAllocation.classes[idxB].students.filter(s => s.id !== solution.studentB.id);
                newAllocation.classes[idxA].students.push(solution.studentB);

                newHistory.unshift({ studentA: solution.studentA, studentB: solution.studentB, timestamp: Date.now() });
            }

            // B. 추가 이동 (복합 교환)
            if (solution.additionalTransfers) {
                solution.additionalTransfers.forEach(transfer => {
                    const currentIdx = findStudentClassIdx(transfer.student.id);
                    const targetIdx = transfer.toClass - 1; // 0-based index

                    if (currentIdx !== -1 && targetIdx !== -1) {
                        // 현재 반에서 제거
                        newAllocation.classes[currentIdx].students = newAllocation.classes[currentIdx].students.filter(s => s.id !== transfer.student.id);
                        // 목표 반에 추가
                        newAllocation.classes[targetIdx].students.push(transfer.student);

                        // 이동 기록 (단독 이동인 경우 studentB는 undefined)
                        newHistory.unshift({ studentA: transfer.student, originSectionIndex: currentIdx, targetSectionIndex: targetIdx, timestamp: Date.now() });
                    }
                });
            }
            appliedCount++;
        });

        // 통계 재계산 (모든 반 대상)
        newAllocation.classes.forEach(cls => {
            cls.gender_stats.male = cls.students.filter(s => s.gender === 'M').length;
            cls.gender_stats.female = cls.students.filter(s => s.gender === 'F').length;
            cls.special_factors.problem = cls.students.filter(s => s.is_problem_student).length;
            cls.special_factors.special = cls.students.filter(s => s.is_special_class).length;
            cls.special_factors.underachiever = cls.students.filter(s => s.is_underachiever).length;
            cls.special_factors.transfer = cls.students.filter(s => s.is_transferring_out).length;
        });

        // 상태 업데이트
        setAllocation(newAllocation);
        setSwapHistory(newHistory);
        setShowAiModal(false);
        setToast({
            message: `${appliedCount}개의 솔루션이 적용되었습니다`,
            type: 'success'
        });
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

        console.log('🔍 추천 로직 실행:', {
            studentA: studentA.name,
            section_number: studentA.section_number,
            rank: studentA.rank
        });

        const classAIndex = allocation.classes.findIndex(c =>
            c.students.some(s => s.id === studentA.id)
        );

        const candidates = allocation.classes
            .flatMap((c, idx) => idx !== classAIndex ? c.students : [])
            .filter(s => {
                console.log(`  체크 중: ${s.name}, section_number=${s.section_number}, rank=${s.rank}, gender=${s.gender}`);

                // 1. 원래 같은 반이었던 학생 (section_number가 같은)
                if (!studentA.section_number || s.section_number !== studentA.section_number) {
                    console.log(`    ❌ section_number 불일치`);
                    return false;
                }

                // 2. 성별 일치
                if (s.gender !== studentA.gender) {
                    console.log(`    ❌ 성별 불일치`);
                    return false;
                }

                // 3. 일반 학생만 추천 (특수 조건 학생 제외)
                if (s.is_special_class || s.is_problem_student || s.is_underachiever || s.is_transferring_out) {
                    console.log(`    ❌ 특별관리 대상 학생`);
                    return false;
                }

                // 4. 분리/결합 조건이 있는 학생 제외
                const { sep, bind } = parseConstraints(s);
                if (sep.length > 0 || bind.length > 0) {
                    console.log(`    ❌ 분리/결합 조건 있음`);
                    return false;
                }

                // 5. 석차 차이 5등 이내
                if (studentA.rank && s.rank) {
                    const diff = Math.abs(studentA.rank - s.rank);
                    if (diff <= 5) {
                        console.log(`    ✅ 추천! 석차 차이: ${diff}`);
                        return true;
                    } else {
                        console.log(`    ❌ 석차 차이 초과: ${diff}`);
                        return false;
                    }
                }

                // 석차가 없는 경우는 제외
                console.log(`    ❌ 석차 없음`);
                return false;
            })
            .slice(0, 5);

        console.log('📋 추천 결과:', candidates.length, '명');
        return candidates;
    };

    if (loading) return <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading"></div></div>;

    // 배정 진행 중 로딩 화면
    if (isAllocating || reAllocating) return (
        <div className="container" style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem'
        }}>
            <div style={{
                width: '60px',
                height: '60px',
                border: '4px solid rgba(99, 102, 241, 0.2)',
                borderTop: '4px solid #6366f1',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }}></div>
            <div style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                textAlign: 'center'
            }}>
                반배정중입니다...
            </div>
            <div style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                textAlign: 'center'
            }}>
                최적의 배정 결과를 찾고 있습니다
            </div>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );

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
                                                → 하단의 <strong>&apos;최종 조정 검토 체크리스트&apos;</strong>를 통해 상세 내용을 확인하고 조정하세요.
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
                                        display: 'grid',
                                        gridTemplateColumns: '80px 1fr auto',
                                        alignItems: 'center',
                                        padding: '1rem',
                                        background: 'rgba(30, 41, 59, 0.4)',
                                        borderRadius: '8px'
                                    }}>
                                        <span style={{ fontWeight: 600 }}>{getSectionName(idx)}</span>
                                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                            <span style={{ color: '#3b82f6', minWidth: '40px' }}>남 {cls.gender_stats.male - cls.students.filter(s => s.gender === 'M' && s.is_transferring_out).length}</span>
                                            <span style={{ color: '#ec4899', minWidth: '40px' }}>여 {cls.gender_stats.female - cls.students.filter(s => s.gender === 'F' && s.is_transferring_out).length}</span>
                                            {cls.special_factors.special > 0 && (
                                                <span style={{ color: '#a855f7', minWidth: '45px', fontSize: '0.85rem' }}>특수 {cls.special_factors.special}</span>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                            <span style={{ fontWeight: 'bold', color: '#6366f1' }}>
                                                {cls.students.filter(s => !s.is_transferring_out).length}명
                                            </span>
                                            {cls.special_factors.transfer > 0 && (
                                                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                                                    + 전출예정 {cls.special_factors.transfer}명
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>평균: </span>
                                <span style={{ fontWeight: 'bold', color: '#6366f1' }}>{overallStats ? (overallStats.totalStudents / overallStats.sectionCount).toFixed(1) : '-'}명</span>
                            </div>
                            <button onClick={() => setShowClassSizeModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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
                            <button onClick={() => setShowRankModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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
                            <button onClick={() => setShowSepModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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
                            <button onClick={() => setShowBindModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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
                            <button onClick={() => setShowSpecialModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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

                            <button onClick={() => setShowDuplicateNamesModal(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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
                        <button
                            onClick={() => handleSave()}
                            disabled={isSaving}
                            className="btn btn-primary"
                            style={{
                                opacity: isSaving ? 0.7 : 1,
                                cursor: isSaving ? 'wait' : 'pointer'
                            }}
                        >
                            {isSaving ? '💾 저장 중...' : '💾 확정 및 저장'}
                        </button>
                        {/* 다운로드 드롭다운 */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
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
                                📥 다운로드 {showDownloadDropdown ? '▲' : '▼'}
                            </button>

                            {/* 드롭다운 메뉴 */}
                            {showDownloadDropdown && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.5rem',
                                    background: 'rgba(30, 41, 59, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    zIndex: 100,
                                    minWidth: '180px'
                                }}>
                                    <button
                                        onClick={() => {
                                            handleExportExcel();
                                            setShowDownloadDropdown(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#fff',
                                            fontSize: '0.9rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        📋 새반 기준
                                    </button>
                                    <button
                                        onClick={handleExportByOriginalClass}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            background: 'transparent',
                                            border: 'none',
                                            borderTop: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff',
                                            fontSize: '0.9rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        📂 기존반 기준
                                    </button>
                                </div>
                            )}
                        </div>
                        {isSavedAllocation && (
                            <button
                                onClick={handleDeleteData}
                                style={{
                                    padding: '0.75rem 1.25rem',
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                🗑️ 데이터 삭제
                            </button>
                        )}
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.75rem' }}>
                            {/* 반인원 평균 */}
                            <div
                                onClick={() => setShowClassSizeModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1rem 0.5rem',
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
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>인원균형</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#6366f1' }}>
                                    {(overallStats.totalStudents / overallStats.sectionCount).toFixed(1)}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>명</div>
                            </div>

                            {/* 반 석차 평균 */}
                            <div
                                onClick={() => setShowRankModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1rem 0.5rem',
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
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>평균석차</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>
                                    {(() => {
                                        if (!allocation) return '-';
                                        const allRanks = allocation.classes.flatMap(c => c.students.filter(s => s.rank).map(s => s.rank!));
                                        return allRanks.length > 0 ? (allRanks.reduce((a, b) => a + b, 0) / allRanks.length).toFixed(1) : '-';
                                    })()}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>등</div>
                            </div>

                            {/* 성비 비교 */}
                            <div
                                onClick={() => setShowGenderRatioModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1rem 0.5rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(236, 72, 153, 0.15)';
                                    e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>성비비교</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ec4899' }}>
                                    {(() => {
                                        if (!allocation) return '-';
                                        const maleCount = allocation.classes.reduce((sum, c) => sum + c.gender_stats.male, 0);
                                        const femaleCount = allocation.classes.reduce((sum, c) => sum + c.gender_stats.female, 0);
                                        return `${Math.round((maleCount / (maleCount + femaleCount)) * 100)}:${Math.round((femaleCount / (maleCount + femaleCount)) * 100)}`;
                                    })()}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>남:여 비율</div>
                            </div>

                            {/* 기존반 배분 */}
                            <div
                                onClick={() => setShowDistributionMatrixModal(true)}
                                style={{
                                    textAlign: 'center',
                                    padding: '1rem 0.5rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>기존반배분</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#8b5cf6' }}>현황보기</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>매트릭스 확인</div>
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

                {/* 체크리스트 섹션 */}
                {allocation && (
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        marginBottom: '3rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🚨 최종 조정 검토 체크리스트
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    onClick={handleExportTeacherReview}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                                    }}
                                >
                                    📊 검토자료 다운로드
                                </button>
                                <span style={{ fontSize: '0.85rem', color: allViolations.length === 0 ? '#10b981' : '#f59e0b' }}>
                                    {allViolations.length === 0 ? '✓ 모든 검토 완료' : `미해결 항목 ${allViolations.length}건`}
                                </span>
                            </div>
                        </div>

                        {/* [V1.8] AI 스마트 해결사 통합 대시보드 배너 */}
                        <div style={{
                            marginBottom: '1.5rem',
                            padding: '1.25rem',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            borderRadius: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.25rem',
                                    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)'
                                }}>
                                    🤖
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#e0e7ff', marginBottom: '0.2rem' }}> AI 스마트 해결사 </div>
                                    <div style={{ fontSize: '0.8rem', color: 'rgba(224, 231, 255, 0.7)' }}>
                                        {allViolations.length > 0
                                            ? `현재 ${allViolations.length}개의 위반 항목이 감지되었습니다. AI가 최적의 해결책을 제안합니다.`
                                            : aiOptimizationTip
                                                ? `✨ 추천 최적화: ${aiOptimizationTip.description}`
                                                : "배정 규칙이 모두 지켜졌습니다! 미세 균형을 더 완벽하게 맞출 수 있습니다."
                                        }
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleAiRecommendation}
                                disabled={false}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    background: allViolations.length === 0 ? '#8b5cf6' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.filter = 'brightness(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.filter = 'brightness(1)';
                                }}
                            >
                                {allViolations.length === 0 ? '✨ 미세 최적화 실행' : '🤖 스마트 해결사 열기'}
                            </button>
                        </div>

                        {allViolations.length > 0 ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '0.75rem',
                                maxHeight: '280px',
                                overflowY: 'auto',
                                paddingRight: '0.5rem',
                                scrollbarWidth: 'thin'
                            }}>
                                {allViolations.map((v) => (
                                    <div
                                        key={v.id}
                                        onClick={() => {
                                            if (v.studentIds.length > 0) {
                                                const student = allStudents.find(s => s.id === v.studentIds[0]);
                                                if (student) {
                                                    setStudentA(student);
                                                    setSearchA(student.name);
                                                    const el = document.getElementById('exchange-section');
                                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                                    setToast({ message: `${student.name} 학생을 교환 대상으로 선택했습니다.`, type: 'info' });
                                                }
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            borderRadius: '10px',
                                            cursor: v.studentIds.length > 0 ? 'pointer' : 'default',
                                            transition: 'all 0.2s',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (v.studentIds.length > 0) {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            background: v.type === 'sep' ? 'rgba(239, 68, 68, 0.1)' :
                                                v.type === 'bind' ? 'rgba(16, 185, 129, 0.1)' :
                                                    v.type === 'imbalance' as any ? 'rgba(234, 179, 8, 0.1)' :
                                                        v.type === 'optimization' as any ? 'rgba(139, 92, 246, 0.1)' :
                                                            'rgba(245, 158, 11, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: v.type === 'sep' ? '#ef4444' :
                                                v.type === 'bind' ? '#10b981' :
                                                    v.type === 'imbalance' as any ? '#eab308' :
                                                        v.type === 'optimization' as any ? '#a78bfa' :
                                                            '#f59e0b',
                                            fontSize: '14px',
                                            flexShrink: 0
                                        }}>
                                            {v.type === 'sep' ? '🚫' : v.type === 'bind' ? '🔗' : v.type === 'imbalance' as any ? '⚖️' : v.type === 'optimization' as any ? '✨' : '👥'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)',
                                                lineHeight: '1.4'
                                            }}>
                                                {v.message}
                                            </div>
                                        </div>

                                        {v.studentIds.length > 0 && (v.type as string) !== 'imbalance' && (
                                            <div style={{ color: '#6366f1', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                이동 ➔
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{
                                padding: '2rem',
                                textAlign: 'center',
                                background: 'rgba(16, 185, 129, 0.05)',
                                borderRadius: '8px',
                                border: '1px dashed rgba(16, 185, 129, 0.2)',
                                color: '#10b981'
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎉</div>
                                <div style={{ fontWeight: 600 }}>모든 제약 조건이 충족되었습니다.</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>완벽하게 배정된 상태입니다!</div>
                            </div>
                        )}
                    </div>
                )}

                {/* 성비 비교 상세 모달 */}
                {showGenderRatioModal && allocation && (() => {
                    // 평균 성비 계산
                    const totalMale = allocation.classes.reduce((sum, cls) => sum + cls.gender_stats.male, 0);
                    const totalFemale = allocation.classes.reduce((sum, cls) => sum + cls.gender_stats.female, 0);
                    const avgMale = totalMale / allocation.classes.length;
                    const avgFemale = totalFemale / allocation.classes.length;
                    const avgMalePercent = (avgMale / (avgMale + avgFemale)) * 100;
                    const avgFemalePercent = (avgFemale / (avgMale + avgFemale)) * 100;

                    // 불균형 반 찾기 (평균 대비 ±2명 이상)
                    const imbalancedClasses = allocation.classes
                        .map((cls, idx) => ({
                            idx,
                            name: getSectionName(idx),
                            male: cls.gender_stats.male,
                            female: cls.gender_stats.female,
                            maleDiff: cls.gender_stats.male - avgMale,
                            femaleDiff: cls.gender_stats.female - avgFemale
                        }))
                        .filter(cls => Math.abs(cls.maleDiff) >= 2 || Math.abs(cls.femaleDiff) >= 2);

                    return (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1500, backdropFilter: 'blur(5px)'
                        }} onClick={() => setShowGenderRatioModal(false)}>
                            <div className="card" style={{
                                maxWidth: '500px', width: '90%', maxHeight: '85vh',
                                overflow: 'auto', padding: '1.5rem'
                            }} onClick={(e) => e.stopPropagation()}>
                                <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    👫 남녀 성비 분석
                                </h2>

                                {/* 평균 성비 요약 */}
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    marginBottom: '1rem'
                                }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#60a5fa' }}>
                                        📊 반별 평균 성비
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                        • 평균 남학생: {avgMale.toFixed(1)}명 ({avgMalePercent.toFixed(1)}%)
                                        <br />
                                        • 평균 여학생: {avgFemale.toFixed(1)}명 ({avgFemalePercent.toFixed(1)}%)
                                    </div>
                                </div>

                                {/* 불균형 반 경고 */}
                                {imbalancedClasses.length > 0 && (
                                    <div style={{
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f59e0b' }}>
                                            ⚠️ 불균형 반 (평균 대비 ±2명 이상)
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                                            {imbalancedClasses.map(cls => (
                                                <div key={cls.idx}>
                                                    • {cls.name}: 남 {cls.male}명
                                                    <span style={{ color: cls.maleDiff > 0 ? '#ef4444' : '#10b981' }}>
                                                        ({cls.maleDiff > 0 ? '+' : ''}{cls.maleDiff.toFixed(1)})
                                                    </span>
                                                    {' / '}여 {cls.female}명
                                                    <span style={{ color: cls.femaleDiff > 0 ? '#ef4444' : '#10b981' }}>
                                                        ({cls.femaleDiff > 0 ? '+' : ''}{cls.femaleDiff.toFixed(1)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 반별 성비 상세 */}
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                                    📈 반별 성비 상세
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {allocation.classes.map((cls, idx) => {
                                        const total = cls.gender_stats.male + cls.gender_stats.female;
                                        const maleRatio = total > 0 ? (cls.gender_stats.male / total) * 100 : 0;
                                        const femaleRatio = total > 0 ? (cls.gender_stats.female / total) * 100 : 0;

                                        return (
                                            <div key={idx} style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '0.6rem', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{getSectionName(idx)}</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>
                                                        남 {cls.gender_stats.male} / 여 {cls.gender_stats.female}
                                                    </span>
                                                </div>
                                                <div style={{ height: '16px', display: 'flex', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.1)' }}>
                                                    <div style={{
                                                        width: `${maleRatio}%`,
                                                        background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 'bold'
                                                    }}>
                                                        {maleRatio > 20 && `${Math.round(maleRatio)}%`}
                                                    </div>
                                                    <div style={{
                                                        width: `${femaleRatio}%`,
                                                        background: 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 'bold'
                                                    }}>
                                                        {femaleRatio > 20 && `${Math.round(femaleRatio)}%`}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button onClick={() => setShowGenderRatioModal(false)} className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
                            </div>
                        </div>
                    );
                })()}

                {/* 기존반 배분 현황 (매트릭스) 모달 */}
                {showDistributionMatrixModal && allocation && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1500, backdropFilter: 'blur(5px)'
                    }} onClick={() => setShowDistributionMatrixModal(false)}>
                        <div className="card" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflow: 'auto', padding: '2rem' }} onClick={(e) => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                📂 기존반 ↔ 새 반 배분 매트릭스
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                각 셀의 숫자는 해당 <strong>기존 반(행)</strong>에서 <strong>새로운 반(열)</strong>으로 배정된 학생 수입니다.
                            </p>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '0.75rem', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)' }}>기존반 \ 새반</th>
                                            {allocation.classes.map((_, idx) => (
                                                <th key={idx} style={{ padding: '0.75rem', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)' }}>
                                                    {getSectionName(idx)}
                                                </th>
                                            ))}
                                            <th style={{ padding: '0.75rem', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', fontWeight: 'bold' }}>합계</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const oldClasses = Array.from(new Set(allStudents.map(s => s.section_number || 1))).sort((a, b) => a - b);
                                            const matrix = oldClasses.map(oldNum => {
                                                const row = allocation.classes.map(cls =>
                                                    cls.students.filter(s => (s.section_number || 1) === oldNum).length
                                                );
                                                const total = row.reduce((a, b) => a + b, 0);
                                                const avg = total / allocation.classes.length;

                                                return { oldNum, row, total, avg };
                                            });

                                            return matrix.map(({ oldNum, row, total, avg }) => (
                                                <tr key={oldNum}>
                                                    <td style={{ padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center', fontWeight: 'bold', background: 'rgba(255,255,255,0.05)' }}>
                                                        {oldNum}반
                                                    </td>
                                                    {row.map((count, idx) => {
                                                        const diff = Math.abs(count - avg);
                                                        const isSkewed = diff > avg * 0.4; // 40% 이상 편차 시 강조
                                                        return (
                                                            <td key={idx} style={{
                                                                padding: '0.75rem',
                                                                border: '1px solid var(--border)',
                                                                textAlign: 'center',
                                                                background: isSkewed ? 'rgba(239, 68, 68, 0.15)' : count > 0 ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                                                                color: isSkewed ? '#ef4444' : 'inherit',
                                                                fontWeight: isSkewed ? 'bold' : 'normal'
                                                            }}>
                                                                {count}
                                                            </td>
                                                        );
                                                    })}
                                                    <td style={{ padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center', fontWeight: 'bold' }}>
                                                        {total}
                                                    </td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                    <div style={{ width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444' }}></div>
                                    <span style={{ color: 'var(--text-secondary)' }}>과도한 쏠림/부족 (평균 대비 ±40% 초과)</span>
                                </div>
                            </div>

                            <button onClick={() => setShowDistributionMatrixModal(false)} className="btn btn-primary" style={{ width: '100%', marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>닫기</button>
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

                {/* 작업 완료 (데이터 삭제) 모달 */}
                {showWorkCompleteModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2000, backdropFilter: 'blur(5px)'
                    }}>
                        <div className="card" style={{ maxWidth: '600px', width: '90%', textAlign: 'center', padding: '2.5rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>반배정이 확정되었습니다!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
                                이제 결과를 엑셀 파일로 다운로드하고,<br />
                                보안을 위해 데이터를 삭제할 수 있습니다.
                            </p>

                            {/* 1단계: 엑셀 다운로드 (강조) */}
                            <div style={{ marginBottom: '3rem' }}>
                                <button
                                    onClick={handleExportExcel}
                                    style={{
                                        width: '100%',
                                        padding: '1.25rem',
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        color: '#fff',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.75rem',
                                        transition: 'transform 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    📥 엑셀 파일 다운로드
                                </button>
                                <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#ef4444', fontWeight: 'bold' }}>
                                    ⚠️ 삭제 전 반드시 다운로드하세요!
                                </p>
                            </div>

                            {/* 구분선 */}
                            <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 2rem 0', position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', top: '-0.8rem', left: '50%', transform: 'translateX(-50%)',
                                    background: 'var(--bg-card)', padding: '0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem'
                                }}>
                                    작업이 끝났다면?
                                </span>
                            </div>

                            {/* 2단계: 데이터 삭제 (보안) */}
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.05)',
                                padding: '1.5rem',
                                borderRadius: '12px',
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                <h3 style={{ fontSize: '1.1rem', color: '#ef4444', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    ⚠️ 개인정보 보호를 위한 권장사항
                                </h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                                    서버에 저장된 <strong>현재 학년의 모든 학생 데이터</strong>를 삭제합니다.<br />
                                    개인정보 유출 방지를 위해 작업을 마친 후 삭제하는 것을 권장합니다.
                                </p>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button
                                        onClick={() => setShowWorkCompleteModal(false)}
                                        className="btn btn-secondary"
                                        style={{ flex: 1 }}
                                    >
                                        닫기 (계속 작업)
                                    </button>
                                    <button
                                        onClick={handleDeleteData}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            background: '#ef4444',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        🗑️ 작업 완료 (데이터 삭제)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                                                <span style={{ fontWeight: '600' }}>총원:</span> {cls.students.filter(s => !s.is_transferring_out).length}명
                                                {cls.special_factors.transfer > 0 && (
                                                    <span style={{ marginLeft: '0.3rem', color: 'var(--text-muted)' }}>
                                                        + 전출예정 {cls.special_factors.transfer}명
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
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '12%' }}>이름</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '6%' }}>성별</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '12%' }}>생년월일</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '20%' }}>특이사항</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '15%' }}>연락처</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '8%' }}>기존반</th>
                                                        <th style={{ padding: '0.5rem 0.3rem', textAlign: 'center', width: '22%' }}>비고</th>
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
                                                                <td
                                                                    onClick={() => {
                                                                        // 이미 선택된 학생인지 확인
                                                                        if (studentA?.id === student.id || studentB?.id === student.id) {
                                                                            setToast({ message: '이미 선택된 학생입니다.', type: 'warning' });
                                                                            return;
                                                                        }

                                                                        // 학생 A가 비어있으면 A로, 아니면 B로
                                                                        if (!studentA) {
                                                                            setStudentA(student);
                                                                            setSearchA(student.name);
                                                                            const el = document.getElementById('exchange-section');
                                                                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                                                                            setToast({ message: `${student.name} 학생을 학생 A로 선택했습니다.`, type: 'info' });
                                                                        } else {
                                                                            // 같은 반 학생인지 확인
                                                                            const studentAClass = allocation?.classes.findIndex(c => c.students.some(s => s.id === studentA.id));
                                                                            const studentBClass = allocation?.classes.findIndex(c => c.students.some(s => s.id === student.id));

                                                                            if (studentAClass === studentBClass) {
                                                                                setToast({ message: '같은 반 학생은 교환할 수 없습니다.', type: 'error' });
                                                                                return;
                                                                            }

                                                                            setStudentB(student);
                                                                            setSearchB(student.name);
                                                                            setToast({ message: `${student.name} 학생을 학생 B로 선택했습니다. 교환 준비 완료!`, type: 'success' });
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '0.6rem 0.5rem',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.9rem',
                                                                        color: 'var(--text-primary)',
                                                                        textAlign: 'center',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s',
                                                                        backgroundColor: (studentA?.id === student.id || studentB?.id === student.id)
                                                                            ? 'rgba(59, 130, 246, 0.2)'
                                                                            : 'transparent'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (studentA?.id !== student.id && studentB?.id !== student.id) {
                                                                            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                                                                            e.currentTarget.style.color = '#3b82f6';
                                                                        }
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        const isSelected = studentA?.id === student.id || studentB?.id === student.id;
                                                                        e.currentTarget.style.backgroundColor = isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent';
                                                                        e.currentTarget.style.color = 'var(--text-primary)';
                                                                    }}
                                                                >
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
                                                                    textAlign: 'center',
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
                                                                    textAlign: 'center',
                                                                    fontSize: '0.75rem'
                                                                }}>
                                                                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
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
                                            {/* 반별 검토 사항 카드 */}
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
                                                    ⚠️ 검토 사항
                                                </h4>
                                                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {(() => {
                                                        // 이 반에 해당하는 위반 사항만 필터링
                                                        const classViolations = allViolations.filter(v => {
                                                            // imbalance 타입은 특별 처리 (과다/부족 반만 표시)
                                                            if ((v.type as string) === 'imbalance') {
                                                                const sectionName = getSectionName(classIndex);
                                                                return v.message.includes(`과다 ${sectionName}`) || v.message.includes(`부족 ${sectionName}`);
                                                            }
                                                            // 다른 타입은 학생 ID로 필터링
                                                            if (v.studentIds && v.studentIds.length > 0) {
                                                                return v.studentIds.some(id => cls.students.some(s => s.id === id));
                                                            }
                                                            return false;
                                                        });

                                                        // 결과 표시
                                                        if (classViolations.length === 0) {
                                                            return (
                                                                <div style={{
                                                                    color: '#10b981',
                                                                    textAlign: 'center',
                                                                    padding: '0.5rem',
                                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                                    borderRadius: '4px'
                                                                }}>
                                                                    ✅ 검토 사항 없음
                                                                </div>
                                                            );
                                                        }

                                                        return classViolations.map((v, idx) => {
                                                            const icon = v.type === 'sep' ? '🚫' :
                                                                v.type === 'bind' ? '🔗' :
                                                                    v.type === 'duplicate' ? '👥' :
                                                                        v.type === 'similar' ? '📝' :
                                                                            (v.type as string) === 'imbalance' ? '⚖️' : '⚠️';

                                                            return (
                                                                <div key={idx} style={{
                                                                    color: '#f59e0b',
                                                                    lineHeight: '1.4',
                                                                    paddingLeft: '0.5rem',
                                                                    borderLeft: '2px solid #f59e0b',
                                                                    fontSize: '0.7rem'
                                                                }}>
                                                                    {icon} {v.message}
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>

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
                                                    {cls.special_factors.problem > 0 && (() => {
                                                        const problemStudents = cls.students.filter(s => s.is_problem_student);
                                                        return (
                                                            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                                                문제행동: <span style={{ fontWeight: '600', color: '#f97316' }}>{cls.special_factors.problem}명</span>
                                                                {' '}
                                                                <span style={{ fontSize: '0.75rem', color: '#f97316' }}>
                                                                    {problemStudents.map(s => s.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                    {cls.special_factors.special > 0 && (() => {
                                                        const specialStudents = cls.students.filter(s => s.is_special_class);
                                                        return (
                                                            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                                                특수교육: <span style={{ fontWeight: '600', color: '#a855f7' }}>{cls.special_factors.special}명</span>
                                                                {' '}
                                                                <span style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                                                                    {specialStudents.map(s => s.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                    {cls.special_factors.underachiever > 0 && (() => {
                                                        const underachievers = cls.students.filter(s => s.is_underachiever);
                                                        return (
                                                            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                                                학습부진: <span style={{ fontWeight: '600', color: '#3b82f6' }}>{cls.special_factors.underachiever}명</span>
                                                                {' '}
                                                                <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                                                                    {underachievers.map(s => s.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
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
                    <div
                        id="exchange-section"
                        style={{
                            width: '350px',
                            flexShrink: 0,
                            position: 'sticky',
                            top: '2rem',
                            height: 'fit-content',
                            maxHeight: 'calc(100vh - 4rem)',
                            overflowY: 'auto'
                        }}
                    >
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
                                            onClick={() => {
                                                setStudentA(null);
                                                setSearchA('');
                                            }}
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
                                            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>💡 추천 학생 (같은 반·성별, 석차 ±5등)</div>
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
                                                onClick={() => {
                                                    setStudentB(null);
                                                    setSearchB('');
                                                }}
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
                                        cursor: (isMoveMode ? !studentA : (!studentA || !studentB)) ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
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
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
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

            {/* 인쇄 전용 영역 (화면엔 보이지 않음) */}
            <div style={{ display: 'none' }} className="print-only-container">
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        .print-only-container, .print-only-container * { 
                            visibility: visible;
                            color: #000 !important;
                        }
                        .print-only-container {
                            display: block !important;
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            background: white;
                        }
                        .page-break {
                            page-break-after: always;
                            margin-bottom: 50px;
                        }
                        @page {
                            size: A4;
                            margin: 15mm;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 15px;
                            font-size: 11px;
                            page-break-inside: avoid;
                            color: #000 !important;
                        }
                        th, td {
                            border: 1px solid #000;
                            padding: 4px 6px;
                            text-align: center;
                            color: #000 !important;
                        }
                        th {
                            background-color: #f3f4f6 !important;
                            -webkit-print-color-adjust: exact;
                            color: #000 !important;
                            font-weight: bold;
                        }
                        .highlight-student {
                            background-color: #fef08a !important;
                            font-weight: bold;
                            -webkit-print-color-adjust: exact;
                            color: #000 !important;
                        }
                        .distribution-summary {
                            margin-bottom: 30px;
                        }
                        .new-classes-grid {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 10px;
                            align-items: flex-start;
                        }
                        .new-class-column {
                            flex: 1;
                            min-width: 22%;
                            max-width: 32%;
                            page-break-inside: avoid;
                        }
                        .header-title {
                            font-size: 20px;
                            font-weight: bold;
                            margin-bottom: 20px;
                            text-align: center;
                            border-bottom: 2px solid #000;
                            padding-bottom: 10px;
                            color: #000 !important;
                        }
                        .section-title {
                            font-size: 14px;
                            font-weight: bold;
                            margin-bottom: 8px;
                            background-color: #e5e7eb !important;
                            padding: 4px;
                            border: 1px solid #000;
                            -webkit-print-color-adjust: exact;
                            color: #000 !important;
                        }
                    }
                `}</style>
                {(() => {
                    if (!allocation) return null;
                    const originalClassNumbers = Array.from(new Set(allStudents.map(s => s.section_number || 1))).sort((a, b) => a - b);

                    return originalClassNumbers.map((origClassNum) => {
                        const studentsOfThisOrigClass = allStudents.filter(s => (s.section_number || 1) === origClassNum);

                        return (
                            <div key={origClassNum} className="page-break">
                                <div className="header-title">
                                    [기존 {origClassNum}반] 선생님 검토용 반배정 자료
                                </div>

                                <div className="distribution-summary">
                                    <div className="section-title">📊 기존 {origClassNum}반 학생 배정 요약</div>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>새로운 반</th>
                                                <th>배정 인원</th>
                                                <th>대상 학생 명단</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allocation.classes.map((newClass, idx) => {
                                                const assignedStudents = newClass.students.filter(s => (s.section_number || 1) === origClassNum);
                                                if (assignedStudents.length === 0) return null;
                                                return (
                                                    <tr key={idx}>
                                                        <td style={{ fontWeight: 'bold' }}>{getSectionName(idx)}</td>
                                                        <td>{assignedStudents.length}명</td>
                                                        <td style={{ textAlign: 'left', paddingLeft: '8px' }}>{assignedStudents.map(s => s.name).join(', ')}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="section-title">👥 새 학급별 명렬표 (기존 {origClassNum}반 학생 강조)</div>
                                <div className="new-classes-grid">
                                    {allocation.classes.map((newClass, idx) => {
                                        return (
                                            <div key={idx} className="new-class-column">
                                                <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '4px', border: '1px solid #000', background: '#f9fafb', padding: '4px' }}>
                                                    {getSectionName(idx)}
                                                </div>
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ width: '30px' }}>번호</th>
                                                            <th>이름</th>
                                                            <th style={{ width: '50px' }}>기존반</th>
                                                            <th style={{ width: '60px' }}>비고</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[...newClass.students].sort(koreanSort).map((student, sIdx) => {
                                                            const isFromOrigClass = (student.section_number || 1) === origClassNum;
                                                            const specialTags = [];
                                                            if (student.is_special_class) specialTags.push('특수');
                                                            if (student.is_problem_student) specialTags.push('문제');
                                                            if (student.is_underachiever) specialTags.push('부진');
                                                            if (student.is_transferring_out) specialTags.push('전출');

                                                            return (
                                                                <tr key={student.id} className={isFromOrigClass ? 'highlight-student' : ''}>
                                                                    <td>{sIdx + 1}</td>
                                                                    <td>{student.name}</td>
                                                                    <td>{student.section_number || 1}</td>
                                                                    <td style={{ fontSize: '9px' }}>{specialTags.join(',')}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    });
                })()}
            </div>

            {/* AI 추천 모달 */}
            {showAiModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, backdropFilter: 'blur(10px)'
                }} onClick={() => setShowAiModal(false)}>
                    <div className="card" style={{
                        maxWidth: '600px',
                        width: '95%',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        padding: '2rem',
                        background: 'rgba(30, 41, 59, 0.95)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{
                            marginBottom: '2rem',
                            textAlign: 'center'
                        }}>
                            <div style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '16px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                margin: '0 auto 1rem',
                                boxShadow: '0 8px 16px rgba(99, 102, 241, 0.4)'
                            }}>🤖</div>
                            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: 'white' }}>
                                AI 스마트 해결사 추천
                            </h2>
                            <p style={{ color: 'rgba(224, 231, 255, 0.7)', marginTop: '0.5rem' }}>
                                감지된 문제들의 최적 해결책을 제안합니다.
                            </p>
                        </div>

                        {aiSolutions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                                해결 가능한 방법을 찾지 못했습니다.<br />
                                수동으로 학생을 교환해보세요.
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                                    {aiSolutions.map((solution, idx) => (
                                        <div key={idx} style={{
                                            padding: '1.75rem',
                                            background: selectedSolutions.has(idx) ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '20px',
                                            border: `2px solid ${selectedSolutions.has(idx) ? '#6366f1' : 'rgba(255, 255, 255, 0.08)'}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center',
                                            boxShadow: selectedSolutions.has(idx) ? '0 10px 30px rgba(99, 102, 241, 0.25)' : 'none',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }} onClick={() => toggleSolution(idx)}>
                                            {/* 선택 체크 박스 대신 세련된 인디케이터 */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '1rem',
                                                right: '1rem',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                border: `2px solid ${selectedSolutions.has(idx) ? '#6366f1' : 'rgba(255, 255, 255, 0.2)'}`,
                                                background: selectedSolutions.has(idx) ? '#6366f1' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontSize: '0.75rem'
                                            }}>
                                                {selectedSolutions.has(idx) && '✓'}
                                            </div>

                                            <div style={{
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                color: '#f87171',
                                                padding: '0.4rem 1rem',
                                                borderRadius: '30px',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold',
                                                marginBottom: '1rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}>
                                                ⚠️ {solution.issue.description.split(':')[0]}
                                            </div>

                                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'white', marginBottom: '1.25rem' }}>
                                                {solution.issue.description.includes(':') ? solution.issue.description.split(':')[1].trim() : solution.issue.description}
                                            </div>

                                            <div style={{
                                                width: '100%',
                                                padding: '1.25rem',
                                                background: 'rgba(16, 185, 129, 0.08)',
                                                borderRadius: '16px',
                                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '0.75rem'
                                            }}>
                                                <div style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 'bold' }}>
                                                    ✨ 기대 효과: {solution.explanation}
                                                </div>

                                                <div style={{
                                                    fontSize: '1rem',
                                                    color: 'white',
                                                    lineHeight: '1.6',
                                                    fontWeight: '500',
                                                    paddingBottom: '0.75rem',
                                                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                                                    width: '100%'
                                                }}>
                                                    <span style={{ color: '#818cf8', fontWeight: '700' }}>{solution.studentA.name}</span>({solution.fromClass}반) <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 0.5rem' }}>↔</span> <span style={{ color: '#818cf8', fontWeight: '700' }}>{solution.studentB.name}</span>({solution.toClass}반)
                                                </div>

                                                {/* 복합 교환 추가 설명 영역 */}
                                                {solution.complexSwapType && solution.additionalTransfers && (
                                                    <div style={{
                                                        width: '100%',
                                                        padding: '0.75rem',
                                                        background: 'rgba(59, 130, 246, 0.1)',
                                                        borderRadius: '8px',
                                                        marginBottom: '0.5rem',
                                                        border: '1px solid rgba(59, 130, 246, 0.3)'
                                                    }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            🔄 {solution.complexSwapType === '2:1' ? '2:1 트레이드 상세' : '3자간 순환 교환'}
                                                        </div>
                                                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', textAlign: 'left' }}>
                                                            <li>
                                                                <span style={{ color: '#e0e7ff' }}>기본:</span> {solution.studentA.name}({solution.fromClass}반) ↔ {solution.studentB.name}({solution.toClass}반)
                                                            </li>
                                                            {solution.additionalTransfers.map((t, tIdx) => (
                                                                <li key={tIdx} style={{ marginTop: '0.2rem' }}>
                                                                    <span style={{ color: '#93c5fd' }}>추가:</span> {t.student.name} ({t.fromClass}반 ➡️ {t.toClass}반)
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {solution.outcomes && (
                                                    <div style={{
                                                        width: '100%',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem',
                                                        paddingTop: '0.5rem'
                                                    }}>
                                                        <div style={{ fontSize: '0.8rem', color: 'rgba(224, 231, 255, 0.5)', fontWeight: 'bold' }}>📍 교환 시 예상되는 결과</div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', textAlign: 'left' }}>
                                                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
                                                                <div style={{ color: 'rgba(129, 140, 248, 0.8)', fontSize: '0.75rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                    👥 기존 반 분산 <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 4px', borderRadius: '4px' }}>추천</span>
                                                                </div>
                                                                {solution.outcomes.prevClass ? (
                                                                    <>
                                                                        <div style={{ lineHeight: '1.4', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span>{solution.outcomes.prevClass.from}</span>
                                                                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>[{solution.outcomes.prevClass.fromAvg}]</span>
                                                                        </div>
                                                                        <div style={{ lineHeight: '1.4', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span>{solution.outcomes.prevClass.to}</span>
                                                                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>[{solution.outcomes.prevClass.toAvg}]</span>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>통계 정보 없음</div>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
                                                                <div style={{ color: 'rgba(129, 140, 248, 0.8)', fontSize: '0.75rem', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span>성비 및 인원</span>
                                                                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>[{solution.outcomes.gender.avg}]</span>
                                                                </div>
                                                                <div style={{ lineHeight: '1.4', fontSize: '0.8rem' }}>{solution.outcomes.gender.from.split('반')[1]} ({solution.outcomes.size.from.split('명')[0].split(' ')[2]}명)</div>
                                                                <div style={{ lineHeight: '1.4', fontSize: '0.8rem' }}>{solution.outcomes.gender.to.split('반')[1]} ({solution.outcomes.size.to.split('명')[0].split(' ')[2]}명)</div>
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.75rem',
                                                            color: 'rgba(16, 185, 129, 0.7)',
                                                            marginTop: '0.4rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            background: 'rgba(16, 185, 129, 0.05)',
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: '8px',
                                                            border: '1px dashed rgba(16, 185, 129, 0.2)'
                                                        }}>
                                                            ✨ 성적(평균 {solution.outcomes.rank.from.split('→')[1]}) 및 다른 제약은 안전하게 유지됩니다.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setShowAiModal(false)}
                                        style={{ padding: '0.8rem 2rem', borderRadius: '12px' }}
                                    >
                                        나중에 하기
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={applySelectedSolutions}
                                        disabled={selectedSolutions.size === 0}
                                        style={{
                                            padding: '0.8rem 2.5rem',
                                            borderRadius: '12px',
                                            background: selectedSolutions.size === 0 ? 'rgba(99, 102, 241, 0.4)' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                            opacity: selectedSolutions.size === 0 ? 1 : 1,
                                            cursor: selectedSolutions.size === 0 ? 'not-allowed' : 'pointer',
                                            boxShadow: selectedSolutions.size === 0 ? 'none' : '0 10px 20px rgba(99, 102, 241, 0.3)'
                                        }}
                                    >
                                        선택한 교환 적용하기 ({selectedSolutions.size})
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}
