require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function killLocks() {
    try {
        console.log('🔪 Checking for stuck queries to kill...');

        // 1. 10초 이상 'active' 상태이거나 잠금 대기 중인 쿼리 조회
        // now() - query_start를 사용하여 duration 계산 (Postgres 공통)
        const stuckQueries = await sql`
            SELECT pid, state, query, now() - query_start as duration
            FROM pg_stat_activity 
            WHERE state != 'idle' 
            AND pid != pg_backend_pid()
            AND (now() - query_start) > interval '10 seconds';
        `;

        if (stuckQueries.length > 0) {
            console.log(`⚠️ Found ${stuckQueries.length} stuck queries. Terminating...`);
            for (const q of stuckQueries) {
                // duration 객체를 문자열로 변환하여 로깅
                const durationStr = JSON.stringify(q.duration);
                console.log(`   - Killing PID ${q.pid} (${durationStr}): ${q.query.substring(0, 50)}...`);
                await sql`SELECT pg_terminate_backend(${q.pid})`;
            }
            console.log('✅ All stuck queries terminated.');
        } else {
            console.log('✅ No stuck queries found.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Kill failed:', error);
        process.exit(1);
    }
}

killLocks();
