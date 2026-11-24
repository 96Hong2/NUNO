// 생년월일은 달력 날짜 `YYYY-MM-DD` 문자열 그대로 다룬다. Date 로 바꾸면 시간대에 따라 하루가 밀린다.

export const BIRTH_DATE_MIN = "1900-01-01";
/** 생년월일 화면이 처음 열릴 때 골라져 있는 날짜. 「다음」 이 바로 눌린다. */
export const BIRTH_DATE_DEFAULT = "2002-03-14";

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 실제 있는 날짜이고 `BIRTH_DATE_MIN` 부터 today(한국 날짜 `YYYY-MM-DD`)까지면 참. */
export function isValidBirthDate(value: string, today: string): boolean {
  const match = PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  return value >= BIRTH_DATE_MIN && value <= today;
}
