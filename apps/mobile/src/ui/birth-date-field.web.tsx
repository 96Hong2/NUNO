import type { BirthDateFieldProps } from "./birth-date-field";

// 웹 생년월일 칸. 브라우저 날짜 칸의 값이 처음부터 `YYYY-MM-DD` 라 그대로 주고받는다.
// 사용자가 값을 지우면 빈 문자열이 오고, 화면은 그때 「다음」 을 막는다.
export function BirthDateField({ value, min, max, onChange }: BirthDateFieldProps) {
  return (
    <input
      type="date"
      aria-label="생년월일"
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      style={{
        fontSize: 20,
        padding: 12,
        border: "1px solid #d0d0d0",
        borderRadius: 12,
        width: "100%",
        boxSizing: "border-box",
      }}
    />
  );
}
