-- CS 4600/5200 · Lab 8: two sessions
-- Creates the three small tables the lab uses, inside the university database.
-- Run it in session A before each task to start that task from the same data:
--   \i lab8_setup.sql
-- It never touches the university tables.

DROP TABLE IF EXISTS lab8_enroll, lab8_section, lab8_duty;

-- Sections with a limited number of seats. taken is how many are filled.
CREATE TABLE lab8_section (
  sec      varchar(12) PRIMARY KEY,
  capacity int NOT NULL CHECK (capacity > 0),
  taken    int NOT NULL CHECK (taken >= 0)
);
INSERT INTO lab8_section VALUES
  ('CS-347-1',  30, 29),   -- one seat left
  ('CS-319-1',  25, 10),
  ('BIO-101-1', 40, 12);

-- Who is enrolled where; it should always agree with taken.
CREATE TABLE lab8_enroll (
  student_id varchar(5),
  sec        varchar(12) REFERENCES lab8_section,
  PRIMARY KEY (student_id, sec)
);
INSERT INTO lab8_enroll
  SELECT lpad(g::text, 5, '0'), 'CS-347-1' FROM generate_series(1, 29) AS g;
INSERT INTO lab8_enroll
  SELECT lpad(g::text, 5, '0'), 'CS-319-1' FROM generate_series(1, 10) AS g;
INSERT INTO lab8_enroll
  SELECT lpad(g::text, 5, '0'), 'BIO-101-1' FROM generate_series(31, 42) AS g;

-- The lab's teaching assistants. The rule: at least one is on duty.
CREATE TABLE lab8_duty (
  ta      varchar(20) PRIMARY KEY,
  on_duty boolean NOT NULL
);
INSERT INTO lab8_duty VALUES ('Ari', true), ('Bea', true);
