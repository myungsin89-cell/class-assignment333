/* eslint-disable @typescript-eslint/no-explicit-any */
import sql from './db';

/**
 * 데이터베이스 스키마 자동 초기화
 * 새로운 Neon 서버에 연결 시 필요한 테이블과 컬럼을 자동으로 생성합니다.
 */
export async function initializeSchema() {
  try {
    console.log('🔄 데이터베이스 스키마 초기화 중...');

    // 1. schools 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 2. classes 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL,
        grade INTEGER NOT NULL,
        section_count INTEGER NOT NULL,
        is_distributed BOOLEAN DEFAULT FALSE,
        parent_class_id INTEGER,
        section_statuses TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 3. students 테이블 생성 (모든 컬럼 포함)
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL,
        section_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        gender TEXT NOT NULL,
        is_problem_student BOOLEAN DEFAULT FALSE,
        is_special_class BOOLEAN DEFAULT FALSE,
        group_name TEXT,
        rank INTEGER,
        previous_section INTEGER,
        birth_date TEXT,
        contact TEXT,
        notes TEXT,
        is_underachiever BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 4. 누락된 컬럼 추가 (기존 테이블이 있는 경우)
    const columnsToAdd = [
      { table: 'students', column: 'birth_date', type: 'TEXT' },
      { table: 'students', column: 'contact', type: 'TEXT' },
      { table: 'students', column: 'notes', type: 'TEXT' },
      { table: 'students', column: 'is_underachiever', type: 'BOOLEAN DEFAULT FALSE' },
      { table: 'students', column: 'previous_section', type: 'INTEGER' },
    ];

    for (const { table, column, type } of columnsToAdd) {
      try {
        await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
      } catch (error) {
        // 컬럼이 이미 존재하면 무시
        console.log(`Column ${column} already exists or error:`, error);
      }
    }

    console.log('✅ 데이터베이스 스키마 초기화 완료!');
    return true;
  } catch (error) {
    console.error('❌ 스키마 초기화 실패:', error);
    throw error;
  }
}

/**
 * 스키마 버전 확인 및 업데이트
 */
export async function checkSchema() {
  try {
    // students 테이블의 컬럼 확인
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'students'
    `;

    const columnNames = columns.map((c: any) => c.column_name);
    const requiredColumns = [
      'id', 'class_id', 'section_number', 'name', 'gender',
      'is_problem_student', 'is_special_class', 'group_name', 'rank',
      'birth_date', 'contact', 'notes', 'is_underachiever', 'previous_section'
    ];

    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

    if (missingColumns.length > 0) {
      console.log('⚠️ 누락된 컬럼 발견:', missingColumns);
      return false;
    }

    console.log('✅ 스키마 확인 완료 - 모든 컬럼이 존재합니다.');
    return true;
  } catch (error) {
    console.error('❌ 스키마 확인 실패:', error);
    return false;
  }
}
