import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json(
        { error: '학교 이름과 비밀번호는 필수입니다.' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: '비밀번호는 최소 4자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // Check if school already exists
    const existingSchool = await sql`
      SELECT id FROM schools WHERE name = ${name}
    `;

    if (existingSchool.length > 0) {
      return NextResponse.json(
        { error: '이미 등록된 학교 이름입니다.' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new school
    const result = await sql`
      INSERT INTO schools (name, password)
      VALUES (${name}, ${hashedPassword})
      RETURNING id
    `;

    return NextResponse.json(
      {
        message: '학교가 성공적으로 등록되었습니다.',
        schoolId: result[0].id
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: '학교 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
