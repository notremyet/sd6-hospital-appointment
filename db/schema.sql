-- Database schema based on the ERD (Figure 4) + the extra columns/tables the system needs
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS line_appointment
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE line_appointment;

-- Drop existing tables first (safe to re-run)
DROP TABLE IF EXISTS pdpa_consents, appointment_reschedules, appointment_slots,
                     follow_ups, appointment_responses, appointments,
                     doctors, patients, departments, staff_users;

CREATE TABLE departments (
  department_id   INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(100) NOT NULL
);

CREATE TABLE patients (
  patient_id   INT AUTO_INCREMENT PRIMARY KEY,
  hn           VARCHAR(20)  NOT NULL UNIQUE,   -- added: used to link a LINE account
  patient_name VARCHAR(100) NOT NULL,
  phone        VARCHAR(20),                    -- added: for nurse follow-up calls
  line_user_id VARCHAR(100) UNIQUE             -- NULL = not linked to LINE yet
);

CREATE TABLE doctors (
  doctor_id     INT AUTO_INCREMENT PRIMARY KEY,
  doctor_name   VARCHAR(100) NOT NULL,
  department_id INT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE appointments (
  appointment_id      INT AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT NOT NULL,
  doctor_id           INT NOT NULL,
  department_id       INT NOT NULL,
  appointment_date    DATE NOT NULL,
  appointment_time    TIME NOT NULL,
  confirmation_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  notification_sent_at DATETIME NULL,
  response_deadline    DATETIME NULL,
  last_updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  reschedule_count     INT NOT NULL DEFAULT 0,       -- added: times rescheduled through LINE
  CHECK (confirmation_status IN ('Pending', 'Confirmed', 'Declined')),
  FOREIGN KEY (patient_id)    REFERENCES patients(patient_id),
  FOREIGN KEY (doctor_id)     REFERENCES doctors(doctor_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  INDEX idx_date (appointment_date),
  INDEX idx_status (confirmation_status)
);

CREATE TABLE appointment_responses (
  response_id    INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  response_type  VARCHAR(20) NOT NULL,
  decline_reason VARCHAR(255) NULL,            -- added: decline reason (Figure 14)
  source         VARCHAR(10) NOT NULL DEFAULT 'LINE',  -- added: answered on LINE or updated by staff
  response_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (response_type IN ('Confirmed', 'Declined')),
  CHECK (source IN ('LINE', 'Staff')),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

CREATE TABLE follow_ups (
  follow_up_id      INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id    INT NOT NULL,
  follow_up_status  VARCHAR(20) NOT NULL DEFAULT 'Open',
  follow_up_time    DATETIME NULL,             -- when the nurse contacted the patient
  follow_up_outcome TEXT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- added
  CHECK (follow_up_status IN ('Open', 'Contacted', 'Unreachable')),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

-- Added: nurse / staff accounts for the Dashboard (DB4)
CREATE TABLE staff_users (
  staff_id      INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,          -- bcrypt hash, never the real password
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'nurse',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (role IN ('nurse', 'staff', 'admin'))
);

-- Added: doctors' consultation slots that patients can reschedule into
-- Bookings are counted from the appointments table (not stored twice, so they cannot drift)
CREATE TABLE appointment_slots (
  slot_id   INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  capacity  INT NOT NULL DEFAULT 1,             -- patients accepted per slot
  UNIQUE KEY uq_slot (doctor_id, slot_date, slot_time),
  CHECK (capacity > 0),
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id)
);

-- Added: reschedule history
CREATE TABLE appointment_reschedules (
  reschedule_id  INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  old_date       DATE NOT NULL,
  old_time       TIME NOT NULL,
  new_date       DATE NOT NULL,
  new_time       TIME NOT NULL,
  source         VARCHAR(10) NOT NULL DEFAULT 'LINE',
  changed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source IN ('LINE', 'Staff')),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

-- Added: PDPA consent log (append-only, kept as evidence)
-- Keyed by LINE user ID because consent is given before the patient links an HN
CREATE TABLE pdpa_consents (
  consent_id   INT AUTO_INCREMENT PRIMARY KEY,
  line_user_id VARCHAR(100) NOT NULL,
  version      VARCHAR(10)  NOT NULL,          -- privacy notice version
  status       VARCHAR(10)  NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('accepted', 'withdrawn')),
  INDEX idx_line_user (line_user_id)
);
