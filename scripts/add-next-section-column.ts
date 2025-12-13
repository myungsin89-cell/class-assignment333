import { config } from 'dotenv';
config({ path: '.env.local' });
import sql from '../lib/db';

async function migrate() {
    try {
        console.log('Adding next_section column...');
        await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS next_section INTEGER;`;
        console.log('Migration successful: next_section column added.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
