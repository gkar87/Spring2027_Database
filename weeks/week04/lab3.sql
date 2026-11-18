-- CS 4600/5200 · Lab 3: aggregates, subqueries and windows
-- Name: ____________________   Course: CS 4600 / CS 5200
--
-- This lab uses the same seven-table database as Lab 2. If you changed it,
-- reload it first:
--   psql -d university -f university.sql
-- Write each query under its comment. Then run the whole file with
--   psql -d university -e -f lab3.sql > lab3_output.txt 2>&1
-- On Windows, add -U postgres after psql. End every query with a semicolon.
-- Submit this file, lab3_output.txt and lab3_answers.txt in one zip:
-- lab3_lastname_firstname.zip (see the handout).

-- Q1. Per department that offers courses: dept_name, courses, credits; by department.


-- Q2. Per term: year, semester, students (different students); by year, then semester.


-- Q3. Departments whose salaries total more than 150,000, with total.


-- Q4. Every instructor with advisees (0 included), most first, then by name.


-- Q5. Courses taken more often than the average course: title and count. Use WITH.


-- Q6. Students who took a course outside their own department. Use EXISTS.


-- Q7. Instructors paid more than every History instructor. Use ALL.


-- Q8. Students who took every course Avery Chen taught. NOT EXISTS with EXCEPT.


-- Q9. Enrollments per grade band (A, B, C, F, in progress): band, enrollments. Use CASE.


-- Q10. Top student(s) by tot_cred in each department, ties kept, no NULL department.


-- Q11. (CS 5200 only) Instructors below their department's average: name, dept_name, below.


-- Q12. (CS 5200 only) Q8 again with two NOT EXISTS and no EXCEPT.

