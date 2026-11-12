// API 오류 응답({ error: { code, message, details } }, api-contract.md 1장)을 화면에서 쓰기 쉬운 모양으로 바꾼다.
// 화면에는 message만 보여 주고 code는 분기에만 쓴다(design.md §7-2).
const FALLBACK_MESSAGE = '잠시 후 다시 시도해 주세요.';

export const isUnauthorizedError = (error) => error?.response?.status === 401;

export const toApiError = (error) => {
  const body = error?.response?.data?.error;
  return {
    status: error?.response?.status ?? null,
    code: body?.code ?? null,
    message: body?.message || FALLBACK_MESSAGE,
    details: Array.isArray(body?.details) ? body.details : [],
  };
};

// 400 details([{ field, reason }]) → { field: reason }
export const toFieldErrors = (apiError) =>
  Object.fromEntries((apiError?.details ?? []).map(({ field, reason }) => [field, reason]));
