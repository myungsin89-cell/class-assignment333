const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'students.db');
const db = new Database(dbPath);

try {
  console.log('Adding child_class_id column to classes table...');
  db.exec(`ALTER TABLE classes ADD COLUMN child_class_id INTEGER;`);
  console.log('✅ Successfully added child_class_id column!');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('✓ Column child_class_id already exists.');
  } else {
    console.error('❌ Error adding column:', error.message);
  }
}

db.close();
console.log('Done!');
