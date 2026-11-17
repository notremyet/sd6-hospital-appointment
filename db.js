const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',     // full Unicode support
  dateStrings: true,      // return dates as strings (no timezone conversion)
  connectionLimit: 10,
});

// Make NOW() / CURDATE() in MySQL always use Thailand time
// (most cloud servers run in UTC, which is 7 hours behind Thailand)
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+07:00'");
});

module.exports = pool;
