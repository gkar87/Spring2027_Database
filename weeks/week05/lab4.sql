-- CS 4600/5200 · Lab 4: changing data, constraints and views
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- Put this file in the same folder as university.sql (the week 5 version,
-- with the prereq table). Then run the whole file with
--   psql -d university -e -f lab4.sql > lab4_output.txt 2>&1
-- On Windows, add -U postgres after psql. End every statement with a semicolon.
--
-- The lines below reload the database first, quietly, so every run starts
-- from the same data. Leave them as they are. Each question changes the data
-- the next one sees, so always run the whole file, never one question alone.
\set ECHO none
\set QUIET on
\ir university.sql
\set QUIET off
\set ECHO queries
--
-- Submit this file, lab4_output.txt and lab4_answers.txt in one zip:
-- lab4_lastname_firstname.zip (see the handout).

-- Q1. Table classroom (building, room_number, capacity); insert four rooms; show all.
DROP TABLE IF EXISTS classroom;


-- Q2. Add a column level to course and fill it from the course number; show course_id, level.


-- Q3. New hire Ines Duarte teaches CS-319 in Fall 2027; then times each course was taught.


-- Q4. One UPDATE: 4% raise under 70,000, 2% otherwise; show name, salary.


-- Q5. Delete every enrollment in a Music course; show how many enrollments are left.


-- Q6. Constraint grade_valid; then the two INSERTs from the handout; then the count.


-- Q7. View transcript; then Morgan Lee's transcript.


-- Q8. View dept_stats (instructors, students, courses per department); select from it.


-- Q9. Every course needed before CS-319, with its title and depth. WITH RECURSIVE.


-- Q10. Deleting a student also deletes their enrollments and advisor row; delete Drew Kim.


-- W1. Paste the query from the handout here, so its result is in your output.


-- Q11. (CS 5200 only) Trigger credits_earned; then the three UPDATEs and the SELECT.


-- Q12. (CS 5200 only) Role grader; then the statements from the handout, as grader.

