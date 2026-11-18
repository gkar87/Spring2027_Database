-- CS 4600/5200 Lab 9: campus events, kept as documents.
-- 4,000 events from January 11 to May 7, 2027, one jsonb document each, made
-- by arithmetic on the event id (not random()), so every copy holds the same
-- documents. Each event has a title, a kind, a host, a start time, a capacity,
-- usually a room, sometimes an online platform, some tags, and a list of
-- RSVPs. Like real data, a few documents are not quite right.
DROP TABLE IF EXISTS event;

CREATE TABLE event (
  id   integer PRIMARY KEY,
  doc  jsonb NOT NULL
);

WITH host(h, name, dept, building, kinds) AS (VALUES
  (0, 'ACM student chapter', 'Comp. Sci.',  'Hale',   ARRAY['talk', 'workshop', 'club']),
  (1, 'Robotics club',       'Comp. Sci.',  'Hale',   ARRAY['club', 'workshop']),
  (2, 'Math circle',         'Mathematics', 'Hale',   ARRAY['club', 'talk']),
  (3, 'Physics club',        'Physics',     'Kirk',   ARRAY['talk', 'club']),
  (4, 'Biology club',        'Biology',     'Morrow', ARRAY['club', 'sports', 'talk']),
  (5, 'History society',     'History',     'Linden', ARRAY['talk', 'club']),
  (6, 'Concert band',        'Music',       'Linden', ARRAY['concert']),
  (7, 'Career services',     NULL,          'Watson', ARRAY['career', 'workshop']),
  (8, 'Campus recreation',   NULL,          'Watson', ARRAY['sports'])
), base AS (
  SELECT g.id, h.*,
         h.kinds[1 + (g.id / 9) % array_length(h.kinds, 1)] AS kind,
         (g.id * 69069 + 5) % 65521 AS r1, (g.id * 1103 + 7) % 9001 AS r2,
         (g.id * 7573 + 3) % 8191 AS r3, (g.id * 2654435761::bigint) % 1000003 AS r4
  FROM generate_series(1, 4000) AS g(id)
  JOIN host h ON h.h = (g.id * 5) % 9
), shaped AS (
  SELECT b.*,
         CASE kind WHEN 'talk' THEN 80 + r2 % 121 WHEN 'club' THEN 20 + r2 % 41
                   WHEN 'sports' THEN 100 + r2 % 401 WHEN 'career' THEN 150 + r2 % 251
                   WHEN 'concert' THEN 100 + r2 % 201 ELSE 15 + r2 % 26 END AS cap,
         (id * 7919) % 41 AS n_rsvp,
         r3 % 10 AS place          -- 0: online only, 1: hybrid, else in person
  FROM base b
)
INSERT INTO event
SELECT id, jsonb_strip_nulls(jsonb_build_object(
  'title', CASE WHEN id % 997 <> 0 THEN name || ': ' ||
             (CASE kind WHEN 'talk' THEN ARRAY['Guest speaker', 'Research talk', 'Alumni panel']
                        WHEN 'club' THEN ARRAY['Weekly meeting', 'Game night', 'Officer elections']
                        WHEN 'sports' THEN ARRAY['Intramural soccer', '5K fun run', 'Climbing night']
                        WHEN 'career' THEN ARRAY['Resume review', 'Internship fair', 'Mock interviews']
                        WHEN 'concert' THEN ARRAY['Spring concert', 'Jazz night', 'Student recital']
                        ELSE ARRAY['Intro to Git', 'SQL bootcamp', 'Study skills'] END)[1 + r1 % 3] END,
  'kind', kind,
  'host', jsonb_strip_nulls(jsonb_build_object('name', name, 'dept', dept)),
  'starts', to_char(date '2027-01-11' + (r4 % 117)::int + make_interval(hours => 11 + r3 % 9, mins => 30 * (r2 % 2)), 'YYYY-MM-DD"T"HH24:MI'),
  'capacity', CASE WHEN id % 401 = 0 THEN to_jsonb(cap::text) ELSE to_jsonb(cap) END,
  'room', CASE WHEN place <> 0 THEN jsonb_build_object('building', building, 'room', 100 + (r1 % 30) * 10) END,
  'online', CASE WHEN place <= 1 THEN jsonb_build_object('platform', (ARRAY['Zoom', 'Teams'])[1 + id % 2]) END,
  'tags', (SELECT jsonb_agg(t ORDER BY t) FROM (
             SELECT t FROM unnest(ARRAY['free food', 'beginner friendly', 'registration required', 'accessible'])
                    WITH ORDINALITY AS u(t, k) WHERE (r1 / (1 + k * 3)) % 4 = 0
             UNION SELECT 'music' WHERE kind = 'concert'
             UNION SELECT 'networking' WHERE kind = 'career' OR (kind = 'talk' AND r3 % 3 = 0)
             UNION SELECT 'outdoors' WHERE kind = 'sports' AND r3 % 2 = 0) AS x),
  'rsvps', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'student', 'S' || lpad(((id * 37 + j * 101) % 900 + 1)::text, 4, '0'),
                     'status', CASE WHEN (id + j) % 4 = 0 THEN 'maybe' ELSE 'going' END) ORDER BY j), '[]')
            FROM generate_series(1, n_rsvp) AS j)
))
FROM shaped;

ANALYZE event;
