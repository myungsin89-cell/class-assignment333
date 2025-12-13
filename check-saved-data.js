const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = 'postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function checkData() {
  try {
    const sql = neon(DATABASE_URL);

    console.log('📊 최근 저장된 학생 데이터 확인:\n');

    const students = await sql`
      SELECT id, name, gender, is_problem_student, is_special_class,
             group_name, rank, birth_date, contact, notes, is_underachiever
      FROM students
      WHERE class_id = 2 AND section_number = 1
      ORDER BY id DESC
      LIMIT 10
    `;

    if (students.length === 0) {
      console.log('저장된 학생이 없습니다.');
      return;
    }

    students.forEach((student, index) => {
      console.log(`\n--- 학생 ${index + 1} ---`);
      console.log(`ID: ${student.id}`);
      console.log(`이름: ${student.name}`);
      console.log(`성별: ${student.gender}`);
      console.log(`특수학급: ${student.is_special_class ? '✓' : '✗'}`);
      console.log(`문제학생: ${student.is_problem_student ? '✓' : '✗'}`);
      console.log(`저성취: ${student.is_underachiever ? '✓' : '✗'}`);
      console.log(`그룹: ${student.group_name || '(없음)'}`);
      console.log(`석차: ${student.rank || '(없음)'}`);
      console.log(`생년월일: ${student.birth_date || '(없음)'}`);
      console.log(`연락처: ${student.contact || '(없음)'}`);
      console.log(`특이사항: ${student.notes || '(없음)'}`);
    });

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

checkData();
