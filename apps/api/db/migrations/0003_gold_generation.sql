-- 판 3: 골드 원장, 완성 룩 작업과 시도와 결과, 룩북과 룩, 개발 전용 가짜 공급사 모드.
-- 골드와 작업 상태는 아래 SECURITY DEFINER 함수로만 바뀐다. nuno_api 는 필요한 칸만 읽고 함수마다 실행 권한을 받는다.
-- 골드나 작업을 바꾸는 함수는 맨 먼저 그 사용자의 users 행을 FOR UPDATE 로 잠근다. 잠금 순서가 하나라 서로 기다리다 멈추지 않는다.
-- 업무 시각은 모두 인자 p_now 로 받는다. 시험이 시각을 앞으로 돌려 선점 기한을 넘긴다.

-- 골드 계정. 사용자 계정 넷은 가입 때 만들고, 시스템 계정 셋은 user_id 가 비어 있다.
CREATE TABLE gold_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN (
    'trial', 'free_gold', 'paid_gold', 'hold', 'promo_grant', 'promo_used', 'revenue'
  )),
  created_at timestamptz NOT NULL,
  CHECK ((user_id IS NULL) = (kind IN ('promo_grant', 'promo_used', 'revenue'))),
  UNIQUE (user_id, kind)
);
-- (user_id, kind) 고유는 user_id 가 빈 줄을 서로 다르게 본다. 시스템 계정은 종류마다 하나로 따로 막는다.
CREATE UNIQUE INDEX gold_accounts_system_kind ON gold_accounts (kind) WHERE user_id IS NULL;

INSERT INTO gold_accounts (kind, created_at)
VALUES ('promo_grant', now()), ('promo_used', now()), ('revenue', now());

-- 묶음 하나는 작업 하나다. held 에서 captured 나 released 로 한 번만 바뀐다.
CREATE TABLE gold_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  ref_kind text NOT NULL CHECK (ref_kind = 'generation_job'),
  ref_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('held', 'captured', 'released')),
  created_at timestamptz NOT NULL,
  settled_at timestamptz,
  UNIQUE (ref_kind, ref_id)
);

-- 거래 하나에 원장 줄이 여럿이다. 같은 멱등 키는 한 번만 들어간다.
CREATE TABLE gold_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('trial_grant', 'free_grant', 'hold', 'capture', 'release')),
  idempotency_key text NOT NULL UNIQUE,
  hold_id uuid REFERENCES gold_holds (id),
  memo text,
  created_at timestamptz NOT NULL,
  CHECK ((hold_id IS NULL) = (kind IN ('trial_grant', 'free_grant'))),
  UNIQUE (hold_id, kind)
);
CREATE INDEX gold_transactions_user ON gold_transactions (user_id, created_at);

-- 들어오면 양수, 빠지면 음수. 잔액은 그 계정 줄의 합이다.
CREATE TABLE gold_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES gold_transactions (id),
  account_id uuid NOT NULL REFERENCES gold_accounts (id),
  amount integer NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL
);
CREATE INDEX gold_entries_account ON gold_entries (account_id);
CREATE INDEX gold_entries_transaction ON gold_entries (transaction_id);

-- 원장은 쌓기만 한다. 바로잡을 일이 생기면 새 거래를 더한다.
CREATE FUNCTION nuno_gold_reject_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '골드 원장 표 % 는 고치거나 지우지 않는다. 바로잡을 때는 새 거래를 더한다', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER gold_entries_append_only BEFORE UPDATE OR DELETE ON gold_entries
  FOR EACH ROW EXECUTE FUNCTION nuno_gold_reject_change();
CREATE TRIGGER gold_entries_no_truncate BEFORE TRUNCATE ON gold_entries
  FOR EACH STATEMENT EXECUTE FUNCTION nuno_gold_reject_change();
CREATE TRIGGER gold_transactions_append_only BEFORE UPDATE OR DELETE ON gold_transactions
  FOR EACH ROW EXECUTE FUNCTION nuno_gold_reject_change();
CREATE TRIGGER gold_transactions_no_truncate BEFORE TRUNCATE ON gold_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION nuno_gold_reject_change();

-- 한 거래의 줄 합은 0 이다. 줄을 하나씩 넣는 동안은 어긋나므로 커밋 때 본다.
CREATE FUNCTION nuno_gold_check_balanced() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_sum bigint;
BEGIN
  SELECT sum(e.amount) INTO v_sum FROM gold_entries e WHERE e.transaction_id = NEW.transaction_id;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION '골드 거래 % 의 줄 합이 0 이 아니다(%)', NEW.transaction_id, v_sum
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER gold_entries_balanced AFTER INSERT ON gold_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION nuno_gold_check_balanced();

-- 「이대로 입히기」 한 번. 같은 사용자의 같은 생성 요청 ID 는 작업 하나다.
CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  input_manifest jsonb NOT NULL,
  payment_kind text NOT NULL CHECK (payment_kind IN ('trial', 'gold')),
  price_gold integer NOT NULL DEFAULT 4 CHECK (price_gold > 0),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'checking', 'succeeded', 'failed')),
  failure_code text,
  lease_token uuid,
  lease_until timestamptz,
  attempt_number integer NOT NULL DEFAULT 0,
  wake_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX generation_jobs_queued ON generation_jobs (created_at, id) WHERE status = 'queued';
CREATE INDEX generation_jobs_leased ON generation_jobs (lease_until)
  WHERE status IN ('generating', 'checking');
CREATE INDEX generation_jobs_user_payment ON generation_jobs (user_id, payment_kind, created_at);

-- 공급사 호출 한 번. 부르기 전에 submitting 줄을 먼저 만든다. round 2 는 검사에서 떨어져 다시 만든 것이다.
CREATE TABLE generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs (id),
  round integer NOT NULL CHECK (round IN (1, 2)),
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('submitting', 'accepted', 'rejected', 'unknown', 'completed', 'failed')),
  billing_status text NOT NULL DEFAULT 'unknown'
    CHECK (billing_status IN ('billed', 'not_billed', 'unknown')),
  cost_usd numeric(10, 4),
  latency_ms integer,
  raw_error text,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE (job_id, round)
);

-- 결과 그림. gen30 은 30일 뒤 지우는 자리, kept 는 룩북에 저장한 자리다.
CREATE TABLE generation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES generation_jobs (id),
  user_id uuid NOT NULL REFERENCES users (id),
  r2_key text NOT NULL,
  storage_state text NOT NULL CHECK (storage_state IN ('gen30', 'kept', 'deleted')),
  ai_label boolean NOT NULL DEFAULT true CHECK (ai_label),
  opened_at timestamptz,
  delete_due_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, id)
);

-- 룩북과 룩. 남의 룩북이나 결과를 가리키지 못하게 키에 user_id 를 함께 건다.
CREATE TABLE lookbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 12),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, id)
);

-- lookbook_id 가 빈 줄은 「모든 룩」 에만 보이는 저장 줄이다. 저장을 연타해도 한 줄이다.
CREATE TABLE looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  lookbook_id uuid,
  result_id uuid NOT NULL,
  is_favorite boolean NOT NULL DEFAULT false,
  worn_items jsonb NOT NULL DEFAULT '[]',
  saved_at timestamptz NOT NULL,
  FOREIGN KEY (user_id, lookbook_id) REFERENCES lookbooks (user_id, id),
  FOREIGN KEY (user_id, result_id) REFERENCES generation_results (user_id, id),
  UNIQUE NULLS NOT DISTINCT (user_id, lookbook_id, result_id)
);
CREATE INDEX looks_result ON looks (result_id);

-- 개발 전용. worker 는 NUNO_DEV_ROUTES=1 일 때만 이 줄로 가짜 공급사의 답을 정한다.
CREATE TABLE dev_provider_modes (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  mode text NOT NULL CHECK (mode IN ('succeed', 'refuse', 'hang')),
  delay_ms integer NOT NULL DEFAULT 0 CHECK (delay_ms BETWEEN 0 AND 600000),
  fail_check_once boolean NOT NULL DEFAULT false
);

REVOKE ALL ON gold_accounts, gold_holds, gold_transactions, gold_entries, generation_jobs,
  generation_attempts, generation_results, lookbooks, looks, dev_provider_modes FROM PUBLIC;

-- API 는 「내 골드」 와 작업 조회에 쓰는 칸만 읽는다. 사용자 ID 조건은 API 가 세션에서 얻은 값으로 건다.
GRANT SELECT (id, user_id, kind) ON gold_accounts TO nuno_api;
GRANT SELECT (id, user_id, ref_kind, ref_id, amount, status) ON gold_holds TO nuno_api;
GRANT SELECT (id, user_id, kind, memo, created_at) ON gold_transactions TO nuno_api;
GRANT SELECT (transaction_id, account_id, amount, created_at) ON gold_entries TO nuno_api;
GRANT SELECT (id, user_id, idempotency_key, payment_kind, price_gold, status, failure_code,
  created_at, finished_at) ON generation_jobs TO nuno_api;
GRANT SELECT (id, job_id, user_id, r2_key, storage_state, ai_label, delete_due_at, created_at)
  ON generation_results TO nuno_api;
GRANT SELECT ON dev_provider_modes TO nuno_api;
-- 룩북과 룩은 업무 상태가 아니라서 API 가 직접 쓴다. 결과 파일 상태는 함수로만 바뀐다.
GRANT SELECT, INSERT, UPDATE, DELETE ON lookbooks, looks TO nuno_api;

-- 아래 nuno_gold_*, nuno_job_* 내부 함수는 SECURITY DEFINER 함수 안에서만 부른다. nuno_api 에는 주지 않는다.

CREATE FUNCTION nuno_gold_account(p_user_id uuid, p_kind text) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT a.id INTO STRICT v_id FROM gold_accounts a WHERE a.user_id = p_user_id AND a.kind = p_kind;
  RETURN v_id;
END;
$$;

CREATE FUNCTION nuno_gold_system_account(p_kind text) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT a.id INTO STRICT v_id FROM gold_accounts a WHERE a.user_id IS NULL AND a.kind = p_kind;
  RETURN v_id;
END;
$$;

CREATE FUNCTION nuno_gold_balance(p_account_id uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(e.amount), 0)::integer FROM gold_entries e WHERE e.account_id = p_account_id;
$$;

-- 같은 멱등 키의 거래가 이미 있으면 NULL 이다. 부르는 쪽은 NULL 이면 줄을 넣지 않는다.
CREATE FUNCTION nuno_gold_transaction(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_hold_id uuid,
  p_memo text,
  p_now timestamptz
) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO gold_transactions (user_id, kind, idempotency_key, hold_id, memo, created_at)
  VALUES (p_user_id, p_kind, p_idempotency_key, p_hold_id, p_memo, p_now)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION nuno_gold_entry(
  p_transaction_id uuid,
  p_account_id uuid,
  p_amount integer,
  p_now timestamptz
) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  INSERT INTO gold_entries (transaction_id, account_id, amount, created_at)
  VALUES (p_transaction_id, p_account_id, p_amount, p_now);
$$;

-- 사용자 계정 넷을 만들고 첫 체험 8골드(무료 2장)를 한 번 넣는다. 부르는 쪽이 users 행을 잠근 뒤 부른다.
CREATE FUNCTION nuno_gold_open(p_user_id uuid, p_now timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_tx uuid;
BEGIN
  INSERT INTO gold_accounts (user_id, kind, created_at)
  SELECT p_user_id, k.kind, p_now
  FROM unnest(ARRAY['trial', 'free_gold', 'paid_gold', 'hold']) AS k (kind)
  ON CONFLICT DO NOTHING;

  v_tx := nuno_gold_transaction(p_user_id, 'trial_grant', 'trial:' || p_user_id, NULL, NULL, p_now);
  IF v_tx IS NOT NULL THEN
    PERFORM nuno_gold_entry(v_tx, nuno_gold_system_account('promo_grant'), -8, p_now);
    PERFORM nuno_gold_entry(v_tx, nuno_gold_account(p_user_id, 'trial'), 8, p_now);
  END IF;
END;
$$;

-- 묶음을 확정하거나 푼다. 묶을 때 빠진 계정을 읽어 그대로 돌려주거나,
-- 확정이면 무상 몫(trial, free_gold)은 promo_used 로, 유상 몫(paid_gold)은 revenue 로 보낸다.
CREATE FUNCTION nuno_gold_settle_hold(p_job_id uuid, p_kind text, p_now timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_hold gold_holds%ROWTYPE;
  v_hold_tx uuid;
  v_tx uuid;
  v_source record;
BEGIN
  SELECT * INTO v_hold FROM gold_holds h
  WHERE h.ref_kind = 'generation_job' AND h.ref_id = p_job_id
  FOR UPDATE;
  IF NOT FOUND OR v_hold.status <> 'held' THEN
    RETURN;
  END IF;

  SELECT t.id INTO STRICT v_hold_tx FROM gold_transactions t
  WHERE t.hold_id = v_hold.id AND t.kind = 'hold';
  v_tx := nuno_gold_transaction(
    v_hold.user_id, p_kind, p_kind || ':job:' || p_job_id, v_hold.id, NULL, p_now
  );
  PERFORM nuno_gold_entry(v_tx, nuno_gold_account(v_hold.user_id, 'hold'), -v_hold.amount, p_now);

  FOR v_source IN
    SELECT e.account_id, a.kind, -sum(e.amount)::integer AS amount
    FROM gold_entries e JOIN gold_accounts a ON a.id = e.account_id
    WHERE e.transaction_id = v_hold_tx AND e.amount < 0
    GROUP BY e.account_id, a.kind
  LOOP
    IF p_kind = 'release' THEN
      PERFORM nuno_gold_entry(v_tx, v_source.account_id, v_source.amount, p_now);
    ELSIF v_source.kind = 'paid_gold' THEN
      PERFORM nuno_gold_entry(v_tx, nuno_gold_system_account('revenue'), v_source.amount, p_now);
    ELSE
      PERFORM nuno_gold_entry(v_tx, nuno_gold_system_account('promo_used'), v_source.amount, p_now);
    END IF;
  END LOOP;

  UPDATE gold_holds
  SET status = CASE p_kind WHEN 'release' THEN 'released' ELSE 'captured' END, settled_at = p_now
  WHERE id = v_hold.id;
END;
$$;

-- 작업을 실패로 끝내고 묶음을 푼다. 결과 그림이 있으면 지움으로 적고 그 키를 돌려준다(파일은 부르는 쪽이 지운다).
-- 부르는 쪽이 users 행과 작업 행을 잠근 뒤 부른다.
CREATE FUNCTION nuno_job_release(p_job_id uuid, p_failure_code text, p_now timestamptz)
RETURNS text
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_key text;
BEGIN
  UPDATE generation_jobs
  SET status = 'failed', failure_code = p_failure_code, finished_at = p_now
  WHERE id = p_job_id AND status NOT IN ('succeeded', 'failed');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM nuno_gold_settle_hold(p_job_id, 'release', p_now);
  UPDATE generation_results
  SET storage_state = 'deleted', deleted_at = p_now
  WHERE job_id = p_job_id AND storage_state <> 'deleted'
  RETURNING r2_key INTO v_key;
  RETURN v_key;
END;
$$;

-- worker 가 부르는 함수의 공통 문지기. 사용자 행을 먼저 잠그고, 상태와 선점 토큰과 기한이 맞을 때만 작업 행을 준다.
-- 맞지 않으면 모든 칸이 빈 행이다.
CREATE FUNCTION nuno_job_lock_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_statuses text[],
  p_now timestamptz
) RETURNS generation_jobs
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
BEGIN
  PERFORM 1 FROM users u
  WHERE u.id = (SELECT j.user_id FROM generation_jobs j WHERE j.id = p_job_id)
  FOR UPDATE;
  SELECT * INTO v_job FROM generation_jobs j
  WHERE j.id = p_job_id
    AND j.status = ANY (p_statuses)
    AND j.lease_token = p_lease_token
    AND j.lease_until > p_now
  FOR UPDATE;
  RETURN v_job;
END;
$$;

-- 가입: 판 2 동작에 더해 골드 계정 넷과 첫 체험 8골드를 한 번 넣는다.
CREATE OR REPLACE FUNCTION nuno_sign_in(
  p_provider text,
  p_subject text,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_now timestamptz
) RETURNS TABLE (user_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_user uuid;
  v_created boolean := false;
BEGIN
  INSERT INTO auth_identities (provider, subject, user_id, created_at)
  VALUES (p_provider, p_subject, gen_random_uuid(), p_now)
  ON CONFLICT (provider, subject) DO NOTHING
  RETURNING auth_identities.user_id INTO v_user;

  IF v_user IS NOT NULL THEN
    INSERT INTO users (id, created_at) VALUES (v_user, p_now);
    v_created := true;
  ELSE
    -- 먼저 들어온 쪽이 커밋하기를 기다린 뒤라 그 행이 보인다.
    SELECT i.user_id INTO STRICT v_user
    FROM auth_identities i
    WHERE i.provider = p_provider AND i.subject = p_subject;
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_user FOR UPDATE;
  PERFORM nuno_gold_open(v_user, p_now);

  INSERT INTO auth_sessions (user_id, token_hash, created_at, expires_at)
  VALUES (v_user, p_token_hash, p_now, p_expires_at);

  RETURN QUERY SELECT v_user, v_created;
END;
$$;

-- 판 2 에서 가입한 사용자도 계정 넷과 첫 체험 8골드를 받는다.
SELECT nuno_gold_open(u.id, now()) FROM users u;

-- 개발 전용 시험용 골드. 사용자마다 한 번만 들어가고 「내 골드」 줄 이름은 memo 다.
CREATE FUNCTION nuno_grant_test_gold(p_user_id uuid, p_amount integer, p_now timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tx uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '시험용 골드는 1 이상이다' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_tx := nuno_gold_transaction(
    p_user_id, 'free_grant', 'test_grant:' || p_user_id, NULL, '시험용 골드', p_now
  );
  IF v_tx IS NULL THEN
    RETURN false;
  END IF;
  PERFORM nuno_gold_entry(v_tx, nuno_gold_system_account('promo_grant'), -p_amount, p_now);
  PERFORM nuno_gold_entry(v_tx, nuno_gold_account(p_user_id, 'free_gold'), p_amount, p_now);
  RETURN true;
END;
$$;

-- 접수. 멱등 확인, 계정 상태, 동의, 스위치, 무료 하루 한도, 잔액, 작업 행, 묶기를 한 트랜잭션에 한다.
-- 거절은 예외가 아니라 error_code 로 돌려준다. 같은 요청 ID 를 다시 보내면 처음 작업을 그대로 준다.
CREATE FUNCTION nuno_submit_job(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_manifest jsonb,
  p_consent_version integer,
  p_now timestamptz
) RETURNS TABLE (job_id uuid, status text, payment_kind text, error_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  c_price constant integer := 4;
  c_trial_daily constant integer := 4;
  v_user_status text;
  v_existing generation_jobs%ROWTYPE;
  v_consent integer;
  v_enabled boolean;
  v_trial uuid;
  v_free uuid;
  v_paid uuid;
  v_free_balance integer;
  v_paid_balance integer;
  v_take_free integer := 0;
  v_take_paid integer := 0;
  v_payment text;
  v_job uuid;
  v_hold uuid;
  v_tx uuid;
BEGIN
  SELECT u.status INTO v_user_status FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'account_inactive'::text;
    RETURN;
  END IF;

  SELECT * INTO v_existing FROM generation_jobs j
  WHERE j.user_id = p_user_id AND j.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_hash = p_request_hash THEN
      RETURN QUERY SELECT v_existing.id, v_existing.status, v_existing.payment_kind, NULL::text;
    ELSE
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'request_mismatch'::text;
    END IF;
    RETURN;
  END IF;

  IF v_user_status <> 'active' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'account_inactive'::text;
    RETURN;
  END IF;

  SELECT c.text_version INTO v_consent FROM consents c
  WHERE c.user_id = p_user_id AND c.kind = 'generation_transfer' AND c.withdrawn_at IS NULL
  ORDER BY c.agreed_at DESC
  LIMIT 1;
  IF v_consent IS DISTINCT FROM p_consent_version THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'consent_required'::text;
    RETURN;
  END IF;

  SELECT f.enabled INTO v_enabled FROM feature_switches f WHERE f.key = 'generate_look';
  IF v_enabled IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'switch_off'::text;
    RETURN;
  END IF;

  v_trial := nuno_gold_account(p_user_id, 'trial');
  IF nuno_gold_balance(v_trial) >= c_price THEN
    -- 무료 한도는 한국 날짜로 센다. 실패해 돌려받은 작업도 센다.
    IF (
      SELECT count(*) FROM generation_jobs j
      WHERE j.user_id = p_user_id
        AND j.payment_kind = 'trial'
        AND (j.created_at AT TIME ZONE 'Asia/Seoul')::date = (p_now AT TIME ZONE 'Asia/Seoul')::date
    ) >= c_trial_daily THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'trial_daily_limit'::text;
      RETURN;
    END IF;
    v_payment := 'trial';
  ELSE
    v_free := nuno_gold_account(p_user_id, 'free_gold');
    v_paid := nuno_gold_account(p_user_id, 'paid_gold');
    v_free_balance := nuno_gold_balance(v_free);
    v_paid_balance := nuno_gold_balance(v_paid);
    -- 환불로 유상 잔액이 음수인 동안은 무상 골드가 있어도 받지 않는다.
    IF v_paid_balance < 0 OR v_free_balance + v_paid_balance < c_price THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'insufficient_gold'::text;
      RETURN;
    END IF;
    v_take_free := least(greatest(v_free_balance, 0), c_price);
    v_take_paid := c_price - v_take_free;
    v_payment := 'gold';
  END IF;

  INSERT INTO generation_jobs (
    user_id, idempotency_key, request_hash, input_manifest, payment_kind, price_gold, status, created_at
  )
  VALUES (p_user_id, p_idempotency_key, p_request_hash, p_manifest, v_payment, c_price, 'queued', p_now)
  RETURNING id INTO v_job;

  INSERT INTO gold_holds (user_id, ref_kind, ref_id, amount, status, created_at)
  VALUES (p_user_id, 'generation_job', v_job, c_price, 'held', p_now)
  RETURNING id INTO v_hold;

  v_tx := nuno_gold_transaction(p_user_id, 'hold', 'hold:job:' || v_job, v_hold, NULL, p_now);
  IF v_payment = 'trial' THEN
    PERFORM nuno_gold_entry(v_tx, v_trial, -c_price, p_now);
  ELSE
    IF v_take_free > 0 THEN
      PERFORM nuno_gold_entry(v_tx, v_free, -v_take_free, p_now);
    END IF;
    IF v_take_paid > 0 THEN
      PERFORM nuno_gold_entry(v_tx, v_paid, -v_take_paid, p_now);
    END IF;
  END IF;
  PERFORM nuno_gold_entry(v_tx, nuno_gold_account(p_user_id, 'hold'), c_price, p_now);

  RETURN QUERY SELECT v_job, 'queued'::text, v_payment, NULL::text;
END;
$$;

-- worker 의 선점. 접수 작업을 오래된 차례로 하나 골라 generating 으로 바꾼다.
-- 사용자 행을 먼저 잠그고 작업 행을 SKIP LOCKED 로 다시 고른다. 계정이 정지되었으면 그 작업은 실패와 풀기로 끝내고 다음을 본다.
CREATE FUNCTION nuno_claim_job(p_lease_token uuid, p_lease_seconds integer, p_now timestamptz)
RETURNS TABLE (job_id uuid, user_id uuid, input_manifest jsonb, payment_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_candidate record;
  v_user_status text;
  v_job generation_jobs%ROWTYPE;
BEGIN
  FOR i IN 1..50 LOOP
    SELECT j.id, j.user_id INTO v_candidate FROM generation_jobs j
    WHERE j.status = 'queued'
    ORDER BY j.created_at, j.id
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN;
    END IF;

    SELECT u.status INTO v_user_status FROM users u WHERE u.id = v_candidate.user_id FOR UPDATE;
    SELECT * INTO v_job FROM generation_jobs j
    WHERE j.id = v_candidate.id AND j.status = 'queued'
    FOR UPDATE SKIP LOCKED;
    CONTINUE WHEN NOT FOUND;

    IF v_user_status <> 'active' THEN
      PERFORM nuno_job_release(v_job.id, 'account_inactive', p_now);
      CONTINUE;
    END IF;

    UPDATE generation_jobs j
    SET status = 'generating',
        lease_token = p_lease_token,
        lease_until = p_now + make_interval(secs => p_lease_seconds),
        attempt_number = j.attempt_number + 1
    WHERE j.id = v_job.id;

    RETURN QUERY SELECT v_job.id, v_job.user_id, v_job.input_manifest, v_job.payment_kind;
    RETURN;
  END LOOP;
END;
$$;

-- 공급사를 부르기 전에 시도 줄을 만든다. 부르기 직전에 계정 상태를 다시 보고, 정지면 실패와 풀기로 끝낸다.
CREATE FUNCTION nuno_start_attempt(
  p_job_id uuid,
  p_lease_token uuid,
  p_provider text,
  p_model text,
  p_now timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
  v_attempt uuid;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['generating'], p_now);
  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF (SELECT u.status FROM users u WHERE u.id = v_job.user_id) <> 'active' THEN
    PERFORM nuno_job_release(p_job_id, 'account_inactive', p_now);
    RETURN NULL;
  END IF;

  INSERT INTO generation_attempts (job_id, round, provider, model, status, created_at)
  VALUES (
    p_job_id,
    (SELECT count(*) + 1 FROM generation_attempts a WHERE a.job_id = p_job_id),
    p_provider,
    p_model,
    'submitting',
    p_now
  )
  RETURNING id INTO v_attempt;
  RETURN v_attempt;
END;
$$;

CREATE FUNCTION nuno_finish_attempt(
  p_job_id uuid,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_status text,
  p_billing_status text,
  p_cost_usd numeric,
  p_latency_ms integer,
  p_raw_error text,
  p_now timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['generating'], p_now);
  IF v_job.id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE generation_attempts
  SET status = p_status,
      billing_status = p_billing_status,
      cost_usd = p_cost_usd,
      latency_ms = p_latency_ms,
      raw_error = p_raw_error,
      finished_at = p_now
  WHERE id = p_attempt_id AND job_id = p_job_id AND status = 'submitting';
  RETURN FOUND;
END;
$$;

-- 결과 그림을 gen30 에 둔 뒤 부른다. 결과 행을 만들고 검사 중으로 바꾼다. 다시 만든 회차는 같은 결과 행에 새 키를 적는다.
CREATE FUNCTION nuno_job_checking(
  p_job_id uuid,
  p_lease_token uuid,
  p_r2_key text,
  p_now timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
  v_result uuid;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['generating'], p_now);
  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO generation_results (job_id, user_id, r2_key, storage_state, delete_due_at, created_at)
  VALUES (p_job_id, v_job.user_id, p_r2_key, 'gen30', p_now + interval '30 days', p_now)
  ON CONFLICT (job_id) DO UPDATE
    SET r2_key = EXCLUDED.r2_key,
        storage_state = 'gen30',
        delete_due_at = EXCLUDED.delete_due_at,
        deleted_at = NULL
  RETURNING id INTO v_result;
  UPDATE generation_jobs SET status = 'checking' WHERE id = p_job_id;
  RETURN v_result;
END;
$$;

-- 검사에서 처음 떨어지면 한 번만 다시 만든다. 선점 기한을 다시 늘리고, 앞 결과 키를 돌려준다(파일은 worker 가 지운다).
-- 이미 두 번 만들었으면 NULL 이다.
CREATE FUNCTION nuno_job_retry(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_now timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
  v_key text;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['checking'], p_now);
  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM generation_attempts a WHERE a.job_id = p_job_id) >= 2 THEN
    RETURN NULL;
  END IF;
  UPDATE generation_results
  SET storage_state = 'deleted', deleted_at = p_now
  WHERE job_id = p_job_id AND storage_state = 'gen30'
  RETURNING r2_key INTO v_key;
  UPDATE generation_jobs
  SET status = 'generating', lease_until = p_now + make_interval(secs => p_lease_seconds)
  WHERE id = p_job_id;
  RETURN v_key;
END;
$$;

-- 검사를 통과하면 완료와 확정을 함께 한다.
CREATE FUNCTION nuno_job_succeed(p_job_id uuid, p_lease_token uuid, p_now timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['checking'], p_now);
  IF v_job.id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE generation_jobs SET status = 'succeeded', finished_at = p_now WHERE id = p_job_id;
  PERFORM nuno_gold_settle_hold(p_job_id, 'capture', p_now);
  RETURN true;
END;
$$;

-- 공급사 거절, 무응답, 오류, 두 번째 검사 불합격이면 실패와 풀기. 지울 결과 키가 있으면 함께 준다.
CREATE FUNCTION nuno_job_fail(
  p_job_id uuid,
  p_lease_token uuid,
  p_failure_code text,
  p_now timestamptz
) RETURNS TABLE (failed boolean, result_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
BEGIN
  v_job := nuno_job_lock_lease(p_job_id, p_lease_token, ARRAY['generating', 'checking'], p_now);
  IF v_job.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, nuno_job_release(p_job_id, p_failure_code, p_now);
END;
$$;

-- 예약 작업. 선점 기한이 지난 생성 중과 검사 중 작업을 실패와 풀기로 끝낸다. worker 가 도중에 죽은 작업을 이것이 정리한다.
CREATE FUNCTION nuno_sweep_jobs(p_now timestamptz)
RETURNS TABLE (job_id uuid, user_id uuid, result_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_candidate record;
BEGIN
  FOR v_candidate IN
    SELECT j.id, j.user_id FROM generation_jobs j
    WHERE j.status IN ('generating', 'checking') AND j.lease_until <= p_now
    ORDER BY j.lease_until
    LIMIT 100
  LOOP
    PERFORM 1 FROM users u WHERE u.id = v_candidate.user_id FOR UPDATE;
    PERFORM 1 FROM generation_jobs j
    WHERE j.id = v_candidate.id AND j.status IN ('generating', 'checking') AND j.lease_until <= p_now
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    job_id := v_candidate.id;
    user_id := v_candidate.user_id;
    result_key := nuno_job_release(v_candidate.id, 'lease_expired', p_now);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 「나가기」: 아직 어느 룩도 가리키지 않는 결과만 지움으로 적고 키를 돌려준다. 주인이 다르면 NULL 이다.
CREATE FUNCTION nuno_discard_result(p_user_id uuid, p_job_id uuid, p_now timestamptz)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_key text;
BEGIN
  PERFORM 1 FROM users u WHERE u.id = p_user_id FOR UPDATE;
  UPDATE generation_results r
  SET storage_state = 'deleted', deleted_at = p_now
  WHERE r.job_id = p_job_id
    AND r.user_id = p_user_id
    AND r.storage_state = 'gen30'
    AND NOT EXISTS (SELECT 1 FROM looks l WHERE l.result_id = r.id)
    AND EXISTS (SELECT 1 FROM generation_jobs j WHERE j.id = r.job_id AND j.status = 'succeeded')
  RETURNING r.r2_key INTO v_key;
  RETURN v_key;
END;
$$;

-- 「내 룩북에 저장」: 결과를 저장 자리 키로 옮겨 적고 「모든 룩」 줄을 하나 만든다. 연타해도 같은 룩 ID 다.
-- 주인이 다르거나 지운 결과면 NULL 이다.
CREATE FUNCTION nuno_keep_result(
  p_user_id uuid,
  p_job_id uuid,
  p_kept_key text,
  p_worn_items jsonb,
  p_now timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_result generation_results%ROWTYPE;
  v_look uuid;
BEGIN
  PERFORM 1 FROM users u WHERE u.id = p_user_id FOR UPDATE;
  SELECT r.* INTO v_result
  FROM generation_results r JOIN generation_jobs j ON j.id = r.job_id
  WHERE r.job_id = p_job_id AND r.user_id = p_user_id AND j.status = 'succeeded'
  FOR UPDATE OF r;
  IF NOT FOUND OR v_result.storage_state = 'deleted' THEN
    RETURN NULL;
  END IF;

  IF v_result.storage_state = 'gen30' THEN
    UPDATE generation_results
    SET storage_state = 'kept', r2_key = p_kept_key, delete_due_at = NULL
    WHERE id = v_result.id;
  END IF;

  INSERT INTO looks (user_id, lookbook_id, result_id, worn_items, saved_at)
  VALUES (p_user_id, NULL, v_result.id, coalesce(p_worn_items, '[]'::jsonb), p_now)
  ON CONFLICT (user_id, lookbook_id, result_id) DO NOTHING
  RETURNING id INTO v_look;
  IF v_look IS NULL THEN
    SELECT l.id INTO v_look FROM looks l
    WHERE l.user_id = p_user_id AND l.lookbook_id IS NULL AND l.result_id = v_result.id;
  END IF;
  RETURN v_look;
END;
$$;

-- 개발 전용 가짜 공급사 모드. API 는 NUNO_DEV_ROUTES=1 일 때만 이 함수를 부르는 주소를 단다.
CREATE FUNCTION nuno_dev_set_provider_mode(
  p_user_id uuid,
  p_mode text,
  p_delay_ms integer,
  p_fail_check_once boolean
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO dev_provider_modes (user_id, mode, delay_ms, fail_check_once)
  VALUES (p_user_id, p_mode, p_delay_ms, p_fail_check_once)
  ON CONFLICT (user_id) DO UPDATE
    SET mode = EXCLUDED.mode,
        delay_ms = EXCLUDED.delay_ms,
        fail_check_once = EXCLUDED.fail_check_once;
$$;

GRANT EXECUTE ON FUNCTION nuno_grant_test_gold(uuid, integer, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_submit_job(uuid, text, text, jsonb, integer, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_claim_job(uuid, integer, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_start_attempt(uuid, uuid, text, text, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_finish_attempt(
  uuid, uuid, uuid, text, text, numeric, integer, text, timestamptz
) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_job_checking(uuid, uuid, text, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_job_retry(uuid, uuid, integer, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_job_succeed(uuid, uuid, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_job_fail(uuid, uuid, text, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_sweep_jobs(timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_discard_result(uuid, uuid, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_keep_result(uuid, uuid, text, jsonb, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_dev_set_provider_mode(uuid, text, integer, boolean) TO nuno_api;
