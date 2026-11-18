-- CS 4600/5200 · Lab 0: set up PostgreSQL and run your first queries
-- Name: ____________________   Section: online / face to face
--
-- Write each query under its comment. Then run the whole file with
--   psql -d university -e -f lab0.sql > lab0_output.txt 2>&1
-- (-e prints each query above its result; 2>&1 keeps the error messages too).
-- On Windows, add -U postgres after psql. Submit this file, lab0_output.txt
-- and lab0_answers.txt in one zip: lab0_lastname_firstname.zip (see the handout).
-- Errors in Q6 are expected: psql prints them and carries on.

-- Q1. Which PostgreSQL are you running?
SELECT version();

-- Q2. Does your database match the course's? (every row should say PASS)
\i lab0_check.sql

-- Q3. The name and budget of every department in the Hale building.


-- Q4. The name and total credits of every Physics student, most credits first.


-- Q5. Add a made-up student (not yourself) with an id that is not taken,
--     any department that exists, and 0 credits. Then select that one row.


-- Q6. Write one INSERT or UPDATE that breaks a constraint on purpose:
--     a primary key, a foreign key, or a CHECK. Name which one in a comment.

