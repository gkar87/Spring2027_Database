"""CS 4600/5200 · Lab 6: a registration helper in Python.

Name: ____________________   Course: CS 4600 / CS 5200

Write the body of each function marked P1 to P7 (and P8 for CS 5200). Every
value that comes from outside the SQL text goes in as a parameter: a %s in the
query and a tuple of values after it. Never build SQL with +, f-strings,
format() or %.

Run lab6.sql first, then this file, and keep both outputs in one file:
    psql -d university -e -f lab6.sql > lab6_output.txt 2>&1
    python lab6.py >> lab6_output.txt 2>&1

Do not put a password in this file. If your database needs one (Windows,
usually), set it in the terminal before you run the program, as the handout
shows.
"""
import os
import sys

import psycopg

CONNINFO = os.environ.get("LAB6_DB", "dbname=university")

# Grade points for Part D (CS 5200).
POINTS = {"A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3,
          "C": 2.0, "C-": 1.7, "D": 1.0, "F": 0.0}


# ---------------------------------------------------------------- P1
def roster(conn, course_id, semester, year):
    """Students who took one offering of a course.
    Return a list of (id, name, grade) tuples, ordered by name.
    Hint: cur = conn.execute("SELECT ... WHERE x = %s AND y = %s", (x, y))
          then return cur.fetchall()."""
    raise NotImplementedError


# ---------------------------------------------------------------- P2
def find_students(conn, text):
    """Students whose name contains text, in any case (ILIKE).
    Return a list of (id, name) tuples, ordered by name.
    The wildcards belong in the value, not in the SQL text."""
    raise NotImplementedError


# ---------------------------------------------------------------- P3
def missing_prereqs(conn, student_id, course_id):
    """The prerequisites of course_id that student_id has not passed.
    Passed means a takes row for that prerequisite with a grade that is not
    NULL and not 'F'. Return a sorted list of course ids, like ['CS-101'],
    or [] when nothing is missing. Lab 6 Q2 is the same idea for every row."""
    raise NotImplementedError


# ---------------------------------------------------------------- P4
def log(conn, student_id, course_id, semester, year, outcome, reason):
    """Given, as an example of an INSERT with parameters. It does not commit."""
    conn.execute(
        """INSERT INTO enroll_log (student_id, course_id, semester, year, outcome, reason)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (student_id, course_id, semester, year, outcome, reason))


def enroll(conn, student_id, course_id, semester, year):
    """Enroll a student in a course for a term, with grade NULL, or refuse.
    Refuse with one of these reasons, checked in this order:
        'no such student', 'no such course', 'missing CS-101, MA-201'
        (the missing prerequisites, as missing_prereqs gives them),
        'already enrolled' (the INSERT into takes raises
        psycopg.errors.UniqueViolation: roll back, then log).
    Log every request with log(), outcome 'enrolled' or 'refused', and commit
    once at the end. Return 'enrolled' or 'refused: ' + the reason."""
    raise NotImplementedError


# ---------------------------------------------------------------- P5
def preview_raise(conn, dept_name, percent):
    """Give everyone in dept_name a raise of percent, rounded to cents, read
    back what changed with RETURNING, then roll back so nothing is kept.
    Return a list of (name, old_salary, new_salary), ordered by name.
    Hint: UPDATE instructor i ... FROM instructor o WHERE o.id = i.id ...
    lets RETURNING show o.salary, the value before the UPDATE."""
    raise NotImplementedError


# ---------------------------------------------------------------- P6
def students_page(conn, after_id, size):
    """One page of students for a list that shows size at a time: the first
    size students whose id is greater than after_id, ordered by id.
    Return a list of (id, name). Use WHERE and LIMIT, not OFFSET."""
    raise NotImplementedError


# ---------------------------------------------------------------- P7
def dept_counts(conn):
    """Every department with its number of students, 0 included, ordered by
    department name, in ONE query. Return a list of (dept_name, count)."""
    raise NotImplementedError


# ---------------------------------------------------------------- P8 (CS 5200)
def gpa_report(conn, batch):
    """Each student's GPA over graded courses, weighted by credits, computed
    in Python from rows read through a server-side cursor,
    conn.cursor(name="gpa_rows"), with cur.fetchmany(batch) in a loop.
    Ungraded rows (grade NULL) do not count; an F counts as 0 points.
    Return (list of (id, name, gpa rounded to 2 places) ordered by id,
            the number of batches fetched that held rows).
    Roll back at the end: a server-side cursor lives inside a transaction."""
    raise NotImplementedError


# ======================================================== do not change below
def show(title, fn):
    print("\n== " + title)
    try:
        result = fn()
    except NotImplementedError:
        print("   not written yet")
        return
    except psycopg.Error as e:
        print("   database error:", e)
        conn.rollback()
        return
    if isinstance(result, list):
        for row in result:
            print("  ", row)
        if all(isinstance(row, tuple) for row in result):
            print("   ({} row{})".format(len(result), "" if len(result) == 1 else "s"))
    else:
        print("  ", result)


def report_lines(result):
    report, batches = result
    return report + ["batches fetched: {}".format(batches)]


def all_pages(conn, size):
    pages, after = [], ""
    while len(pages) < 10:
        rows = students_page(conn, after, size)
        if not rows:
            break
        pages.append("page {}: {}".format(len(pages) + 1, ", ".join(r[0] for r in rows)))
        after = rows[-1][0]
    return pages


def main():
    global conn
    print("Lab 6 output, Python", sys.version.split()[0], "and psycopg", psycopg.__version__)
    conn = psycopg.connect(CONNINFO)
    print("Connected to PostgreSQL", conn.info.server_version)

    show("P1 roster('CS-101', 'Fall', 2025)", lambda: roster(conn, "CS-101", "Fall", 2025))
    show("P1 roster('CS-347', 'Spring', 2027)", lambda: roster(conn, "CS-347", "Spring", 2027))
    show("P2 find_students('ri')", lambda: find_students(conn, "ri"))
    show("P2 find_students(\"' OR 1=1 --\")", lambda: find_students(conn, "' OR 1=1 --"))
    show("P3 missing_prereqs('98988', 'CS-347')", lambda: missing_prereqs(conn, "98988", "CS-347"))
    show("P3 missing_prereqs('45678', 'CS-190')", lambda: missing_prereqs(conn, "45678", "CS-190"))
    for args in [("00128", "CS-190", "Fall", 2027), ("00128", "CS-190", "Fall", 2027),
                 ("54321", "CS-347", "Fall", 2027), ("99999", "CS-101", "Fall", 2027),
                 ("45678", "CS-190", "Fall", 2027)]:
        show("P4 enroll" + str(args), lambda a=args: enroll(conn, *a))
    show("P4 the log", lambda: conn.execute(
        "SELECT student_id, course_id, outcome, reason FROM enroll_log ORDER BY log_id").fetchall())
    show("P5 preview_raise('Comp. Sci.', 4)", lambda: preview_raise(conn, "Comp. Sci.", 4))
    show("P5 salaries afterwards, unchanged", lambda: conn.execute(
        "SELECT name, salary FROM instructor WHERE dept_name = 'Comp. Sci.' ORDER BY name").fetchall())
    show("P6 every student, 5 per page", lambda: all_pages(conn, 5))
    show("P7 dept_counts()", lambda: dept_counts(conn))
    show("P8 gpa_report(conn, 4), CS 5200", lambda: report_lines(gpa_report(conn, 4)))
    conn.rollback()
    conn.close()


if __name__ == "__main__":
    main()
