-- CS 4600/5200 · Lab 7: predict the cost, then measure it
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- Put this file in the same folder as university.sql and big_tables.sql. Then
-- run the whole file with
--   psql -d university -e -f lab7.sql > lab7_output.txt 2>&1
-- On Windows, add -U postgres after psql. End every statement with a semicolon.
--
-- The lines below reload the university database and the two big tables
-- quietly, so every run starts from the same data with no extra indexes. Leave
-- them as they are, and always run the whole file. Loading takes a few seconds.
\set ECHO none
\set QUIET on
DROP TABLE IF EXISTS big_takes, big_student;
\ir university.sql
\ir big_tables.sql
\set QUIET off
\set ECHO queries
--
-- Every EXPLAIN in this lab uses the same options, so the grader can compare:
--   EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
-- Each question that changes a setting ends with RESET ALL; so the next
-- question starts from the defaults.
--
-- Submit this file, lab7_output.txt and lab7_answers.txt in one zip:
-- lab7_lastname_firstname.zip (see the handout).

-- Q1. One query: relname, pages and rows (reltuples) for big_student,
--     big_takes, big_student_pkey and big_takes_pkey (four rows).


-- Q2. The plan of the join of all students with all their enrollments,
--     with every setting as it is:
--     SELECT count(*) FROM big_student s JOIN big_takes t ON t.student_no = s.student_no


-- Q3. The same join as a merge join: turn off the hash join and the nested
--     loop, EXPLAIN, then RESET ALL.


-- Q4. The same join as an indexed nested loop: turn off the hash join, the
--     merge join and memoize, EXPLAIN, then RESET ALL.


-- Q5. With work_mem at 64kB, the plan of
--     SELECT * FROM big_takes ORDER BY course_id, year
--     then RESET ALL.


-- Q6. The same sort with the default work_mem, and then with LIMIT 10.


-- Q7. Three plans, each with LIMIT 5, of the enrollments with grade 'F':
--     (a) in no order, (b) ORDER BY year, (c) ORDER BY reg_id.


-- Q8. For each department, the number of F grades its students received:
--     dept_name, f_grades, most first, then by dept_name. The query, then its plan.


-- Q9. Student 4321's name with each course_id and year they took (a join).
--     Its plan; then CREATE INDEX big_takes_student_idx ON big_takes (student_no);
--     then its plan again.


-- Q10. How many Music students took no course in 2027? Use NOT EXISTS.
--      The query, then its plan (EXPLAIN (COSTS OFF) is enough here).


-- Part D (CS 5200 only).
-- D2. The join of the Music students with their enrollments, with the hash
--     join, merge join, index scans, bitmap scans and memoize all turned off.
--     EXPLAIN, then RESET ALL.

