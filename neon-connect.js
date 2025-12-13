const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = 'postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function connectToNeon() {
  try {
    const sql = neon(DATABASE_URL);

    console.log('✅ Neon 데이터베이스에 연결되었습니다!');
    console.log('-----------------------------------');

    // 데이터베이스 버전 확인
    const version = await sql`SELECT version()`;
    console.log('PostgreSQL 버전:', version[0].version);

    // 현재 데이터베이스 정보
    const dbInfo = await sql`SELECT current_database(), current_user`;
    console.log('현재 데이터베이스:', dbInfo[0].current_database);
    console.log('현재 사용자:', dbInfo[0].current_user);

    // 테이블 목록 가져오기
    console.log('\n📋 테이블 목록:');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    if (tables.length === 0) {
      console.log('  테이블이 없습니다.');
    } else {
      tables.forEach((table, index) => {
        console.log(`  ${index + 1}. ${table.table_name}`);
      });
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

connectToNeon();
