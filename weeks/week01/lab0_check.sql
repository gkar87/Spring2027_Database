-- CS 4600/5200 Lab 0 self-check.
-- Run it after loading university.sql:   psql -d university -f lab0_check.sql
-- Every line should say PASS.
SELECT t.relation,
       t.expected,
       t.found,
       CASE WHEN t.expected = t.found THEN 'PASS' ELSE 'FAIL: reload university.sql' END AS status
FROM (
  VALUES ('department', 6,  (SELECT count(*) FROM department)),
         ('instructor', 10, (SELECT count(*) FROM instructor)),
         ('student',    12, (SELECT count(*) FROM student)),
         ('course',     9,  (SELECT count(*) FROM course)),
         ('takes',      22, (SELECT count(*) FROM takes))
) AS t(relation, expected, found);
