/** UI copy only. Keep raw errors in the store for conflict/retry decisions. */
export function userMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/HOLIDAY_DATA_UNKNOWN/.test(message))
    return "공휴일을 확인하지 못해 휴일 제외 반복 생성을 잠시 보류했어요.";
  if (/VERSION_CONFLICT|TIME_CONFLICT/.test(message))
    return "다른 변경과 겹쳤어요. 비교 창에서 저장할 내용을 선택해 주세요.";
  if (/fetch|network|offline|Failed to fetch/i.test(message))
    return "연결을 확인해 주세요. 저장 대기 중인 변경은 연결되면 다시 전송합니다.";
  if (/JWT|session expired|not authenticated|unauthorized/i.test(message))
    return "로그인이 만료됐어요. 저장 상태를 확인한 후 다시 로그인해 주세요.";
  if (
    /[가-힣]/.test(message) &&
    !/FunctionsHttpError|Postgrest|\bat\s+\w+\s*\(|\bSELECT\b|\bINSERT\b|"code"/.test(
      message,
    )
  )
    return message.replace(/^Error:\s*/, "").slice(0, 500);
  return "요청을 처리하지 못했어요. 연결과 저장 상태를 확인한 후 다시 시도해 주세요.";
}
