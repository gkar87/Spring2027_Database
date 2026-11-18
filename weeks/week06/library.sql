
-- Week 6 design studio: a small campus library, next to the university tables.
-- The exercises add tables to it; Reset database drops those and puts the
-- starting library back.
DROP TABLE IF EXISTS loan, student_patron, copy, writes, patron_phone,
  librarian, patron, author, book, branch CASCADE;

CREATE TABLE branch (
  branch_id  varchar(4) PRIMARY KEY,
  name       varchar(30) NOT NULL,
  city       varchar(30) NOT NULL
);

CREATE TABLE book (
  isbn       varchar(17) PRIMARY KEY,
  title      varchar(60) NOT NULL,
  pub_year   integer
);

CREATE TABLE author (
  author_id  char(4) PRIMARY KEY,
  name       varchar(40) NOT NULL
);

CREATE TABLE patron (
  patron_id  char(5) PRIMARY KEY,
  name       varchar(40) NOT NULL,
  birth_date date,
  email      varchar(60) UNIQUE
);

-- Every librarian works at exactly one branch: a NOT NULL foreign key.
CREATE TABLE librarian (
  staff_id   char(4) PRIMARY KEY,
  name       varchar(40) NOT NULL,
  branch_id  varchar(4) NOT NULL REFERENCES branch
);

INSERT INTO branch VALUES
  ('MAIN', 'Main Library',    'Warrensburg'),
  ('EAST', 'Eastside Branch', 'Warrensburg'),
  ('LAKE', 'Lakeview Branch', 'Sedalia');

INSERT INTO book VALUES
  ('978-1-0000-0001-1', 'Data on the Prairie',       2019),
  ('978-1-0000-0002-8', 'Keys and Constraints',      2021),
  ('978-1-0000-0003-5', 'A Short History of Tables', 2016),
  ('978-1-0000-0004-2', 'Queries at Midnight',       2023),
  ('978-1-0000-0005-9', 'The Normal Form',           2020);

INSERT INTO author VALUES
  ('A001', 'Lucia Moreno'),
  ('A002', 'Femi Adeyemi'),
  ('A003', 'Mei Tanaka'),
  ('A004', 'Ravi Shah');

INSERT INTO patron VALUES
  ('P0001', 'Nina Volkova',  '2004-03-17', 'nvolkova@example.edu'),
  ('P0002', 'Omar Haddad',   '1958-11-02', 'ohaddad@example.com'),
  ('P0003', 'Grace Okoro',   '2001-07-29', NULL),
  ('P0004', 'Leo Brandt',    '1990-01-05', 'lbrandt@example.com'),
  ('P0005', 'Isla Murphy',   NULL,         'imurphy@example.edu');

INSERT INTO librarian VALUES
  ('L001', 'Ada Kowalski',  'MAIN'),
  ('L002', 'Ben Asante',    'MAIN'),
  ('L003', 'Carmen Ruiz',   'EAST'),
  ('L004', 'Dev Malhotra',  'LAKE');
