// 성공 응답 공용 헬퍼. api-contract.md 1장 "응답 형식"의 Envelope를 여기서만 만든다.
export const sendData = (res, data, { status = 200 } = {}) => res.status(status).json({ data });

export const sendList = (res, items, meta) => res.status(200).json({ data: items, meta });
