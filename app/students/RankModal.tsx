'use client';

import { useState, useEffect } from 'react';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
} from '@dnd-kit/core';

interface Student {
    id?: number;
    name: string;
    gender: 'M' | 'F';
    birth_date?: string;
    contact?: string;
    notes?: string;
    is_problem_student: boolean;
    is_special_class: boolean;
    is_underachiever: boolean;
    is_transferring_out: boolean;
    group_name: string;
    rank: number | null;
    previous_section?: number | null;
}

interface RankModalProps {
    students: Student[];
    onClose: () => void;
    onSave: (updatedStudents: Student[]) => void;
}

interface RankSlot {
    rank: number;
    student: Student | null;
}

export default function RankModal({ students, onClose, onSave }: RankModalProps) {
    const [maleSlots, setMaleSlots] = useState<RankSlot[]>([]);
    const [femaleSlots, setFemaleSlots] = useState<RankSlot[]>([]);
    const [unassignedMales, setUnassignedMales] = useState<Student[]>([]);
    const [unassignedFemales, setUnassignedFemales] = useState<Student[]>([]);
    const [activeStudent, setActiveStudent] = useState<Student | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // 적절한 거리로 조정
            },
        })
    );

    useEffect(() => {
        // 남/여학생 분리
        const males = students.filter(s => s.gender === 'M');
        const females = students.filter(s => s.gender === 'F');

        // 석차 슬롯 초기화
        const maleCount = males.length;
        const femaleCount = females.length;

        const initialMaleSlots: RankSlot[] = Array.from({ length: maleCount }, (_, i) => ({
            rank: i + 1,
            student: males.find(s => s.rank === i + 1) || null,
        }));

        const initialFemaleSlots: RankSlot[] = Array.from({ length: femaleCount }, (_, i) => ({
            rank: i + 1,
            student: females.find(s => s.rank === i + 1) || null,
        }));

        setMaleSlots(initialMaleSlots);
        setFemaleSlots(initialFemaleSlots);

        // 미지정 학생
        setUnassignedMales(males.filter(s => !s.rank));
        setUnassignedFemales(females.filter(s => !s.rank));
    }, [students]);

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const studentData = active.data.current?.student as Student;
        setActiveStudent(studentData);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveStudent(null);

        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        if (!activeData || !overData) return;

        const student = activeData.student as Student;
        const targetRank = overData.rank as number;
        const targetGender = overData.gender as 'M' | 'F';
        const sourceFrom = activeData.from as string; // 'unassigned', 'slot-M', 'slot-F'

        // student가 undefined인 경우 처리
        if (!student || !student.gender) {
            console.error('Invalid student data:', student);
            return;
        }

        // 성별이 다르면 이동 불가
        if (student.gender !== targetGender) {
            alert('같은 성별 영역에만 배치할 수 있습니다.');
            return;
        }

        const isMale = student.gender === 'M';
        const currentSlots = isMale ? [...maleSlots] : [...femaleSlots];
        const setSlots = isMale ? setMaleSlots : setFemaleSlots;
        const unassigned = isMale ? [...unassignedMales] : [...unassignedFemales];
        const setUnassigned = isMale ? setUnassignedMales : setUnassignedFemales;

        const targetSlotIndex = currentSlots.findIndex(s => s.rank === targetRank);
        if (targetSlotIndex === -1) return;

        const targetSlot = currentSlots[targetSlotIndex];
        const existingStudent = targetSlot.student;

        // 1. 타겟 슬롯에 이미 학생이 있는 경우 (교체 또는 밀어내기)
        if (existingStudent) {
            // 소스가 '석차 슬롯'인 경우 -> 교체 (Swap)
            if (sourceFrom.startsWith('slot-')) {
                const sourceSlotIndex = currentSlots.findIndex(s => s.student?.name === student.name);
                if (sourceSlotIndex !== -1) {
                    // Swap: 타겟 학생을 소스 슬롯으로 이동
                    currentSlots[sourceSlotIndex].student = existingStudent;

                    // 타겟 슬롯에 새 학생 배치
                    currentSlots[targetSlotIndex].student = student;

                    setSlots(currentSlots);
                    return; // 종료
                }
            }
            // 소스가 '미지정'인 경우 -> 기존 학생을 미지정으로 이동 (기존 로직 유지)
            else {
                setUnassigned([...unassigned, existingStudent]);
            }
        }

        // 2. 일반적인 이동 (빈 슬롯으로 이동하거나, 미지정에서 덮어쓰기)

        // 새 학생 배치
        currentSlots[targetSlotIndex].student = student;

        // 기존 위치에서 제거
        if (sourceFrom === 'unassigned') {
            // 이름으로 비교 (id가 없을 수 있음)
            setUnassigned(unassigned.filter(s => s.name !== student.name));
        } else {
            // 다른 슬롯에서 왔는데, 1번(Swap) 케이스에 걸리지 않은 경우 (즉, 타겟이 비어있었던 경우)
            const oldSlotIndex = currentSlots.findIndex(s => s.student?.name === student.name && s.rank !== targetRank);
            if (oldSlotIndex !== -1) {
                currentSlots[oldSlotIndex].student = null;
            }
        }

        setSlots(currentSlots);
    };

    const handleSave = () => {
        // 모든 학생의 rank 업데이트
        const updatedStudents = students.map(student => {
            if (student.gender === 'M') {
                const slot = maleSlots.find(s => s.student === student);
                return { ...student, rank: slot ? slot.rank : null };
            } else {
                const slot = femaleSlots.find(s => s.student === student);
                return { ...student, rank: slot ? slot.rank : null };
            }
        });

        onSave(updatedStudents);
        onClose();
    };

    // 나머지 미지정 학생을 빈 슬롯에 임의 배정
    const handleRandomAssign = (gender: 'M' | 'F') => {
        const currentSlots = gender === 'M' ? [...maleSlots] : [...femaleSlots];
        const setSlots = gender === 'M' ? setMaleSlots : setFemaleSlots;
        const unassigned = gender === 'M' ? [...unassignedMales] : [...unassignedFemales];
        const setUnassigned = gender === 'M' ? setUnassignedMales : setUnassignedFemales;

        // 빈 슬롯 찾기
        const emptySlotIndices = currentSlots
            .map((slot, idx) => slot.student === null ? idx : -1)
            .filter(idx => idx !== -1);

        // 미지정 학생 섯플
        const shuffled = [...unassigned].sort(() => Math.random() - 0.5);

        // 배정
        const assignCount = Math.min(emptySlotIndices.length, shuffled.length);
        for (let i = 0; i < assignCount; i++) {
            currentSlots[emptySlotIndices[i]].student = shuffled[i];
        }

        setSlots(currentSlots);
        setUnassigned(shuffled.slice(assignCount)); // 배정된 학생 제외
    };

    // 석차 슬롯에서 학생을 미지정으로 되돌리기
    const handleUnassign = (student: Student, gender: 'M' | 'F') => {
        const currentSlots = gender === 'M' ? [...maleSlots] : [...femaleSlots];
        const setSlots = gender === 'M' ? setMaleSlots : setFemaleSlots;
        const unassigned = gender === 'M' ? [...unassignedMales] : [...unassignedFemales];
        const setUnassigned = gender === 'M' ? setUnassignedMales : setUnassignedFemales;

        // 슬롯에서 제거
        const slotIndex = currentSlots.findIndex(s => s.student?.name === student.name);
        if (slotIndex !== -1) {
            currentSlots[slotIndex].student = null;
            setSlots(currentSlots);
            setUnassigned([...unassigned, student]);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '2rem'
        }}
            onClick={onClose}>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div style={{
                    background: 'white',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '1200px',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    padding: '2rem'
                }}
                    onClick={(e) => e.stopPropagation()}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1.5rem'
                    }}>
                        <h2 style={{
                            margin: 0,
                            color: '#1a1a2e',
                            fontSize: '1.5rem',
                            fontWeight: 700
                        }}>학생 석차 지정</h2>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                padding: '0.5rem',
                                color: '#666'
                            }}
                        >
                            ×
                        </button>
                    </div>

                    {/* 미지정 학생 영역 - 남/여 분리 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1rem',
                        marginBottom: '1.5rem'
                    }}>
                        {/* 미지정 남학생 */}
                        <div style={{
                            background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                            padding: '1rem',
                            borderRadius: '8px',
                            border: '2px solid #007bff'
                        }}>
                            <h3 style={{
                                marginTop: 0,
                                fontSize: '1rem',
                                color: '#007bff',
                                fontWeight: 600,
                                marginBottom: '0.75rem'
                            }}>
                                미지정 남학생 ({unassignedMales.length}명)
                            </h3>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {unassignedMales.length === 0 && (
                                    <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>모든 남학생이 배치되었습니다</p>
                                )}
                                {unassignedMales.map((student, index) => (
                                    <StudentCard
                                        key={`unassigned-m-${index}`}
                                        student={student}
                                        from="unassigned"
                                    />
                                ))}
                            </div>
                        </div>

                        {/* 미지정 여학생 */}
                        <div style={{
                            background: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
                            padding: '1rem',
                            borderRadius: '8px',
                            border: '2px solid #e91e63'
                        }}>
                            <h3 style={{
                                marginTop: 0,
                                fontSize: '1rem',
                                color: '#e91e63',
                                fontWeight: 600,
                                marginBottom: '0.75rem'
                            }}>
                                미지정 여학생 ({unassignedFemales.length}명)
                            </h3>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {unassignedFemales.length === 0 && (
                                    <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>모든 여학생이 배치되었습니다</p>
                                )}
                                {unassignedFemales.map((student, index) => (
                                    <StudentCard
                                        key={`unassigned-f-${index}`}
                                        student={student}
                                        from="unassigned"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 남/여학생 석차 영역 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '2rem'
                    }}>
                        {/* 남학생 */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h3 style={{ margin: 0, color: '#007bff' }}>남학생 석차</h3>
                                <button
                                    onClick={() => handleRandomAssign('M')}
                                    disabled={unassignedMales.length === 0}
                                    style={{
                                        background: unassignedMales.length === 0 ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        cursor: unassignedMales.length === 0 ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    🎲 나머지 임의 배정
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {maleSlots.map((slot) => (
                                    <RankSlotComponent
                                        key={`male-${slot.rank}`}
                                        rank={slot.rank}
                                        student={slot.student}
                                        gender="M"
                                        onUnassign={handleUnassign}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* 여학생 */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h3 style={{ margin: 0, color: '#e91e63' }}>여학생 석차</h3>
                                <button
                                    onClick={() => handleRandomAssign('F')}
                                    disabled={unassignedFemales.length === 0}
                                    style={{
                                        background: unassignedFemales.length === 0 ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        cursor: unassignedFemales.length === 0 ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    🎲 나머지 임의 배정
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {femaleSlots.map((slot) => (
                                    <RankSlotComponent
                                        key={`female-${slot.rank}`}
                                        rank={slot.rank}
                                        student={slot.student}
                                        gender="F"
                                        onUnassign={handleUnassign}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 저장 버튼 */}
                    <div style={{
                        marginTop: '2rem',
                        display: 'flex',
                        gap: '1rem',
                        justifyContent: 'flex-end'
                    }}>
                        <button
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            취소
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                        >
                            적용
                        </button>
                    </div>
                </div>

                <DragOverlay>
                    {activeStudent ? (
                        <div style={{
                            background: '#007bff',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            cursor: 'grabbing',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                            {activeStudent.name}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
}

// 학생 카드 컴포넌트
function StudentCard({ student, from }: { student: Student; from: string }) {
    console.log('StudentCard Props:', { studentName: student?.name, from }); // 디버깅

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `draggable-${from}-${student.name}`,
        data: {
            student: student,
            from: from
        },
    });

    const isMale = student.gender === 'M';

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={{
                background: isMale ? '#e3f2fd' : '#fce4ec',
                color: isMale ? '#007bff' : '#e91e63',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isDragging ? 0.5 : 1,
                fontWeight: 600,
                fontSize: '0.95rem',
                border: `2px solid ${isMale ? '#007bff' : '#e91e63'}`,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none'
            }}
        >
            {student.name}
        </div>
    );
}

// 석차 슬롯 컴포넌트
function RankSlotComponent({ rank, student, gender, onUnassign }: {
    rank: number;
    student: Student | null;
    gender: 'M' | 'F';
    onUnassign: (student: Student, gender: 'M' | 'F') => void;
}) {
    const { setNodeRef } = useDroppable({
        id: `slot-${gender}-${rank}`,
        data: { rank, gender },
    });

    return (
        <div
            ref={setNodeRef}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '2px dashed #ddd',
                borderRadius: '8px',
                background: student ? (gender === 'M' ? '#e3f2fd' : '#fce4ec') : 'white',
                minHeight: '50px'
            }}
        >
            <span style={{ fontWeight: 'bold', color: '#666', minWidth: '40px' }}>
                {rank}등:
            </span>
            {student ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <StudentCard student={student} from={`slot-${gender}`} />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnassign(student, gender);
                        }}
                        style={{
                            background: 'rgba(220, 53, 69, 0.1)',
                            border: '1px solid #dc3545',
                            color: '#dc3545',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            padding: 0,
                            flexShrink: 0
                        }}
                        title="미지정으로 되돌리기"
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <span style={{ color: '#999', fontStyle: 'italic' }}>드래그하여 배치</span>
            )}
        </div>
    );
}
