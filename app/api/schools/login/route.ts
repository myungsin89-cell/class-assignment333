import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json(
        { error: '학교 이름과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // Find school by name
    const schools = await sql`
      SELECT id, name, password FROM schools WHERE name = ${name}
    `;

    if (schools.length === 0) {
      return NextResponse.json(
        { error: '학교를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const school = schools[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, school.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        message: '로그인 성공',
        schoolId: school.id,
        schoolName: school.name
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
