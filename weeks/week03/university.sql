-- CS 4600/5200 Database Theory and Applications, Spring 2027
-- Sample database from week 3 on: the week 1 university, plus two tables
-- (teaches, advisor) and a few rows that give outer joins and NULLs
-- something to show: a department with no people, a course nobody teaches,
-- an instructor with no salary yet, and a student with no department.
-- Runs on PostgreSQL 14 or newer, and in the browser playground.
-- Load it with:  psql -d university -f university.sql

DROP TABLE IF EXISTS advisor, teaches, takes, course, student, instructor, department CASCADE;

CREATE TABLE department (
  dept_name  varchar(20) PRIMARY KEY,
  building   varchar(15) NOT NULL,
  budget     numeric(12,2) CHECK (budget > 0)
);

CREATE TABLE instructor (
  id         char(5) PRIMARY KEY,
  name       varchar(30) NOT NULL,
  dept_name  varchar(20) REFERENCES department,
  salary     numeric(8,2) CHECK (salary > 29000)
);

CREATE TABLE student (
  id         char(5) PRIMARY KEY,
  name       varchar(30) NOT NULL,
  dept_name  varchar(20) REFERENCES department,
  tot_cred   integer DEFAULT 0 CHECK (tot_cred >= 0)
);

CREATE TABLE course (
  course_id  varchar(8) PRIMARY KEY,
  title      varchar(40) NOT NULL,
  dept_name  varchar(20) REFERENCES department,
  credits    integer CHECK (credits > 0)
);

CREATE TABLE takes (
  id         char(5) REFERENCES student,
  course_id  varchar(8) REFERENCES course,
  semester   varchar(6) CHECK (semester IN ('Fall', 'Spring', 'Summer')),
  year       integer CHECK (year BETWEEN 2000 AND 2100),
  grade      varchar(2),
  PRIMARY KEY (id, course_id, semester, year)
);

INSERT INTO department VALUES
  ('Comp. Sci.',  'Hale',   120000),
  ('Mathematics', 'Hale',    90000),
  ('Physics',     'Kirk',    85000),
  ('Biology',     'Morrow',  95000),
  ('History',     'Linden',  50000),
  ('Music',       'Linden',  60000);

INSERT INTO instructor VALUES
  ('10101', 'Avery Chen',   'Comp. Sci.',  98000),
  ('12121', 'Jordan Patel', 'Comp. Sci.',  92000),
  ('15151', 'Maria Lopez',  'Mathematics', 87000),
  ('22222', 'Sam Okafor',   'Physics',     95000),
  ('32343', 'Lena Fischer', 'History',     61000),
  ('33456', 'Kofi Mensah',  'Physics',     87000),
  ('45565', 'Priya Raman',  'Comp. Sci.',  75000),
  ('58583', 'Tomas Novak',  'History',     62000),
  ('76543', 'Hana Sato',    'Biology',     80000),
  ('83821', 'Diego Torres', 'Music',       72000);

INSERT INTO student VALUES
  ('00128', 'Riley Adams',   'Comp. Sci.',  102),
  ('12345', 'Morgan Lee',    'Comp. Sci.',   32),
  ('19991', 'Casey Brooks',  'History',      80),
  ('23121', 'Jamie Rivera',  'Physics',     110),
  ('44553', 'Taylor Nguyen', 'Physics',      56),
  ('45678', 'Drew Kim',      'Physics',      46),
  ('54321', 'Alex Johnson',  'Comp. Sci.',   54),
  ('55739', 'Sky Martinez',  'Music',        38),
  ('70557', 'Quinn Davis',   'Physics',       0),
  ('76653', 'Robin Ali',     'Mathematics',  58),
  ('98765', 'Jesse Park',    'Mathematics',  98),
  ('98988', 'Avery Clark',   'Biology',     120);

INSERT INTO course VALUES
  ('CS-101',  'Intro to Computer Science', 'Comp. Sci.',  4),
  ('CS-190',  'Game Design',               'Comp. Sci.',  4),
  ('CS-315',  'Robotics',                  'Comp. Sci.',  3),
  ('CS-347',  'Database System Concepts',  'Comp. Sci.',  3),
  ('MA-201',  'Linear Algebra',            'Mathematics', 3),
  ('PHY-101', 'Physical Principles',       'Physics',     4),
  ('HIS-351', 'World History',             'History',     3),
  ('MU-199',  'Music Video Production',    'Music',       3),
  ('BIO-101', 'Intro to Biology',          'Biology',     4);

INSERT INTO takes VALUES
  ('00128', 'CS-101',  'Fall',   2025, 'A'),
  ('00128', 'CS-347',  'Fall',   2025, 'A-'),
  ('12345', 'CS-101',  'Fall',   2025, 'C'),
  ('12345', 'CS-190',  'Spring', 2026, 'A'),
  ('12345', 'CS-315',  'Spring', 2026, 'A'),
  ('12345', 'CS-347',  'Fall',   2025, 'A'),
  ('19991', 'HIS-351', 'Spring', 2026, 'B'),
  ('23121', 'PHY-101', 'Fall',   2025, 'C+'),
  ('44553', 'PHY-101', 'Fall',   2025, 'B-'),
  ('45678', 'CS-101',  'Fall',   2025, 'F'),
  ('45678', 'CS-101',  'Spring', 2026, 'B+'),
  ('45678', 'CS-315',  'Spring', 2026, 'B'),
  ('54321', 'CS-101',  'Fall',   2025, 'A-'),
  ('54321', 'CS-190',  'Spring', 2026, 'B+'),
  ('55739', 'MU-199',  'Spring', 2026, 'A-'),
  ('76653', 'MA-201',  'Fall',   2025, 'C'),
  ('98765', 'CS-101',  'Fall',   2025, 'C-'),
  ('98765', 'CS-315',  'Spring', 2026, 'B'),
  ('98988', 'BIO-101', 'Spring', 2026, 'A'),
  ('98988', 'CS-347',  'Spring', 2027, NULL),
  ('70557', 'CS-347',  'Spring', 2027, NULL),
  ('54321', 'MA-201',  'Spring', 2027, NULL);

-- New in week 3 ------------------------------------------------------------

CREATE TABLE teaches (
  id         char(5) REFERENCES instructor,
  course_id  varchar(8) REFERENCES course,
  semester   varchar(6) CHECK (semester IN ('Fall', 'Spring', 'Summer')),
  year       integer CHECK (year BETWEEN 2000 AND 2100),
  PRIMARY KEY (id, course_id, semester, year)
);

CREATE TABLE advisor (
  s_id       char(5) PRIMARY KEY REFERENCES student,
  i_id       char(5) NOT NULL REFERENCES instructor
);

-- A department with no instructors, students or courses yet.
INSERT INTO department VALUES ('Economics', 'Watson', 70000);

-- A new hire whose salary is not set yet.
INSERT INTO instructor VALUES ('98345', 'Noor Haddad', 'Mathematics', NULL);

-- A student who has not declared a department.
INSERT INTO student VALUES ('61234', 'Emery Walsh', NULL, 12);

-- A course in the catalog that nobody teaches or takes yet.
INSERT INTO course VALUES ('CS-319', 'Image Processing', 'Comp. Sci.', 3);

INSERT INTO teaches VALUES
  ('10101', 'CS-101',  'Fall',   2025),
  ('10101', 'CS-347',  'Fall',   2025),
  ('10101', 'CS-315',  'Spring', 2026),
  ('12121', 'CS-190',  'Spring', 2026),
  ('45565', 'CS-101',  'Spring', 2026),
  ('45565', 'CS-347',  'Spring', 2027),
  ('15151', 'MA-201',  'Fall',   2025),
  ('15151', 'MA-201',  'Spring', 2027),
  ('22222', 'PHY-101', 'Fall',   2025),
  ('32343', 'HIS-351', 'Spring', 2026),
  ('83821', 'MU-199',  'Spring', 2026),
  ('76543', 'BIO-101', 'Spring', 2026);

INSERT INTO advisor VALUES
  ('00128', '45565'),
  ('12345', '10101'),
  ('19991', '32343'),
  ('23121', '22222'),
  ('44553', '22222'),
  ('45678', '33456'),
  ('54321', '10101'),
  ('76653', '15151'),
  ('98765', '15151'),
  ('98988', '76543');
