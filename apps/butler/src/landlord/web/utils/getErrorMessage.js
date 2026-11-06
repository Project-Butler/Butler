// API 오류 응답({ error: { code, message } })의 message를 그대로 보여준다(design.md §7-2).
export const getErrorMessage = (error) => error?.response?.data?.error?.message || '잠시 후 다시 시도해 주세요.';
