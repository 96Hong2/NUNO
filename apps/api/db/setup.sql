-- Postgres 마다 관리자가 한 번 돌린다. 역할은 DB 밖(클러스터) 것이라 판 옮기기에 넣지 않는다.
-- 비밀번호는 여기 두지 않는다. 로컬은 scripts/test-db.mjs 가 넣고, 개발 서버와 출시용은 관리자가 \password 로 넣는다.
--   nuno_owner: 판 옮기기를 돌리고 표를 가진다. 로그인하지 않는다.
--   nuno_api:   API 서버가 접속한다. 판 옮기기가 GRANT 로 준 만큼만 읽고 쓴다.
-- 운영자 역할은 운영 방식을 정하는 Task 에서 더한다. 그때까지 스위치는 관리자가 바꾼다.
SELECT 'CREATE ROLE nuno_owner NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nuno_owner') \gexec
SELECT 'CREATE ROLE nuno_api LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nuno_api') \gexec

-- 판 옮기기를 돌리는 관리자가 nuno_owner 로 표를 만든다.
GRANT nuno_owner TO CURRENT_USER;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE, USAGE ON SCHEMA public TO nuno_owner;
GRANT USAGE ON SCHEMA public TO nuno_api;
