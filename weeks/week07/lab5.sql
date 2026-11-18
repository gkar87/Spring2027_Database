-- CS 4600/5200 · Lab 5: normalizing the tutoring sign-in sheet
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- Put this file in the same folder as tutoring.sql. Then run the whole file with
--   psql -d university -e -f lab5.sql > lab5_output.txt 2>&1
-- On Windows, add -U postgres after psql. End every statement with a semicolon.
--
-- The lines below reload the tutoring sheet first, quietly, and drop every table
-- this lab creates, so every run starts from the same data. Leave them as they
-- are. Each question changes what the next one sees, so always run the whole
-- file, never one question alone.
\set ECHO none
\set QUIET on
\ir tutoring.sql
\set QUIET off
\set ECHO queries
--
-- Submit this file, lab5_output.txt and lab5_answers.txt in one zip:
-- lab5_lastname_firstname.zip (see the handout).

-- Q1. Number of sessions, of different students and of different tutors, in one row.


-- Q2. Students with more than one email address: student_id, emails.


-- Q3. Tutors with more than one name: tutor_id, names.


-- Q4. Two UPDATEs that fix the typos you found in Q2 and Q3.


-- Q5. One query: fd and violations for each of F1 to F5 (five rows).


-- Q6. rows, key_values and student_date_values, in one row.


-- Q7. CREATE TABLE center, subject_center, tutor, tutee, tutor_session.


-- Q8. Fill the five tables from tutoring; then table_name and rows for each.


-- Q9. View rejoined; then missing and extra, in one row.


-- Q10. center, center_room, total_minutes and sessions per center, from the new tables.


-- Q11. (CS 5200 only) Does (student_id, subject) -> tutor_id hold? violations.


-- Q12. (CS 5200 only) Table advises; fill it; count it; then the INSERT from the handout.
