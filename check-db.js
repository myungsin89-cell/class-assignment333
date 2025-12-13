const Database = require('better-sqlite3');
const db = new Database('./students.db');

console.log('=== DATABASE SCHEMA ===\n');

// Get all table names
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '), '\n');

// Get schema for each table
tables.forEach(table => {
  console.log(`\n--- ${table.name} ---`);
  const info = db.prepare(`PRAGMA table_info(${table.name})`).all();
  console.log(info);
});

// Try to fetch a sample school and classes
console.log('\n=== SAMPLE DATA ===\n');
try {
  const schools = db.prepare('SELECT * FROM schools LIMIT 3').all();
  console.log('Schools:', schools);

  const classes = db.prepare('SELECT * FROM classes LIMIT 3').all();
  console.log('Classes:', classes);
} catch (err) {
  console.error('Error fetching data:', err.message);
}

db.close();
