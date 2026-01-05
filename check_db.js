require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;

console.log('Checking DB Connection...');
console.log('URL length:', DATABASE_URL ? DATABASE_URL.length : 0);

if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is missing in .env');
    process.exit(1);
}

const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 3,
    connect_timeout: 5,
});

async function check() {
    try {
        console.log('1. Testing simple query (SELECT 1)...');
        const result = await sql`SELECT 1 as res`;
        console.log('✅ Connection Sucess! Result:', result);

        console.log('2. Checking students table...');
        const students = await sql`SELECT count(*) FROM students`;
        console.log('✅ Students table accessible. Count:', students[0].count);

        console.log('🎉 DB Diagnostics Passed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ DB Connection Failed:', error);
        process.exit(1);
    }
}

check();
