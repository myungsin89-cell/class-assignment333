const Database = require('better-sqlite3');
const db = new Database('./students.db');

console.log('Testing API query...\n');

try {
  // This is the exact query used by the API
  const schoolId = '1';
  const stmt = db.prepare('SELECT * FROM classes WHERE school_id = ? ORDER BY created_at DESC');
  const classes = stmt.all(schoolId);

  console.log(`Found ${classes.length} classes for school_id = ${schoolId}:`);
  classes.forEach((c, i) => {
    console.log(`  ${i + 1}. Class ID ${c.id}: Grade ${c.grade}, ${c.section_count} sections, school_id: ${c.school_id}`);
  });

  console.log('\n✓ Query successful!');
} catch (error) {
  console.error('✗ Query failed:', error.message);
} finally {
  db.close();
}
