-- 판 1: 기능 스위치와 생성 공급사 설정. 앱은 스위치 이름과 켜짐만 읽고, 공급사 설정에는 닿지 않는다.
-- 스위치를 바꾸는 API 는 없다. 지금은 관리자가 바꾼다.
CREATE TABLE feature_switches (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);

CREATE TABLE provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  model_version text NOT NULL,
  mode text NOT NULL,
  priority integer NOT NULL CHECK (priority IN (1, 2)),
  country text NOT NULL,
  subprocessor_countries text[] NOT NULL DEFAULT '{}',
  max_concurrency integer NOT NULL CHECK (max_concurrency > 0),
  price_usd numeric(10, 4) NOT NULL CHECK (price_usd >= 0),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, model_version, mode)
);

REVOKE ALL ON feature_switches, provider_configs FROM PUBLIC;
GRANT SELECT (key, enabled) ON feature_switches TO nuno_api;
GRANT SELECT ON provider_configs TO nuno_api;

-- 골드와 작업 상태 함수(T7)는 nuno_api 에 하나씩 실행 권한을 준다. Postgres 기본값인 「누구나 실행」 을 거둔다.
ALTER DEFAULT PRIVILEGES FOR ROLE nuno_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 「이대로 입히기」 는 원가와 품질 시험을 통과하기 전까지 꺼 둔다.
INSERT INTO feature_switches (key, enabled, reason, updated_by)
VALUES ('generate_look', false, '원가와 품질 시험 전', 'migration');
