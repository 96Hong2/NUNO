// 웹은 한글 글자마다 줄을 바꿀 수 있어 「입히기」 가 「입|히기」 로 끊긴다. 어절 단위로만 바꾸고,
// 한 어절이 줄보다 길 때만 그 안에서 끊는다. 기기 앱은 글자 그리기가 달라 이 파일을 쓰지 않는다.
if (typeof document !== "undefined" && !document.getElementById("nuno-korean-line-break")) {
  const style = document.createElement("style");
  style.id = "nuno-korean-line-break";
  style.textContent = "body * { word-break: keep-all; overflow-wrap: anywhere; }";
  document.head.appendChild(style);
}

export {};
