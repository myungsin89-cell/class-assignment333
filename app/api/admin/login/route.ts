import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = '6499';

export async function POST(request: NextRequest) {
    try {
        const { password } = await request.json();

        if (!password) {
            return NextResponse.json(
                { error: '비밀번호를 입력해주세요.' },
                { status: 400 }
            );
        }

        if (password !== ADMIN_PASSWORD) {
            return NextResponse.json(
                { error: '비밀번호가 올바르지 않습니다.' },
                { status: 401 }
            );
        }

        // Simple token generation (in production, use JWT or similar)
        const token = Buffer.from(`admin:${Date.now()}`).toString('base64');

        return NextResponse.json({
            success: true,
            token,
            message: '로그인 성공'
        });
    } catch (error) {
        console.error('Admin login error:', error);
        return NextResponse.json(
            { error: '로그인 처리 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
