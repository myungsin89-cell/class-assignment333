require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function fixSchema() {
    try {
        console.log('🔧 Fixing Database Schema...');

        // 1. classes 테이블 컬럼 추가
        console.log('Adding columns to classes table...');
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS conditions_completed BOOLEAN DEFAULT FALSE`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_count INTEGER`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_names TEXT`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_count INTEGER DEFAULT 0`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_mode TEXT DEFAULT 'flexible'`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_names TEXT`;

        // 2. students 테이블 컬럼 추가 (혹시 누락되었을 경우 대비)
        console.log('Adding columns to students table...');
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS student_number INTEGER`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS next_section INTEGER`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_underachiever BOOLEAN DEFAULT false`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date TEXT`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS contact TEXT`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT`;

        console.log('✅ Schema fixed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to fix schema:', error);
        process.exit(1);
    }
}

fixSchema();
