-- Initialize databases for Tinqer testing.
-- tinqer_test is created by the image from POSTGRES_DB; only create the extra DB here
-- (running CREATE DATABASE tinqer_test again would abort init on a fresh data dir).
CREATE DATABASE tinqer_integration;

-- Grant all privileges to postgres user
GRANT ALL PRIVILEGES ON DATABASE tinqer_test TO postgres;
GRANT ALL PRIVILEGES ON DATABASE tinqer_integration TO postgres;