import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcrypt';

// GET: 모든 학교 목록 조회
export async function GET() {
    try {
        const schools = await sql`
      SELECT id, name, created_at
      FROM schools
      ORDER BY created_at DESC
    `;

        return NextResponse.json({ schools });
    } catch (error) {
        console.error('Get schools error:', error);
        return NextResponse.json(
            { error: '학교 목록 조회 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// PUT: 학교 비밀번호 수정
export async function PUT(request: NextRequest) {
    try {
        const { schoolId, newPassword } = await request.json();

        if (!schoolId || !newPassword) {
            return NextResponse.json(
                { error: '학교 ID와 새 비밀번호를 입력해주세요.' },
                { status: 400 }
            );
        }

        if (newPassword.length < 4) {
            return NextResponse.json(
                { error: '비밀번호는 최소 4자 이상이어야 합니다.' },
                { status: 400 }
            );
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await sql`
      UPDATE schools
      SET password = ${hashedPassword}
      WHERE id = ${schoolId}
    `;

        return NextResponse.json({
            success: true,
            message: '비밀번호가 성공적으로 변경되었습니다.'
        });
    } catch (error) {
        console.error('Update password error:', error);
        return NextResponse.json(
            { error: '비밀번호 변경 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// DELETE: 학교 삭제 (연관 데이터 모두 삭제)
export async function DELETE(request: NextRequest) {
    try {
        const { schoolId } = await request.json();

        if (!schoolId) {
            return NextResponse.json(
                { error: '학교 ID를 입력해주세요.' },
                { status: 400 }
            );
        }

        // Delete school and related data (CASCADE will handle classes and students)
        // First, get all class IDs for this school
        const classes = await sql`
      SELECT id FROM classes WHERE school_id = ${schoolId}
    `;

        // Delete students for each class
        for (const classItem of classes) {
            await sql`
        DELETE FROM students WHERE class_id = ${classItem.id}
      `;
        }

        // Delete classes
        await sql`
      DELETE FROM classes WHERE school_id = ${schoolId}
    `;

        // Delete school
        await sql`
      DELETE FROM schools WHERE id = ${schoolId}
    `;

        return NextResponse.json({
            success: true,
            message: '학교 및 모든 연관 데이터가 삭제되었습니다.'
        });
    } catch (error) {
        console.error('Delete school error:', error);
        return NextResponse.json(
            { error: '학교 삭제 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
