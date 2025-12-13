import { NextRequest, NextResponse } from 'next/server';
import { initializeSchema } from '@/lib/db-schema';

/**
 * 데이터베이스 스키마 초기화 API
 * GET /api/init-db 로 호출하면 스키마를 자동으로 생성/업데이트합니다.
 */
export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    return NextResponse.json({
      success: true,
      message: '데이터베이스 스키마가 성공적으로 초기화되었습니다.'
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
