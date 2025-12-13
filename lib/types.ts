export interface Student {
    id: number;
    name: string;
    gender: 'M' | 'F';
    section_number?: number;
    group_name: string;
    is_problem_student: boolean;
    is_special_class: boolean;
    is_underachiever: boolean;
    is_transferring_out: boolean;
    next_section?: number;
    rank?: number;
    birth_date?: string;
    contact?: string;
    notes?: string;
}

export interface Group {
    id: string;
    name: string;
    students: Student[];
    type: 'outer' | 'inner' | 'sameClass';
    section?: number;
}

export interface ClassData {
    id: number;
    grade: number;
    section_count: number;
    section_statuses?: string;
    new_section_count?: number;
    section_names?: string;
    special_student_reduction?: number; // 특수교육 학생 반 정원 감축 인원 (0, 1, 2, 3 등) - deprecated
    special_reduction_count?: number; // 특수교육대상 반 인원 감소 수
    special_reduction_mode?: 'force' | 'flexible'; // 강제/유연 적용 모드
}

export interface AllocationResult {
    classId: number;
    classes: {
        id: number;
        students: Student[];
        special_factors: {
            problem: number;
            special: number;
            underachiever: number;
            transfer: number;
        };
        gender_stats: {
            male: number;
            female: number;
        };
    }[];
}
