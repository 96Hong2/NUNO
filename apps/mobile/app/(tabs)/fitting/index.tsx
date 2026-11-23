import { Redirect } from "expo-router";

// 피팅룸을 열면 첫 칸 「코디」 를 보인다.
export default function FittingIndex() {
  return <Redirect href="/fitting/coordi" />;
}
