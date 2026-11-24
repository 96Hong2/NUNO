-- 판 2: 사용자, 로그인 신원과 세션, Apple 자격, 푸시 기기, 동의.
-- nuno_api 는 표에 쓰지 못한다. 쓰기는 아래 SECURITY DEFINER 함수로만 하고, 함수마다 실행 권한을 준다.
-- 업무 시각은 모두 인자 p_now 로 받는다. 시험이 시각을 고정하거나 앞으로 돌린다.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text,
  birth_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deletion_pending')),
  deletion_requested_at timestamptz,
  deletion_due_at timestamptz,
  created_at timestamptz NOT NULL
);

-- 신원 행을 먼저 넣어 (provider, subject) 고유 색인으로 동시 가입을 하나로 줄인다.
-- 그래서 users 를 가리키는 키는 커밋 때 확인한다.
CREATE TABLE auth_identities (
  provider text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX auth_identities_user_id ON auth_identities (user_id);

-- 세션 토큰 원문은 두지 않는다. token_hash 는 원문의 SHA-256 이다.
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX auth_sessions_user_id ON auth_sessions (user_id);

-- Apple refresh token 은 API 가 AES-256-GCM 으로 암호화한 글만 둔다. 계정 삭제 때 Apple 에 토큰 철회를 보낸다.
CREATE TABLE apple_credentials (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  refresh_token_encrypted text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  push_token text NOT NULL UNIQUE,
  platform text NOT NULL,
  notify_looks boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);
CREATE INDEX devices_user_id ON devices (user_id);

-- 동의 기록은 고치지 않고 쌓는다. 다시 동의하면 새 행, 철회는 그 행의 withdrawn_at 만 채운다.
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind = 'generation_transfer'),
  text_version integer NOT NULL CHECK (text_version > 0),
  agreed_at timestamptz NOT NULL,
  withdrawn_at timestamptz
);
CREATE INDEX consents_user_kind ON consents (user_id, kind, agreed_at DESC);

REVOKE ALL ON users, auth_identities, auth_sessions, apple_credentials, devices, consents FROM PUBLIC;
-- 「내 정보」 의 동의 상태만 API 가 직접 읽는다. 사용자 ID 조건은 API 가 세션에서 얻은 값으로 건다.
GRANT SELECT (user_id, kind, text_version, agreed_at, withdrawn_at) ON consents TO nuno_api;

-- 같은 (provider, subject) 면 같은 사용자다. 없으면 사용자를 만든다. 동시에 와도 사용자는 하나다.
CREATE FUNCTION nuno_sign_in(
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

  INSERT INTO auth_sessions (user_id, token_hash, created_at, expires_at)
  VALUES (v_user, p_token_hash, p_now, p_expires_at);

  RETURN QUERY SELECT v_user, v_created;
END;
$$;

-- 만료, 철회된 세션과 쓰지 못하는 계정(정지, 삭제 대기)이면 NULL 이다.
CREATE FUNCTION nuno_session_user(p_token_hash bytea, p_now timestamptz) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.user_id
  FROM auth_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > p_now
    AND u.status = 'active';
$$;

CREATE FUNCTION nuno_sign_out(p_token_hash bytea, p_now timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE auth_sessions SET revoked_at = p_now
  WHERE token_hash = p_token_hash AND revoked_at IS NULL;
$$;

CREATE FUNCTION nuno_agree_consent(
  p_user_id uuid,
  p_kind text,
  p_text_version integer,
  p_now timestamptz
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO consents (user_id, kind, text_version, agreed_at)
  VALUES (p_user_id, p_kind, p_text_version, p_now)
  RETURNING id;
$$;

CREATE FUNCTION nuno_withdraw_consent(p_user_id uuid, p_kind text, p_now timestamptz)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  -- 작업 함수들처럼 사용자 행을 먼저 잠가, 철회와 공급사 전송 시작의 순서를 정한다.
  PERFORM 1 FROM users WHERE id = p_user_id FOR UPDATE;
  UPDATE consents SET withdrawn_at = p_now
  WHERE user_id = p_user_id AND kind = p_kind AND withdrawn_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 다시 로그인하면 새 refresh token 으로 바꾼다.
CREATE FUNCTION nuno_store_apple_credential(p_user_id uuid, p_encrypted text, p_now timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO apple_credentials (user_id, refresh_token_encrypted, created_at)
  VALUES (p_user_id, p_encrypted, p_now)
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        created_at = EXCLUDED.created_at;
$$;

-- 푸시 토큰은 기기 하나에 하나다. 같은 기기에서 다른 계정으로 들어오면 주인을 바꾼다.
CREATE FUNCTION nuno_register_device(
  p_user_id uuid,
  p_push_token text,
  p_platform text,
  p_now timestamptz
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO devices (user_id, push_token, platform, created_at, last_seen_at)
  VALUES (p_user_id, p_push_token, p_platform, p_now, p_now)
  ON CONFLICT (push_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = EXCLUDED.last_seen_at
  RETURNING id;
$$;

GRANT EXECUTE ON FUNCTION nuno_sign_in(text, text, bytea, timestamptz, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_session_user(bytea, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_sign_out(bytea, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_agree_consent(uuid, text, integer, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_withdraw_consent(uuid, text, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_store_apple_credential(uuid, text, timestamptz) TO nuno_api;
GRANT EXECUTE ON FUNCTION nuno_register_device(uuid, text, text, timestamptz) TO nuno_api;
