const postgres = require('postgres');
const dotenv = require('dotenv');
const result = dotenv.config({ path: '.env.local' });

if (result.error) {
    console.error('❌ Error loading .env.local:', result.error);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment!');
    process.exit(1);
}

console.log('Using DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

async function init() {
    const sql = postgres(DATABASE_URL, {
        connect_timeout: 10,
        ssl: 'require' // Force SSL for Supabase
    });

    try {
        console.log('Initializing database schema...');

        await sql`
            CREATE TABLE IF NOT EXISTS schools (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('✅ Schools table check passed');

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
        console.log('✅ Classes table check passed');

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
        console.log('✅ Students table check passed');

        // Migration columns
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS next_section INTEGER;`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_names TEXT;`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_underachiever BOOLEAN DEFAULT false;`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date TEXT;`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS contact TEXT;`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT;`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS new_section_count INTEGER;`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_count INTEGER DEFAULT 0;`;
        await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS special_reduction_mode TEXT DEFAULT 'flexible';`;
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS student_number INTEGER;`;

        console.log('✅ All migrations check passed');
        console.log('🚀 Database initialization complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Database initialization failed:');
        console.error(error);
        process.exit(1);
    }
}

init();
