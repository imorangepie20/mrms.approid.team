import { AdminApiError } from "./api";

export function apiErrorMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return "로그인이 필요합니다.";
    if (error.status === 403) return "관리자 권한이 없습니다.";
    if (error.status === 503) return "EMS 데이터를 잠시 불러오지 못했습니다. 다시 시도해 주세요.";
    if (error.status === 409) return "작업 상태가 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.";
    return "요청을 처리하지 못했습니다.";
  }
  return "요청을 처리하지 못했습니다.";
}
