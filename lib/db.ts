import { neon } from '@neondatabase/serverless';

// Get database URL from environment variable
// This allows each user to have their own database when deployed via OAuth2
const DATABASE_URL = process.env.DATABASE_URL;

// 빌드 시에는 환경 변수가 없을 수 있으므로 더미 URL 사용
// 실제 런타임에서 DATABASE_URL이 없으면 쿼리 실행 시 에러 발생
const sql = DATABASE_URL
  ? neon(DATABASE_URL)
  : neon('postgresql://dummy:dummy@localhost:5432/dummy'); // 빌드용 더미

// Initialize database schema
export async function initDatabase() {
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

    // Migration: Add next_section column if it doesn't exist
    await sql`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS next_section INTEGER;
    `;

    // Migration: Add section_names column to classes table
    await sql`
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_names TEXT;
    `;

    // Migration: Add missing student columns
    await sql`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS is_underachiever BOOLEAN DEFAULT false;
    `;

    await sql`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date TEXT;
    `;

    await sql`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS contact TEXT;
    `;

    await sql`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT;
    `;

    // Migration: Add special reduction columns to classes table
    await sql`
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_count INTEGER;
    `;

    await sql`
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_count INTEGER DEFAULT 0;
    `;

    await sql`
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_mode TEXT DEFAULT 'flexible';
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Auto-initialize on import (only if DATABASE_URL is set)
// Tables will be created if they don't exist (CREATE TABLE IF NOT EXISTS)
if (DATABASE_URL) {
  initDatabase().catch(console.error);
}

export default sql;
