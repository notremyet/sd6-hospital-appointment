const pool = require('./db');

async function main() {
  const [rows] = await pool.query(`
    SELECT a.appointment_id, p.hn, p.patient_name, d.doctor_name,
           dep.department_name, a.appointment_date, a.appointment_time,
           a.confirmation_status
    FROM appointments a
    JOIN patients p     ON p.patient_id = a.patient_id
    JOIN doctors d      ON d.doctor_id = a.doctor_id
    JOIN departments dep ON dep.department_id = a.department_id
    ORDER BY a.appointment_date, a.appointment_time
  `);
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});
