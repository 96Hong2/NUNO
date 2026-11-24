# 프리셋 트윈 점과 마스크 뽑기

프리셋 트윈 원본 기본 사진(`assets-source/twins/<키>/base-source.*`)에서 얼굴 점 478개, 몸 점 33개, 사람 마스크를 뽑아 앱 판 폴더 `apps/mobile/assets/twins/<키>/` 에 둔다. 마스크는 그 폴더의 `base.jpg` 크기로 줄인다. 확인 그림은 `docs/plans/evidence/T2/landmarks-<키>.png` 다. 앱과 `verify` 는 이 스크립트를 부르지 않는다.

## 준비

- 파이썬 3.12 가상 환경에 `requirements.txt` 를 설치한다. MediaPipe 휠이 3.15 를 공식 지원하지 않는다.
- 모델 파일 둘을 한 폴더에 받는다(저장소에 넣지 않는다).
  - `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`
  - `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task`

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r tools/twin-landmarks/requirements.txt
```

## 실행

```bash
.venv/bin/python tools/twin-landmarks/extract.py --models <모델 폴더> \
  --out assets-source/twins --check docs/plans/evidence/T2 \
  --twin yuna=assets-source/twins/yuna/base-source.png --twin harin=assets-source/twins/harin/base-source.jpg …
```

- 얼굴은 몸 점의 얼굴 영역을 잘라 512px 로 키운 뒤 찾는다. 전신 사진에서는 얼굴이 작아 그대로 넣으면 놓친다.
- 점을 못 찾은 트윈이 있으면 종료 코드 1 과 그 키를 낸다. 손으로 고친 값은 `docs/plans/plan_T2.md` 에 적는다.
- `landmarks.json` 좌표는 사진 폭과 높이를 1 로 둔 비율이고 원점은 왼쪽 위다.
