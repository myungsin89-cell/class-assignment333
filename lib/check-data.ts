
import sql from '@/lib/db';

async function checkData() {
    try {
        const schools = await sql`SELECT * FROM schools WHERE name = '테스트학교'`;
        console.log('Schools:', schools);

        if (schools.length > 0) {
            const schoolId = schools[0].id;
            const classes = await sql`SELECT * FROM classes WHERE school_id = ${schoolId}`;
            console.log('Classes:', classes);

            if (classes.length > 0) {
                for (const c of classes) {
                    const count = await sql`SELECT count(*) FROM students WHERE class_id = ${c.id}`;
                    console.log(`Class ${c.id} (Grade ${c.grade}) Student Count:`, count[0].count);
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
}

checkData();
