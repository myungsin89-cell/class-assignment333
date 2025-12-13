const Database = require('better-sqlite3');
const db = new Database('./students.db');

console.log('Starting database migration...\n');

try {
  // Check if school_id column exists
  const tableInfo = db.prepare('PRAGMA table_info(classes)').all();
  const hasSchoolId = tableInfo.some(col => col.name === 'school_id');

  if (!hasSchoolId) {
    console.log('Adding school_id column to classes table...');
    db.exec('ALTER TABLE classes ADD COLUMN school_id INTEGER');
    console.log('✓ Added school_id column');

    // Set all existing classes to school_id = 1 (default school)
    const result = db.prepare('UPDATE classes SET school_id = 1 WHERE school_id IS NULL').run();
    console.log(`✓ Updated ${result.changes} existing classes to school_id = 1`);

    console.log('\nMigration completed successfully!');
  } else {
    console.log('school_id column already exists. No migration needed.');
  }

  // Verify
  const newTableInfo = db.prepare('PRAGMA table_info(classes)').all();
  console.log('\nFinal schema for classes table:');
  newTableInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });

} catch (error) {
  console.error('Migration failed:', error.message);
} finally {
  db.close();
}
