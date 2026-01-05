const postgres = require('postgres');

const DATABASE_URL = 'postgresql://postgres.bercuuxfjitezvxkszcp:sNB4S-z7S%406wRSu@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';

async function testConfig() {
    console.log('Testing connection to Supabase...');
    const sql = postgres(DATABASE_URL, {
        connect_timeout: 10,
    });

    try {
        const result = await sql`SELECT version()`;
        console.log('✅ Connection successful!');
        console.log('DB Version:', result[0].version);
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed!');
        console.error(err);
        process.exit(1);
    }
}

testConfig();
