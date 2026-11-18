
-- Weeks 10 to 12: two generated tables big enough for indexes and query plans
-- to matter. big_student has 10,000 students and big_takes 100,000
-- enrollments. The values come from arithmetic on the row number, not from
-- random(), so every copy of the database holds the same rows, and the
-- statistics are taken from every row, so every copy gets the same plans.
-- Only the primary keys are indexed: adding the others is the week's work.
DROP TABLE IF EXISTS big_takes, big_student;

CREATE TABLE big_student (
  student_no integer PRIMARY KEY,
  name       varchar(40) NOT NULL,
  dept_name  varchar(20) REFERENCES department,
  tot_cred   integer NOT NULL CHECK (tot_cred >= 0)
);

INSERT INTO big_student
SELECT n,
       (ARRAY['Avery','Blake','Casey','Dana','Eli','Finley','Gray','Harper','Indigo','Jamie',
              'Kai','Logan','Morgan','Noel','Oakley','Parker','Quinn','Reese','Sage','Taylor'])[1 + n % 20]
       || ' ' ||
       (ARRAY['Adams','Brooks','Chen','Diaz','Evans','Fischer','Garcia','Hughes','Ito','Jensen',
              'Kim','Lopez','Moreau','Nguyen','Okafor','Patel','Quist','Rivera','Silva','Tanaka',
              'Usman','Vance','Walsh','Xu','Young'])[1 + (n / 20) % 25],
       (ARRAY['Comp. Sci.','Comp. Sci.','Comp. Sci.','Physics','Mathematics','Mathematics',
              'Biology','History','Economics','Music'])[1 + (n * 7) % 10],
       (n * 37) % 131
FROM generate_series(1, 10000) AS n;

CREATE TABLE big_takes (
  reg_id     integer PRIMARY KEY,
  student_no integer NOT NULL REFERENCES big_student,
  course_id  varchar(8) NOT NULL REFERENCES course,
  semester   varchar(6) NOT NULL,
  year       integer NOT NULL,
  grade      varchar(2)
);

INSERT INTO big_takes
SELECT g,
       1 + (g * 7919) % 10000,
       (ARRAY['CS-101','CS-101','CS-101','MA-201','MA-201','CS-190','CS-315','CS-319','CS-347',
              'BIO-101','PHY-101','PHY-101','HIS-351','MU-199'])[1 + (g * 31) % 14],
       (ARRAY['Fall','Spring','Summer','Fall','Spring'])[1 + (g * 3) % 5],
       2001 + (g * 17) % 27,
       CASE WHEN 2001 + (g * 17) % 27 = 2027 THEN NULL
            ELSE (ARRAY['A','A','A-','A-','B+','B+','B','B','B','B-','B-','C+','C','C','C-','D','F'])[1 + (g * 13) % 17]
       END
FROM generate_series(1, 100000) AS g;

SET default_statistics_target = 400;
ANALYZE big_student, big_takes;
RESET default_statistics_target;

-- plan_label(node): a plan node's name as EXPLAIN prints it, from its JSON:
-- HashAggregate or GroupAggregate, Hash Anti Join, Index Scan Backward. A step
-- that runs inside another step's condition starts with "SubPlan: ".
CREATE OR REPLACE FUNCTION plan_label(n jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE n ->> 'Parent Relationship' WHEN 'SubPlan' THEN 'SubPlan: ' WHEN 'InitPlan' THEN 'InitPlan: ' ELSE '' END
  || CASE
    WHEN n ->> 'Node Type' = 'Aggregate' THEN
      CASE n ->> 'Strategy' WHEN 'Hashed' THEN 'HashAggregate' WHEN 'Sorted' THEN 'GroupAggregate'
                            WHEN 'Mixed' THEN 'MixedAggregate' ELSE 'Aggregate' END
    WHEN n ->> 'Join Type' IS NOT NULL AND n ->> 'Join Type' <> 'Inner' THEN
      CASE WHEN n ->> 'Node Type' = 'Nested Loop' THEN 'Nested Loop ' || (n ->> 'Join Type') || ' Join'
           ELSE replace(n ->> 'Node Type', ' Join', ' ' || (n ->> 'Join Type') || ' Join') END
    WHEN n ->> 'Scan Direction' = 'Backward' THEN (n ->> 'Node Type') || ' Backward'
    ELSE n ->> 'Node Type'
  END
$$;

-- plan_steps(query): the steps of a query's plan, one row each, from the top.
-- Like EXPLAIN, but as a table that an exercise can check.
--   SELECT * FROM plan_steps('SELECT * FROM big_takes WHERE reg_id = 42');
CREATE OR REPLACE FUNCTION plan_steps(q text)
RETURNS TABLE (step integer, node text, on_table text, using_index text)
LANGUAGE plpgsql AS $$
DECLARE
  j jsonb;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO j;
  RETURN QUERY
  WITH RECURSIVE t(depth, path, n) AS (
    SELECT 0, ARRAY[0], j -> 0 -> 'Plan'
    UNION ALL
    SELECT t.depth + 1, t.path || c.i::integer, c.p
    FROM t, jsonb_array_elements(t.n -> 'Plans') WITH ORDINALITY AS c(p, i)
  )
  SELECT (row_number() OVER (ORDER BY t.path))::integer,
         repeat('  ', t.depth) || plan_label(t.n),
         t.n ->> 'Relation Name',
         t.n ->> 'Index Name'
  FROM t
  ORDER BY t.path;
END $$;

-- plan_actual(query): runs the query, like EXPLAIN ANALYZE, and returns each
-- step with the rows it really produced over all its runs, how many times it
-- ran, the table and index pages it touched (its own and its inputs'), and how
-- it sorted, if it did.
--   SELECT * FROM plan_actual('SELECT * FROM big_takes ORDER BY year LIMIT 5');
CREATE OR REPLACE FUNCTION plan_actual(q text)
RETURNS TABLE (step integer, node text, actual_rows bigint, loops bigint, pages bigint, sort_method text)
LANGUAGE plpgsql AS $$
DECLARE
  j jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) ' || q INTO j;
  RETURN QUERY
  WITH RECURSIVE t(depth, path, n) AS (
    SELECT 0, ARRAY[0], j -> 0 -> 'Plan'
    UNION ALL
    SELECT t.depth + 1, t.path || c.i::integer, c.p
    FROM t, jsonb_array_elements(t.n -> 'Plans') WITH ORDINALITY AS c(p, i)
  )
  SELECT (row_number() OVER (ORDER BY t.path))::integer,
         repeat('  ', t.depth) || plan_label(t.n),
         round((t.n ->> 'Actual Rows')::numeric * (t.n ->> 'Actual Loops')::numeric)::bigint,
         (t.n ->> 'Actual Loops')::bigint,
         ((t.n ->> 'Shared Hit Blocks')::bigint + (t.n ->> 'Shared Read Blocks')::bigint),
         t.n ->> 'Sort Method'
  FROM t
  ORDER BY t.path;
END $$;

-- plan_rows(query): runs the query, like EXPLAIN ANALYZE, and puts the
-- planner's guess next to the truth for each step: est_rows is how many rows
-- the planner expected one run of the step to produce, actual_rows how many
-- it really did (averaged over its runs, if it ran more than once).
--   SELECT * FROM plan_rows('SELECT * FROM big_takes WHERE year > 2020');
CREATE OR REPLACE FUNCTION plan_rows(q text)
RETURNS TABLE (step integer, node text, est_rows bigint, actual_rows bigint, loops bigint)
LANGUAGE plpgsql AS $$
DECLARE
  j jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ' || q INTO j;
  RETURN QUERY
  WITH RECURSIVE t(depth, path, n) AS (
    SELECT 0, ARRAY[0], j -> 0 -> 'Plan'
    UNION ALL
    SELECT t.depth + 1, t.path || c.i::integer, c.p
    FROM t, jsonb_array_elements(t.n -> 'Plans') WITH ORDINALITY AS c(p, i)
  )
  SELECT (row_number() OVER (ORDER BY t.path))::integer,
         repeat('  ', t.depth) || plan_label(t.n),
         round((t.n ->> 'Plan Rows')::numeric)::bigint,
         round((t.n ->> 'Actual Rows')::numeric)::bigint,
         (t.n ->> 'Actual Loops')::bigint
  FROM t
  ORDER BY t.path;
END $$;
