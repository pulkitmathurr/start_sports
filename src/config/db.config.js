require('dotenv').config();
const mysql  = require('mysql2');
const logger = require('../utils/logger');

const db = mysql.createPool({
  host:             process.env.DB_HOST             || 'localhost',
  user:             process.env.DB_USER             || 'root',
  password:         process.env.DB_PASSWORD         || '',
  database:         process.env.DB_NAME             || 'db_start_sports',
  waitForConnections: true,
  connectionLimit:  parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit:       0,
  timezone:         process.env.DB_TIMEZONE         || '+05:30',
});

db.getConnection((err, connection) => {
  if (err) {
    logger.error('Database connection failed', { error: err.message });
    return;
  }
  logger.info('Database connected');
  connection.release();
});

module.exports = db;