import type { BrushStroke, CutoutSource, Rect } from "../domain";

/** 「배경을 지웠어요」 와 「옷만 보이도록 잘라 주세요」 에서 손본 값. 그림에 굽기 전까지 이 값만 들고 다닌다. */
export interface GarmentEdits {
  /** 원본 사진 대비 남길 네모 */
  crop: Rect;
  /** 시계 방향 90도 단위 */
  rotation: 0 | 90 | 180 | 270;
  /** 「지우기」, 「되살리기」, 「붓으로 가리기」 자국. 원본 사진 비율 좌표다. */
  strokes: BrushStroke[];
}

export const NO_EDITS: GarmentEdits = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  strokes: [],
};

/** 고른 사진에서 누끼를 만든 결과. uri 는 화면이 바로 그릴 수 있는 주소다. */
export interface PreparedPhoto {
  originalUri: string;
  cutoutUri: string;
  cutoutSource: CutoutSource;
  /** 사진에 사람이 들었으면 그 얼굴 네모. 사람이 없으면 null. */
  face: Rect | null;
  hadPerson: boolean;
  width: number;
  height: number;
}

/** 손본 값을 구운 누끼. pixels 는 색 미리 고르기에 쓰는 작은 RGBA 점들이다. */
export interface RenderedGarment {
  cutoutUri: string;
  /** 가로 / 세로 */
  aspect: number;
  pixels: Uint8ClampedArray;
}

export interface StoredGarmentFiles {
  originalPath: string;
  cutoutPath: string;
  thumbPath: string;
}

/**
 * 옷 그림 포트. 웹은 미리 만든 누끼와 canvas, 아이폰은 Apple Vision 과 앱 문서 폴더로 구현한다.
 * 경로는 앱 문서 폴더 기준 상대 경로(`garments/<옷 ID>/…`)다.
 */
export interface GarmentMedia {
  /** 「지우기」, 「되살리기」, 「자르기」, 「돌리기」 를 구울 수 있는지. 아이폰 구현은 Xcode 설치 뒤에 붙는다. */
  editable: boolean;
  prepare(photoUri: string): Promise<PreparedPhoto>;
  /** 손본 값을 굽고 투명한 가장자리를 잘라 옷만 남긴다. 「다음」 으로 넘길 때 쓴다. */
  render(photo: PreparedPhoto, edits: GarmentEdits): Promise<RenderedGarment>;
  /** 손보는 동안 보이는 그림. 가장자리를 자르지 않아 붓 자국 좌표가 사진 좌표와 맞는다. */
  renderPreview(photo: PreparedPhoto, edits: GarmentEdits): Promise<RenderedGarment>;
  store(id: string, photo: PreparedPhoto, rendered: RenderedGarment): Promise<StoredGarmentFiles>;
  /** 다 쓴 미리보기 주소를 놓아준다. 웹은 blob 주소를 해제하고, 아이폰은 할 일이 없다. */
  release(uri: string): void;
  /** 저장한 그림 경로를 화면이 그릴 주소로 바꾼다. */
  resolve(path: string): Promise<string>;
  remove(id: string): Promise<void>;
}
