const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const authDir = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

const dbPath = path.join(authDir, 'zapptor.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    } else {
        console.log('Connected to ZappTor SQLite database.');
    }
});

// Helper to run query in a promise
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// Helper to get all records
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Helper to get one record
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Initialize database tables
const initDatabase = async () => {
    try {
        // Create tenants table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS tenants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                expires_at TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration to add plan column if it doesn't exist
        try {
            await dbRun("ALTER TABLE tenants ADD COLUMN plan TEXT DEFAULT 'free'");
        } catch (err) {
            // Column already exists, silent ignore
        }

        // Create users table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                tenant_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        // Create payments table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT DEFAULT 'pending', -- pending, paid
                paid_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        // Create auto_responses table (stores templates per tenant)
        await dbRun(`
            CREATE TABLE IF NOT EXISTS auto_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'first_of_day',
                enabled INTEGER NOT NULL DEFAULT 0,
                message TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, type),
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        // Create auto_response_log table (tracks which contacts received auto-response per day)
        await dbRun(`
            CREATE TABLE IF NOT EXISTS auto_response_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                contact_id TEXT NOT NULL,
                response_date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, contact_id, response_date)
            )
        `);

        // Create settings table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Seed default Root user if not exists
        const rootUser = await dbGet("SELECT * FROM users WHERE username = 'root'");
        if (!rootUser) {
            const defaultPassword = 'admin123';
            const hash = await bcrypt.hash(defaultPassword, 10);
            await dbRun(
                "INSERT INTO users (name, username, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
                ['Administrador Geral', 'root', hash, 'root', null]
            );
            console.log('===================================================');
            console.log('DEFAULT ROOT USER CREATED!');
            console.log('Username: root');
            console.log('Password: admin123 (Please change this after login)');
            console.log('===================================================');
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

module.exports = {
    db,
    dbRun,
    dbAll,
    dbGet,
    initDatabase
};
