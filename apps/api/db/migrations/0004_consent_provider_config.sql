-- 판 4: 동의 문구 판과 공급사 자료 보관 기간을 공급사 설정 줄에 둔다. 작업은 접수 때 고른 설정 줄과 그 판을 적는다.
-- worker 는 공급사를 부르기 직전마다 작업에 적은 줄과 판이 지금 고른 줄과 같은지 본다. 다르면 부르지 않고 실패와 풀기다.
-- 보관 기간을 바꾸면 같은 줄의 동의 문구 판도 함께 올린다. 한 판이 두 보관 기간 문구를 가리키지 않게 한다.

ALTER TABLE provider_configs
  ADD COLUMN consent_text_version integer NOT NULL DEFAULT 1 CHECK (consent_text_version > 0),
  ADD COLUMN retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days >= 0);

-- 판 4 전에 접수한 작업은 두 칸이 비어 있다. 설정 줄을 지우면 작업 행은 남고 ID 가 빈 값이 된다.
ALTER TABLE generation_jobs
  ADD COLUMN consent_text_version integer,
  ADD COLUMN provider_config_id uuid REFERENCES provider_configs (id) ON DELETE SET NULL;
CREATE INDEX generation_jobs_provider_config ON generation_jobs (provider_config_id);

-- worker 가 작업을 받은 설정 줄의 공급사와 모델을 읽는다.
GRANT SELECT (provider_config_id, consent_text_version) ON generation_jobs TO nuno_api;

-- 지금 쓰는 공급사 설정 줄. 켜 둔 줄 가운데 우선순위, 공급사 이름, ID 순서로 첫 줄이다. id 가 끝 키라 동점에도 늘 같은 줄이다.
-- 켜 둔 줄이 없으면 행이 없다. 그때는 동의도 접수도 받지 않는다.
CREATE FUNCTION nuno_current_provider_config()
RETURNS TABLE (
  id uuid,
  consent_text_version integer,
  retention_days integer,
  provider text,
  country text
)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT c.id, c.consent_text_version, c.retention_days, c.provider, c.country
  FROM provider_configs c
  WHERE c.enabled
  ORDER BY c.priority, c.provider, c.id
  LIMIT 1;
$$;

-- 접수. 판 3 동작에 더해, 사용자 동의 판 비교 다음에 지금 설정 줄의 판과 비교하고 그 줄의 ID 와 판을 작업에 적는다.
-- 라우트가 판을 확인한 뒤 함수가 돌기 전에 판이 바뀌는 경우를 여기서 막는다.
CREATE OR REPLACE FUNCTION nuno_submit_job(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_manifest jsonb,
  p_consent_version integer,
  p_now timestamptz,
  p_pay_with text DEFAULT NULL
) RETURNS TABLE (job_id uuid, status text, payment_kind text, error_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  c_price constant integer := 4;
  c_trial_daily constant integer := 4;
  v_user_status text;
  v_existing generation_jobs%ROWTYPE;
  v_consent integer;
  v_config record;
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

  SELECT * INTO v_config FROM nuno_current_provider_config();
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'provider_unavailable'::text;
    RETURN;
  END IF;
  IF v_config.consent_text_version IS DISTINCT FROM p_consent_version THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'consent_text_outdated'::text;
    RETURN;
  END IF;

  SELECT f.enabled INTO v_enabled FROM feature_switches f WHERE f.key = 'generate_look';
  IF v_enabled IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'switch_off'::text;
    RETURN;
  END IF;

  v_trial := nuno_gold_account(p_user_id, 'trial');
  IF p_pay_with = 'trial' AND nuno_gold_balance(v_trial) < c_price THEN
    -- 화면은 무료 장을 보여 줬지만 그사이 무료 장이 없어졌다. 묻지 않고 골드를 쓰지 않는다.
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'payment_changed'::text;
    RETURN;
  END IF;
  IF p_pay_with IS DISTINCT FROM 'gold' AND nuno_gold_balance(v_trial) >= c_price THEN
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
    user_id, idempotency_key, request_hash, input_manifest, payment_kind, price_gold, status,
    consent_text_version, provider_config_id, created_at
  )
  VALUES (
    p_user_id, p_idempotency_key, p_request_hash, p_manifest, v_payment, c_price, 'queued',
    v_config.consent_text_version, v_config.id, p_now
  )
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

-- 공급사를 부르기 전에 시도 줄을 만든다. 다시 만들기 회차도 이 함수를 지난다.
-- 판 3 의 계정 상태와 전송 동의 확인에 더해, 작업에 적은 설정 줄과 판이 지금 고른 줄과 같은지 본다.
-- 줄이 바뀌었거나 비었으면 provider_changed, 판이 다르면 consent_outdated 로 실패와 풀기다. 시도 줄은 만들지 않는다.
-- 접수 때 사용자의 동의 판과 같았으므로 동의 행의 판은 다시 보지 않는다.
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

GRANT EXECUTE ON FUNCTION nuno_current_provider_config() TO nuno_api;
