import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const { grade, section_count } = await request.json();

        const stmt = db.prepare('INSERT INTO classes (grade, section_count) VALUES (?, ?)');
        const result = stmt.run(grade, section_count);

        return NextResponse.json({ id: result.lastInsertRowid, grade, section_count });
    } catch (error: any) {
        console.error('Error creating class:', error);
        return NextResponse.json({ error: 'Failed to create class', details: error.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const stmt = db.prepare('SELECT * FROM classes ORDER BY created_at DESC');
        const classes = stmt.all();

        return NextResponse.json(classes);
    } catch (error) {
        console.error('Error fetching classes:', error);
        return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 });
    }
}
