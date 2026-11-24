import { PRESET_TWIN_KEYS, type PresetTwinKey } from "../domain";

export {
  chooseTwin,
  createTwinChoiceTable,
  currentTwin,
  readTwinChoice,
} from "./twin-choice-store";

/** 「옷을 입어 볼 트윈을 골라 주세요」 화면이 카드로 보일 프리셋 키 목록. 설치 파일 순서 그대로다. */
export function listPresetTwinKeys(): readonly PresetTwinKey[] {
  return PRESET_TWIN_KEYS;
}
