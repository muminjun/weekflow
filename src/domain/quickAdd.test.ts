import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";
// 2026-11-18 is a Wednesday.
const today = "2026-11-18";
const categories = [
  { id: "c1", name: "업무" },
  { id: "c2", name: "운동" },
  { id: "c3", name: "보관함", archived_at: "2026-01-01T00:00:00Z" },
];
const parse = (text: string) => parseQuickAdd(text, { today, categories });

describe("parseQuickAdd", () => {
  it("reads a relative day, afternoon hour and duration", () => {
    expect(parse("내일 3시 회의 1시간")).toMatchObject({
      title: "회의",
      date: "2026-11-19",
      start: 900,
      duration: 60,
    });
  });
  it("respects explicit 오전/오후 and half hours", () => {
    expect(parse("오전 9시반 스탠드업 15분")).toMatchObject({
      title: "스탠드업",
      date: today,
      start: 570,
      duration: 15,
    });
    expect(parse("저녁 7시 러닝")).toMatchObject({ start: 1140 });
    expect(parse("오전 12시 배포")).toMatchObject({ start: 0 });
  });
  it("keeps morning bare hours and 24h clock times as typed", () => {
    expect(parse("9시 메일 정리")).toMatchObject({ start: 540 });
    expect(parse("14:30 리뷰")).toMatchObject({ start: 870, duration: 60 });
  });
  it("reads time ranges, including ranges written without 오후", () => {
    expect(parse("금요일 3시-5시 워크숍")).toMatchObject({
      title: "워크숍",
      date: "2026-11-20",
      start: 900,
      duration: 120,
    });
    expect(parse("10:00~11:30 면접")).toMatchObject({
      start: 600,
      duration: 90,
    });
  });
  it("resolves weekdays relative to today and next week", () => {
    expect(parse("월요일 3시 주간회의").date).toBe("2026-11-23");
    expect(parse("수요일 3시 오늘 회의").date).toBe("2026-11-18");
    expect(parse("다음주 화 10시 치과").date).toBe("2026-11-24");
    expect(parse("이번주 월요일 10시 정리").date).toBe("2026-11-16");
    expect(parse("12/1 10시 발표").date).toBe("2026-12-01");
  });
  it("treats 까지 as a deadline, not a placement", () => {
    const r = parse("금까지 보고서 #업무 2h");
    expect(r).toMatchObject({
      title: "보고서",
      due: "2026-11-20",
      categoryId: "c1",
      duration: 120,
    });
    expect(r.start).toBeUndefined();
  });
  it("matches categories by prefix and ignores archived ones", () => {
    expect(parse("러닝 #운").categoryId).toBe("c2");
    expect(parse("정리 #보관").categoryId).toBeUndefined();
    expect(parse("정리 #보관").title).toBe("정리 #보관");
  });
  it("snaps to quarter hours and clamps at midnight", () => {
    expect(parse("밤 11시 정리 2시간")).toMatchObject({
      start: 1380,
      duration: 60,
    });
    expect(parse("10:07 메모 20분")).toMatchObject({
      start: 600,
      duration: 30,
    });
  });
  it("leaves ordinary words alone", () => {
    expect(parse("월간 보고서 작성")).toMatchObject({
      title: "월간 보고서 작성",
      chips: [],
    });
    expect(parse("3시간 공부").start).toBeUndefined();
    expect(parse("3시간 공부")).toMatchObject({ title: "공부", duration: 180 });
  });
  it("summarizes what it understood", () => {
    expect(parse("내일 3시 회의 #업무").chips).toEqual([
      "11월 19일(목) 15:00–16:00",
      "#업무",
    ]);
  });
});
