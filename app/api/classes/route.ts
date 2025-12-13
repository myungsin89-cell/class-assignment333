import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const { school_id, grade, section_count } = await request.json();

        if (!school_id) {
            return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
        }

        const result = await sql`INSERT INTO classes (school_id, grade, section_count) VALUES (${school_id}, ${grade}, ${section_count}) RETURNING id`;

        return NextResponse.json({ id: result[0].id, school_id, grade, section_count });
    } catch (error) {
        console.error('Error creating class:', error);
        return NextResponse.json({ error: 'Failed to create class', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const schoolId = searchParams.get('schoolId');

        if (!schoolId) {
            return NextResponse.json({ error: 'schoolId parameter is required' }, { status: 400 });
        }

        const classes = await sql`SELECT * FROM classes WHERE school_id = ${schoolId} ORDER BY created_at DESC`;

        // 각 클래스에 대해 child class가 있는지 확인
        const classesWithChildInfo = await Promise.all(classes.map(async (classData) => {
            const childResult = await sql`SELECT COUNT(*) as count FROM classes WHERE parent_class_id = ${classData.id}`;
            return {
                ...classData,
                has_child_classes: Number(childResult[0].count) > 0
            };
        }));

        return NextResponse.json(classesWithChildInfo);
    } catch (error) {
        console.error('Error fetching classes:', error);
        return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const classId = searchParams.get('classId');
        const schoolId = searchParams.get('schoolId');

        if (!classId || !schoolId) {
            return NextResponse.json({ error: 'classId and schoolId are required' }, { status: 400 });
        }

        // Verify that the class belongs to this school
        const classDataResult = await sql`SELECT * FROM classes WHERE id = ${classId} AND school_id = ${schoolId}`;
        const classData = classDataResult[0];

        if (!classData) {
            return NextResponse.json({ error: 'Class not found or unauthorized' }, { status: 404 });
        }

        // Check if this class has child classes (반편성된 클래스)
        const childClasses = await sql`SELECT id FROM classes WHERE parent_class_id = ${classId}`;

        // Delete all child classes first (if any)
        if (childClasses.length > 0) {
            await sql`DELETE FROM classes WHERE parent_class_id = ${classId}`;
        }

        // Delete the class (students will be deleted automatically due to CASCADE)
        await sql`DELETE FROM classes WHERE id = ${classId}`;

        const message = childClasses.length > 0
            ? `학급과 반편성된 ${childClasses.length}개의 새로운반이 모두 삭제되었습니다.`
            : 'Class deleted successfully';

        return NextResponse.json({
            success: true,
            message,
            deletedChildClasses: childClasses.length
        });
    } catch (error) {
        console.error('Error deleting class:', error);
        return NextResponse.json({ error: 'Failed to delete class', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
