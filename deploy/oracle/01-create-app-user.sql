-- Run once as ADMIN in Autonomous Database → Database Actions → SQL.
-- Replace the password (12–30 chars, upper + lower + digit; no double quotes). Keep it out of git and chat.
CREATE USER ibt_app IDENTIFIED BY "Change-Me-Str0ng-Passw0rd";
GRANT CREATE SESSION, CREATE TABLE TO ibt_app;
ALTER USER ibt_app QUOTA 1G ON DATA;

-- The game server creates its table on first start. For reference, it is:
--   CREATE TABLE ibt_docs (
--     path VARCHAR2(512) PRIMARY KEY, coll VARCHAR2(512) NOT NULL,
--     data CLOB NOT NULL CHECK (data IS JSON), updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL);
--   CREATE INDEX ibt_docs_coll ON ibt_docs (coll);
