const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = 'postgresql://neondb_owner:npg_46DdWTayGtEn@ep-odd-paper-a1kj7j8u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function checkSchema() {
  try {
    const sql = neon(DATABASE_URL);

    console.log('📋 Students 테이블 스키마:');
    console.log('-----------------------------------');

    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'students'
      ORDER BY ordinal_position
    `;

    columns.forEach((col) => {
      console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    console.log('\n📋 Classes 테이블 스키마:');
    console.log('-----------------------------------');

    const classColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'classes'
      ORDER BY ordinal_position
    `;

    classColumns.forEach((col) => {
      console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    console.log('\n📋 Schools 테이블 스키마:');
    console.log('-----------------------------------');

    const schoolColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'schools'
      ORDER BY ordinal_position
    `;

    schoolColumns.forEach((col) => {
      console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

checkSchema();
