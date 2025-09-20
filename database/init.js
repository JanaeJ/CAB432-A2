const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'media_processor.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Media files table
      db.run(`
        CREATE TABLE IF NOT EXISTS media_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          original_filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Processing jobs table
      db.run(`
        CREATE TABLE IF NOT EXISTS processing_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_file_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          job_type TEXT NOT NULL,
          parameters TEXT,
          status TEXT DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          output_path TEXT,
          error_message TEXT,
          started_at DATETIME,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (media_file_id) REFERENCES media_files (id),
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // User sessions table
      db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT UNIQUE NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Create default admin user
      const adminPassword = 'admin123';
      bcrypt.hash(adminPassword, 10, (err, hash) => {
        if (err) {
          console.error('Error hashing admin password:', err);
          return;
        }
        
        db.run(`
          INSERT OR IGNORE INTO users (username, password_hash, role)
          VALUES (?, ?, ?)
        `, ['admin', hash, 'admin'], (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('Default admin user created (username: admin, password: admin123)');
          }
        });
      });

      // Create default test user
      const testPassword = 'user123';
      bcrypt.hash(testPassword, 10, (err, hash) => {
        if (err) {
          console.error('Error hashing test user password:', err);
          return;
        }
        
        db.run(`
          INSERT OR IGNORE INTO users (username, email, password_hash, role)
          VALUES (?, ?, ?, ?)
        `, ['user', 'user@example.com', hash, 'user'], (err) => {
          if (err) {
            console.error('Error creating test user:', err);
          } else {
            console.log('Default test user created (username: user, password: user123)');
          }
        });
      });

      db.run('PRAGMA foreign_keys = ON');
      
      resolve();
    });
  });
}

function getDatabase() {
  return db;
}

module.exports = {
  initializeDatabase,
  getDatabase
};
