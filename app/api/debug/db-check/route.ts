import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const status: any = {
        database_url_exists: !!process.env.DATABASE_URL,
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        connection: 'pending',
        tables: {}
    };

    try {
        // 1. 단순 연결 테스트
        const startTime = Date.now();
        const result = await sql`SELECT 1 as connected`;
        const endTime = Date.now();

        status.connection = result[0]?.connected === 1 ? 'success' : 'failed';
        status.latency_ms = endTime - startTime;

        // 2. 테이블 존재 여부 확인
        const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;

        status.existing_tables = tables.map((t: any) => t.table_name);

        // 3. 주요 테이블 상세 확인
        const schoolCount = await sql`SELECT count(*) FROM schools`.catch(() => [{ count: 'error' }]);
        status.tables.schools = schoolCount[0].count;

        return NextResponse.json(status);
    } catch (error: any) {
        status.connection = 'failed';
        status.error = {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint
        };
        return NextResponse.json(status, { status: 500 });
    }
}
