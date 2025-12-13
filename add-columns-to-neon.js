const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = 'postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function addColumns() {
  try {
    const sql = neon(DATABASE_URL);

    console.log('🔄 Neon DB에 컬럼 추가 중...\n');

    // birth_date 컬럼 추가
    try {
      await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date TEXT`;
      console.log('✅ birth_date 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️ birth_date 컬럼 추가 실패 (이미 존재할 수 있음):', e.message);
    }

    // contact 컬럼 추가
    try {
      await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS contact TEXT`;
      console.log('✅ contact 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️ contact 컬럼 추가 실패 (이미 존재할 수 있음):', e.message);
    }

    // notes 컬럼 추가
    try {
      await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT`;
      console.log('✅ notes 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️ notes 컬럼 추가 실패 (이미 존재할 수 있음):', e.message);
    }

    // is_underachiever 컬럼 추가
    try {
      await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_underachiever BOOLEAN DEFAULT FALSE`;
      console.log('✅ is_underachiever 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️ is_underachiever 컬럼 추가 실패 (이미 존재할 수 있음):', e.message);
    }

    console.log('\n📋 업데이트된 Students 테이블 스키마:');
    console.log('-----------------------------------');

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'students'
      ORDER BY ordinal_position
    `;

    columns.forEach((col) => {
      console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    console.log('\n✅ 모든 컬럼 추가 완료!');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

addColumns();
