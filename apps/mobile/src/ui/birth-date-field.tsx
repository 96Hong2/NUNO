import DateTimePicker from "@react-native-community/datetimepicker";

// 네이티브 생년월일 칸. 웹은 birth-date-field.web.tsx 다(datetimepicker 가 웹에서 아무것도 그리지 않는다).
// 값은 `YYYY-MM-DD` 문자열로 주고받는다. Date 는 기기 현지 연, 월, 일로만 바꾼다.
// toISOString 으로 자르면 한국 시각 0~9시에 하루 앞으로 밀린다.

export interface BirthDateFieldProps {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(text: string): Date {
  const [year = 1900, month = 1, day = 1] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toText(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function BirthDateField({ value, min, max, onChange }: BirthDateFieldProps) {
  return (
    <DateTimePicker
      value={toDate(value)}
      mode="date"
      display="spinner"
      locale="ko-KR"
      minimumDate={toDate(min)}
      maximumDate={toDate(max)}
      onValueChange={(_, date) => onChange(toText(date))}
    />
  );
}
