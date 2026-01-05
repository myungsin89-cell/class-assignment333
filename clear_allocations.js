require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function clearAllocations() {
    try {
        console.log('🗑️ 저장된 배정(next_section) 초기화 중...');

        // 모든 학생의 next_section을 NULL로 초기화
        const result = await sql`
            UPDATE students 
            SET next_section = NULL 
            WHERE next_section IS NOT NULL
        `;

        console.log(`✅ ${result.count}명의 학생 배정 초기화 완료!`);
        console.log('이제 반편성 결과 페이지에서 새로운 배정이 생성됩니다.');

        process.exit(0);
    } catch (error) {
        console.error('❌ 오류:', error);
        process.exit(1);
    }
}

clearAllocations();
