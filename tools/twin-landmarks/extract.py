"""프리셋 트윈 기본 사진에서 얼굴 점 478개, 몸 점 33개, 사람 마스크를 뽑고 확인 그림을 그린다.

실행법은 같은 폴더 README.md. 앱 코드나 verify 가 부르지 않는다.
"""

import argparse
import json
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from PIL import Image, ImageDraw

# 몸 점 33개 가운데 얼굴 점(코, 눈, 귀, 입). 얼굴을 잘라 키울 영역을 잡는 데 쓴다.
POSE_FACE = range(0, 11)
POSE_LINES = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
]


def to_mp_image(rgb: Image.Image) -> mp.Image:
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.asarray(rgb)))


def face_points(face_model, rgb: Image.Image, pose_xy):
    """포즈의 얼굴 점 둘레를 정사각으로 잘라 키운 뒤 얼굴 점을 찾고, 원래 사진 좌표(0~1)로 되돌린다."""
    width, height = rgb.size
    xs = [pose_xy[i][0] * width for i in POSE_FACE]
    ys = [pose_xy[i][1] * height for i in POSE_FACE]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * 3.2
    left, top = max(0, cx - side / 2), max(0, cy - side / 2)
    right, bottom = min(width, cx + side / 2), min(height, cy + side / 2)
    crop = rgb.crop((int(left), int(top), int(right), int(bottom)))
    scale = 512 / max(crop.size)
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    result = face_model.detect(to_mp_image(crop))
    if not result.face_landmarks:
        return None
    cw, ch = right - int(left), bottom - int(top)
    return [
        [round((int(left) + p.x * cw) / width, 5), round((int(top) + p.y * ch) / height, 5), round(p.z, 5)]
        for p in result.face_landmarks[0]
    ]


def draw_check(rgb: Image.Image, mask: np.ndarray, face, pose) -> Image.Image:
    width, height = rgb.size
    tint = Image.new("RGB", rgb.size, (0, 160, 255))
    alpha = Image.fromarray((mask * 90).astype(np.uint8))
    out = Image.composite(tint, rgb, alpha)
    draw = ImageDraw.Draw(out)
    for a, b in POSE_LINES:
        draw.line([(pose[a][0] * width, pose[a][1] * height), (pose[b][0] * width, pose[b][1] * height)],
                  fill=(255, 80, 0), width=4)
    for x, y, *_ in pose:
        draw.ellipse([x * width - 6, y * height - 6, x * width + 6, y * height + 6], fill=(255, 80, 0))
    for x, y, _ in face or []:
        draw.ellipse([x * width - 1.5, y * height - 1.5, x * width + 1.5, y * height + 1.5], fill=(0, 255, 120))
    return out.resize((600, round(600 * height / width)), Image.LANCZOS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True, help="face_landmarker.task, pose_landmarker_heavy.task 가 든 폴더")
    parser.add_argument("--twin", action="append", required=True, help="키=기본 사진 경로. 여러 번 준다")
    parser.add_argument("--out", required=True, help="앱 판 폴더 apps/mobile/assets/twins")
    parser.add_argument("--check", required=True, help="확인 그림을 둘 폴더")
    args = parser.parse_args()

    models = Path(args.models)
    pose_model = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(models / "pose_landmarker_heavy.task")),
        running_mode=vision.RunningMode.IMAGE, output_segmentation_masks=True, num_poses=1))
    face_model = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(models / "face_landmarker.task")),
        running_mode=vision.RunningMode.IMAGE, num_faces=1))

    failed = []
    for item in args.twin:
        key, path = item.split("=", 1)
        rgb = Image.open(path).convert("RGB")
        result = pose_model.detect(to_mp_image(rgb))
        if not result.pose_landmarks:
            failed.append(f"{key}: 몸 점을 찾지 못함")
            continue
        pose = [[round(p.x, 5), round(p.y, 5), round(p.z, 5), round(p.visibility, 3)]
                for p in result.pose_landmarks[0]]
        mask = np.clip(result.segmentation_masks[0].numpy_view().squeeze(), 0, 1)
        face = face_points(face_model, rgb, pose)
        if face is None:
            failed.append(f"{key}: 얼굴 점을 찾지 못함")

        out = Path(args.out) / key
        out.mkdir(parents=True, exist_ok=True)
        # 앱 판 기본 사진(base.jpg)이 있으면 마스크를 그 크기로 줄인다. 점은 비율이라 크기와 상관없다.
        mask_image = Image.fromarray((mask * 255).astype(np.uint8))
        if (out / "base.jpg").exists():
            mask_image = mask_image.resize(Image.open(out / "base.jpg").size, Image.LANCZOS)
        mask_image.save(out / "mask.png", optimize=True)
        (out / "landmarks.json").write_text(json.dumps({
            "image": {"width": rgb.width, "height": rgb.height},
            "coords": "0~1, 왼쪽 위 원점",
            "face": face,
            "pose": pose,
        }, ensure_ascii=False) + "\n")
        check = Path(args.check)
        check.mkdir(parents=True, exist_ok=True)
        draw_check(rgb, mask, face, pose).save(check / f"landmarks-{key}.png")
        print(f"{key}: 몸 점 {len(pose)}, 얼굴 점 {len(face) if face else 0}")

    for line in failed:
        print(line, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
