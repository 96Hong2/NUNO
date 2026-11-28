-- 판 7: 생성 입력으로 쓸 옷 사진 올리기.
-- 앱은 올리기 줄을 발급받고 그림을 올린다. 서버가 크기, 형식, 해시를 검사한 뒤 확정한다.
-- 접수와 worker 는 그 사용자의 확정 줄만 입력으로 쓴다. 다른 사용자의 올리기 ID 는 없는 ID 와 같게 다룬다.
-- 표는 nuno_api 에 열지 않고 함수 다섯만 준다. 잠금 순서는 판 5 그대로 사용자가 맨 먼저다.
-- 공급사에 넘길 사본(job-in/)은 버킷 수명 주기 규칙이 1일 뒤 지운다. 그래서 확정 뒤 23시간까지만 입력으로 쓴다.

CREATE TABLE uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  purpose text NOT NULL CHECK (purpose IN ('job_input')),
  -- 확정 때 서버가 정한다: job-in/<사용자 ID>/<올리기 ID>/<해시>.<확장자>
  r2_key text UNIQUE,
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer CHECK (byte_size > 0),
  content_type text CHECK (content_type IN ('image/png', 'image/jpeg')),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'confirmed')),
  issued_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  CHECK (
    (status = 'confirmed') = (r2_key IS NOT NULL AND sha256 IS NOT NULL AND byte_size IS NOT NULL
      AND content_type IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE INDEX uploads_user_issued ON uploads (user_id, issued_at);

REVOKE ALL ON uploads FROM PUBLIC;

-- 올리기 줄 하나를 발급한다. 한국 시간 하루에 발급한 줄이 상한 이상이면 upload_daily_limit 이다.
CREATE FUNCTION nuno_issue_upload(p_user_id uuid, p_now timestamptz, p_daily_limit integer)
RETURNS TABLE (upload_id uuid, error_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status text;
  v_count integer;
  v_id uuid;
BEGIN
  -- 같은 사용자의 동시 발급이 상한을 함께 넘지 않게 사용자 행을 먼저 잠근다.
  SELECT u.status INTO v_status FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT NULL::uuid, 'account_inactive'::text;
    RETURN;
  END IF;
  SELECT count(*) INTO v_count FROM uploads up
  WHERE up.user_id = p_user_id
    AND (up.issued_at AT TIME ZONE 'Asia/Seoul')::date = (p_now AT TIME ZONE 'Asia/Seoul')::date;
  IF v_count >= p_daily_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'upload_daily_limit'::text;
    RETURN;
  END IF;
  INSERT INTO uploads (user_id, purpose, issued_at) VALUES (p_user_id, 'job_input', p_now)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, NULL::text;
END;
$$;

-- 서버가 검사를 마친 파일로 그 사용자의 발급 줄을 확정한다. 남의 줄, 없는 줄, 이미 확정한 줄이면 false.
-- 키는 그 사용자와 그 올리기 ID 아래여야 한다.
CREATE FUNCTION nuno_confirm_upload(
  p_user_id uuid, p_upload_id uuid, p_r2_key text, p_sha256 text, p_byte_size integer,
  p_content_type text, p_now timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_updated integer;
BEGIN
  PERFORM 1 FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF left(p_r2_key, length('job-in/' || p_user_id || '/' || p_upload_id || '/'))
     <> 'job-in/' || p_user_id || '/' || p_upload_id || '/' THEN
    RAISE EXCEPTION '올리기 키가 그 사용자와 올리기 ID 아래가 아니다: %', p_r2_key;
  END IF;
  UPDATE uploads up
  SET status = 'confirmed', r2_key = p_r2_key, sha256 = p_sha256, byte_size = p_byte_size,
      content_type = p_content_type, confirmed_at = p_now
  WHERE up.id = p_upload_id AND up.user_id = p_user_id AND up.status = 'issued';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- 그림을 받기 전에 부른다. 그 사용자의 줄이면 true. 남의 줄과 없는 줄은 같은 답이다.
CREATE FUNCTION nuno_upload_owned(p_user_id uuid, p_upload_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM uploads up WHERE up.id = p_upload_id AND up.user_id = p_user_id);
$$;

-- 그 사용자의 줄이 확정됐으면 그 파일 키, 아니면 NULL. 같은 바이트를 다시 올렸는지 가릴 때 쓴다.
CREATE FUNCTION nuno_upload_key(p_user_id uuid, p_upload_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT up.r2_key FROM uploads up WHERE up.id = p_upload_id AND up.user_id = p_user_id;
$$;

-- 그 사용자의 확정 줄 가운데 확정 뒤 23시간이 지나지 않은 줄만 준다.
-- 접수는 개수로 소유를 확인하고, worker 는 이 함수가 준 키와 해시로만 파일을 다시 검사한다.
CREATE FUNCTION nuno_job_uploads(p_user_id uuid, p_upload_ids uuid[], p_now timestamptz)
RETURNS TABLE (id uuid, r2_key text, sha256 text, byte_size integer, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT up.id, up.r2_key, up.sha256, up.byte_size, up.content_type
  FROM uploads up
  WHERE up.user_id = p_user_id AND up.id = ANY (p_upload_ids) AND up.status = 'confirmed'
    AND up.confirmed_at > p_now - interval '23 hours';
$$;

GRANT EXECUTE ON FUNCTION nuno_issue_upload(uuid, timestamptz, integer) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_confirm_upload(uuid, uuid, text, text, integer, text, timestamptz)
  TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_upload_owned(uuid, uuid) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_upload_key(uuid, uuid) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_job_uploads(uuid, uuid[], timestamptz) TO nuno_api;
