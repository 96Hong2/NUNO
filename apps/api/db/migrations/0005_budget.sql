-- 판 5: 하루 생성 예산. 공급사를 부르기 전에 그날 예산에서 한 장 값을 예약하고, 시도가 끝나면 청구액으로 정산한다.
-- 이번 판은 하루 전체(total) 행만 예약하고 정산한다. 공급사별(provider)과 무료 체험(trial) 행은 쓰지 않는다.
-- 그날 행이 없으면 기본값 표의 상한을 복사해 만든다. 기본값도 없으면 상한 0원이라 공급사를 부르지 않는다.
-- 잠금 순서: 사용자 → 작업 → 시도 → 예산 행(날짜, 종류, 공급사 순). 예산 행은 nuno_budget_lock 으로만 잠근다.
-- 예약 기록은 시도 행의 열이다. 시도 하나가 예약 하나라 정산도 시도마다 한 번이다.

CREATE TABLE cost_daily (
  day date NOT NULL,
  budget_kind text NOT NULL CHECK (budget_kind IN ('total', 'provider', 'trial')),
  provider text NOT NULL DEFAULT '',
  budget_usd numeric(12, 4) NOT NULL CHECK (budget_usd >= 0),
  reserved_usd numeric(12, 4) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  settled_usd numeric(12, 4) NOT NULL DEFAULT 0 CHECK (settled_usd >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (day, budget_kind, provider)
);

-- 그날 행이 없을 때 복사할 상한. 운영자가 관리자로 넣는다. 판은 값을 넣지 않는다.
CREATE TABLE cost_budget_defaults (
  budget_kind text NOT NULL CHECK (budget_kind IN ('total', 'provider', 'trial')),
  provider text NOT NULL DEFAULT '',
  budget_usd numeric(12, 4) NOT NULL CHECK (budget_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (budget_kind, provider)
);

REVOKE ALL ON cost_daily, cost_budget_defaults FROM PUBLIC;

-- reserved: 예약만 했다. settled: 청구액을 확정 합에 넣었다. released: 청구되지 않아 예약을 풀었다.
-- kept_reserved: 청구 여부나 청구액을 몰라 예약액을 예약 합에 그대로 둔다. 다시 정산하지 않는다.
-- 판 5 전에 만든 시도는 네 칸이 비어 있다.
ALTER TABLE generation_attempts
  ADD COLUMN budget_day date,
  ADD COLUMN reserved_usd numeric(10, 4) CHECK (reserved_usd >= 0),
  ADD COLUMN budget_status text
    CHECK (budget_status IN ('reserved', 'settled', 'released', 'kept_reserved')),
  ADD CONSTRAINT generation_attempts_budget_filled
    CHECK ((budget_status IS NULL) = (budget_day IS NULL AND reserved_usd IS NULL));
CREATE INDEX generation_attempts_budget_reserved ON generation_attempts (budget_day, id)
  WHERE budget_status = 'reserved';

-- 그날 total 행을 잠근다. 없으면 기본값으로 만든다. 부르는 쪽이 사용자, 작업, 시도 행을 먼저 잠근다.
CREATE FUNCTION nuno_budget_lock(p_day date, p_now timestamptz) RETURNS cost_daily
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_row cost_daily%ROWTYPE;
BEGIN
  INSERT INTO cost_daily (day, budget_kind, provider, budget_usd, updated_at)
  VALUES (
    p_day,
    'total',
    '',
    coalesce(
      (SELECT d.budget_usd FROM cost_budget_defaults d WHERE d.budget_kind = 'total' AND d.provider = ''),
      0
    ),
    p_now
  )
  ON CONFLICT (day, budget_kind, provider) DO NOTHING;
  SELECT * INTO STRICT v_row FROM cost_daily c
  WHERE c.day = p_day AND c.budget_kind = 'total' AND c.provider = ''
  FOR UPDATE;
  RETURN v_row;
END;
$$;

-- 시도 하나의 예약을 정산한다. 부르는 쪽이 사용자, 작업 행을 잠근 뒤 부른다.
-- 예약 상태인 시도만 바꾸고, 바꿨을 때만 예산 행을 고친다. 두 번 불러도 한 번만 반영된다.
CREATE FUNCTION nuno_budget_settle_attempt(p_attempt_id uuid, p_now timestamptz) RETURNS text
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_attempt record;
BEGIN
  UPDATE generation_attempts a
  SET budget_status = CASE
    WHEN a.billing_status = 'billed' AND a.cost_usd IS NOT NULL THEN 'settled'
    WHEN a.billing_status = 'not_billed' THEN 'released'
    ELSE 'kept_reserved'
  END
  WHERE a.id = p_attempt_id AND a.budget_status = 'reserved'
  RETURNING a.budget_day, a.reserved_usd, a.cost_usd, a.budget_status INTO v_attempt;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_attempt.budget_status = 'kept_reserved' THEN
    RETURN v_attempt.budget_status;
  END IF;

  PERFORM nuno_budget_lock(v_attempt.budget_day, p_now);
  UPDATE cost_daily c
  SET reserved_usd = c.reserved_usd - v_attempt.reserved_usd,
      settled_usd = c.settled_usd
        + CASE WHEN v_attempt.budget_status = 'settled' THEN v_attempt.cost_usd ELSE 0 END,
      updated_at = p_now
  WHERE c.day = v_attempt.budget_day AND c.budget_kind = 'total' AND c.provider = '';
  RETURN v_attempt.budget_status;
END;
$$;

-- 판 4 동작에 더해, 시도 줄을 만들기 전에 그날 예산에서 작업이 적은 설정 줄의 한 장 값을 예약한다.
-- 상한이 0원이거나 예약 합, 확정 합, 이번 값을 더해 상한을 넘으면 시도 줄 없이 budget_exhausted 로 실패와 풀기다.
CREATE OR REPLACE FUNCTION nuno_start_attempt(
  p_job_id uuid,
  p_lease_token uuid,
  p_provider text,
  p_model text,
  p_now timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
  v_config record;
  v_price numeric(10, 4);
  v_day date := (p_now AT TIME ZONE 'Asia/Seoul')::date;
  v_budget cost_daily%ROWTYPE;
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
  IF NOT nuno_has_transfer_consent(v_job.user_id) THEN
    PERFORM nuno_job_release(p_job_id, 'consent_withdrawn', p_now);
    RETURN NULL;
  END IF;

  SELECT * INTO v_config FROM nuno_current_provider_config();
  IF NOT FOUND OR v_job.provider_config_id IS DISTINCT FROM v_config.id THEN
    PERFORM nuno_job_release(p_job_id, 'provider_changed', p_now);
    RETURN NULL;
  END IF;
  IF v_job.consent_text_version IS DISTINCT FROM v_config.consent_text_version THEN
    PERFORM nuno_job_release(p_job_id, 'consent_outdated', p_now);
    RETURN NULL;
  END IF;

  SELECT c.price_usd INTO STRICT v_price FROM provider_configs c WHERE c.id = v_job.provider_config_id;
  v_budget := nuno_budget_lock(v_day, p_now);
  IF v_budget.budget_usd <= 0
     OR v_budget.reserved_usd + v_budget.settled_usd + v_price > v_budget.budget_usd THEN
    PERFORM nuno_job_release(p_job_id, 'budget_exhausted', p_now);
    RETURN NULL;
  END IF;
  UPDATE cost_daily c
  SET reserved_usd = c.reserved_usd + v_price, updated_at = p_now
  WHERE c.day = v_day AND c.budget_kind = 'total' AND c.provider = '';

  INSERT INTO generation_attempts (
    job_id, round, provider, model, status, budget_day, reserved_usd, budget_status, created_at
  )
  VALUES (
    p_job_id,
    (SELECT count(*) + 1 FROM generation_attempts a WHERE a.job_id = p_job_id),
    p_provider,
    p_model,
    'submitting',
    v_day,
    v_price,
    'reserved',
    p_now
  )
  RETURNING id INTO v_attempt;
  RETURN v_attempt;
END;
$$;

-- 판 3 동작에 더해, 선점이 맞고 시도 줄을 바꿨을 때만 그 시도의 예약을 바로 정산한다.
-- 선점이 풀린 늦은 호출은 시도 줄도 예산 행도 건드리지 않는다.
CREATE OR REPLACE FUNCTION nuno_finish_attempt(
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
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  PERFORM nuno_budget_settle_attempt(p_attempt_id, p_now);
  RETURN true;
END;
$$;

-- 예약 작업. 끝난 작업에 예약 상태로 남은 시도를 정산한다. worker 가 공급사를 부른 뒤 죽은 시도가 여기로 온다.
-- 시도를 예산 날짜, ID 순서로 고르고, 시도마다 사용자, 작업, 시도, 예산 행 순서로 잠근다. 정산한 시도 수를 낸다.
CREATE FUNCTION nuno_settle_budgets(p_now timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_candidate record;
  v_count integer := 0;
BEGIN
  FOR v_candidate IN
    SELECT a.id, a.job_id, j.user_id FROM generation_attempts a
    JOIN generation_jobs j ON j.id = a.job_id
    WHERE a.budget_status = 'reserved' AND j.status IN ('succeeded', 'failed')
    ORDER BY a.budget_day, a.id
    LIMIT 100
  LOOP
    PERFORM 1 FROM users u WHERE u.id = v_candidate.user_id FOR UPDATE;
    PERFORM 1 FROM generation_jobs j
    WHERE j.id = v_candidate.job_id AND j.status IN ('succeeded', 'failed')
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    PERFORM 1 FROM generation_attempts a
    WHERE a.id = v_candidate.id AND a.budget_status = 'reserved'
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    IF nuno_budget_settle_attempt(v_candidate.id, p_now) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION nuno_settle_budgets(timestamptz) TO nuno_api;
