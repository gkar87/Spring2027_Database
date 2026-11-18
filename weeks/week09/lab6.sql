-- CS 4600/5200 · Lab 6: a registration helper in Python, part 1 (SQL)
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- Put this file in the same folder as university.sql and lab6.py. Run it first,
-- then the Python program, and keep both outputs in one file:
--   psql -d university -e -f lab6.sql > lab6_output.txt 2>&1
--   python lab6.py >> lab6_output.txt 2>&1
-- On Windows, add -U postgres after psql. On macOS and Linux, type python3 if
-- python is not found. Note the >> on the second line: it adds to the file.
--
-- The lines below reload the university database quietly, so every run starts
-- from the same data, and remove this lab's table and role. Leave them as they
-- are, and run lab6.sql again before every run of lab6.py.
\set ECHO none
\set QUIET on
DROP TABLE IF EXISTS enroll_log;
\ir university.sql
DROP ROLE IF EXISTS registrar_app;
\set QUIET off
\set ECHO queries
--
-- Submit this file, lab6.py, lab6_output.txt and lab6_answers.txt in one zip:
-- lab6_lastname_firstname.zip (see the handout).

-- Q1. CREATE TABLE enroll_log: one row for every enrollment request lab6.py
--     handles, accepted or refused (see the handout for the columns).


-- Q2. Enrollments already in takes that break a prerequisite:
--     id, name, course_id, missing (four columns, eight rows).


-- Q3. The program's own role, registrar_app, with only the privileges it needs.
--     Then SET ROLE registrar_app, count the rows of takes, try the DELETE
--     below (it must be refused), and RESET ROLE.

-- DELETE FROM takes WHERE id = '45678';
