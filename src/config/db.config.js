require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createPool({
  host:             process.env.DB_HOST             || 'localhost',
  user:             process.env.DB_USER             || 'root',
  password:         process.env.DB_PASSWORD         || '',
  database:         process.env.DB_NAME             || 'db_start_sports',
  waitForConnections: true,
  connectionLimit:  parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit:       0
});

db.getConnection((err, connection) => {
  if (err) {
    console.log('Database connection failed:', err);
    return;
  }
  console.log('Database connected! ✅');
  connection.release();
});

module.exports = db;