-- 판 6: 접수 대기 상한과 저장하지 않은 결과의 보관 기한.
-- 접수 상태로 대기 상한을 넘긴 작업은 공급사를 부르지 않고 queue_timeout 으로 실패와 풀기다. 상한 초는 worker 가 넘긴다.
-- 선점 함수가 직접 상한을 본다. 정리 함수가 한 바퀴에 다 끝내지 못해도 상한을 넘긴 작업이 선점되지 않는다.
-- 보관 기한(delete_due_at)이 지난 gen30 결과는 룩북에 저장하지 못한다. worker 가 파일을 먼저 지우고 DB 를 deleted 로 적는다.
-- 정리 함수는 한 번 부를 때 한 건만 다룬다. 트랜잭션 하나가 사용자 행 하나만 잠가 worker 의 다른 함수와 교착이 생기지 않는다.
-- 잠금 순서는 판 5 그대로 사용자 → 작업 → 시도 → 예산 행이다.

-- 대기 상한을 넘긴 접수 작업 하나를 실패와 풀기로 끝낸다. 넘긴 작업이 없으면 행이 없다.
-- 고른 작업을 그사이 worker 가 선점했으면 expired 가 false 인 행을 준다. 부르는 쪽이 행이 없을 때까지 되풀이한다.
CREATE FUNCTION nuno_expire_next_queued_job(p_now timestamptz, p_wait_seconds integer)
RETURNS TABLE (job_id uuid, user_id uuid, expired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_cutoff timestamptz;
  v_candidate record;
BEGIN
  IF p_wait_seconds IS NULL OR p_wait_seconds <= 0 THEN
    RAISE EXCEPTION '대기 상한은 0보다 큰 초다: %', p_wait_seconds;
  END IF;
  v_cutoff := p_now - make_interval(secs => p_wait_seconds);

  SELECT j.id, j.user_id INTO v_candidate FROM generation_jobs j
  WHERE j.status = 'queued' AND j.created_at <= v_cutoff
  ORDER BY j.created_at, j.id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_candidate.user_id FOR UPDATE;
  PERFORM 1 FROM generation_jobs j
  WHERE j.id = v_candidate.id AND j.status = 'queued' AND j.created_at <= v_cutoff
  FOR UPDATE;
  job_id := v_candidate.id;
  user_id := v_candidate.user_id;
  expired := FOUND;
  IF expired THEN
    PERFORM nuno_job_release(v_candidate.id, 'queue_timeout', p_now);
  END IF;
  RETURN NEXT;
END;
$$;

-- 대기 상한을 보는 선점. worker 는 이 네 인자 판만 부른다. 판 3 의 세 인자 판은 기존 시험이 불러 남겨 둔다.
-- 고른 접수 작업이 대기 상한을 넘겼으면 공급사로 보내지 않고 queue_timeout 으로 실패와 풀기를 한 뒤
-- queue_timed_out 이 true 인 행을 준다. 부르는 쪽이 알림을 보내고 다시 부른다.
-- 대기 만료는 한 번에 한 건이라, 트랜잭션 하나가 대기 만료로 여러 사용자 행을 잠그지 않는다.
-- 그 밖의 동작(계정 정지, 동의 철회, SKIP LOCKED)은 판 3 과 같다.
CREATE FUNCTION nuno_claim_job(
  p_lease_token uuid,
  p_lease_seconds integer,
  p_now timestamptz,
  p_wait_seconds integer
)
RETURNS TABLE (
  job_id uuid,
  user_id uuid,
  input_manifest jsonb,
  payment_kind text,
  queue_timed_out boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_cutoff timestamptz;
  v_candidate record;
  v_user_status text;
  v_job generation_jobs%ROWTYPE;
BEGIN
  IF p_wait_seconds IS NULL OR p_wait_seconds <= 0 THEN
    RAISE EXCEPTION '대기 상한은 0보다 큰 초다: %', p_wait_seconds;
  END IF;
  v_cutoff := p_now - make_interval(secs => p_wait_seconds);

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

    IF v_job.created_at <= v_cutoff THEN
      PERFORM nuno_job_release(v_job.id, 'queue_timeout', p_now);
      RETURN QUERY SELECT v_job.id, v_job.user_id, v_job.input_manifest, v_job.payment_kind, true;
      RETURN;
    END IF;
    IF v_user_status <> 'active' THEN
      PERFORM nuno_job_release(v_job.id, 'account_inactive', p_now);
      CONTINUE;
    END IF;
    IF NOT nuno_has_transfer_consent(v_job.user_id) THEN
      PERFORM nuno_job_release(v_job.id, 'consent_withdrawn', p_now);
      CONTINUE;
    END IF;

    UPDATE generation_jobs j
    SET status = 'generating',
        lease_token = p_lease_token,
        lease_until = p_now + make_interval(secs => p_lease_seconds),
        attempt_number = j.attempt_number + 1
    WHERE j.id = v_job.id;

    RETURN QUERY SELECT v_job.id, v_job.user_id, v_job.input_manifest, v_job.payment_kind, false;
    RETURN;
  END LOOP;
END;
$$;

-- 보관 기한이 지난 gen30 결과 하나를 deleted 로 적는다. worker 가 그 키의 파일을 지운 뒤 부른다.
-- 저장한 결과(kept)와 기한 전 결과는 바꾸지 않고 false 다.
CREATE FUNCTION nuno_expire_result(p_result_id uuid, p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT r.user_id INTO v_user FROM generation_results r WHERE r.id = p_result_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM users u WHERE u.id = v_user FOR UPDATE;
  UPDATE generation_results r
  SET storage_state = 'deleted', deleted_at = p_now
  WHERE r.id = p_result_id AND r.storage_state = 'gen30' AND r.delete_due_at <= p_now;
  RETURN FOUND;
END;
$$;

-- 판 3 동작에 더해, 보관 기한이 지난 gen30 결과는 정리 전이라도 저장하지 않고 NULL 이다.
CREATE OR REPLACE FUNCTION nuno_keep_result(
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
  IF v_result.storage_state = 'gen30' AND v_result.delete_due_at <= p_now THEN
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

GRANT EXECUTE ON FUNCTION nuno_expire_next_queued_job(timestamptz, integer) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_claim_job(uuid, integer, timestamptz, integer) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_expire_result(uuid, timestamptz) TO nuno_api;
