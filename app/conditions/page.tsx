'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    useDraggable,
    useDroppable
} from '@dnd-kit/core';
import { customConfirm } from '@/components/GlobalAlert';

interface ClassData {
    id: number;
    grade: number;
    section_count: number;
    section_statuses?: string;
}

interface Student {
    id?: number;
    name: string;
    gender: 'M' | 'F';
    section_number?: number;
    group_name: string;
    is_problem_student: boolean;
    is_special_class: boolean;
    is_underachiever: boolean;
    is_transferring_out: boolean;
}

interface Group {
    id: string;
    name: string;
    students: Student[];
    type: 'outer' | 'inner' | 'sameClass';
    section?: number;
}

function ConditionsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const classId = searchParams.get('classId');

    const [classData, setClassData] = useState<ClassData | null>(null);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [outerGroups, setOuterGroups] = useState<Group[]>([]);
    const [innerGroups, setInnerGroups] = useState<Group[]>([]);
    const [sameClassGroups, setSameClassGroups] = useState<Group[]>([]); // 같은 반 배정 그룹
    const [isSaved, setIsSaved] = useState(false); // 설정 저장 여부
    const [loading, setLoading] = useState(true);
    const [activeStudent, setActiveStudent] = useState<Student | null>(null);

    // 마감 상태 및 모달
    const [isConditionsCompleted, setIsConditionsCompleted] = useState(false);
    const [showTempSaveModal, setShowTempSaveModal] = useState(false);
    const [showDeadlineConfirmModal, setShowDeadlineConfirmModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<'complete' | 'uncomplete' | null>(null);
    const [deadlineLoading, setDeadlineLoading] = useState(false);

    // 반 구성 설정 상태
    const [sectionCount, setSectionCount] = useState<number>(0);
    const [namingMode, setNamingMode] = useState<'auto' | 'manual'>('auto');
    const [sectionNames, setSectionNames] = useState<string[]>([]);

    // 특수교육대상 반 인원 조정 설정
    const [specialReductionCount, setSpecialReductionCount] = useState<number>(0);
    const [specialReductionMode, setSpecialReductionMode] = useState<'force' | 'flexible'>('flexible');

    // 알고리즘 설명 모달
    const [showAlgorithmModal, setShowAlgorithmModal] = useState(false);

    // 외부 분리 & 같은 반 배정 그룹 생성 모달
    const [groupModal, setGroupModal] = useState<{ show: boolean, type: 'outer' | 'sameClass', section?: number }>({ show: false, type: 'outer' });

    // 반 내부 분리 전용 모달
    const [innerSeparationModal, setInnerSeparationModal] = useState<{ show: boolean, section: number | null }>({ show: false, section: null });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    // 반 이름 자동 생성 함수
    const generateSectionNames = (count: number, grade: number): string[] => {
        if (count <= 0) return [];

        if (count <= 14) {
            // 14개 이하: 가나다라 순
            const koreanNames = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
            return Array.from({ length: count }, (_, i) => koreanNames[i]);
        } else {
            // 14개 초과: abcd 순 (f, n, x 제외)
            const alphabet = 'abcdeghijklmopqrstuvwyz'.split('');
            return Array.from({ length: count }, (_, i) => alphabet[i]);
        }
    };

    useEffect(() => {
        if (classId) {
            loadData();
        }
    }, [classId]);

    // 반 개수 변경 시 자동으로 반 이름 생성 (자동 모드일 때만)
    useEffect(() => {
        if (namingMode === 'auto' && sectionCount > 0 && classData) {
            const names = generateSectionNames(sectionCount, classData.grade);
            setSectionNames(names);
        } else if (namingMode === 'manual' && sectionCount > 0) {
            // 수동 모드에서 개수가 변경되면 배열 크기 조정
            setSectionNames(prev => {
                const newNames = [...prev];
                while (newNames.length < sectionCount) {
                    newNames.push('');
                }
                return newNames.slice(0, sectionCount);
            });
        }
    }, [sectionCount, namingMode, classData]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [classRes, studentsRes] = await Promise.all([
                fetch(`/api/classes/${classId}`),
                fetch(`/api/students/all?classId=${classId}`)
            ]);

            const classInfo = await classRes.json();
            const students = await studentsRes.json();

            setClassData(classInfo);
            setAllStudents(students);

            // localStorage에서 임시저장 데이터 확인
            const tempDataStr = localStorage.getItem(`conditions_temp_${classId}`);
            if (tempDataStr) {
                try {
                    const tempData = JSON.parse(tempDataStr);
                    const savedAt = new Date(tempData.savedAt);
                    const timeAgo = Math.floor((Date.now() - savedAt.getTime()) / 1000 / 60); // 분 단위

                    const confirmRestore = await customConfirm(
                        `📦 임시저장된 데이터가 있습니다.\n\n저장 시각: ${savedAt.toLocaleString('ko-KR')}\n(약 ${timeAgo}분 전)\n\n임시저장 데이터를 복원하시겠습니까?\n\n※ "취소"를 선택하면 서버의 마지막 저장 데이터를 불러옵니다.`
                    );

                    if (confirmRestore) {
                        // localStorage 데이터 복원
                        if (tempData.outerGroups) setOuterGroups(tempData.outerGroups);
                        if (tempData.innerGroups) setInnerGroups(tempData.innerGroups);
                        if (tempData.sameClassGroups) setSameClassGroups(tempData.sameClassGroups);
                        if (tempData.sectionCount) setSectionCount(tempData.sectionCount);
                        if (tempData.sectionNames) setSectionNames(tempData.sectionNames);
                        if (tempData.specialReductionCount !== undefined) setSpecialReductionCount(tempData.specialReductionCount);
                        if (tempData.specialReductionMode) setSpecialReductionMode(tempData.specialReductionMode);

                        // 조건설정 마감 상태는 서버에서 로드 (중요한 상태이므로)
                        setIsConditionsCompleted(classInfo.conditions_completed === 1 || classInfo.conditions_completed === true);

                        console.log('✅ localStorage 임시저장 데이터 복원 완료');
                        return; // 서버 데이터 로드 건너뛰기
                    } else {
                        // 사용자가 취소하면 임시저장 데이터 삭제
                        localStorage.removeItem(`conditions_temp_${classId}`);
                    }
                } catch (e) {
                    console.error('임시저장 데이터 파싱 오류:', e);
                    localStorage.removeItem(`conditions_temp_${classId}`);
                }
            }

            // 서버 데이터로 초기화
            parseGroups(students);

            // 분반 설정 로드 (new_section_count 사용 - 기존반 section_count와 분리)
            const newSectionCount = classInfo.new_section_count || classInfo.section_count || 0;
            setSectionCount(newSectionCount);
            if (classInfo.new_section_names) {
                try {
                    const names = JSON.parse(classInfo.new_section_names);
                    setSectionNames(names);
                } catch {
                    setSectionNames(generateSectionNames(newSectionCount, classInfo.grade));
                }
            } else if (classInfo.section_names) {
                try {
                    const names = JSON.parse(classInfo.section_names);
                    setSectionNames(names);
                } catch {
                    setSectionNames(generateSectionNames(newSectionCount, classInfo.grade));
                }
            } else {
                setSectionNames(generateSectionNames(newSectionCount, classInfo.grade));
            }

            // 특수교육대상 반 인원 조정 설정 로드
            setSpecialReductionCount(classInfo.special_reduction_count || 0);
            setSpecialReductionMode(classInfo.special_reduction_mode || 'flexible');

            // 조건설정 마감 상태 로드
            setIsConditionsCompleted(classInfo.conditions_completed === 1 || classInfo.conditions_completed === true);

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const parseGroups = (students: Student[]) => {
        console.log('🔍 parseGroups 호출됨, 학생 수:', students.length);
        console.log('📝 첫 5명의 group_name:', students.slice(0, 5).map(s => ({
            name: s.name,
            section: s.section_number,
            group_name: s.group_name
        })));

        const sepGroupMap = new Map<string, Set<number>>(); // Student ID Set으로 변경 (중복 방지)
        const bindGroupMap = new Map<string, Set<number>>();

        // 1. group_name에서 제약조건 파싱 및 그룹화
        students.forEach(s => {
            if (!s.group_name || !s.group_name.trim()) return;

            // group_name은 쉼표로 구분된 제약조건들: "SEP:1반-그룹1,BIND:친구그룹"
            const constraints = s.group_name.split(',');

            constraints.forEach(constraint => {
                const trimmed = constraint.trim();

                if (trimmed.startsWith('SEP:')) {
                    // SEP: 접두사를 완전히 제거 (중복된 경우도 처리)
                    const groupName = trimmed.replace(/^(SEP:)+/, '');
                    if (!groupName) return; // 빈 문자열이면 건너뛰기

                    if (!sepGroupMap.has(groupName)) {
                        sepGroupMap.set(groupName, new Set());
                    }
                    if (s.id !== undefined) sepGroupMap.get(groupName)!.add(s.id);
                } else if (trimmed.startsWith('BIND:')) {
                    // BIND: 접두사를 완전히 제거
                    const groupName = trimmed.replace(/^(BIND:)+/, '');
                    if (!groupName) return; // 빈 문자열이면 건너뛰기

                    if (!bindGroupMap.has(groupName)) {
                        bindGroupMap.set(groupName, new Set());
                    }
                    if (s.id !== undefined) bindGroupMap.get(groupName)!.add(s.id);
                }
            });
        });

        const loadedOuter: Group[] = [];
        const loadedInner: Group[] = [];
        const loadedSameClass: Group[] = [];

        // ID를 Student 객체로 변환하는 헬퍼
        const getStudentsByIds = (ids: Set<number>): Student[] => {
            return students.filter(s => s.id !== undefined && ids.has(s.id));
        };

        // SEP 그룹 처리
        sepGroupMap.forEach((studentIds, groupName) => {
            const studentList = getStudentsByIds(studentIds);
            if (studentList.length === 0) return;

            // 그룹명이 "N반-XXX" 형식인지 확인 (반 내부 분리)
            const innerGroupPattern = /^(\d+)반-(.+)$/;
            const match = groupName.match(innerGroupPattern);

            if (match) {
                // 반 내부 분리 그룹: "1반-그룹1"
                const groupSection = parseInt(match[1]);
                const actualGroupName = match[2];

                // 해당 반의 학생들만 포함되어 있는지 확인
                const allSameSection = studentList.every(s => s.section_number === groupSection);

                if (allSameSection) {
                    console.log(`✅ Inner 그룹 인식: ${groupName} → ${groupSection}반 "${actualGroupName}"`);
                    loadedInner.push({
                        id: `inner-${groupSection}-${actualGroupName}`,
                        name: actualGroupName,  // "그룹1" (반 번호 제외)
                        students: studentList,
                        type: 'inner',
                        section: groupSection
                    });
                } else {
                    console.warn(`⚠️ 반 불일치: ${groupName} - 예상=${groupSection}반, 실제=`, new Set(studentList.map(s => s.section_number)));
                    // 학생들이 여러 반에 걸쳐 있으면 outer로 분류
                    loadedOuter.push({
                        id: `outer-${groupName}`,
                        name: groupName,
                        students: studentList,
                        type: 'outer'
                    });
                }
            } else {
                // 반 외부 분리 그룹: 반 번호가 없는 일반 그룹명
                console.log(`📌 Outer 그룹 인식: ${groupName}`);
                loadedOuter.push({
                    id: `outer-${groupName}`,
                    name: groupName,
                    students: studentList,
                    type: 'outer'
                });
            }
        });

        // BIND 그룹 처리 (같은 반 배정)
        bindGroupMap.forEach((studentIds, groupName) => {
            const studentList = getStudentsByIds(studentIds);
            if (studentList.length === 0) return;

            console.log(`🔗 BIND 그룹 인식: ${groupName}`);
            loadedSameClass.push({
                id: `sameClass-${groupName}`,
                name: groupName,
                students: studentList,
                type: 'sameClass'
            });
        });

        console.log(`📊 파싱 결과: Inner=${loadedInner.length}, Outer=${loadedOuter.length}, BIND=${loadedSameClass.length}`);

        setOuterGroups(loadedOuter);
        setInnerGroups(loadedInner);
        setSameClassGroups(loadedSameClass);
    };

    const handleOpenGroupModal = (type: 'inner' | 'outer', section?: number) => {
        if (type === 'inner' && section) {
            setInnerSeparationModal({ show: true, section });
        } else {
            setGroupModal({ show: true, type: 'outer', section });
        }
    };

    const handleDeleteGroup = async (type: 'inner' | 'outer' | 'sameClass', groupId: string) => {
        const confirmed = await customConfirm('이 그룹을 삭제하시겠습니까?');
        if (!confirmed) return;

        if (type === 'inner') {
            setInnerGroups(innerGroups.filter(g => g.id !== groupId));
        } else if (type === 'outer') {
            setOuterGroups(outerGroups.filter(g => g.id !== groupId));
        } else {
            setSameClassGroups(sameClassGroups.filter(g => g.id !== groupId));
        }
    };

    const handleRemoveStudent = (type: 'inner' | 'outer' | 'sameClass', groupId: string, student: Student) => {
        if (type === 'inner') {
            setInnerGroups(groups => groups.map(g => {
                if (g.id === groupId) {
                    return { ...g, students: g.students.filter(s => !(s.name === student.name && s.section_number === student.section_number)) };
                }
                return g;
            }));
        } else if (type === 'outer') {
            setOuterGroups(groups => groups.map(g => {
                if (g.id === groupId) {
                    return { ...g, students: g.students.filter(s => !(s.name === student.name && s.section_number === student.section_number)) };
                }
                return g;
            }));
        } else {
            setSameClassGroups(groups => groups.map(g => {
                if (g.id === groupId) {
                    return { ...g, students: g.students.filter(s => !(s.name === student.name && s.section_number === student.section_number)) };
                }
                return g;
            }));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveStudent(null);
        if (!over) return;

        const student = active.data.current?.student as Student;
        const targetGroupId = over.data.current?.groupId;
        const targetType = over.data.current?.type;

        if (!student || !targetGroupId) return;

        if (targetType === 'inner') {
            const targetGroup = innerGroups.find(g => g.id === targetGroupId);
            if (!targetGroup) return;

            if (student.section_number !== targetGroup.section) {
                alert('다른 반 학생을 반 내부 그룹에 넣을 수 없습니다.');
                return;
            }

            if (!targetGroup.students.some(s => s.name === student.name && s.section_number === student.section_number)) {
                setInnerGroups(prev => prev.map(g => {
                    if (g.id === targetGroupId) return { ...g, students: [...g.students, student] };
                    if (g.section === student.section_number) {
                        return { ...g, students: g.students.filter(s => !(s.name === student.name && s.section_number === student.section_number)) };
                    }
                    return g;
                }));
            }
        } else if (targetType === 'outer') {
            const targetGroup = outerGroups.find(g => g.id === targetGroupId);
            if (targetGroup && !targetGroup.students.some(s => s.name === student.name && s.section_number === student.section_number)) {
                setOuterGroups(prev => prev.map(g => {
                    if (g.id === targetGroupId) return { ...g, students: [...g.students, student] };
                    return { ...g, students: g.students.filter(s => !(s.name === student.name && s.section_number === student.section_number)) };
                }));
            }
        }
    };

    const handleSave = async (silent: boolean = false) => {
        console.log('💾 저장 시작...');
        console.log('📋 Inner Groups:', innerGroups);
        console.log('📋 Outer Groups:', outerGroups);
        console.log('📋 BIND Groups:', sameClassGroups);

        // 유효성 검사
        if (sectionCount <= 0) {
            alert('분반 개수를 입력해주세요.');
            return;
        }

        if (sectionNames.length !== sectionCount) {
            alert('반 이름 설정이 올바르지 않습니다.');
            return;
        }

        // 수동 모드에서 빈 이름 체크
        if (namingMode === 'manual' && sectionNames.some(name => !name.trim())) {
            alert('모든 반 이름을 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            // 1. 반 구성 설정 저장 (new_section_count - 기존반 section_count는 변경하지 않음)
            const classConfigResponse = await fetch(`/api/classes/${classId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    new_section_count: sectionCount,  // section_count 대신 new_section_count 사용
                    section_names: sectionNames,
                    special_reduction_count: specialReductionCount,
                    special_reduction_mode: specialReductionMode
                }),
            });

            if (!classConfigResponse.ok) {
                throw new Error('Failed to save class configuration');
            }

            // 2. 분리/배정 그룹 설정 저장
            const constraintMap = new Map<string, string[]>();

            const addConstraint = (key: string, val: string) => {
                if (!constraintMap.has(key)) constraintMap.set(key, []);
                constraintMap.get(key)!.push(val);
            };

            // 반 내부 분리: 반 번호를 그룹명에 포함하여 각 반의 그룹을 독립적으로 처리
            innerGroups.forEach(g => {
                g.students.forEach(s => {
                    // 반 번호를 포함한 고유한 그룹명 생성: "1반-그룹1"
                    const uniqueGroupName = `${s.section_number}반-${g.name}`;
                    addConstraint(`${s.section_number}-${s.name}`, `SEP:${uniqueGroupName}`);
                });
            });

            // 반 외부 분리: 기존대로 반 번호 없이 저장 (모든 반에 걸쳐 분리)
            outerGroups.forEach(g => {
                g.students.forEach(s => {
                    addConstraint(`${s.section_number}-${s.name}`, `SEP:${g.name}`);
                });
            });

            sameClassGroups.forEach(g => {
                g.students.forEach(s => {
                    addConstraint(`${s.section_number}-${s.name}`, `BIND:${g.name}`);
                });
            });

            const updatedStudents = allStudents.map(s => ({
                ...s,
                group_name: (constraintMap.get(`${s.section_number}-${s.name}`) || []).join(',')
            }));

            const studentsResponse = await fetch('/api/students/save-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classId, students: updatedStudents }),
            });

            if (!studentsResponse.ok) throw new Error('Failed to save student groups');

            setIsSaved(true);
            if (!silent) {
                alert('설정이 저장되었습니다.');
            }
        } catch (error) {
            console.error(error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const getGroupColor = (idx: number) => {
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
        return colors[idx % colors.length];
    };

    // 임시저장 (localStorage)
    const handleTempSave = () => {
        const tempData = {
            outerGroups,
            innerGroups,
            sameClassGroups,
            sectionCount,
            sectionNames,
            specialReductionCount,
            specialReductionMode,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(`conditions_temp_${classId}`, JSON.stringify(tempData));
        setShowTempSaveModal(true);
    };

    // 마감/해제 처리
    const handleDeadlineAction = async () => {
        if (!pendingAction) return;

        setDeadlineLoading(true);
        try {
            if (pendingAction === 'complete') {
                // 먼저 현재 설정 저장 (silent 모드로 alert 표시 안 함)
                await handleSave(true);

                // 마감 상태 저장
                const response = await fetch(`/api/classes/${classId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conditions_completed: true })
                });

                if (response.ok) {
                    setIsConditionsCompleted(true);
                    // localStorage 임시저장 삭제
                    localStorage.removeItem(`conditions_temp_${classId}`);
                    alert('✅ 조건 설정이 마감되었습니다.');
                } else {
                    alert('마감 처리 중 오류가 발생했습니다.');
                }
            } else {
                // 마감 해제
                const response = await fetch(`/api/classes/${classId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conditions_completed: false })
                });

                if (response.ok) {
                    setIsConditionsCompleted(false);
                    alert('마감이 해제되었습니다.');
                } else {
                    alert('마감 해제 중 오류가 발생했습니다.');
                }
            }
        } catch (error) {
            console.error('Deadline action error:', error);
            alert('오류가 발생했습니다.');
        } finally {
            setDeadlineLoading(false);
            setShowDeadlineConfirmModal(false);
            setPendingAction(null);
        }
    };

    if (loading || !classData) {
        return (
            <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="loading"></div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
            <div className="container">
                {/* 헤더 & Stepper */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '3rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary-light)' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>학급 관리</span>
                            <span>/</span>
                            <span style={{ fontSize: '0.9rem' }}>{classData.grade}학년</span>
                        </div>
                        <h1 style={{ margin: 0 }}>{classData.grade}학년 반배정 대시보드</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={() => router.push(`/classes/${classId}`)} className="btn btn-secondary">
                            ◀ 이전단계
                        </button>
                        <button onClick={() => router.push('/dashboard')} className="btn btn-secondary">
                            🏠 홈으로
                        </button>
                    </div>
                </div>

                {/* Stepper */}
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '4rem' }}>
                    <div className="stat-card" style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        position: 'relative',
                        overflow: 'hidden',
                        opacity: 0.7
                    }}>
                        <div style={{
                            position: 'absolute', top: '1.5rem', right: '1.5rem',
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: 'white', color: '#3b82f6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', fontWeight: 'bold',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}>✓</div>
                        <div className="stat-icon" style={{ background: '#3b82f6', color: 'white', marginBottom: '1rem' }}>📝</div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>학생 정보 입력</h3>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>명렬표 작성 완료</p>
                    </div>

                    <div className="stat-card" style={{
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        position: 'relative',
                        transition: 'all 0.3s ease',
                        transform: 'scale(1.02)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{
                            position: 'absolute', top: '1.5rem', right: '1.5rem',
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: 'white', color: '#10b981',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', fontWeight: 'bold',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}>2</div>
                        <div className="stat-icon" style={{ background: '#10b981', color: 'white', marginBottom: '1rem' }}>⚙️</div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>조건 설정</h3>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            분리 학생 지정 및<br />우선순위 조정
                        </p>
                        <button
                            className="btn"
                            disabled
                            style={{
                                width: '100%',
                                background: '#10b981',
                                color: 'white',
                                fontSize: '0.85rem',
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                border: 'none',
                                borderRadius: '6px'
                            }}
                        >
                            설정 진행 중...
                        </button>
                    </div>

                    <div className="stat-card" style={{
                        background: isSaved ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                        border: isSaved ? '2px solid #3b82f6' : '1px solid var(--border)',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        opacity: isSaved ? 1 : 0.5,
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            position: 'absolute', top: '1.5rem', right: '1.5rem',
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: isSaved ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', fontWeight: 'bold',
                            border: isSaved ? 'none' : '1px solid rgba(255,255,255,0.2)'
                        }}>3</div>
                        <div className="stat-icon" style={{ background: isSaved ? '#3b82f6' : 'var(--bg-tertiary)', color: isSaved ? 'white' : 'var(--text-muted)', marginBottom: '1rem' }}>🎯</div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: isSaved ? 'white' : 'var(--text-muted)' }}>반편성 결과</h3>
                        <p style={{ margin: 0, color: isSaved ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                            알고리즘 배정 결과 확인<br />및 수동 조정
                        </p>
                        {isSaved && (
                            <button
                                onClick={() => router.push(`/classes/${classId}/allocation`)}
                                className="btn btn-primary"
                                style={{ marginTop: '1rem', width: '100%' }}
                            >
                                👉 반배정 하기
                            </button>
                        )}
                    </div>
                </div>

                {/* 마감 상태 배너 (중간 위치) */}
                {isConditionsCompleted && (
                    <div style={{
                        background: 'rgba(255, 99, 71, 0.1)',
                        border: '1px solid #ff6347',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                            <div>
                                <h3 style={{ margin: '0 0 0.25rem 0', color: '#d32f2f', fontSize: '1rem' }}>조건 설정이 마감되었습니다.</h3>
                                <p style={{ margin: 0, color: '#d32f2f', fontSize: '0.9rem' }}>
                                    수정이 필요하시면 하단의 <b>[🔒 마감 해제]</b> 버튼을 클릭해주세요.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{
                    pointerEvents: isConditionsCompleted ? 'none' : 'auto',
                    opacity: isConditionsCompleted ? 0.6 : 1,
                    transition: 'all 0.3s ease',
                    filter: isConditionsCompleted ? 'grayscale(0.5)' : 'none'
                }}>
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                        {/* 2행 그리드 레이아웃 */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr',
                            gridTemplateRows: 'auto auto auto',
                            gap: '2rem',
                            marginBottom: '2rem',
                            alignItems: 'start'
                        }}>
                            {/* 좌측: 반 내부 분리 (3행 전체 차지) */}
                            <div style={{ gridRow: '1 / 4', padding: 0, flexDirection: 'column', alignItems: 'stretch', height: '100%', display: 'flex', overflow: 'hidden' }} className="stat-card">
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        🏫 반 내부 분리
                                    </h2>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        같은 반 학생끼리 묶어서 분리 (명렬표 데이터 자동 인식)
                                    </p>
                                </div>

                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '1.5rem',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '1rem',
                                    alignContent: 'start'
                                }}>
                                    {[...Array(classData.section_count)].map((_, i) => {
                                        const secNum = i + 1;
                                        const secGroups = innerGroups.filter(g => g.section === secNum);


                                        return (
                                            <div key={secNum} className="card" style={{
                                                padding: 0,
                                                border: '1px solid var(--border)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                minHeight: '120px',
                                                overflow: 'hidden'
                                            }}>
                                                {/* 카드 헤더 */}
                                                <div style={{
                                                    padding: '1rem 1.25rem',
                                                    background: 'var(--bg-tertiary)',
                                                    borderBottom: '1px solid var(--border)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>
                                                        {secNum}반
                                                        {secGroups.length > 0 && (
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                                                ({secGroups.length}개 그룹)
                                                            </span>
                                                        )}
                                                    </span>
                                                    <button
                                                        onClick={() => handleOpenGroupModal('inner', secNum)}
                                                        className="btn btn-secondary"
                                                        disabled={isConditionsCompleted}
                                                        style={{
                                                            fontSize: '0.85rem',
                                                            padding: '0.4rem 0.8rem',
                                                            opacity: isConditionsCompleted ? 0.5 : 1,
                                                            cursor: isConditionsCompleted ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        ✏️ 수정
                                                    </button>
                                                </div>

                                                {/* 카드 내용: 그룹 목록 */}
                                                <div style={{ padding: '1rem', flex: 1 }}>
                                                    {secGroups.length === 0 ? (
                                                        <div style={{
                                                            textAlign: 'center',
                                                            padding: '2rem',
                                                            color: 'var(--text-secondary)',
                                                            fontSize: '0.85rem',
                                                            fontStyle: 'italic'
                                                        }}>
                                                            그룹 없음
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {secGroups.map((group, idx) => (
                                                                <div key={group.id} style={{
                                                                    background: 'var(--bg-secondary)',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--border)',
                                                                    overflow: 'hidden'
                                                                }}>
                                                                    <div style={{
                                                                        padding: '0.5rem 0.8rem',
                                                                        background: `${getGroupColor(idx)}15`,
                                                                        borderBottom: `2px solid ${getGroupColor(idx)}`,
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        alignItems: 'center'
                                                                    }}>
                                                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                                                            {group.name}
                                                                            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                                                                ({group.students.length}명)
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ padding: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '50px', alignContent: 'start' }}>
                                                                        {group.students.map((s, sIdx) => (
                                                                            <div key={sIdx} style={{
                                                                                padding: '0.25rem 0.5rem',
                                                                                borderRadius: '4px',
                                                                                background: 'var(--bg-primary)',
                                                                                border: '1px solid var(--border)',
                                                                                fontSize: '0.8rem',
                                                                                display: 'flex',
                                                                                gap: '0.3rem',
                                                                                alignItems: 'center'
                                                                            }}>
                                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>


                            {/* 우측 1행: 반 외부 분리 */}
                            <div className="stat-card" style={{ padding: 0, flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            ⚡ 반 외부 분리
                                        </h2>
                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            서로 다른 반이어야 하는 그룹 설정
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleOpenGroupModal('outer')}
                                        className="btn btn-primary"
                                        disabled={isConditionsCompleted}
                                        style={{
                                            fontSize: '0.9rem',
                                            padding: '0.5rem 1rem',
                                            opacity: isConditionsCompleted ? 0.5 : 1,
                                            cursor: isConditionsCompleted ? 'not-allowed' : 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        + 그룹 추가
                                    </button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', alignContent: 'start' }}>
                                    {outerGroups.length === 0 ? (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                            <p>외부 분리 그룹이 없습니다.</p>
                                        </div>
                                    ) : (
                                        outerGroups.map((group, idx) => (
                                            <GroupItem
                                                key={group.id}
                                                group={group}
                                                color={getGroupColor(idx + 10)}
                                                onRemoveStudent={(gId: string, s: Student) => handleRemoveStudent('outer', gId, s)}
                                                onDeleteGroup={() => handleDeleteGroup('outer', group.id)}
                                                type="outer"
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 우측 2행: 같은 반 배정 (전체 너비) */}
                            <div className="stat-card" style={{ padding: 0, flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🤝 같은 반 배정
                                        </h2>
                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            같은 반에 배정되어야 하는 그룹 설정
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setGroupModal({ show: true, type: 'sameClass' })}
                                        className="btn btn-primary"
                                        disabled={isConditionsCompleted}
                                        style={{
                                            fontSize: '0.9rem',
                                            padding: '0.5rem 1rem',
                                            opacity: isConditionsCompleted ? 0.5 : 1,
                                            cursor: isConditionsCompleted ? 'not-allowed' : 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        + 그룹 추가
                                    </button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', alignContent: 'start' }}>
                                    {sameClassGroups.length === 0 ? (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                            <p>같은 반 배정 그룹이 없습니다.</p>
                                        </div>
                                    ) : (
                                        sameClassGroups.map((group, idx) => (
                                            <GroupItem
                                                key={group.id}
                                                group={group}
                                                color={getGroupColor(idx + 20)}
                                                onRemoveStudent={(gId: string, s: Student) => handleRemoveStudent('sameClass', gId, s)}
                                                onDeleteGroup={() => handleDeleteGroup('sameClass', group.id)}
                                                type="outer"
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 우측 3행: 동명이인 (전체 너비) */}
                            <DuplicateNamesCard allStudents={allStudents} />
                        </div>

                        {/* 특별 관리 학생 (3열 그리드) */}
                        <SpecialStudentsGrid allStudents={allStudents} />

                        <DragOverlay>
                            {activeStudent ? (
                                <div style={{
                                    padding: '0.5rem 1rem',
                                    background: 'white',
                                    borderRadius: '8px',
                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                    border: '2px solid #3b82f6',
                                    fontWeight: 'bold',
                                    color: '#1e293b'
                                }}>
                                    [{activeStudent.section_number}반] {activeStudent.name}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>

                    {/* 반 구성 설정 카드 - 2열 그리드 레이아웃 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1.5rem',
                        marginTop: '2rem',
                        marginBottom: '2rem'
                    }}>
                        {/* 왼쪽: 기본 설정 */}
                        <div className="stat-card" style={{
                            padding: 0,
                            flexDirection: 'column',
                            alignItems: 'stretch'
                        }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.05)' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                                    🎯 기본 설정
                                </h3>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {/* 분반 개수 */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                        분반 개수
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <input
                                            type="number"
                                            min="1"
                                            max="26"
                                            value={sectionCount || ''}
                                            onChange={(e) => setSectionCount(parseInt(e.target.value) || 0)}
                                            className="form-input"
                                            style={{ width: '80px', padding: '0.6rem', fontSize: '1rem', textAlign: 'center' }}
                                            placeholder="3"
                                        />
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>개 (최대 26개)</span>
                                    </div>
                                </div>

                                {/* 반 이름 설정 방식 */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                        반 이름 방식
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            padding: '0.5rem 1rem',
                                            background: namingMode === 'auto' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                                            border: namingMode === 'auto' ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 500
                                        }}>
                                            <input
                                                type="radio"
                                                name="namingMode"
                                                value="auto"
                                                checked={namingMode === 'auto'}
                                                onChange={(e) => setNamingMode(e.target.value as 'auto' | 'manual')}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            자동
                                        </label>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            padding: '0.5rem 1rem',
                                            background: namingMode === 'manual' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                                            border: namingMode === 'manual' ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 500
                                        }}>
                                            <input
                                                type="radio"
                                                name="namingMode"
                                                value="manual"
                                                checked={namingMode === 'manual'}
                                                onChange={(e) => setNamingMode(e.target.value as 'auto' | 'manual')}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            수동
                                        </label>
                                    </div>
                                </div>

                                {/* 반 이름 미리보기 */}
                                {sectionCount > 0 && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                            반 이름
                                        </label>
                                        {namingMode === 'auto' ? (
                                            <div style={{
                                                padding: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)'
                                            }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {sectionNames.map((name, idx) => (
                                                        <span key={idx} style={{
                                                            padding: '0.3rem 0.7rem',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '4px',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600
                                                        }}>
                                                            {name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.5rem' }}>
                                                {sectionNames.map((name, idx) => (
                                                    <input
                                                        key={idx}
                                                        type="text"
                                                        value={name}
                                                        onChange={(e) => {
                                                            const newNames = [...sectionNames];
                                                            newNames[idx] = e.target.value;
                                                            setSectionNames(newNames);
                                                        }}
                                                        className="form-input"
                                                        style={{ padding: '0.4rem', fontSize: '0.85rem', textAlign: 'center' }}
                                                        placeholder={`${idx + 1}`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 오른쪽: 특수교육대상 설정 */}
                        <div className="stat-card" style={{
                            padding: 0,
                            flexDirection: 'column',
                            alignItems: 'stretch'
                        }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(16, 185, 129, 0.05)' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                                    📚 특수교육대상 설정
                                </h3>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    특수교육대상 학생이 있는 반의 인원을 줄여 담임 부담을 경감합니다.
                                </p>

                                {/* 감소 인원 */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                        감소 인원
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="10"
                                            value={specialReductionCount}
                                            onChange={(e) => setSpecialReductionCount(parseInt(e.target.value) || 0)}
                                            className="form-input"
                                            style={{ width: '70px', padding: '0.6rem', fontSize: '1rem', textAlign: 'center' }}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>명</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(0 = 감소 없음)</span>
                                    </div>
                                </div>

                                {/* 적용 방식 */}
                                {specialReductionCount > 0 && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                                            적용 방식
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <label style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.75rem 1rem',
                                                background: specialReductionMode === 'flexible' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                                                border: specialReductionMode === 'flexible' ? '2px solid #10b981' : '1px solid var(--border)',
                                                borderRadius: '8px',
                                                cursor: 'pointer'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="specialReductionMode"
                                                    value="flexible"
                                                    checked={specialReductionMode === 'flexible'}
                                                    onChange={(e) => setSpecialReductionMode(e.target.value as 'force' | 'flexible')}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>✅ 유연 적용 (권장)</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                                        전체 균형 우선
                                                    </span>
                                                </div>
                                            </label>
                                            <label style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.75rem 1rem',
                                                background: specialReductionMode === 'force' ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-secondary)',
                                                border: specialReductionMode === 'force' ? '2px solid #ef4444' : '1px solid var(--border)',
                                                borderRadius: '8px',
                                                cursor: 'pointer'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="specialReductionMode"
                                                    value="force"
                                                    checked={specialReductionMode === 'force'}
                                                    onChange={(e) => setSpecialReductionMode(e.target.value as 'force' | 'flexible')}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>⚠️ 강제 적용</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                                        불균형 가능
                                                    </span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* 저장 및 마감 버튼 액션 바 */}
                </div>

                {/* 저장 및 마감 버튼 액션 바 */}
                <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                    {/* 알고리즘 설명 버튼 (항상 활성화) */}
                    <button
                        onClick={() => setShowAlgorithmModal(true)}
                        className="btn btn-secondary"
                        style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', background: 'var(--bg-secondary)', border: '2px solid var(--border)' }}
                    >
                        📊 반배정원리
                    </button>

                    {!isConditionsCompleted ? (
                        <>
                            <button
                                onClick={handleTempSave}
                                className="btn"
                                style={{
                                    padding: '0.8rem 2rem',
                                    fontSize: '1.1rem',
                                    background: 'var(--bg-primary)',
                                    border: '2px solid #cbd5e1',
                                    color: '#475569'
                                }}
                            >
                                💾 임시저장
                            </button>
                            <button
                                onClick={() => {
                                    setPendingAction('complete');
                                    setShowDeadlineConfirmModal(true);
                                }}
                                className="btn"
                                style={{
                                    padding: '0.8rem 3rem',
                                    fontSize: '1.2rem',
                                    fontWeight: 600,
                                    background: 'var(--success)',
                                    color: 'white',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                ✓ 마감 (최종 저장)
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => {
                                setPendingAction('uncomplete');
                                setShowDeadlineConfirmModal(true);
                            }}
                            className="btn"
                            style={{
                                padding: '0.8rem 3rem',
                                fontSize: '1.2rem',
                                background: 'var(--text-secondary)',
                                color: 'white',
                                border: 'none',
                                fontWeight: 600
                            }}
                        >
                            🔒 마감 해제
                        </button>
                    )}
                </div>



                {/* 알고리즘 설명 모달 */}
                {showAlgorithmModal && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '2rem',
                            backdropFilter: 'blur(3px)'
                        }}
                        onClick={() => setShowAlgorithmModal(false)}
                    >
                        <div
                            style={{
                                background: 'var(--bg-primary)',
                                borderRadius: '16px',
                                maxWidth: '700px',
                                width: '100%',
                                maxHeight: '90vh',
                                overflow: 'auto',
                                boxShadow: '0 25px 80px rgba(0, 0, 0, 0.4)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* 헤더 */}
                            <div style={{
                                padding: '1.5rem 2rem',
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                color: 'white',
                                borderRadius: '16px 16px 0 0'
                            }}>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🎯 반배정이 이렇게 됩니다</h2>
                                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.9 }}>아래 조건들을 고려하여 자동으로 배정됩니다</p>
                            </div>

                            {/* 키워드 카드들 */}
                            <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                {/* 1. 학생 균등 배분 */}
                                <div style={{
                                    padding: '1.25rem',
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(59, 130, 246, 0.3)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <span style={{
                                            background: '#3b82f6',
                                            color: 'white',
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700
                                        }}>👥 학생 균등 배분</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>📊</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>인원수 동일</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ec4899' }}>⚥</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>남녀 비율 균형</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>📈</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>석차 평균 유사</div>
                                        </div>
                                    </div>

                                    {/* 지그재그 배정 설명 */}
                                    <div style={{
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        border: '1px solid var(--border)'
                                    }}>
                                        <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                                            <strong>📐 지그재그 배정 방식이란?</strong><br />
                                            각 반 선생님들이 정한 석차를 유지하면서, 같은 등수끼리 묶어서 순서대로 분산 배치합니다.<br />
                                            <strong>중요:</strong> 1반 1등과 2반 1등은 서로 다른 반에 배정됩니다.
                                        </div>

                                        <div style={{
                                            background: '#f1f5f9',
                                            padding: '0.8rem',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            borderLeft: '3px solid #64748b'
                                        }}>
                                            <div style={{ marginBottom: '0.4rem', fontWeight: 600, color: '#475569' }}>🎯 배정 순서:</div>
                                            <div style={{ fontFamily: 'monospace', color: '#334155', lineHeight: '1.8' }}>
                                                1등 그룹: 1반 1등→A반, 2반 1등→B반, 3반 1등→C반<br />
                                                2등 그룹: 1반 2등→<span style={{ color: '#ef4444', fontWeight: 600 }}>C반</span>, 2반 2등→<span style={{ color: '#ef4444', fontWeight: 600 }}>B반</span>, 3반 2등→<span style={{ color: '#ef4444', fontWeight: 600 }}>A반</span> (역순!)<br />
                                                3등 그룹: 1반 3등→A반, 2반 3등→B반, 3반 3등→C반 (다시 정순!)
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            → 이렇게 하면 원래 같은 반 최상위권 학생들이 새로운 반에서 서로 흩어져 모든 반이 고르게 됩니다.
                                        </div>
                                    </div>
                                </div>

                                {/* 2. 분리/결합 처리 */}
                                <div style={{
                                    padding: '1.25rem',
                                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(239, 68, 68, 0.3)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <span style={{
                                            background: '#ef4444',
                                            color: 'white',
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700
                                        }}>🚫 분리/결합 처리</span>
                                        <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>100% 보장</span>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>분리 그룹</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>→ 지정한 학생들 반드시 다른 반 배정</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>같은반 그룹</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>→ 지정한 학생들 같은 반 배정</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ color: '#eab308', fontWeight: 'bold' }}>동명이인</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>→ 자동으로 다른 반에 분산</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. 특별관리대상 분산 */}
                                <div style={{
                                    padding: '1.25rem',
                                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.05) 100%)',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(249, 115, 22, 0.3)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <span style={{
                                            background: '#f97316',
                                            color: 'white',
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700
                                        }}>⚠️ 특별관리대상 분산</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ fontWeight: 600 }}>문제행동</span>
                                            <span style={{ color: 'var(--text-muted)' }}> 학생 분산</span>
                                        </div>
                                        <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ fontWeight: 600 }}>특수교육</span>
                                            <span style={{ color: 'var(--text-muted)' }}> 대상 분산</span>
                                        </div>
                                        <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ fontWeight: 600 }}>학습부진</span>
                                            <span style={{ color: 'var(--text-muted)' }}> 학생 분산</span>
                                        </div>
                                        <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                            <span style={{ fontWeight: 600 }}>전출예정</span>
                                            <span style={{ color: 'var(--text-muted)' }}> → 맨 마지막 번호</span>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        💡 특수교육 학생이 있는 반은 설정값만큼 정원이 자동 감소됩니다
                                    </div>
                                </div>

                                {/* 우선순위 안내 */}
                                <div style={{
                                    padding: '1rem',
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    fontSize: '0.85rem'
                                }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#10b981' }}>📌 조건이 충돌할 경우 우선순위</div>
                                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        <strong>1순위:</strong> 분리/결합 조건, 동명이인 분리 &nbsp;→&nbsp;
                                        <strong>2순위:</strong> 성적/성별 균형 &nbsp;→&nbsp;
                                        <strong>3순위:</strong> 특별관리 분산, 인원 균형
                                    </div>
                                </div>
                            </div>

                            {/* 닫기 버튼 */}
                            <div style={{
                                padding: '1.25rem 2rem',
                                borderTop: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <button
                                    onClick={() => setShowAlgorithmModal(false)}
                                    className="btn btn-primary"
                                    style={{ padding: '0.8rem 3rem', fontSize: '1rem' }}
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 임시저장 확인 모달 */}
                {showTempSaveModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '2rem',
                            borderRadius: '12px',
                            maxWidth: '400px',
                            width: '90%',
                            textAlign: 'center',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💾</div>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'black' }}>임시저장 완료</h3>
                            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
                                현재 설정이 이 브라우저에 저장되었습니다.<br />
                                브라우저를 닫았다가 다시 열어도 유지됩니다.<br />
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>(다른 기기에서는 불러올 수 없습니다)</span>
                            </p>
                            <button
                                onClick={() => setShowTempSaveModal(false)}
                                className="btn btn-primary"
                                style={{ minWidth: '120px', display: 'block', margin: '0 auto' }}
                            >
                                확인
                            </button>
                        </div>
                    </div>
                )}

                {/* 마감/해제 확인 모달 */}
                {showDeadlineConfirmModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '2rem',
                            borderRadius: '12px',
                            maxWidth: '400px',
                            width: '90%',
                            textAlign: 'center',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                        }}>
                            <h3 style={{ marginTop: 0, color: 'black' }}>
                                {pendingAction === 'complete' ? '조건 설정 마감' : '마감 해제'}
                            </h3>
                            <p style={{ color: '#666', marginBottom: '2rem' }}>
                                {pendingAction === 'complete'
                                    ? '조건 설정을 마감하시겠습니까?\n모든 정보가 저장됩니다.'
                                    : '마감을 해제하시겠습니까?\n다시 정보를 수정할 수 있게 됩니다.'}
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button
                                    onClick={() => {
                                        setShowDeadlineConfirmModal(false);
                                        setPendingAction(null);
                                    }}
                                    className="btn btn-secondary"
                                    disabled={deadlineLoading}
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleDeadlineAction}
                                    className="btn"
                                    style={{
                                        background: pendingAction === 'complete' ? 'var(--success)' : 'var(--text-secondary)',
                                        color: 'white'
                                    }}
                                    disabled={deadlineLoading}
                                >
                                    {deadlineLoading ? '처리 중...' : '확인'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 외부 분리 & 같은 반 배정 그룹 생성 모달 */}
                {
                    groupModal.show && (
                        <OuterGroupCreationModal
                            type={groupModal.type}
                            allStudents={allStudents}
                            existingGroupNames={
                                groupModal.type === 'outer'
                                    ? outerGroups.map(g => g.name)
                                    : sameClassGroups.map(g => g.name)
                            }
                            onClose={() => setGroupModal({ show: false, type: 'outer' })}
                            onCreate={(groupName: string, selectedStudents: Student[]) => {
                                if (groupModal.type === 'outer') {
                                    setOuterGroups([...outerGroups, {
                                        id: `outer-${groupName}`,
                                        name: groupName,
                                        students: selectedStudents,
                                        type: 'outer'
                                    }]);
                                } else {
                                    setSameClassGroups([...sameClassGroups, {
                                        id: `sameClass-${groupName}`,
                                        name: groupName,
                                        students: selectedStudents,
                                        type: 'outer' // type은 outer로 통일 (드래그 앤 드롭 호환)
                                    }]);
                                }
                                setGroupModal({ show: false, type: 'outer' });
                            }}
                        />
                    )
                }

                {/* 반 내부 분리 전용 모달 (Checkbox 기반) */}
                {
                    innerSeparationModal.show && innerSeparationModal.section && (
                        <InnerSeparationModal
                            section={innerSeparationModal.section}
                            allStudents={allStudents}
                            innerGroups={innerGroups}
                            onClose={() => setInnerSeparationModal({ show: false, section: null })}
                            onSave={(updatedGroups) => {
                                setInnerGroups(updatedGroups);
                                setInnerSeparationModal({ show: false, section: null });
                            }}
                        />
                    )
                }
            </div >
        </div >
    );
}

// ---- Inner Separation Modal Component (Checkbox based) ----
function InnerSeparationModal({ section, allStudents, innerGroups, onClose, onSave }: {
    section: number,
    allStudents: Student[],
    innerGroups: Group[],
    onClose: () => void,
    onSave: (groups: Group[]) => void
}) {
    const [localGroups, setLocalGroups] = useState<Group[]>(
        innerGroups.filter(g => g.section === section)
    );
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set()); // Using name-gender key
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');

    const sectionStudents = allStudents.filter(s => s.section_number === section);

    // Helper to identify students uniquely (assuming name+gender is unique enough within a class, or fallback to index if needed)
    // Using name+gender since ID might be missing or inconsistent in referenced code
    const getStudentKey = (s: Student) => `${s.name}-${s.gender}`;

    const handleStudentToggle = (student: Student) => {
        const key = getStudentKey(student);

        // 이미 다른 그룹에 속해있는지 확인
        const existingGroup = localGroups.find(g => g.students.some(s => s.name === student.name && s.gender === student.gender));

        if (existingGroup) {
            // 이미 그룹에 속해 있으면 선택 불가 (UI에서 처리하지만 혹시 모를 로직 방어)
            return;
        }

        const newSelected = new Set(selectedStudents);
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        setSelectedStudents(newSelected);
    };

    const handleCreateGroup = () => {
        if (selectedStudents.size === 0) {
            alert('최소 한 명의 학생을 선택해주세요.');
            return;
        }

        if (selectedStudents.size === 1) {
            alert('그룹은 최소 2명 이상이어야 합니다.');
            return;
        }

        // 다음 그룹 번호 찾기 (그룹1, 그룹2...)
        const existingGroupNumbers = localGroups
            .map(g => {
                const match = g.name.match(/그룹(\d+)/);
                return match ? parseInt(match[1]) : 0;
            })
            .filter(n => n > 0);

        let nextGroupNumber = 1;
        while (existingGroupNumbers.includes(nextGroupNumber)) {
            nextGroupNumber++;
        }

        const groupName = `그룹${nextGroupNumber}`;

        const selectedStudentList = sectionStudents.filter(s => selectedStudents.has(getStudentKey(s)));

        const newGroup: Group = {
            id: `inner-${section}-${groupName}-${Date.now()}`,
            name: groupName,
            students: selectedStudentList,
            type: 'inner',
            section
        };

        setLocalGroups([...localGroups, newGroup]);
        setSelectedStudents(new Set());
    };

    const handleDeleteGroup = async (groupId: string) => {
        const confirmed = await customConfirm('이 그룹을 삭제하시겠습니까?');
        if (confirmed) {
            setLocalGroups(localGroups.filter(g => g.id !== groupId));
        }
    };

    const handleRenameGroup = (groupId: string) => {
        const group = localGroups.find(g => g.id === groupId);
        if (!group) return;

        setEditingGroupId(groupId);
        setEditingGroupName(group.name);
    };

    const handleSaveRename = () => {
        if (!editingGroupId || !editingGroupName.trim()) {
            setEditingGroupId(null);
            return;
        }

        // 중복 이름 체크
        if (localGroups.some(g => g.id !== editingGroupId && g.name === editingGroupName.trim())) {
            alert('이미 존재하는 그룹 이름입니다.');
            return;
        }

        setLocalGroups(localGroups.map(g =>
            g.id === editingGroupId
                ? { ...g, name: editingGroupName.trim() }
                : g
        ));
        setEditingGroupId(null);
        setEditingGroupName('');
    };

    const handleRemoveStudentFromGroup = (groupId: string, studentToRemove: Student) => {
        setLocalGroups(groups => groups.map(g => {
            if (g.id === groupId) {
                const updatedStudents = g.students.filter(s =>
                    !(s.name === studentToRemove.name && s.gender === studentToRemove.gender)
                );

                // 그룹에 학생이 1명 이하로 남으면 그룹 삭제? (기존 로직 따름)
                if (updatedStudents.length < 2) {
                    return null; // 필터링 대상
                }

                return { ...g, students: updatedStudents };
            }
            return g;
        }).filter(g => g !== null) as Group[]);
    };

    const handleSaveAndClose = () => {
        const otherGroups = innerGroups.filter(g => g.section !== section);
        onSave([...otherGroups, ...localGroups]);
    };

    const getGroupColorClass = (groupName: string) => {
        const match = groupName.match(/그룹(\d+)/);
        let colorIndex = 1;
        if (match) {
            const num = parseInt(match[1]);
            colorIndex = ((num - 1) % 10) + 1;
        } else {
            // 숫자가 없으면 해시 코드 등으로 색상 결정
            let hash = 0;
            for (let i = 0; i < groupName.length; i++) {
                hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
            }
            colorIndex = (Math.abs(hash) % 10) + 1;
        }

        // 색상 매핑 (SeparationModal css 클래스 매핑 대신 직접 스타일 반환)
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
            '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'
        ];
        return {
            bg: `${colors[colorIndex - 1]}20`, // 20% opacity
            text: colors[colorIndex - 1],
            border: colors[colorIndex - 1]
        };
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '2rem', backdropFilter: 'blur(5px)'
        }} onClick={onClose}>
            <div className="card" style={{
                width: '100%', maxWidth: '1200px', height: '85vh',
                padding: 0, display: 'flex', flexDirection: 'column',
                background: '#1e293b', borderRadius: '16px', border: '1px solid #475569',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div style={{
                    padding: '1.5rem 2rem', borderBottom: '1px solid #334155', background: '#0f172a',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>{section}반 내부 분리 설정</h2>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>
                            같은 반에 배정되면 안 되는 학생들을 그룹으로 묶어 관리하세요.
                        </p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '2rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
                </div>

                {/* 메인 영역 */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* 좌측: 생성된 그룹 목록 */}
                    <div style={{
                        flex: '1', padding: '2rem', overflowY: 'auto',
                        borderRight: '1px solid #334155', background: '#1e293b'
                    }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                            <span>생성된 그룹 ({localGroups.length})</span>
                        </h3>

                        {localGroups.length === 0 ? (
                            <div style={{
                                padding: '3rem 2rem', borderRadius: '12px', border: '2px dashed #475569',
                                textAlign: 'center', color: '#64748b'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
                                <p>아직 생성된 그룹이 없습니다.</p>
                                <p style={{ fontSize: '0.9rem' }}>오른쪽 목록에서 학생을 선택하여 그룹을 만들어보세요.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {localGroups.map(group => {
                                    const style = getGroupColorClass(group.name);
                                    return (
                                        <div key={group.id} style={{
                                            background: '#0f172a', padding: '1.25rem', borderRadius: '12px', border: '1px solid #334155'
                                        }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #1e293b'
                                            }}>
                                                {editingGroupId === group.id ? (
                                                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                                                        <input
                                                            type="text" className="form-input"
                                                            value={editingGroupName}
                                                            onChange={(e) => setEditingGroupName(e.target.value)}
                                                            style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSaveRename();
                                                                if (e.key === 'Escape') setEditingGroupId(null);
                                                            }}
                                                        />
                                                        <button className="btn btn-primary" onClick={handleSaveRename} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>저장</button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <span style={{
                                                                background: style.bg, color: style.text, border: `1px solid ${style.border}`,
                                                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600
                                                            }}>
                                                                {group.name}
                                                            </span>
                                                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{group.students.length}명</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                            <button onClick={() => handleRenameGroup(group.id)} style={{ padding: '0.4rem', borderRadius: '6px', color: '#94a3b8', border: 'none', background: 'transparent', cursor: 'pointer' }} title="이름 수정">✏️</button>
                                                            <button onClick={() => handleDeleteGroup(group.id)} style={{ padding: '0.4rem', borderRadius: '6px', color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer' }} title="삭제">🗑️</button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {group.students.map((student, idx) => (
                                                    <div key={idx} style={{
                                                        background: '#1e293b', color: '#f1f5f9', padding: '0.4rem 0.8rem',
                                                        borderRadius: '6px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem'
                                                    }}>
                                                        <span style={{ color: student.gender === 'M' ? '#60a5fa' : '#f472b6', fontWeight: 600 }}>{student.name}</span>
                                                        <button onClick={() => handleRemoveStudentFromGroup(group.id, student)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: 0, display: 'flex', alignItems: 'center' }}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 우측: 학생 선택 */}
                    <div style={{ width: '400px', padding: '2rem', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0' }}>학생 선택 ({selectedStudents.size}명)</h3>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>체크박스를 선택하여 새 분리 그룹을 생성하세요.</p>

                        <div style={{ flex: 1, overflowY: 'auto', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {sectionStudents.map((student, index) => {
                                    const assignedGroup = localGroups.find(g => g.students.some(s => s.name === student.name && s.gender === student.gender));
                                    const key = getStudentKey(student);
                                    const isSelected = selectedStudents.has(key);

                                    return (
                                        <label key={index} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                                            background: isSelected ? 'rgba(99, 102, 241, 0.1)' : (assignedGroup ? 'rgba(15, 23, 42, 0.5)' : '#0f172a'),
                                            borderRadius: '8px', cursor: assignedGroup ? 'not-allowed' : 'pointer',
                                            border: isSelected ? '1px solid #6366f1' : '1px solid transparent',
                                            opacity: assignedGroup ? 0.6 : 1, transition: 'all 0.2s'
                                        }}>
                                            <input type="checkbox" checked={isSelected} onChange={() => handleStudentToggle(student)} disabled={!!assignedGroup} style={{ cursor: assignedGroup ? 'not-allowed' : 'pointer' }} />
                                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.9rem', color: student.gender === 'M' ? '#60a5fa' : '#f472b6', fontWeight: 600 }}>{student.name}</span>
                                                {assignedGroup && <span style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '2px' }}>{assignedGroup.name}</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <button className="btn btn-primary" onClick={handleCreateGroup} disabled={selectedStudents.size < 2}
                                style={{ width: '100%', justifyContent: 'center', padding: '1rem', opacity: selectedStudents.size < 2 ? 0.5 : 1, cursor: selectedStudents.size < 2 ? 'not-allowed' : 'pointer', fontSize: '1.1rem' }}>
                                + 새 그룹 만들기
                            </button>
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={onClose}>취소</button>
                    <button className="btn btn-success" onClick={handleSaveAndClose} style={{ paddingLeft: '2rem', paddingRight: '2rem', background: '#10b981', color: 'white', border: 'none' }}>적용하기</button>
                </div>
            </div>
        </div>
    );
}

// ---- Sub Components ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GroupItem({ group, color, onRemoveStudent, onDeleteGroup, type }: any) {
    const { setNodeRef } = useDroppable({
        id: group.id,
        data: { groupId: group.id, type }
    });

    return (
        <div ref={setNodeRef} style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '0.5rem 0.8rem',
                background: `${color}15`,
                borderBottom: `2px solid ${color}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {group.name}
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                        ({group.students.length}명)
                    </span>
                </span>
                <button
                    onClick={onDeleteGroup}
                    style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                >×</button>
            </div>
            <div style={{ padding: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '60px', alignContent: 'start' }}>
                {group.students.length === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>드래그하세요</span>
                ) : (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    group.students.map((s: any, idx: number) => (
                        <div key={idx} style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            display: 'flex',
                            gap: '0.3rem',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>({s.section_number}반)</span>
                            <button
                                onClick={() => onRemoveStudent(group.id, s)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold', padding: 0 }}
                            >×</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function DraggableStudent({ student }: { student: Student }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `student-${student.section_number}-${student.name}-${Math.random()}`,
        data: { student }
    });

    const borderColor = student.gender === 'M' ? '#93c5fd' : '#f9a8d4';
    const nameColor = student.gender === 'M' ? '#1d4ed8' : '#be185d';

    return (
        <div ref={setNodeRef} {...listeners} {...attributes} style={{
            padding: '0.4rem 0.6rem',
            background: 'white',
            borderRadius: '6px',
            border: `1px solid ${borderColor}`,
            cursor: 'grab',
            opacity: isDragging ? 0.5 : 1,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                {student.section_number}반
            </span>
            <span style={{ fontWeight: 700, color: nameColor }}>
                {student.name}
            </span>
        </div>
    );
}

// 특별 관리 학생 3열 그리드 컴포넌트
function SpecialStudentsGrid({ allStudents }: { allStudents: Student[] }) {
    const categories = [
        { label: '문제행동 학생', icon: '⚠️', color: '#ef4444', students: allStudents.filter(s => s.is_problem_student) },
        { label: '특수교육 대상', icon: '🎯', color: '#8b5cf6', students: allStudents.filter(s => s.is_special_class) },
        { label: '학습 부진아', icon: '📚', color: '#f59e0b', students: allStudents.filter(s => s.is_underachiever) },
        { label: '전출예정', icon: '✈️', color: '#06b6d4', students: allStudents.filter(s => s.is_transferring_out) }
    ];

    return (
        <div className="stat-card" style={{
            padding: 0,
            flexDirection: 'column',
            alignItems: 'stretch',
            marginBottom: '2rem'
        }}>
            {/* 헤더 */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🎯 특별 관리 학생
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    반 배정 시 고려해야 할 학생들 (분산 배치 필요)
                </p>
            </div>

            {/* 4열 그리드 */}
            <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                {categories.map((category, catIdx) => (
                    <div key={catIdx} style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        overflow: 'hidden'
                    }}>
                        {/* 카테고리 헤더 - GroupItem 스타일 */}
                        <div style={{
                            padding: '0.5rem 0.8rem',
                            background: `${category.color}15`,
                            borderBottom: `2px solid ${category.color}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1rem' }}>{category.icon}</span>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                    {category.label}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                                {category.students.length}명
                            </span>
                        </div>

                        {/* 학생 목록 - GroupItem 스타일 */}
                        <div style={{ padding: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '80px', alignContent: 'start' }}>
                            {category.students.length === 0 ? (
                                <div style={{
                                    width: '100%',
                                    textAlign: 'center',
                                    padding: '1.5rem 0.5rem',
                                    color: 'var(--text-secondary)'
                                }}>
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.3 }}>{category.icon}</div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', fontStyle: 'italic' }}>없음</p>
                                </div>
                            ) : (
                                category.students.map((student, idx) => (
                                    <div key={idx} style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        gap: '0.3rem',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-secondary)',
                                            padding: '0.1rem 0.3rem',
                                            borderRadius: '3px'
                                        }}>
                                            {student.section_number}반
                                        </span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {student.name}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// 동명이인 관리 컴포넌트
function DuplicateNamesCard({ allStudents }: { allStudents: Student[] }) {
    // 완전 동명이인 찾기 (성+이름 모두 같음)
    const exactDuplicates = new Map<string, Student[]>();
    allStudents.forEach(student => {
        const fullName = student.name;
        if (!exactDuplicates.has(fullName)) {
            exactDuplicates.set(fullName, []);
        }
        exactDuplicates.get(fullName)!.push(student);
    });

    // 2명 이상인 경우만 필터링
    const exactDuplicateGroups = Array.from(exactDuplicates.entries())
        .filter(([_, students]) => students.length >= 2)
        .map(([name, students]) => ({ name, students }));

    // 이름만 같은 학생 찾기 (성 제외)
    const givenNameDuplicates = new Map<string, Student[]>();
    allStudents.forEach(student => {
        // 한글 이름에서 성 제외 (첫 글자 제외)
        const givenName = student.name.length > 1 ? student.name.substring(1) : student.name;
        if (givenName.length > 0) {
            if (!givenNameDuplicates.has(givenName)) {
                givenNameDuplicates.set(givenName, []);
            }
            givenNameDuplicates.get(givenName)!.push(student);
        }
    });

    // 2명 이상이면서 완전 동명이인이 아닌 경우만 필터링
    const givenNameDuplicateGroups = Array.from(givenNameDuplicates.entries())
        .filter(([_, students]) => {
            if (students.length < 2) return false;
            // 모두 같은 full name이면 제외 (이미 exactDuplicates에 포함됨)
            const uniqueFullNames = new Set(students.map(s => s.name));
            return uniqueFullNames.size > 1;
        })
        .map(([givenName, students]) => ({ givenName, students }));

    const totalExact = exactDuplicateGroups.reduce((sum, g) => sum + g.students.length, 0);
    const totalGivenName = givenNameDuplicateGroups.reduce((sum, g) => sum + g.students.length, 0);

    return (
        <div className="stat-card" style={{
            padding: 0,
            flexDirection: 'column',
            alignItems: 'stretch'
        }}>
            {/* 헤더 */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    👥 동명이인
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    이름이 중복되는 학생 관리
                </p>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* 완전 동명이인 */}
                <div>
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        borderLeft: '3px solid #ef4444',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem' }}>🔴</span>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>완전 동명이인</h3>
                        </div>
                        <span style={{
                            background: '#ef4444',
                            color: 'white',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: '600'
                        }}>
                            {exactDuplicateGroups.length}그룹 · {totalExact}명
                        </span>
                    </div>

                    {exactDuplicateGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                            없음
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {exactDuplicateGroups.map((group, idx) => (
                                <div key={idx} style={{
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0'
                                }}>
                                    <span style={{
                                        color: '#ef4444',
                                        fontWeight: 600,
                                        minWidth: '3rem'
                                    }}>
                                        • {group.name}
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                        ({group.students.length}명)
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1 }}>
                                        {group.students.map((s, sIdx) => (
                                            <span key={sIdx} style={{
                                                fontSize: '0.7rem',
                                                background: 'var(--bg-secondary)',
                                                padding: '0.15rem 0.4rem',
                                                borderRadius: '3px',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                {s.section_number}반
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 이름만 같음 */}
                <div>
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(245, 158, 11, 0.1)',
                        borderRadius: '6px',
                        borderLeft: '3px solid #f59e0b',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem' }}>🟡</span>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>이름만 같음</h3>
                        </div>
                        <span style={{
                            background: '#f59e0b',
                            color: 'white',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: '600'
                        }}>
                            {givenNameDuplicateGroups.length}그룹 · {totalGivenName}명
                        </span>
                    </div>

                    {givenNameDuplicateGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                            없음
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {givenNameDuplicateGroups.map((group, idx) => (
                                <div key={idx} style={{
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0'
                                }}>
                                    <span style={{
                                        color: '#f59e0b',
                                        fontWeight: 600,
                                        minWidth: '3rem'
                                    }}>
                                        • &quot;{group.givenName}&quot;
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                        ({group.students.length}명)
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1 }}>
                                        {group.students.map((s, sIdx) => (
                                            <span key={sIdx} style={{
                                                fontSize: '0.7rem',
                                                background: 'var(--bg-secondary)',
                                                padding: '0.15rem 0.4rem',
                                                borderRadius: '3px',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                {s.section_number}반 {s.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---- Outer Group Creation Modal Component ----
function OuterGroupCreationModal({ type = 'outer', allStudents, existingGroupNames, onClose, onCreate }: {
    type?: 'outer' | 'sameClass',
    allStudents: Student[],
    existingGroupNames: string[],
    onClose: () => void,
    onCreate: (groupName: string, selectedStudents: Student[]) => void
}) {
    const [groupName, setGroupName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 검색어가 있을 때만 학생 목록 표시
    const filteredStudents = searchTerm
        ? allStudents.filter(s => s.name.includes(searchTerm))
        : [];

    const handleToggleStudent = (student: Student) => {
        const id = `${student.section_number}-${student.name}`;
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleCreate = () => {
        if (!groupName.trim()) {
            alert('그룹 이름을 입력하세요.');
            return;
        }

        if (existingGroupNames.includes(groupName.trim())) {
            alert('이미 존재하는 그룹 이름입니다.');
            return;
        }

        const selectedStudents = allStudents.filter(s =>
            selectedIds.has(`${s.section_number}-${s.name}`)
        );

        onCreate(groupName.trim(), selectedStudents);
        onClose();
    };

    const selectedStudents = allStudents.filter(s =>
        selectedIds.has(`${s.section_number}-${s.name}`)
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '2rem',
            backdropFilter: 'blur(5px)'
        }} onClick={onClose}>
            <div className="card" style={{
                width: '600px',
                maxHeight: '85vh',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                background: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #475569',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }} onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid #334155',
                    background: '#0f172a'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>
                            {type === 'outer' ? '⚡ 반 외부 그룹 생성' : '🤝 같은 반 배정 그룹 생성'}
                        </h2>
                        <button onClick={onClose} style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '2rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '0.5rem',
                            lineHeight: 1
                        }}>×</button>
                    </div>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>
                        {type === 'outer'
                            ? '서로 다른 반에 배정되어야 하는 학생들을 지정하세요.'
                            : '같은 반에 배정되어야 하는 학생들을 지정하세요.'}
                    </p>
                </div>

                {/* 그룹명 입력 */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid #334155'
                }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                        📝 그룹명
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="예: 친한친구모임, 동네친구모임 등"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        autoFocus
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                    />
                </div>

                {/* 학생 검색 */}
                <div style={{
                    padding: '1.5rem 2rem 0 2rem'
                }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                        🔍 학생 검색
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="학생 이름으로 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                    />
                </div>

                {/* 학생 목록 */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1.5rem 2rem',
                    background: '#0f172a'
                }}>
                    {filteredStudents.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem 1rem',
                            color: '#64748b'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                            <p style={{ margin: 0, fontSize: '1rem' }}>
                                {searchTerm ? '검색 결과가 없습니다.' : '학생 이름을 검색하세요.'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            {filteredStudents.map((student, index) => {
                                const id = `${student.section_number}-${student.name}`;
                                const isSelected = selectedIds.has(id);

                                return (
                                    <label
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem',
                                            background: isSelected ? 'rgba(99, 102, 241, 0.1)' : '#1e293b',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            border: isSelected ? '1px solid #6366f1' : '1px solid #334155',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleStudent(student)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                [{student.section_number}반]
                                            </span>
                                            <span style={{
                                                fontSize: '0.9rem',
                                                color: student.gender === 'M' ? '#60a5fa' : '#f472b6',
                                                fontWeight: 600
                                            }}>
                                                {student.name}
                                            </span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 선택된 학생 미리보기 */}
                {selectedStudents.length > 0 && (
                    <div style={{
                        padding: '1.5rem 2rem',
                        borderTop: '1px solid #334155',
                        background: '#0f172a'
                    }}>
                        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                            선택된 학생 ({selectedStudents.length}명)
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {selectedStudents.map((student, index) => (
                                <div
                                    key={index}
                                    style={{
                                        background: '#1e293b',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '6px',
                                        border: '1px solid #334155',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <span style={{ color: '#94a3b8' }}>[{student.section_number}반]</span>
                                    <span style={{
                                        color: student.gender === 'M' ? '#60a5fa' : '#f472b6',
                                        fontWeight: 600
                                    }}>
                                        {student.name}
                                    </span>
                                    <button
                                        onClick={() => handleToggleStudent(student)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#94a3b8',
                                            fontSize: '1rem',
                                            padding: 0,
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 하단 버튼 */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderTop: '1px solid #334155',
                    background: '#0f172a',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1rem'
                }}>
                    <button className="btn btn-secondary" onClick={onClose}>취소</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreate}
                        style={{ paddingLeft: '2rem', paddingRight: '2rem' }}
                    >
                        생성{selectedStudents.length > 0 && ` (${selectedStudents.length}명)`}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ConditionsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><span className="loading loading-spinner loading-lg"></span></div>}>
            <ConditionsPageContent />
        </Suspense>
    );
}
