-- CS 5200 · Lab 9: a document store of campus events
-- Name:
--
-- Put this file in the same folder as lab9_events.sql. Then run the whole
-- file with
--   psql -d university -e -f lab9.sql > lab9_output.txt 2>&1
-- On Windows, add -U postgres after psql. In Colab, start the line with !.
-- End every statement with a semicolon.
--
-- The lines below reload the events quietly, so every run starts from the same
-- data with no extra indexes. They also drop Part C's tables. Leave them as
-- they are, and always run the whole file.
\set ECHO none
\set QUIET on
DROP TABLE IF EXISTS ev_rsvp, ev_tag, ev;
\ir lab9_events.sql
\set QUIET off
\set ECHO queries
--
-- Every EXPLAIN in this lab uses the same options:
--   EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
--
-- Submit this file, lab9_output.txt and lab9_answers.txt in one zip:
-- lab9_lastname_firstname.zip (see the handout).

-- ===================================================== Part A: querying documents

-- Q1. How many events of each kind? Two columns, kind and events, most first,
-- ties by kind.


-- Q2. Events hosted by a Comp. Sci. group and tagged "free food" that start
-- on or after April 26, 2027: id, title and start, in order of start, ties by
-- id. Use @> for the host and the tag.


-- Q3. How many events are in person only, online only, and hybrid (both a
-- room and an online platform)? Use the ? operator.


-- Q4. Every tag and the number of events that carry it, most common first,
-- ties by tag.


-- Q5. The five events with the most "going" RSVPs: id, title and the number
-- going, ties broken by id.


-- Q6. Overbooked events have more "going" RSVPs than their capacity. First,
-- how many are there? Then show the five most overbooked: id, kind, capacity
-- and going, ordered by how far over capacity they are, ties by id.


-- Q7. Find the documents with a problem: no title, or a capacity that is not
-- a JSON number. Show the id and what is wrong, ordered by id.


-- Q8. With one JSON path and the @? operator, count the events that start in
-- April 2027 and have a capacity over 100.


-- ===================================================== Part B: indexes

-- Q9. The events student S0042 is going to: id and title, ordered by id.
-- EXPLAIN the query, create a GIN index on doc named event_doc, EXPLAIN it
-- again, then run it.


-- Q10. The events on April 27, 2027 (starts from '2027-04-27' up to but not
-- including '2027-04-28'): id and title. EXPLAIN it, create the index that
-- helps it, named event_starts, and EXPLAIN it again.


-- Q11. Show the size of the table event and of each of its three indexes,
-- largest first.


-- ===================================================== Part C: back to tables

-- Q12. Create the tables ev, ev_tag and ev_rsvp, with keys, and load them from
-- the documents with INSERT ... SELECT.


-- Q13. Check the load: one row with six counts, the number of events, tags
-- and RSVPs in the documents beside the number in your tables.


-- Q14. Q5 again, on your tables.

