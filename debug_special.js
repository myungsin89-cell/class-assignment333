require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function debug() {
    try {
        // 1. 특수교육 학생 확인
        const specialStudents = await sql`
            SELECT id, name, is_special_class, class_id 
            FROM students 
            WHERE is_special_class = true
        `;
        console.log('\n📚 특수교육 학생 목록:');
        console.log(specialStudents);

        // 2. 클래스 설정 확인
        const classes = await sql`
            SELECT id, grade, section_count, new_section_count, 
                   special_reduction_count, special_reduction_mode
            FROM classes
        `;
        console.log('\n🏫 클래스 설정:');
        classes.forEach(c => {
            console.log(`  - 클래스 ${c.id}: 학년=${c.grade}, 반수=${c.new_section_count || c.section_count}, 특수보정=${c.special_reduction_count}, 모드=${c.special_reduction_mode}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ 오류:', error);
        process.exit(1);
    }
}

debug();
