import type { GarmentMedia, PreparedPhoto, RenderedGarment } from "@nuno/wardrobe";
import { Directory, File, Paths } from "expo-file-system";
import { Image } from "react-native";

function size(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function untouched(photo: PreparedPhoto): Promise<RenderedGarment> {
  return Promise.resolve({
    cutoutUri: photo.cutoutUri,
    aspect: photo.width / Math.max(1, photo.height),
    pixels: new Uint8ClampedArray(0),
  });
}

/**
 * 아이폰 옷 그림 어댑터의 자리. Apple Vision 누끼, 손보기 굽기, 다시 인코딩해 위치 정보 지우기는 Xcode 를 설치한 뒤 붙인다.
 * 그때까지는 고른 사진을 그대로 옷 그림으로 쓰고, 앱 문서 폴더 `garments/<옷 ID>/` 에 복사한다.
 */
export const garmentMedia: GarmentMedia = {
  editable: false,

  async prepare(photoUri) {
    const { width, height } = await size(photoUri);
    return {
      originalUri: photoUri,
      cutoutUri: photoUri,
      cutoutSource: "none",
      face: null,
      hadPerson: false,
      width,
      height,
    };
  },

  render: untouched,
  renderPreview: untouched,

  async store(id, photo, rendered) {
    const directory = new Directory(Paths.document, "garments", id);
    directory.create({ intermediates: true, idempotent: true });
    const copy = async (from: string, name: string) => {
      const target = new File(directory, name);
      if (target.exists) target.delete();
      await new File(from).copy(target);
      return `garments/${id}/${name}`;
    };
    return {
      originalPath: await copy(photo.originalUri, "original.jpg"),
      cutoutPath: await copy(rendered.cutoutUri, "cutout.png"),
      thumbPath: await copy(rendered.cutoutUri, "thumb.png"),
    };
  },

  async storeImage(id, imageUri) {
    const directory = new Directory(Paths.document, "garments", id);
    directory.create({ intermediates: true, idempotent: true });
    const paths = {
      originalPath: `garments/${id}/original.png`,
      cutoutPath: `garments/${id}/cutout.png`,
      thumbPath: `garments/${id}/thumb.png`,
    };
    for (const name of ["original.png", "cutout.png", "thumb.png"]) {
      const target = new File(directory, name);
      if (target.exists) target.delete();
      await new File(imageUri).copy(target);
    }
    return paths;
  },

  release() {
    // 아이폰 파일 주소는 놓아줄 것이 없다.
  },

  resolve(path) {
    return Promise.resolve(new File(Paths.document, path).uri);
  },

  remove(id) {
    const directory = new Directory(Paths.document, "garments", id);
    if (directory.exists) directory.delete();
    return Promise.resolve();
  },
};
