-- CS 4600/5200 · Lab 2: queries, joins and NULLs
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- Reload this week's database first (it has seven tables):
--   psql -d university -f university.sql
-- Write each query under its comment. Then run the whole file with
--   psql -d university -e -f lab2.sql > lab2_output.txt 2>&1
-- On Windows, add -U postgres after psql. End every query with a semicolon.
-- Submit this file, lab2_output.txt and lab2_answers.txt in one zip:
-- lab2_lastname_firstname.zip (see the handout).

-- Q1. course_id, title and credits of every 4-credit course, by title.


-- Q2. Name and tot_cred of students with 50 to 100 credits, most first.


-- Q3. Physics and Biology instructors: name, salary, raised (4%, to cents). Use IN.


-- Q4. Every Fall 2025 grade: student name, course title, grade; by name, then title.


-- Q5. Students whose advisor earns more than 90,000, with the advisor's name.


-- Q6. Every department with its instructors' names; empty departments too.


-- Q7. Students who have never taken a course. Use an outer join.


-- Q8. Instructors who both teach and advise. INTERSECT on ids, then names.


-- Q9. Enrollments without an A: name, course_id, grade ('in progress' if none yet).


-- Q10. Students who took a section taught by their own advisor, each once.


-- Q11. (CS 5200 only) Pairs of students in the same section, each pair once.


-- Q12. (CS 5200 only) Q7 again, with EXCEPT and no outer join.

