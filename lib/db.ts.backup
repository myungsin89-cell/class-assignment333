import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'students.db');

// Prevent multiple connections in development
const globalForDb = global as unknown as { db: Database.Database };

const db = globalForDb.db || new Database(dbPath);

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

// Initialize database schema
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL,
      section_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      section_number INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      gender TEXT CHECK(gender IN ('M', 'F')) NOT NULL,
      is_problem_student BOOLEAN DEFAULT 0,
      group_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_students_class_section ON students(class_id, section_number);
  `);
} catch (error) {
  console.error('Database initialization failed:', error);
}

export default db;
