'use client';

import { useState, useEffect } from 'react';
import { customConfirm } from '@/components/GlobalAlert';

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

interface Group {
    id: string;
    name: string;
    students: Student[];
}

interface SeparationModalProps {
    students: Student[];
    currentSection?: number; // 현재 선택된 반 번호
    onClose: () => void;
    onSave: (updatedStudents: Student[]) => void;
}

export default function SeparationModal({ students, currentSection, onClose, onSave }: SeparationModalProps) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');

    useEffect(() => {
        // 기존 그룹 로드 (group_name 기준)
        const groupMap = new Map<string, Student[]>();

        students.forEach((student, index) => {
            if (student.group_name && student.group_name.trim()) {
                if (!groupMap.has(student.group_name)) {
                    groupMap.set(student.group_name, []);
                }
                const groupStudents = groupMap.get(student.group_name)!;
                // Add student with their original index to track selection correctly
                groupStudents.push({ ...student, id: student.id || index });
            }
        });

        const loadedGroups: Group[] = Array.from(groupMap.entries()).map(([name, groupStudents], index) => ({
            id: `group-${index}`,
            name,
            students: groupStudents,
        }));

        setGroups(loadedGroups);
    }, [students]);

    const handleStudentToggle = (index: number) => {
        // 학생이 이미 다른 그룹에 속해있어도 선택 가능 (한 학생이 여러 그룹에 속할 수 있음)
        const newSelected = new Set(selectedStudents);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
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

        // 다음 그룹 번호 찾기
        const existingGroupNumbers = groups
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

        const selectedStudentList = Array.from(selectedStudents)
            .map(index => students[index])
            .filter(s => s);

        const newGroup: Group = {
            id: `group-${Date.now()}`,
            name: groupName,
            students: selectedStudentList,
        };

        setGroups([...groups, newGroup]);
        setSelectedStudents(new Set());
    };

    const handleDeleteGroup = async (groupId: string) => {
        const confirmed = await customConfirm('이 그룹을 삭제하시겠습니까?');
        if (confirmed) {
            setGroups(groups.filter(g => g.id !== groupId));
        }
    };

    const handleRenameGroup = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        setEditingGroupId(groupId);
        setEditingGroupName(group.name);
    };

    const handleSaveRename = () => {
        if (!editingGroupId || !editingGroupName.trim()) {
            setEditingGroupId(null);
            return;
        }

        setGroups(groups.map(g =>
            g.id === editingGroupId
                ? { ...g, name: editingGroupName.trim() }
                : g
        ));
        setEditingGroupId(null);
        setEditingGroupName('');
    };

    const handleRemoveStudentFromGroup = (groupId: string, studentToRemove: Student) => {
        setGroups(groups.map(g => {
            if (g.id === groupId) {
                const updatedStudents = g.students.filter(s =>
                    !(s.name === studentToRemove.name && s.gender === studentToRemove.gender)
                );

                // 그룹에 학생이 1명 이하로 남으면 그룹 삭제
                if (updatedStudents.length < 2) {
                    return null;
                }

                return { ...g, students: updatedStudents };
            }
            return g;
        }).filter(g => g !== null) as Group[]);
    };

    const handleSave = () => {
        // 학생 데이터 업데이트
        const updatedStudents = students.map(student => {
            // 모든 그룹에서 이 학생을 찾아서 그룹명 할당
            const group = groups.find(g => g.students.some(s => s.name === student.name && s.gender === student.gender));

            // currentSection이 있으면 SEP:N반-그룹명 형식으로 저장
            let groupName = '';
            if (group) {
                if (currentSection) {
                    // section_number를 포함한 형식으로 저장
                    groupName = `SEP:${currentSection}반-${group.name}`;
                } else {
                    // 기존 형식 (section 정보가 없는 경우 - 외부 분리로 처리)
                    groupName = `SEP:${group.name}`;
                }
            }

            return {
                ...student,
                group_name: groupName,
            };
        });

        onSave(updatedStudents);
        onClose();
    };

    // Helper to get group color class
    const getGroupColorClass = (groupName: string) => {
        const match = groupName.match(/그룹(\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            const colorIndex = ((num - 1) % 10) + 1;
            return `group-color-${colorIndex}`;
        }
        return 'group-color-1'; // Default
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '2rem',
            backdropFilter: 'blur(5px)'
        }}
            onClick={onClose}>
            <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '1200px',
                height: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid #475569'
            }}
                onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#0f172a'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.5rem' }}>🔗 분리 대상 설정</h2>
                        <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                            같은 반에 배정되면 안 되는 학생들을 그룹으로 묶어 관리하세요.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '2rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '0.5rem',
                            lineHeight: 1
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div style={{
                    display: 'flex',
                    flex: 1,
                    overflow: 'hidden'
                }}>
                    {/* Left Panel: Groups List */}
                    <div style={{
                        flex: '1',
                        padding: '2rem',
                        overflowY: 'auto',
                        borderRight: '1px solid #334155',
                        background: '#1e293b'
                    }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>생성된 그룹 ({groups.length})</span>
                        </h3>

                        {groups.length === 0 ? (
                            <div style={{
                                padding: '3rem 2rem',
                                borderRadius: '12px',
                                border: '2px dashed #475569',
                                textAlign: 'center',
                                color: '#64748b'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
                                <p>아직 생성된 그룹이 없습니다.</p>
                                <p style={{ fontSize: '0.9rem' }}>오른쪽 목록에서 학생을 선택하여 그룹을 만들어보세요.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {groups.map(group => (
                                    <div key={group.id} style={{
                                        background: '#0f172a',
                                        padding: '1.25rem',
                                        borderRadius: '12px',
                                        border: '1px solid #334155'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '1rem',
                                            paddingBottom: '0.75rem',
                                            borderBottom: '1px solid #1e293b'
                                        }}>
                                            {editingGroupId === group.id ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={editingGroupName}
                                                        onChange={(e) => setEditingGroupName(e.target.value)}
                                                        style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveRename();
                                                            if (e.key === 'Escape') setEditingGroupId(null);
                                                        }}
                                                    />
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={handleSaveRename}
                                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                                    >
                                                        저장
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <span className={`badge-group ${getGroupColorClass(group.name)}`}>
                                                            {group.name}
                                                        </span>
                                                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                                            {group.students.length}명
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            onClick={() => handleRenameGroup(group.id)}
                                                            className="btn-secondary"
                                                            style={{
                                                                padding: '0.4rem',
                                                                borderRadius: '6px',
                                                                color: '#94a3b8',
                                                                border: 'none',
                                                                background: 'transparent'
                                                            }}
                                                            title="그룹명 수정"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteGroup(group.id)}
                                                            className="btn-secondary"
                                                            style={{
                                                                padding: '0.4rem',
                                                                borderRadius: '6px',
                                                                color: '#ef4444',
                                                                border: 'none',
                                                                background: 'transparent'
                                                            }}
                                                            title="그룹 삭제"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {group.students.map((student, index) => (
                                                <div
                                                    key={index}
                                                    style={{
                                                        background: '#1e293b',
                                                        color: '#f1f5f9',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #334155',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        fontSize: '0.9rem'
                                                    }}
                                                >
                                                    <span style={{
                                                        color: student.gender === 'M' ? '#60a5fa' : '#f472b6',
                                                        fontWeight: 600
                                                    }}>
                                                        {student.name}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveStudentFromGroup(group.id, student)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: '#94a3b8',
                                                            fontSize: '1rem',
                                                            padding: 0,
                                                            marginLeft: '0.25rem',
                                                            display: 'flex',
                                                            alignItems: 'center'
                                                        }}
                                                        title="그룹에서 제거"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Student Selection */}
                    <div style={{
                        width: '400px',
                        padding: '2rem',
                        background: '#0f172a',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0' }}>
                            학생 선택 ({selectedStudents.size}명)
                        </h3>

                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                체크박스를 선택하여 새 분리 그룹을 생성하세요.
                            </p>
                        </div>

                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            background: '#1e293b',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                            padding: '1rem'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {students.map((student, index) => {
                                    // Check if student belongs to any group
                                    const assignedGroup = groups.find(g =>
                                        g.students.some(s => s.name === student.name && s.gender === student.gender)
                                    );

                                    return (
                                        <label
                                            key={index}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.75rem',
                                                background: selectedStudents.has(index)
                                                    ? 'rgba(99, 102, 241, 0.1)'
                                                    : '#0f172a',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                border: selectedStudents.has(index)
                                                    ? '1px solid #6366f1'
                                                    : '1px solid transparent',
                                                transition: 'all 0.2s',
                                                position: 'relative'
                                            }}
                                            title={assignedGroup ? `현재 ${assignedGroup.name}에 포함 (다른 그룹에도 추가 가능)` : ''}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedStudents.has(index)}
                                                onChange={() => handleStudentToggle(index)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{
                                                    fontSize: '0.9rem',
                                                    color: student.gender === 'M' ? '#60a5fa' : '#f472b6',
                                                    fontWeight: 600
                                                }}>
                                                    {student.name}
                                                </span>
                                                {assignedGroup && (
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: '#fbbf24',
                                                        marginTop: '2px'
                                                    }}>
                                                        {assignedGroup.name}
                                                    </span>
                                                )}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateGroup}
                                disabled={selectedStudents.size < 2}
                                style={{
                                    width: '100%',
                                    justifyContent: 'center',
                                    padding: '1rem',
                                    opacity: selectedStudents.size < 2 ? 0.5 : 1,
                                    cursor: selectedStudents.size < 2 ? 'not-allowed' : 'pointer',
                                    fontSize: '1.1rem'
                                }}
                            >
                                + 새 그룹 만들기
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderTop: '1px solid #334155',
                    background: '#0f172a',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1rem'
                }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                    >
                        취소
                    </button>
                    <button
                        className="btn btn-success"
                        onClick={handleSave}
                        style={{ paddingLeft: '2rem', paddingRight: '2rem' }}
                    >
                        적용하기
                    </button>
                </div>
            </div>
        </div>
    );
}
