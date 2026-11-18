-- CS 4600/5200 Database Theory and Applications, Spring 2027
-- Week 7: the tutoring center's sign-in sheet, typed into one wide table.
-- One row per tutoring session. Used by the week 7 playground and Lab 5.
-- Runs on PostgreSQL 14 or newer. It drops the tutoring tables first, so it
-- is safe to run again whenever you want the starting data back.

DROP TABLE IF EXISTS tutoring, tutor_session, tutee, tutor, subject_center,
  center, advises CASCADE;

CREATE TABLE tutoring (
  student_id    char(3),
  student_name  varchar(30),
  student_email varchar(40),
  tutor_id      char(2),
  tutor_name    varchar(30),
  subject       varchar(20),
  center        varchar(20),
  center_room   varchar(20),
  session_date  date,
  minutes       integer
);

INSERT INTO tutoring VALUES
  ('S01', 'Ava Brooks', 'abrooks@example.edu', 'T1', 'Marco Silva', 'Calculus', 'Math Lab', 'Hale 104', '2027-01-19', 60),
  ('S01', 'Ava Brooks', 'abrooks@example.edu', 'T1', 'Marco Silva', 'Calculus', 'Math Lab', 'Hale 104', '2027-01-26', 45),
  ('S01', 'Ava Brooks', 'abrooks@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-02-02', 30),
  ('S02', 'Liam Ortega', 'lortega@example.edu', 'T4', 'Sam Rivers', 'Calculus', 'Math Lab', 'Hale 104', '2027-01-20', 60),
  ('S02', 'Liam Ortega', 'lortega@example.edu', 'T2', 'Jun Park', 'Statistics', 'Math Lab', 'Hale 104', '2027-01-27', 45),
  ('S02', 'Liam Ortega', 'lortega@example.edu', 'T4', 'Sam Rivers', 'Calculus', 'Math Lab', 'Hale 104', '2027-02-03', 60),
  ('S03', 'Jia Lee', 'jlee@example.edu', 'T3', 'Elena Petrova', 'Chemistry', 'Science Hub', 'Morrow 210', '2027-01-21', 45),
  ('S03', 'Jia Lee', 'jlee@example.edu', 'T3', 'Elena Petrova', 'Chemistry', 'Science Hub', 'Morrow 210', '2027-01-28', 60),
  ('S03', 'Jia Lee', 'j.lee@example.edu', 'T1', 'Marco Silva', 'Calculus', 'Math Lab', 'Hale 104', '2027-02-04', 30),
  ('S04', 'Noor Saleh', 'nsaleh@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-01-19', 60),
  ('S04', 'Noor Saleh', 'nsaleh@example.edu', 'T2', 'Jun Park', 'Statistics', 'Math Lab', 'Hale 104', '2027-01-26', 30),
  ('S04', 'Noor Saleh', 'nsaleh@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-02-09', 45),
  ('S05', 'Ethan Cole', 'ecole@example.edu', 'T4', 'Sam Rivers', 'Calculus', 'Math Lab', 'Hale 104', '2027-01-22', 30),
  ('S05', 'Ethan Cole', 'ecole@example.edu', 'T3', 'Elena Petrov', 'Chemistry', 'Science Hub', 'Morrow 210', '2027-02-05', 60),
  ('S06', 'Maya Singh', 'msingh@example.edu', 'T2', 'Jun Park', 'Statistics', 'Math Lab', 'Hale 104', '2027-01-20', 60),
  ('S06', 'Maya Singh', 'msingh@example.edu', 'T1', 'Marco Silva', 'Calculus', 'Math Lab', 'Hale 104', '2027-01-27', 45),
  ('S06', 'Maya Singh', 'msingh@example.edu', 'T2', 'Jun Park', 'Statistics', 'Math Lab', 'Hale 104', '2027-02-03', 60),
  ('S06', 'Maya Singh', 'msingh@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-02-10', 30),
  ('S07', 'Owen Price', 'oprice@example.edu', 'T3', 'Elena Petrova', 'Chemistry', 'Science Hub', 'Morrow 210', '2027-01-25', 45),
  ('S07', 'Owen Price', 'oprice@example.edu', 'T4', 'Sam Rivers', 'Calculus', 'Math Lab', 'Hale 104', '2027-02-01', 60),
  ('S08', 'Zara Ali', 'zali@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-01-21', 45),
  ('S08', 'Zara Ali', 'zali@example.edu', 'T3', 'Elena Petrova', 'Chemistry', 'Science Hub', 'Morrow 210', '2027-01-28', 30),
  ('S08', 'Zara Ali', 'zali@example.edu', 'T5', 'Noah Kim', 'Writing', 'Writing Center', 'Library 2B', '2027-02-04', 60),
  ('S08', 'Zara Ali', 'zali@example.edu', 'T2', 'Jun Park', 'Statistics', 'Math Lab', 'Hale 104', '2027-02-11', 45);
