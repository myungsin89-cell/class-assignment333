const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../students.db');
const db = new Database(dbPath);

console.log('Migrating database to add new student columns...');

try {
    const addColumn = (columnDef) => {
        try {
            db.prepare(`ALTER TABLE students ADD COLUMN ${columnDef}`).run();
            console.log(`Added column: ${columnDef}`);
        } catch (error) {
            if (error.message.includes('duplicate column name')) {
                console.log(`Column already exists: ${columnDef.split(' ')[0]}`);
            } else {
                console.error(`Error adding column ${columnDef}:`, error.message);
            }
        }
    };

    addColumn('birth_date TEXT');
    addColumn('contact TEXT');
    addColumn('notes TEXT');
    addColumn('is_underachiever INTEGER DEFAULT 0');

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
} finally {
    db.close();
}
