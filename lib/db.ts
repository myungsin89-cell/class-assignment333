import { neon } from '@neondatabase/serverless';

// Get database URL from environment variable
// This allows each user to have their own database when deployed via OAuth2
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Please add it to your .env.local file.');
}

const sql = neon(DATABASE_URL);

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

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Auto-initialize on import
// Tables will be created if they don't exist (CREATE TABLE IF NOT EXISTS)
initDatabase().catch(console.error);

export default sql;
