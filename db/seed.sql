-- Mock data (not real patients). Dates are relative to today, so appointments are always upcoming
USE line_appointment;
SET NAMES utf8mb4;

INSERT INTO departments (department_name) VALUES
  ('Internal Medicine'), ('Surgery'), ('Pediatrics');

INSERT INTO doctors (doctor_name, department_id) VALUES
  ('Dr. Somchai Jaidee', 1),
  ('Dr. Wipa Rakdee', 1),
  ('Dr. Thana Khaengraeng', 2),
  ('Dr. Malee Sodsai', 3);

INSERT INTO patients (hn, patient_name, phone, line_user_id) VALUES
  ('HN0001', 'Kittisak Wongsa',     '0800000001', NULL),
  ('HN0002', 'Supaporn Rattanakul', '0800000002', NULL),
  ('HN0003', 'Thanawat Boonmee',    '0800000003', NULL),
  ('HN0004', 'Anong Srisawat',      '0800000004', NULL),
  ('HN0005', 'Prasert Thongdee',    '0800000005', NULL);

INSERT INTO appointments
  (patient_id, doctor_id, department_id, appointment_date, appointment_time,
   confirmation_status, notification_sent_at, response_deadline) VALUES
  -- reminder not sent yet
  (1, 1, 1, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '09:00', 'Pending', NULL, NULL),
  (2, 3, 2, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '10:30', 'Pending', NULL, NULL),
  (1, 3, 2, DATE_ADD(CURDATE(), INTERVAL 7 DAY), '11:00', 'Pending', NULL, NULL),
  -- already answered
  (3, 4, 3, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '13:00', 'Confirmed',
     NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  (4, 2, 1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '14:00', 'Declined',
     NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  -- reminder sent, no response, deadline passed -> should enter the Follow-up List
  (5, 1, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:30', 'Pending',
     NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 1 HOUR);

INSERT INTO appointment_responses (appointment_id, response_type, decline_reason, response_time) VALUES
  (4, 'Confirmed', NULL, NOW() - INTERVAL 20 HOUR),
  (5, 'Declined', 'Schedule conflict', NOW() - INTERVAL 18 HOUR);

-- More mock data so the Dashboard has enough rows to show pagination
INSERT INTO patients (hn, patient_name, phone, line_user_id) VALUES
  ('HN0006', 'Waranya Khamdee',      '0810000006', NULL),
  ('HN0007', 'Nattapong Srisuk',     '0810000007', NULL),
  ('HN0008', 'Jiratchaya Suksawat',  '0810000008', NULL),
  ('HN0009', 'Pimchanok Saelim',     '0810000009', NULL),
  ('HN0010', 'Chayut Phromma',       '0810000010', NULL),
  ('HN0011', 'Siriporn Chaimongkol', '0810000011', NULL),
  ('HN0012', 'Pongsakorn Kaewjai',   '0810000012', NULL);

INSERT INTO appointments
  (patient_id, doctor_id, department_id, appointment_date, appointment_time,
   confirmation_status, notification_sent_at, response_deadline) VALUES
  (6,  1, 1, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:00', 'Pending',   NULL, NULL),
  (7,  3, 2, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '10:00', 'Confirmed', NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  (8,  4, 3, DATE_ADD(CURDATE(), INTERVAL 5 DAY), '13:00', 'Confirmed', NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  (9,  2, 1, DATE_ADD(CURDATE(), INTERVAL 5 DAY), '15:00', 'Declined',  NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  (10, 1, 1, DATE_ADD(CURDATE(), INTERVAL 6 DAY), '09:00', 'Pending',   NULL, NULL),
  (11, 3, 2, DATE_ADD(CURDATE(), INTERVAL 6 DAY), '10:00', 'Confirmed', NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY),
  (12, 4, 3, DATE_ADD(CURDATE(), INTERVAL 8 DAY), '11:00', 'Pending',   NULL, NULL);

INSERT INTO appointment_responses (appointment_id, response_type, decline_reason, response_time) VALUES
  (8,  'Confirmed', NULL, NOW() - INTERVAL 20 HOUR),
  (9,  'Confirmed', NULL, NOW() - INTERVAL 19 HOUR),
  (10, 'Declined', 'Feeling unwell', NOW() - INTERVAL 18 HOUR),
  (12, 'Confirmed', NULL, NOW() - INTERVAL 17 HOUR);

-- Demo Dashboard account  ->  username: nurse1  password: nurse1234
-- (the value below is a hash of the password, not the password itself)
INSERT INTO staff_users (username, password_hash, full_name, role) VALUES
  ('nurse1', '$2b$10$7HpDCvP4klGTctNO6nfhoOmEdfp0RfpIG0rrvb1PFQ6hV6GBGAtAW', 'Demo Nurse', 'nurse');

-- Mock consultation slots: every doctor, Monday–Friday, for the next 14 days
-- Morning 09:00–11:30, afternoon 13:00–15:30, every 30 minutes, 2 patients per slot
INSERT INTO appointment_slots (doctor_id, slot_date, slot_time, capacity)
SELECT d.doctor_id, CURDATE() + INTERVAL n.n DAY, t.t, 2
FROM doctors d
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
            UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
            UNION ALL SELECT 13 UNION ALL SELECT 14) AS n
CROSS JOIN (SELECT '09:00:00' AS t UNION ALL SELECT '09:30:00' UNION ALL SELECT '10:00:00'
            UNION ALL SELECT '10:30:00' UNION ALL SELECT '11:00:00' UNION ALL SELECT '11:30:00'
            UNION ALL SELECT '13:00:00' UNION ALL SELECT '13:30:00' UNION ALL SELECT '14:00:00'
            UNION ALL SELECT '14:30:00' UNION ALL SELECT '15:00:00' UNION ALL SELECT '15:30:00') AS t
WHERE DAYOFWEEK(CURDATE() + INTERVAL n.n DAY) BETWEEN 2 AND 6;
