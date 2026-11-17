import { useState } from "react";
import { CalendarPlus, Download } from "lucide-react";
import { Modal } from "./Modal";
import { Input } from "../ui/Input";
import { calendarFile, type CalendarEvent } from "../domain/calendar";
import { setAskCalendar } from "../ui/calendarPreference";
export function CalendarExport({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = () =>
    new File([calendarFile(event)], "weekflow-event.ics", {
      type: "text/calendar;charset=utf-8",
    });
  function download() {
    const url = URL.createObjectURL(file());
    const link = document.createElement("a");
    link.href = url;
    link.download = "weekflow-event.ics";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage(
      "일정 파일을 준비했어요. 파일을 열고 달력에서 추가를 완료해 주세요.",
    );
  }
  async function add() {
    const value = file();
    if (!navigator.canShare?.({ files: [value] })) {
      download();
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ files: [value], title: event.title });
      setMessage(
        "일정 파일을 전달했어요. 달력의 추가 화면에서 최종 저장을 확인해 주세요.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "AbortError"
          ? "기기 달력 추가를 취소했어요. WEEKFLOW의 일정은 저장돼 있어요."
          : "기기로 전달하지 못했어요. 아래 ‘일정 파일 저장’을 사용해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="기기 달력에도 추가할까요?" onClose={onClose}>
      <div className="calendar-export-summary">
        <CalendarPlus size={26} />
        <div>
          <strong>{event.title}</strong>
          <p>
            {new Date(event.start).toLocaleString("ko-KR")} –{" "}
            {new Date(event.end).toLocaleString("ko-KR")}
          </p>
        </div>
      </div>
      <p className="helper-text">
        WEEKFLOW에는 저장했어요. 일정 파일을 기기의 달력 앱으로 열어 추가해
        주세요. 공유 목록에 달력이 없으면 파일 저장을 이용해 주세요.
      </p>
      <p className="helper-text">
        기기 달력의 최종 저장 여부는 웹에서 확인할 수 없어요. 이번 일정 한 건을
        복사하며, 이후 수정·삭제는 서로 동기화되지 않아요.
      </p>
      <label className="check-label">
        <Input
          type="checkbox"
          onChange={(e) => setAskCalendar(!e.target.checked)}
        />
        다음부터 묻지 않기
      </label>
      <div className="calendar-export-actions">
        <button className="primary" disabled={busy} onClick={() => void add()}>
          <CalendarPlus size={18} />
          기기 달력에 추가
        </button>
        <button disabled={busy} onClick={download}>
          <Download size={18} />
          일정 파일 저장
        </button>
        <button onClick={onClose}>나중에</button>
      </div>
      {message && (
        <p role="status" className="helper-text">
          {message}
        </p>
      )}
    </Modal>
  );
}
