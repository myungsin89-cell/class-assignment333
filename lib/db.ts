import postgres from 'postgres';

// Singleton pattern to prevent excessive connections in development
const globalForSql = global as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
  isDbInitialized: boolean | undefined;
};

// Get database URL from environment variable
const DATABASE_URL = process.env.DATABASE_URL;

const sql = globalForSql.sql || (DATABASE_URL
  ? postgres(DATABASE_URL, {
    max: 5,  // 최대 연결 수를 줄여 연결 고갈 방지
    idle_timeout: 10,  // 유휴 연결 타임아웃 (초) - 더 빠르게 해제
    connect_timeout: 10,  // 연결 타임아웃 (초)
    prepare: false,  // prepared statement 비활성화로 연결 문제 방지
  })
  : postgres('postgresql://dummy:dummy@localhost:5432/dummy'));

if (process.env.NODE_ENV !== 'production') {
  globalForSql.sql = sql;
}

// Initialize database schema
export async function initDatabase() {
  if (globalForSql.isDbInitialized) return;

  try {
    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL,
        grade INTEGER NOT NULL,
        section_count INTEGER NOT NULL,
        is_distributed BOOLEAN DEFAULT false,
        parent_class_id INTEGER,
        section_statuses TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL,
        section_number INTEGER NOT NULL DEFAULT 1,
        student_number INTEGER,
        name TEXT NOT NULL,
        gender TEXT CHECK(gender IN ('M', 'F')) NOT NULL,
        is_problem_student BOOLEAN DEFAULT false,
        is_special_class BOOLEAN DEFAULT false,
        group_name TEXT,
        rank INTEGER,
        previous_section INTEGER,
        is_transferring_out BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_students_class_section ON students(class_id, section_number);
    `;

    // Migration: Add columns
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS next_section INTEGER;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_names TEXT;`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_underachiever BOOLEAN DEFAULT false;`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date TEXT;`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS contact TEXT;`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_count INTEGER;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_names TEXT;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS conditions_completed BOOLEAN DEFAULT FALSE;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_count INTEGER DEFAULT 0;`;
    await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_mode TEXT DEFAULT 'flexible';`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS student_number INTEGER;`;

    globalForSql.isDbInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Auto-initialize on import (only if DATABASE_URL is set)
if (DATABASE_URL && !globalForSql.isDbInitialized) {
  initDatabase().catch(console.error);
}

export default sql;
