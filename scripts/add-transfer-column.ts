import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Load environment variables from .env.local
config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL is not defined in .env.local');
    process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
    try {
        console.log('Adding is_transferring_out column to students table...');
        await sql`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS is_transferring_out BOOLEAN DEFAULT false;
    `;
        console.log('Successfully added is_transferring_out column.');
    } catch (error) {
        console.error('Error adding column:', error);
    }
}

main();
