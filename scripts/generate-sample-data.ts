import sql from '../lib/db';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { resolve } from 'path';

// .env.local 파일 로드
config({ path: resolve(process.cwd(), '.env.local') });

/**
 * 3학년 15개 반 예시 데이터 생성 스크립트
 * 각 반에 한국 이름을 가진 학생 데이터를 생성합니다.
 */

// 한국 성씨 목록
const lastNames = [
    '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
    '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍',
    '전', '고', '문', '손', '배', '조', '백', '허', '남', '심'
];

// 한국 이름 (두 글자)
const firstNames = [
    '민준', '서준', '예준', '도윤', '시우', '주원', '하준', '지호', '지우', '준서',
    '준우', '현우', '도현', '건우', '우진', '선우', '연우', '유준', '정우', '승우',
    '서진', '민재', '현준', '시후', '승현', '유찬', '은우', '지훈', '승민', '성민',
    '서윤', '서연', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '지안',
    '수아', '소율', '지민', '채원', '수빈', '예은', '예린', '다은', '은서', '채은',
    '지원', '수현', '예서', '시은', '수연', '예나', '유나', '지혜', '예리', '수민'
];

// 무작위 한국 이름 생성
function getRandomKoreanName(): string {
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    return lastName + firstName;
}

// 무작위 성별 생성 (남:여 = 1:1)
function getRandomGender(): 'M' | 'F' {
    return Math.random() < 0.5 ? 'M' : 'F';
}

// 무작위 순위 생성 (1-100)
function getRandomRank(): number {
    return Math.floor(Math.random() * 100) + 1;
}

// 무작위 그룹 생성 (10% 확률로 그룹 할당, 그룹1-10 중 선택)
function getRandomGroup(): string {
    if (Math.random() < 0.1) {
        const groupNum = Math.floor(Math.random() * 10) + 1;
        return `그룹${groupNum}`;
    }
    return '';
}

// 무작위 부진아 여부 (5% 확률)
function getRandomUnderachiever(): boolean {
    return Math.random() < 0.05;
}

// 무작위 특수교육 여부 (3% 확률)
function getRandomSpecial(): boolean {
    return Math.random() < 0.03;
}

// 무작위 문제행동 여부 (5% 확률)
function getRandomProblem(): boolean {
    return Math.random() < 0.05;
}

async function generateSampleData() {
    try {
        console.log('🚀 예시 데이터 생성을 시작합니다...');

        // 1. 학교 계정 확인 또는 생성
        const schoolName = 'sample_school';
        let schoolResult = await sql`
            SELECT id FROM schools WHERE name = ${schoolName}
        `;

        let schoolId: number;
        if (schoolResult.length === 0) {
            // 학교 계정이 없으면 생성
            const hashedPassword = await bcrypt.hash('password123', 10);

            const newSchool = await sql`
                INSERT INTO schools (name, password)
                VALUES (${schoolName}, ${hashedPassword})
                RETURNING id
            `;
            schoolId = newSchool[0].id;
            console.log(`✅ 학교 계정 생성 완료 (ID: ${schoolId})`);
        } else {
            schoolId = schoolResult[0].id;
            console.log(`✅ 기존 학교 계정 사용 (ID: ${schoolId})`);
        }

        // 2. 3학년 기존반 클래스 생성 (15개 반)
        const grade = 3;
        const sectionCount = 15;

        // 기존 3학년 클래스가 있는지 확인
        const existingClass = await sql`
            SELECT id FROM classes 
            WHERE school_id = ${schoolId} 
            AND grade = ${grade} 
            AND section_count = ${sectionCount}
            AND is_distributed = false
            AND parent_class_id IS NULL
        `;

        let classId: number;
        if (existingClass.length > 0) {
            classId = existingClass[0].id;
            console.log(`✅ 기존 3학년 클래스 사용 (ID: ${classId})`);

            // 기존 학생 데이터 삭제
            await sql`DELETE FROM students WHERE class_id = ${classId}`;
            console.log('🗑️  기존 학생 데이터 삭제 완료');
        } else {
            const newClass = await sql`
                INSERT INTO classes (school_id, grade, section_count, is_distributed, section_statuses)
                VALUES (${schoolId}, ${grade}, ${sectionCount}, false, '{}')
                RETURNING id
            `;
            classId = newClass[0].id;
            console.log(`✅ 3학년 ${sectionCount}개 반 클래스 생성 완료 (ID: ${classId})`);
        }

        // 3. 각 반에 학생 데이터 생성 (반당 25-30명)
        const generatedNames = new Set<string>(); // 중복 이름 방지
        let totalStudents = 0;

        for (let section = 1; section <= sectionCount; section++) {
            const studentsPerSection = Math.floor(Math.random() * 6) + 25; // 25-30명
            const students = [];

            for (let i = 0; i < studentsPerSection; i++) {
                let name = getRandomKoreanName();

                // 중복 이름 방지
                while (generatedNames.has(name)) {
                    name = getRandomKoreanName();
                }
                generatedNames.add(name);

                students.push({
                    class_id: classId,
                    section_number: section,
                    name: name,
                    gender: getRandomGender(),
                    rank: getRandomRank(),
                    group_name: getRandomGroup(),
                    is_underachiever: getRandomUnderachiever(),
                    is_special_class: getRandomSpecial(),
                    is_problem_student: getRandomProblem()
                });
            }

            // 학생 데이터 삽입
            for (const student of students) {
                await sql`
                    INSERT INTO students (
                        class_id, section_number, name, gender, rank, 
                        group_name, is_underachiever, is_special_class, is_problem_student
                    )
                    VALUES (
                        ${student.class_id}, ${student.section_number}, ${student.name}, 
                        ${student.gender}, ${student.rank}, ${student.group_name}, 
                        ${student.is_underachiever}, ${student.is_special_class}, ${student.is_problem_student}
                    )
                `;
            }

            totalStudents += studentsPerSection;
            console.log(`✅ ${section}반: ${studentsPerSection}명 생성 완료`);
        }

        console.log(`\n🎉 예시 데이터 생성 완료!`);
        console.log(`총 ${totalStudents}명의 학생 데이터가 생성되었습니다.`);
        console.log(`\n📌 접속 정보:`);
        console.log(`   학교명: ${schoolName}`);
        console.log(`   비밀번호: password123`);
        console.log(`   학년: 3학년`);
        console.log(`   반 수: ${sectionCount}개 반`);
        console.log(`\n웹사이트에서 위 정보로 로그인하여 확인하세요!`);

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

// 스크립트 실행
generateSampleData()
    .then(() => {
        console.log('✅ 스크립트 실행 완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ 스크립트 실행 실패:', error);
        process.exit(1);
    });
