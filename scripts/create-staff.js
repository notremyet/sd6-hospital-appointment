// Create a nurse / staff account for the Dashboard
// npm run create-staff -- <username> <password> "<full name>" [nurse|staff|admin]
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const [username, password, fullName, role = 'nurse'] = process.argv.slice(2);
  if (!username || !password || !fullName) {
    console.log('Usage: npm run create-staff -- <username> <password> "<full name>" [nurse|staff|admin]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters long');

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO staff_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [username, hash, fullName, role]
  );
  console.log(`✅ Created account ${username} (${role})`);
}

main()
  .catch((err) => {
    console.error('❌', err.code === 'ER_DUP_ENTRY' ? 'That username already exists' : err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
