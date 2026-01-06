'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import RankModal from './RankModal';
import SeparationModal from './SeparationModal';
import * as XLSX from 'xlsx';
import { customConfirm } from '@/components/GlobalAlert';

export interface Student {
    id?: number;
    student_number: number | null;
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

interface ClassData {
    id: number;
    grade: number;
    section_count: number;
    section_statuses?: string;
    is_distributed?: number;
    parent_class_id?: number;
    child_class_id?: number;
    new_section_count?: number;  // 분반 개수 (조건설정에서 설정한 값)
}

const getGroupColorClass = (groupName: string) => {
    if (!groupName) return '';
    const match = groupName.match(/그룹(\d+)/);
    if (match) {
        const num = parseInt(match[1]);
        const colorIndex = ((num - 1) % 10) + 1;
        return `group-color-${colorIndex}`;
    }
    return '';
};

// SEP: 접두사를 제거하고 표시용 그룹명 반환
const getDisplayGroupName = (groupName: string) => {
    if (!groupName) return '';
    // SEP:N반-그룹명 형식에서 그룹명만 추출
    if (groupName.startsWith('SEP:')) {
        const parts = groupName.replace('SEP:', '').split('-');
        if (parts.length >= 2) {
            return parts.slice(1).join('-'); // N반 부분 제외하고 그룹명만
        }
        return parts[0]; // 그룹명만 있는 경우
    }
    return groupName;
};

export default function StudentsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const classId = searchParams.get('classId');
    const currentSection = parseInt(searchParams.get('section') || '1');

    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [classData, setClassData] = useState<ClassData | null>(null);
    const [parentClassData, setParentClassData] = useState<ClassData | null>(null);
    const [childClassData, setChildClassData] = useState<ClassData | null>(null);
    const [isPasting, setIsPasting] = useState(false);
    const [showDistributeModal, setShowDistributeModal] = useState(false);
    const [newSectionCount, setNewSectionCount] = useState<number>(2);
    const [showRankModal, setShowRankModal] = useState(false);
    const [showSeparationModal, setShowSeparationModal] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'complete' | 'unmark'>('complete');
    const [showTempSaveModal, setShowTempSaveModal] = useState(false);

    // localStorage 키 생성
    const getTempSaveKey = () => `temp_students_${classId}_${currentSection}`;

    useEffect(() => {
        if (!classId) return;
        loadClassData();
    }, [classId]);



    // 섹션 변경 시 상태 재확인 (classData가 이미 로드된 경우)
    useEffect(() => {
        if (classData && currentSection) {
            try {
                const statuses = JSON.parse(classData.section_statuses || '{}');
                setIsCompleted(statuses[currentSection] === 'completed');
            } catch (e) {
                setIsCompleted(false);
            }
        }
    }, [currentSection, classData]);

    const loadClassData = async () => {
        try {
            const response = await fetch(`/api/classes/${classId}?t=${Date.now()}`);
            const data = await response.json();

            try {
                const statuses = JSON.parse(data.section_statuses || '{}');
                setIsCompleted(statuses[currentSection] === 'completed');
            } catch (e) {
                setIsCompleted(false);
            }

            setClassData(data);

            // 조건설정에서 저장한 new_section_count가 있으면 분배 개수 초기화
            if (data.new_section_count && data.new_section_count >= 2) {
                setNewSectionCount(data.new_section_count);
            }

            // 현재 클래스가 child class인 경우 (반편성된 클래스)
            if (data.parent_class_id) {
                try {
                    const parentResponse = await fetch(`/api/classes/${data.parent_class_id}`);
                    if (parentResponse.ok) {
                        const parentData = await parentResponse.json();
                        setParentClassData(parentData);
                        setChildClassData(data);
                    } else {
                        // Parent class가 존재하지 않으면 일반 클래스로 처리
                        console.warn(`Parent class ${data.parent_class_id} not found, treating as normal class`);
                        setParentClassData(null);
                        setChildClassData(null);
                    }
                } catch (error) {
                    console.error('Error loading parent class:', error);
                    setParentClassData(null);
                    setChildClassData(null);
                }
            }
            // 현재 클래스가 parent class인 경우 (기존반)
            else if (data.child_class_id) {
                try {
                    const childResponse = await fetch(`/api/classes/${data.child_class_id}`);
                    if (childResponse.ok) {
                        const childData = await childResponse.json();
                        setParentClassData(data);
                        setChildClassData(childData);
                    } else {
                        // Child class가 존재하지 않으면 일반 클래스로 처리
                        console.warn(`Child class ${data.child_class_id} not found, treating as normal class`);
                        setParentClassData(null);
                        setChildClassData(null);
                    }
                } catch (error) {
                    console.error('Error loading child class:', error);
                    setParentClassData(null);
                    setChildClassData(null);
                }
            }
            // 반편성이 없는 일반 클래스
            else {
                setParentClassData(null);
                setChildClassData(null);
            }
        } catch (error) {
            console.error('Error loading class data:', error);
        }
    };



    const loadStudents = async () => {
        try {
            const response = await fetch(`/api/students?classId=${classId}&section=${currentSection}`);
            const data = await response.json();
            if (data.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setStudents(data.map((s: any) => ({
                    id: s.id,
                    student_number: s.student_number || null,
                    name: s.name,
                    gender: s.gender,
                    birth_date: s.birth_date || '',
                    contact: s.contact || '',
                    notes: s.notes || '',
                    is_problem_student: Boolean(s.is_problem_student),
                    is_special_class: Boolean(s.is_special_class),
                    is_underachiever: Boolean(s.is_underachiever),
                    is_transferring_out: Boolean(s.is_transferring_out),
                    group_name: s.group_name || '',
                    rank: s.rank || null,
                    section_number: s.section_number,
                    previous_section: s.previous_section || null,
                })));
            } else {
                setStudents([createEmptyStudent()]);
            }
        } catch (error) {
            console.error('Error loading students:', error);
            setStudents([createEmptyStudent()]);
        }
    };

    // 임시 저장 데이터 확인 및 로드
    const loadTempData = async () => {
        const key = getTempSaveKey();
        const savedData = localStorage.getItem(key);

        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                // 데이터 유효성 간단 확인
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    const confirmed = await customConfirm(
                        '작성 중인 임시 저장 데이터가 있습니다.\n불러오시겠습니까?'
                    );
                    if (confirmed) {
                        setStudents(parsedData);
                        console.log('임시 저장 데이터 로드 완료');
                    }
                }
            } catch (e) {
                console.error('임시 저장 데이터 파싱 오류:', e);
            }
        }
    };



    // 데이터 로드: 서버 데이터 로드 후 임시 저장 데이터 확인
    useEffect(() => {
        if (!classId || !currentSection) return;
        const init = async () => {
            await loadStudents();
            await loadTempData();
        };
        init();
    }, [classId, currentSection]);

    const createEmptyStudent = (): Student => ({
        student_number: null,
        name: '',
        gender: 'M',
        birth_date: '',
        contact: '',
        notes: '',
        is_problem_student: false,
        is_special_class: false,
        is_underachiever: false,
        is_transferring_out: false,
        group_name: '',
        rank: null,
        previous_section: null,
    });

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        if (isCompleted) return;
        setIsPasting(true);

        const pastedData = e.clipboardData.getData('text');
        const rows = pastedData.split('\n').filter(row => row.trim());

        const newStudentsData = rows.map(row => {
            const cols = row.split('\t');

            // 스마트 컬럼 감지: 첫 번째 컬럼이 숫자인지 확인 (출석번호로 사용)
            const firstCol = cols[0]?.trim() || '';
            const isFirstColNumber = /^\d+$/.test(firstCol);

            let student_number: number | null = null;
            let startCol = 0;

            if (isFirstColNumber) {
                student_number = parseInt(firstCol, 10);
                startCol = 1; // 번호를 썼으니 다음 칸부터 데이터
            }

            // 데이터 객체 생성 (값이 있는 경우만 포함하여 기존 데이터를 보호)
            const data: any = { student_number };

            const name = cols[startCol]?.trim();
            if (name) data.name = name;

            const genderRaw = cols[startCol + 1]?.trim().toUpperCase();
            if (genderRaw) {
                const isFemale = genderRaw === 'F' || genderRaw === '여' || genderRaw === '여자' || genderRaw === '여성' || genderRaw === 'FEMALE';
                data.gender = isFemale ? 'F' : 'M';
            }

            const birthRaw = cols[startCol + 2]?.trim();
            if (birthRaw) {
                // 숫자만 추출
                let cleanBirth = birthRaw.replace(/\D/g, '');
                if (cleanBirth.length === 6) {
                    // 6자리(YYMMDD)를 8자리(YYYYMMDD)로 변환
                    const yearPrefix = parseInt(cleanBirth.substring(0, 2), 10) > 30 ? '19' : '20';
                    cleanBirth = yearPrefix + cleanBirth;
                }
                data.birth_date = cleanBirth;
            }

            const notes = cols[startCol + 3]?.trim();
            if (notes) data.notes = notes;

            const contact = cols[startCol + 4]?.trim();
            if (contact) data.contact = contact;

            return data;
        });

        // 스마트 병합: 현재 비어있는 행을 찾아서 채우거나, 동일 번호/이름이 있으면 업데이트
        setStudents(prevStudents => {
            const updated = [...prevStudents];
            const remainingNewStudents: any[] = [];

            newStudentsData.forEach(newS => {
                let merged = false;
                let existingIdx = -1;

                // 1. 번호가 있다면 동일한 번호를 가진 행을 찾아 매칭
                if (newS.student_number !== null) {
                    existingIdx = updated.findIndex(s => s.student_number === newS.student_number);
                }

                // 2. 번호 매칭 실패 시 이름으로 매칭 시도 (이름이 제공된 경우)
                if (existingIdx === -1 && newS.name) {
                    existingIdx = updated.findIndex(s => s.name === newS.name);
                }

                if (existingIdx !== -1) {
                    // 기존 행 업데이트 (제공된 필드만 덮어씌움)
                    updated[existingIdx] = {
                        ...updated[existingIdx],
                        ...newS,
                    };
                    merged = true;
                }

                if (!merged) {
                    remainingNewStudents.push(newS);
                }
            });

            // 2. 매칭되지 않은 데이터들은 기존 빈 행(이름 없는 행)을 찾아서 채움
            let pasteIdx = 0;
            for (let i = 0; i < updated.length && pasteIdx < remainingNewStudents.length; i++) {
                if (!updated[i].name) {
                    updated[i] = {
                        ...createEmptyStudent(),
                        ...remainingNewStudents[pasteIdx++]
                    };
                }
            }

            // 3. 그래도 남은 데이터는 뒤에 추가
            while (pasteIdx < remainingNewStudents.length) {
                updated.push({
                    ...createEmptyStudent(),
                    ...remainingNewStudents[pasteIdx++]
                });
            }

            // 출석번호 순으로 정렬 (번호가 있는 경우)
            return updated.sort((a, b) => {
                const numA = a.student_number;
                const numB = b.student_number;

                if (numA !== null && numB !== null) return numA - numB;
                if (numA !== null) return -1;
                if (numB !== null) return 1;
                return 0;
            });
        });

        setTimeout(() => setIsPasting(false), 2000);
    };

    const downloadTemplate = () => {
        // Excel 워크북 생성
        const wb = XLSX.utils.book_new();

        // 헤더와 예시 데이터
        const ws_data = [
            ['번호', '이름', '성별', '생년월일', '특이사항', '보호자 연락처'],
            [1, '홍길동', '남', '090101', '반장', '010-1234-5678'],
            [2, '김영희', '여', '090202', '', '010-2345-6789'],
            [3, '이철수', '남', '090303', '학급부회장', '010-3456-7890']
        ];

        // 워크시트 생성
        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // 열 너비 설정
        ws['!cols'] = [
            { wch: 8 },  // 번호
            { wch: 12 }, // 이름
            { wch: 8 },  // 성별
            { wch: 12 }, // 생년월일
            { wch: 20 }, // 특이사항
            { wch: 15 }  // 보호자 연락처
        ];

        // 워크북에 워크시트 추가
        XLSX.utils.book_append_sheet(wb, ws, '학생명단');

        // 파일 다운로드
        XLSX.writeFile(wb, `${classData?.grade}학년_${currentSection}반_명렬표_템플릿.xlsx`);
    };

    const addRow = () => {
        setStudents([...students, createEmptyStudent()]);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || isCompleted) return;

        // 파일 확장자 검증
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            alert('Excel 파일(.xlsx 또는 .xls)만 업로드 가능합니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (jsonData.length < 2) {
                    alert('파일에 데이터가 없습니다.');
                    return;
                }

                // 첫 번째 행은 헤더이므로 제외
                const dataRows = jsonData.slice(1);

                const newStudents: Student[] = dataRows
                    .filter(row => row && row.length > 0 && row[1]) // 이름이 있는 행만
                    .map(row => {
                        const student_number_val = parseInt(String(row[0] || '').trim(), 10);
                        const student_number = isNaN(student_number_val) ? null : student_number_val;

                        const name = String(row[1] || '').trim();
                        const genderValue = String(row[2] || '').trim().toLowerCase();
                        let gender: 'M' | 'F' = 'M';

                        if (genderValue === '여' ||
                            genderValue === '여자' ||
                            genderValue === '여성' ||
                            genderValue === 'f' ||
                            genderValue === 'female') {
                            gender = 'F';
                        }

                        const birth_date = String(row[3] || '').trim();
                        const notes = String(row[4] || '').trim();
                        const contact = String(row[5] || '').trim();

                        return {
                            ...createEmptyStudent(),
                            student_number,
                            name,
                            gender,
                            birth_date,
                            notes,
                            contact,
                        };
                    });

                if (newStudents.length === 0) {
                    alert('유효한 학생 데이터가 없습니다.');
                    return;
                }

                setStudents(newStudents);
                setIsPasting(true);
                setTimeout(() => setIsPasting(false), 1000);
                alert(`${newStudents.length}명의 학생 데이터를 불러왔습니다!`);

                // 파일 input 초기화
                e.target.value = '';
            } catch (error) {
                console.error('파일 읽기 오류:', error);
                alert('파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해주세요.');
            }
        };

        reader.readAsArrayBuffer(file);
    };

    const removeRow = (index: number) => {
        if (isCompleted) return;
        setStudents(students.filter((_, i) => i !== index));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateStudent = (index: number, field: keyof Student, value: any) => {
        if (isCompleted) return;
        const updated = [...students];
        updated[index] = { ...updated[index], [field]: value };
        setStudents(updated);
    };

    // 개별 필드 붙여넣기 핸들러
    const handleFieldPaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>, startIndex: number, field: keyof Student) => {
        e.preventDefault();
        e.stopPropagation(); // 부모의 handlePaste 실행 방지

        // 마감된 경우 붙여넣기 차단
        if (isCompleted) return;

        const pastedData = e.clipboardData.getData('text');
        const rows = pastedData.split('\n').filter(v => v.trim());

        console.log('[붙여넣기] 필드:', field, '시작 인덱스:', startIndex);
        console.log('[붙여넣기] 데이터:', pastedData);
        console.log('[붙여넣기] 행 개수:', rows.length);

        if (rows.length === 0) return;

        const updated = [...students];

        // 필드 순서 정의 (UI 테이블 컬럼 순서와 일치)
        const fieldOrder: (keyof Student)[] = ['student_number'];
        if (classData?.is_distributed) {
            fieldOrder.push('previous_section' as keyof Student);
        }
        fieldOrder.push('name', 'gender', 'birth_date', 'notes', 'contact', 'rank');

        const startFieldIndex = fieldOrder.indexOf(field);

        console.log('[붙여넣기] 필드 순서 인덱스:', startFieldIndex);

        if (startFieldIndex === -1) return; // 필드를 찾을 수 없음

        // 각 행 처리
        rows.forEach((row, rowIndex) => {
            const targetRowIndex = startIndex + rowIndex;
            const cols = row.split('\t');

            // 행이 부족하면 추가
            while (updated.length <= targetRowIndex) {
                updated.push(createEmptyStudent());
            }

            // 각 열 처리 (커서 위치부터 시작)
            cols.forEach((value, colIndex) => {
                const targetFieldIndex = startFieldIndex + colIndex;
                if (targetFieldIndex >= fieldOrder.length) return; // 범위 초과

                const targetField = fieldOrder[targetFieldIndex];
                const trimmedValue = value.trim();

                console.log(`[붙여넣기] 행 ${targetRowIndex}, 열 ${colIndex}: ${targetField} = "${trimmedValue}"`);

                // 필드 타입에 따라 값 변환
                if (targetField === 'student_number' || targetField === 'rank') {
                    const cleanValue = trimmedValue.replace(/[^\d]/g, '');
                    const numValue = parseInt(cleanValue, 10);
                    updated[targetRowIndex][targetField] = !isNaN(numValue) ? numValue : null;
                } else if (targetField === 'gender') {
                    const genderValue = trimmedValue.toUpperCase();
                    const isFemale = genderValue === 'F' || genderValue === '여' || genderValue === '여자' || genderValue === '여성' || genderValue === 'FEMALE';
                    updated[targetRowIndex].gender = isFemale ? 'F' : 'M';
                } else if (targetField === 'birth_date') {
                    // 숫자만 추출 및 8자리 변환
                    let cleanBirth = trimmedValue.replace(/\D/g, '');
                    if (cleanBirth.length === 6) {
                        const yearPrefix = parseInt(cleanBirth.substring(0, 2), 10) > 30 ? '19' : '20';
                        cleanBirth = yearPrefix + cleanBirth;
                    }
                    updated[targetRowIndex].birth_date = cleanBirth;
                } else if (targetField === 'name' || targetField === 'notes' || targetField === 'contact') {
                    updated[targetRowIndex][targetField] = trimmedValue;
                }
            });
        });

        // 이름이 있는 행만 남기거나 정렬하는 등의 추가 로직이 필요할 수 있으나,
        // 현재는 붙여넣은 그대로를 유지하여 사용자가 확인하게 함
        setStudents(updated);
        setIsPasting(true);
        setTimeout(() => setIsPasting(false), 1000);
    };

    const handleSave = async () => {
        const validStudents = students.filter(s => s.name.trim());

        if (validStudents.length === 0) {
            alert('최소 한 명의 학생 정보를 입력해주세요.');
            return;
        }

        console.log('💾 저장 시작:', {
            classId,
            section: currentSection,
            studentCount: validStudents.length
        });

        setLoading(true);

        try {
            const requestData = {
                classId,
                section: currentSection,
                students: validStudents,
            };

            console.log('📤 요청 데이터:', requestData);

            const response = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });

            console.log('📥 응답 상태:', response.status, response.statusText);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: '서버 응답 파싱 실패' }));
                console.error('❌ 서버 에러:', errorData);
                throw new Error(errorData.error || `서버 오류 (${response.status})`);
            }

            const result = await response.json();
            console.log('✅ 저장 성공:', result);
            alert(`학생 정보가 저장되었습니다! (${result.count}명)`);
            loadStudents();
        } catch (error) {
            console.error('❌ 저장 실패:', error);
            const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
            alert(`저장 중 오류가 발생했습니다:\n${errorMsg}\n\n콘솔(F12)에서 자세한 내용을 확인하세요.`);
        } finally {
            setLoading(false);
        }
    };

    const handleTempSave = () => {
        try {
            const key = getTempSaveKey();
            localStorage.setItem(key, JSON.stringify(students));
            setShowTempSaveModal(true);
        } catch (e) {
            console.error('임시 저장 실패:', e);
            alert('임시 저장 중 오류가 발생했습니다.');
        }
    };

    const navigateToSection = (section: number) => {
        router.push(`/students?classId=${classId}&section=${section}`);
    };

    const handleDistribute = async () => {
        if (!classId || !newSectionCount || newSectionCount < 2) {
            alert('반 수는 최소 2개 이상이어야 합니다.');
            return;
        }

        const schoolId = localStorage.getItem('schoolId');
        if (!schoolId) {
            router.push('/');
            return;
        }

        const confirmed = await customConfirm(`현재 학급의 모든 학생을 ${newSectionCount}개 반으로 편성하시겠습니까?`);
        if (!confirmed) return;

        setLoading(true);
        setShowDistributeModal(false);

        try {
            const response = await fetch('/api/classes/distribute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    classId,
                    newSectionCount,
                    schoolId: parseInt(schoolId)
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to distribute students');
            }

            const result = await response.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alert(`반편성이 완료되었습니다!\n\n${result.stats.map((s: any) =>
                `${s.section}반: 총 ${s.total}명 (남 ${s.male}, 여 ${s.female}, 문제아 ${s.problem}, 특수반 ${s.special})`
            ).join('\n')}`);

            // 새로운 클래스의 1반으로 이동
            router.push(`/students?classId=${result.newClassId}&section=1`);
        } catch (error) {
            console.error('Error:', error);
            alert(`반편성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDistributedClass = async () => {
        if (!childClassData) {
            alert('삭제할 새로운반이 없습니다.');
            return;
        }

        const confirmed = await customConfirm(
            `새로운반 전체를 삭제하시겠습니까?\n\n` +
            `삭제 대상:\n` +
            `- ${classData?.grade}학년 새로운반 (${childClassData.section_count}개 반: 1반~${childClassData.section_count}반)\n` +
            `- 모든 반의 학생 데이터\n\n` +
            `삭제 후 기존반으로 돌아가며, 이 작업은 되돌릴 수 없습니다.`
        );
        if (!confirmed) return;

        setLoading(true);

        try {
            const schoolId = localStorage.getItem('schoolId');
            const response = await fetch(`/api/classes?classId=${childClassData.id}&schoolId=${schoolId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete class');
            }

            alert(`새로운반 전체(${childClassData.section_count}개 반)가 삭제되었습니다.\n대시보드로 돌아갑니다.`);

            // 대시보드로 이동
            router.push('/dashboard');
        } catch (error) {
            console.error('Error:', error);
            alert(error instanceof Error ? error.message : '새로운반 삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 통계 계산
    const stats = {
        total: students.filter(s => s.name.trim()).length,
        male: students.filter(s => s.gender === 'M' && s.name.trim()).length,
        female: students.filter(s => s.gender === 'F' && s.name.trim()).length,
        problem: students.filter(s => s.is_problem_student && s.name.trim()).length,
        special: students.filter(s => s.is_special_class && s.name.trim()).length,
    };

    if (!classId) {
        return (
            <div className="container">
                <div className="card">
                    <p>잘못된 접근입니다. 메인 페이지에서 학년과 반 수를 먼저 입력해주세요.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
            <div className="container" style={{ maxWidth: '1600px', width: '98%', padding: '1.5rem 1rem' }}>
                {/* 헤더 */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '2rem'
                }}>
                    <div>
                        <h1 style={{ margin: '0 0 0.5rem 0' }}>{classData?.grade}학년 {currentSection}반 학생 정보</h1>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>학생 정보를 입력하고 석차, 분리 그룹을 설정하세요</p>
                    </div>
                    <button
                        onClick={() => router.push(`/classes/${classId}`)}
                        className="btn btn-secondary"
                    >
                        ◀ 반 목록으로
                    </button>
                </div>

                {/* 마감 배너 (Option C) */}
                {isCompleted && (
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
                                <h3 style={{ margin: '0 0 0.25rem 0', color: '#d32f2f', fontSize: '1rem' }}>이 학급은 마감되었습니다.</h3>
                                <p style={{ margin: 0, color: '#d32f2f', fontSize: '0.9rem' }}>
                                    수정이 필요하시면 우측의 <b>[🔒 마감 해제]</b> 버튼을 클릭해주세요.
                                </p>
                            </div>
                        </div>
                    </div>
                )}



                {/* 툴바 */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={downloadTemplate}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                            title="엑셀 템플릿 다운로드"
                        >
                            📥 예시자료
                        </button>

                        {/* 파일 업로드 버튼 */}
                        <div style={{ position: 'relative' }}>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                                id="excel-upload"
                                disabled={isCompleted}
                            />
                            <label
                                htmlFor="excel-upload"
                                className="btn btn-secondary"
                                style={{
                                    fontSize: '0.9rem',
                                    padding: '0.5rem 1rem',
                                    cursor: isCompleted ? 'not-allowed' : 'pointer',
                                    margin: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: isCompleted ? 0.6 : 1
                                }}
                                title="엑셀 파일 업로드"
                            >
                                📂 파일 업로드
                            </label>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setIsPasting(!isPasting)}
                                disabled={isCompleted}
                                style={{
                                    fontSize: '0.9rem',
                                    padding: '0.5rem 1rem',
                                    background: isPasting ? 'var(--primary-light)' : undefined,
                                    color: isPasting ? 'white' : undefined,
                                    opacity: isCompleted ? 0.6 : 1,
                                    cursor: isCompleted ? 'not-allowed' : 'pointer'
                                }}
                                title="엑셀 데이터 붙여넣기"
                            >
                                📋 엑셀 붙여넣기
                            </button>
                            {isPasting && (
                                <div style={{
                                    position: 'absolute',
                                    top: '110%',
                                    left: 0,
                                    width: '300px',
                                    padding: '1rem',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    zIndex: 10,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                                        엑셀에서 원하는 영역만 복사(Ctrl+C)해서<br />
                                        여기서 붙여넣기(Ctrl+V) 하세요.<br />
                                        <strong>* 번호나 이름이 같으면 기존 정보를 업데이트합니다.</strong><br />
                                        <strong>* 번호와 이름이 모두 없으면 새로 추가합니다.</strong>
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        필수 필드: [성명], [성별] (권장: 생년월일, 비고)
                                    </p>

                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="btn"
                            onClick={() => setShowRankModal(true)}
                            disabled={isCompleted}
                            style={{
                                background: 'white',
                                border: '1px solid var(--primary)',
                                color: 'var(--primary)',
                                fontSize: '0.9rem',
                                padding: '0.5rem 1rem',
                                opacity: isCompleted ? 0.6 : 1,
                                cursor: isCompleted ? 'not-allowed' : 'pointer'
                            }}
                        >
                            📊 석차 지정
                        </button>

                        <button
                            className="btn"
                            onClick={() => setShowSeparationModal(true)}
                            disabled={isCompleted}
                            style={{
                                background: 'white',
                                border: '1px solid var(--secondary)',
                                color: 'var(--secondary)',
                                fontSize: '0.9rem',
                                padding: '0.5rem 1rem',
                                opacity: isCompleted ? 0.6 : 1,
                                cursor: isCompleted ? 'not-allowed' : 'pointer'
                            }}
                        >
                            🔗 반 내부 분리
                        </button>
                    </div>
                </div>

                {isPasting && (
                    <div style={{
                        background: 'var(--success)',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                        animation: 'fadeIn 0.3s'
                    }}>
                        ✅ 데이터가 성공적으로 붙여넣기 되었습니다!
                    </div>
                )}

                <div className="table-container" onPaste={handlePaste} style={{ position: 'relative' }}>
                    {/* 마감 시 테이블 오버레이 */}
                    {isCompleted && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.05)',
                            zIndex: 5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'not-allowed',
                            borderRadius: '8px'
                        }}>
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '1rem 2rem',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 'bold',
                                color: '#d32f2f'
                            }}>
                                <span style={{ fontSize: '1.2rem' }}>🔒</span>
                                마감된 학급입니다. 수정하려면 마감 해제를 해주세요.
                            </div>
                        </div>
                    )}
                    <table style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '60px', textAlign: 'center', whiteSpace: 'nowrap' }}>번호</th>
                                {!!classData?.is_distributed && (
                                    <th style={{ width: '60px', textAlign: 'center', whiteSpace: 'nowrap' }}>이전반</th>
                                )}
                                <th style={{ width: '140px', textAlign: 'center', whiteSpace: 'nowrap' }}>성명</th>
                                <th style={{ width: '60px', textAlign: 'center', whiteSpace: 'nowrap' }}>성별</th>
                                <th style={{ width: '120px', textAlign: 'center', whiteSpace: 'nowrap' }}>생년월일</th>
                                <th style={{ width: '250px', textAlign: 'center', whiteSpace: 'nowrap' }}>특이사항</th>
                                <th style={{ width: '180px', textAlign: 'center', whiteSpace: 'nowrap' }}>연락처</th>
                                <th style={{ width: '80px', textAlign: 'center', borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>석차</th>
                                <th style={{ width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>문제행동</th>
                                <th style={{ width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>특수교육</th>
                                <th style={{ width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>학습부진</th>
                                <th style={{ width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>전출</th>
                                <th style={{ width: '160px', textAlign: 'center', whiteSpace: 'nowrap' }}>분리</th>
                                <th style={{ width: '50px', textAlign: 'center' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student, index) => (
                                <tr key={index} className="student-row" style={{ position: 'relative' }}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={student.student_number || ''}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^\d]/g, '');
                                                updateStudent(index, 'student_number', val ? parseInt(val, 10) : null);
                                            }}
                                            onPaste={(e) => handleFieldPaste(e, index, 'student_number')}
                                            disabled={isCompleted}
                                            placeholder="-"
                                            title="출석번호"
                                            style={{
                                                margin: 0,
                                                padding: '0.25rem',
                                                border: 'none',
                                                background: 'transparent',
                                                textAlign: 'center',
                                                width: '100%',
                                                color: 'var(--text-muted)',
                                                fontWeight: 'bold'
                                            }}
                                            onFocus={(e) => e.target.style.borderBottom = '1px solid var(--primary)'}
                                            onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                                        />
                                    </td>
                                    {!!classData?.is_distributed && (
                                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                            {student.previous_section ? `${student.previous_section}반` : '-'}
                                        </td>
                                    )}
                                    <td>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={student.name}
                                            onChange={(e) => updateStudent(index, 'name', e.target.value)}
                                            onPaste={(e) => handleFieldPaste(e, index, 'name')}
                                            disabled={isCompleted}
                                            placeholder="이름"
                                            title="학생 성명"
                                            style={{ margin: 0, padding: '0.25rem', border: 'none', background: 'transparent', width: '100%', textAlign: 'center' }}
                                            onFocus={(e) => e.target.style.borderBottom = '1px solid var(--primary)'}
                                            onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div
                                            className={`badge ${student.gender === 'M' ? 'badge-male' : 'badge-female'}`}
                                            title="성별 (클릭하여 변경)"
                                            style={{
                                                cursor: isCompleted ? 'not-allowed' : 'pointer',
                                                margin: '0 auto',
                                                width: 'fit-content',
                                                opacity: isCompleted ? 0.7 : 1
                                            }}
                                            onClick={() => !isCompleted && updateStudent(index, 'gender', student.gender === 'M' ? 'F' : 'M')}
                                        >
                                            {student.gender === 'M' ? '남' : '여'}
                                        </div>
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={student.birth_date || ''}
                                            onChange={(e) => updateStudent(index, 'birth_date', e.target.value)}
                                            onPaste={(e) => handleFieldPaste(e, index, 'birth_date')}
                                            placeholder="YYMMDD"
                                            disabled={isCompleted}
                                            title="생년월일 (예: 120510)"
                                            style={{ margin: 0, padding: '0.25rem', border: 'none', background: 'transparent', fontSize: '0.9rem', width: '100%', textAlign: 'center' }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={student.notes || ''}
                                            onChange={(e) => updateStudent(index, 'notes', e.target.value)}
                                            onPaste={(e) => handleFieldPaste(e, index, 'notes')}
                                            placeholder="-"
                                            disabled={isCompleted}
                                            title={student.notes || ''}
                                            style={{
                                                margin: 0,
                                                padding: '0.25rem',
                                                border: 'none',
                                                background: 'transparent',
                                                fontSize: '0.9rem',
                                                width: '100%',
                                                textAlign: 'center',
                                                textOverflow: 'ellipsis',
                                                overflow: 'hidden',
                                                whiteSpace: 'nowrap'
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={student.contact || ''}
                                            onChange={(e) => updateStudent(index, 'contact', e.target.value)}
                                            onPaste={(e) => handleFieldPaste(e, index, 'contact')}
                                            placeholder="-"
                                            disabled={isCompleted}
                                            title="연락처"
                                            style={{ margin: 0, padding: '0.25rem', border: 'none', background: 'transparent', fontSize: '0.9rem', width: '100%', textAlign: 'center' }}
                                        />
                                    </td>

                                    {/* 구분선 이후 관리 항목 */}
                                    <td style={{ borderLeft: '2px solid var(--border)', padding: '0.5rem' }}>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="form-input"
                                            value={student.rank || ''}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                                updateStudent(index, 'rank', isNaN(val) ? null : val);
                                            }}
                                            onPaste={(e) => handleFieldPaste(e, index, 'rank')}
                                            placeholder="-"
                                            disabled={isCompleted}
                                            title="석차 (숫자만 입력)"
                                            style={{ margin: 0, textAlign: 'center', background: 'transparent', border: 'none', width: '100%', minWidth: '50px', padding: '0.25rem' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={student.is_problem_student}
                                            onChange={(e) => updateStudent(index, 'is_problem_student', e.target.checked)}
                                            disabled={isCompleted}
                                            title="문제행동 학생"
                                            style={{ width: '18px', height: '18px', cursor: isCompleted ? 'not-allowed' : 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={student.is_special_class}
                                            onChange={(e) => updateStudent(index, 'is_special_class', e.target.checked)}
                                            disabled={isCompleted}
                                            title="특수교육 대상"
                                            style={{ width: '18px', height: '18px', cursor: isCompleted ? 'not-allowed' : 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={student.is_underachiever}
                                            onChange={(e) => updateStudent(index, 'is_underachiever', e.target.checked)}
                                            disabled={isCompleted}
                                            title="학습부진 대상"
                                            style={{ width: '18px', height: '18px', cursor: isCompleted ? 'not-allowed' : 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={student.is_transferring_out}
                                            onChange={(e) => updateStudent(index, 'is_transferring_out', e.target.checked)}
                                            disabled={isCompleted}
                                            title="전출 예정"
                                            style={{ width: '18px', height: '18px', cursor: isCompleted ? 'not-allowed' : 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {/* 분리 그룹 배지로만 표시 (읽기 전용) */}
                                        {student.group_name ? (
                                            <span
                                                className={`badge-group ${getGroupColorClass(getDisplayGroupName(student.group_name))}`}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.15rem 0.4rem',
                                                    display: 'inline-block'
                                                }}
                                                title={`분리 그룹: ${getDisplayGroupName(student.group_name)}`}
                                            >
                                                {getDisplayGroupName(student.group_name)}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className="btn"
                                            onClick={() => removeRow(index)}
                                            disabled={isCompleted}
                                            style={{
                                                padding: '0.2rem 0.5rem',
                                                color: isCompleted ? 'var(--text-disabled)' : 'var(--text-muted)',
                                                cursor: isCompleted ? 'not-allowed' : 'pointer',
                                                background: 'transparent',
                                                border: 'none',
                                                fontSize: '1.1rem',
                                                lineHeight: 1
                                            }}
                                            title="학생 삭제"
                                        >×</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 버튼 액션 바 */}
                {/* 버튼 액션 바 */}
                <div className="action-bar" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
                    <div className="action-group" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={addRow} disabled={isCompleted}>
                            + 학생 추가
                        </button>
                        <button
                            className="btn"
                            onClick={handleTempSave}
                            disabled={isCompleted}
                            style={{
                                background: 'white',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            💾 임시저장
                        </button>
                    </div>

                    <div className="action-group">
                        {childClassData && (
                            <button
                                className="btn"
                                onClick={handleDeleteDistributedClass}
                                style={{
                                    background: 'var(--error)',
                                    color: 'white',
                                    marginRight: '0.5rem',
                                    opacity: 0.8
                                }}
                            >
                                🗑️ 새로운반 삭제
                            </button>
                        )}
                        {errorMsg && (
                            <div style={{ color: 'var(--error)', fontWeight: 'bold', marginRight: '1rem', alignSelf: 'center', whiteSpace: 'pre-wrap', textAlign: 'right' }}>
                                ⚠️ {errorMsg}
                            </div>
                        )}
                        <button
                            className="btn"
                            onClick={() => {
                                setErrorMsg(null);
                                if (!classId || !currentSection) {
                                    setErrorMsg('학급 정보가 없습니다.');
                                    return;
                                }

                                // --- 마감 해지 로직 ---
                                if (isCompleted) {
                                    setConfirmAction('unmark');
                                    setShowConfirmModal(true);
                                    return;
                                }

                                // --- 마감 로직 ---
                                const studentsWithoutRank = students.filter(s => s.name.trim() && s.rank === null);
                                if (studentsWithoutRank.length > 0) {
                                    const names = studentsWithoutRank.map(s => s.name).join(', ');
                                    setErrorMsg(`석차가 입력되지 않은 학생이 있습니다 (${studentsWithoutRank.length}명)\n: ${names}`);
                                    return;
                                }

                                setConfirmAction('complete');
                                setShowConfirmModal(true);
                            }}
                            style={{
                                background: isCompleted ? 'var(--text-secondary)' : 'var(--success)',
                                color: 'white',
                                fontWeight: 'bold',
                                paddingLeft: '2rem',
                                paddingRight: '2rem',
                                boxShadow: isCompleted ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                                transition: 'all 0.3s'
                            }}
                        >
                            {isCompleted ? '🔒 마감 해제' : '✓ 마감 (최종 저장)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 반편성 모달 */}
            {
                showDistributeModal && (
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
                        zIndex: 1000
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '2rem',
                            borderRadius: '12px',
                            maxWidth: '500px',
                            width: '90%'
                        }}>
                            <h2 style={{ marginTop: 0, color: '#667eea', textAlign: 'center' }}>🔀 반편성</h2>
                            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
                                현재 학급의 모든 학생을 새로운 반으로 편성합니다.<br />
                                등수, 성별, 그룹, 문제아, 특수반을 고려하여 균등하게 배치됩니다.
                            </p>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                    새로운 반 수
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={newSectionCount}
                                    onChange={(e) => setNewSectionCount(parseInt(e.target.value) || 2)}
                                    min="2"
                                    max="20"
                                    style={{ width: '100%' }}
                                />
                                <small style={{ color: '#999' }}>2개 ~ 20개 반으로 편성 가능합니다.</small>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowDistributeModal(false)}
                                >
                                    취소
                                </button>
                                <button
                                    className="btn"
                                    onClick={handleDistribute}
                                    style={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        border: 'none',
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    반편성 시작
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* 석차 지정 모달 */}
            {
                showRankModal && (
                    <RankModal
                        students={students}
                        onClose={() => setShowRankModal(false)}
                        onSave={async (updatedStudents) => {
                            setStudents(updatedStudents);
                            setShowRankModal(false);

                            // 자동 저장
                            setLoading(true);
                            try {
                                const validStudents = updatedStudents.filter(s => s.name.trim());
                                if (validStudents.length > 0) {
                                    await fetch('/api/students', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            classId,
                                            section: currentSection,
                                            students: validStudents,
                                        }),
                                    });
                                    console.log('석차 정보가 자동 저장되었습니다.');
                                }
                            } catch (error) {
                                console.error('자동 저장 실패:', error);
                                alert('석차 정보 저장 중 오류가 발생했습니다.');
                            } finally {
                                setLoading(false);
                            }
                        }}
                    />
                )
            }

            {/* 분리 대상 설정 모달 */}
            {
                showSeparationModal && (
                    <SeparationModal
                        students={students}
                        currentSection={currentSection}
                        onClose={() => setShowSeparationModal(false)}
                        onSave={async (updatedStudents) => {
                            setStudents(updatedStudents);
                            setShowSeparationModal(false);

                            // 자동 저장
                            setLoading(true);
                            try {
                                const validStudents = updatedStudents.filter(s => s.name.trim());
                                if (validStudents.length > 0) {
                                    await fetch('/api/students', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            classId,
                                            section: currentSection,
                                            students: validStudents,
                                        }),
                                    });
                                    console.log('분리 그룹 정보가 자동 저장되었습니다.');
                                }
                            } catch (error) {
                                console.error('자동 저장 실패:', error);
                                alert('분리 그룹 정보 저장 중 오류가 발생했습니다.');
                            } finally {
                                setLoading(false);
                            }
                        }}
                    />
                )
            }
            {/* 확인 모달 */}
            {showConfirmModal && (
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
                            {confirmAction === 'complete' ? '명렬표 마감' : '마감 해지'}
                        </h3>
                        <p style={{ color: '#666', marginBottom: '2rem' }}>
                            {confirmAction === 'complete'
                                ? '이 반의 학생 정보 입력을 마감하시겠습니까?\n모든 정보가 저장됩니다.'
                                : '마감을 해지하시겠습니까?\n다시 정보를 수정할 수 있게 됩니다.'}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowConfirmModal(false)}
                                style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                취소
                            </button>
                            <button
                                className="btn"
                                onClick={async () => {
                                    setShowConfirmModal(false);
                                    setLoading(true);
                                    try {
                                        if (confirmAction === 'complete') {
                                            // 학생 정보 저장
                                            const validStudents = students.filter(s => s.name.trim());
                                            if (validStudents.length > 0) {
                                                await fetch('/api/students', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        classId,
                                                        section: currentSection,
                                                        students: validStudents,
                                                    }),
                                                });
                                            }
                                            // 마감 상태 업데이트
                                            const response = await fetch(`/api/classes/${classId}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ section: currentSection, status: 'completed' })
                                            });
                                            if (response.ok) {
                                                alert('✅ 완료되었습니다!');
                                                setIsCompleted(true);
                                                // 임시 저장 데이터 삭제
                                                localStorage.removeItem(getTempSaveKey());
                                                router.refresh();
                                                await loadClassData();
                                            } else {
                                                throw new Error('마감 처리 실패');
                                            }
                                        } else {
                                            // 마감 해지
                                            const response = await fetch(`/api/classes/${classId}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ section: currentSection, status: 'in_progress' })
                                            });
                                            if (response.ok) {
                                                alert('마감이 해지되었습니다.');
                                                setIsCompleted(false);
                                                // 불필요한 전체 데이터 리로드(loadClassData) 제거 - 상태 변경만으로 충분함
                                                router.refresh();
                                            } else {
                                                throw new Error('해지 실패');
                                            }
                                        }
                                    } catch (e) {
                                        const err = e as Error;
                                        setErrorMsg('오류 발생: ' + (err.message || '알 수 없는 오류'));
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.875rem 1.5rem',
                                    background: confirmAction === 'complete' ? '#10b981' : '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: '600',
                                    fontSize: '1rem',
                                    textAlign: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {confirmAction === 'complete' ? '마감하기' : '해제하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 임시 저장 안내 모달 */}
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
                        <h3 style={{ marginTop: 0, color: 'black' }}>
                            임시저장 완료
                        </h3>
                        <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            현재 설정이 이 브라우저에 저장되었습니다.<br />
                            브라우저를 닫았다가 다시 열어도 유지됩니다.<br />
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>(다른 기기에서는 불러올 수 없습니다)</span>
                        </p>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowTempSaveModal(false)}
                            style={{ minWidth: '120px', display: 'flex', margin: '0 auto', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}
            {/* 로딩 오버레이 */}
            {loading && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(5px)'
                }}>
                    <div className="spinner" style={{
                        width: '50px',
                        height: '50px',
                        border: '5px solid #f3f3f3',
                        borderTop: '5px solid var(--primary)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '1rem'
                    }} />
                    <h3 style={{ color: 'var(--primary)', margin: 0 }}>작업을 처리 중입니다...</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>잠시만 기다려주세요.</p>
                    <style jsx>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
}
