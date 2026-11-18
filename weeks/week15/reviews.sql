
-- Week 15: course reviews kept as documents, one jsonb value per review.
-- 3,000 reviews of the nine courses, made by arithmetic on the row number
-- (not random()), so every copy holds the same documents. 900 students
-- each review one course a term, three or four terms, never the same course
-- twice. The documents' shapes vary on purpose: every review has
-- course_id, student, term and rating; some also have tags, workload,
-- would_recommend, comment or ta.
-- kv is a tiny key-value store: one key, one value, nothing else.
DROP TABLE IF EXISTS review, kv;

CREATE TABLE review (
  id   integer PRIMARY KEY,
  doc  jsonb NOT NULL
);

INSERT INTO review
SELECT n, jsonb_strip_nulls(jsonb_build_object(
  'course_id', c,
  'student', 'S' || lpad(((s * 7919) % 900 + 1)::text, 4, '0'),
  'term', (ARRAY['Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027'])[1 + (s + k) % 4],
  'rating', least(5, greatest(1, base + (r1 % 5) - 2)),
  'tags', CASE WHEN r2 % 10 < 7 THEN
            (SELECT jsonb_agg(t ORDER BY t) FROM unnest(ARRAY['projects', 'exams', 'heavy reading', 'group work', 'labs', 'attendance'])
               WITH ORDINALITY AS u(t, k) WHERE (r3 / (1 + k * 3)) % 3 = 0) END,
  'workload', CASE WHEN r2 % 5 < 3 THEN jsonb_build_object('hours', 3 + r4 % 10, 'exams', r4 % 4) END,
  'would_recommend', CASE WHEN r5 % 10 < 7 THEN to_jsonb(base + (r1 % 5) - 2 >= 3) END,
  'comment', CASE WHEN r5 % 10 < 3 THEN
            (ARRAY['Hard but fair.', 'Start the projects early.', 'Great lectures.', 'Too much reading.',
                   'The labs made it click.', 'Office hours saved me.', 'Fast pace.'])[1 + r6 % 7] END,
  'ta', CASE WHEN r6 % 10 = 0 THEN jsonb_build_object('name', (ARRAY['Rowan', 'Emery', 'Jules'])[1 + r4 % 3], 'helpful', r3 % 4 <> 0) END
))
FROM (
  SELECT n, s, k, c, base,
         (n * 2654435761::bigint) % 1000003 AS r1, (n * 40503 + 17) % 9973 AS r2,
         (n * 69069 + 5) % 65521 AS r3, (n * 1103 + 7) % 9001 AS r4,
         (n * 7573 + 3) % 8191 AS r5, (n * 3571 + 11) % 7919 AS r6
  FROM generate_series(1, 3000) AS n,
       LATERAL (SELECT (n - 1) % 900 AS s, (n - 1) / 900 AS k) AS sk,
       LATERAL (SELECT (ARRAY['CS-101', 'CS-347', 'CS-190', 'CS-315', 'CS-101', 'CS-347',
                              'MA-201', 'PHY-101', 'CS-101', 'HIS-351', 'MU-199', 'BIO-101'])[1 + (s * 5 + k * 7) % 12] AS c) AS cc,
       LATERAL (SELECT CASE c WHEN 'CS-347' THEN 4 WHEN 'MU-199' THEN 5 WHEN 'PHY-101' THEN 3 WHEN 'MA-201' THEN 3
                              WHEN 'CS-101' THEN 4 WHEN 'HIS-351' THEN 4 ELSE 3 END AS base) AS b
) AS g;

CREATE TABLE kv (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

INSERT INTO kv VALUES
  ('session:8f3a', '{"student": "S0042", "cart": ["CS-347", "MA-201"], "expires": "2027-04-27T16:00"}'),
  ('session:91bc', '{"student": "S1187", "cart": [], "expires": "2027-04-27T15:10"}'),
  ('prefs:S0042',  '{"theme": "dark", "email_digest": "weekly"}'),
  ('counter:logins:2027-04-27', '318'),
  ('flag:new_registration', 'true');

ANALYZE review, kv;
