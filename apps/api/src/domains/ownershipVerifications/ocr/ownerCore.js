// Created: 2026-11-02
// CLOVA 템플릿 OCR 결과에서 소유자를 뽑는 순수 함수(네트워크 없이 쓸 수 있다).
// 사용자 결정(2026-10-20): 소유자 주소는 추출하지 않는다. 템플릿에도 주소 필드를 두지 않는다.
// 사용자 결정(2026-11-02): 소유자현황은 1쪽에만 있으므로 1쪽만 OCR한다. 생년월일은 세기를 붙여 YYYY-MM-DD로 낸다.

// 템플릿 필드 이름: owner01_name, owner01_birth …
// 콘솔에 "bitrh"로 잘못 적힌 필드가 섞여 있어(2026-11-02 사용자 전달) 두 철자를 모두 받는다.
const FIELD_RE = /^owner(\d+)_(name|birth|bitrh)$/;

// 주민등록번호 뒷자리 첫 숫자 → 출생 세기
const CENTURY = { 9: 1800, 0: 1800, 1: 1900, 2: 1900, 5: 1900, 6: 1900, 3: 2000, 4: 2000, 7: 2000, 8: 2000 };

// 날짜가 실제로 있는 날인지(2월 30일 등을 거른다)
const validDate = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// 대장의 「주민(법인)등록번호」 칸 글 → { birthDate, reason }
//   앞 6자리(YYMMDD)와 뒷자리 첫 숫자(세기)로 YYYY-MM-DD를 만든다. 예: 800101-1****** → 1980-01-01
//   개인·법인은 구분하지 않는다. 이 기능은 사용자 정보와 대장상 소유자가 일치하는지만 보기 때문이다(사용자 결정 2026-11-02).
//   뒷자리 첫 숫자가 안 보이거나 날짜가 올바르지 않으면 birthDate는 null이고 reason에 이유를 적는다.
export const parseBirthDate = (text) => {
  const s = String(text ?? '').replace(/\s/g, '');
  if (!s) return { birthDate: null, reason: '번호 칸이 비어 있습니다.' };
  const m = /^(\d{6})-?(\d)?/.exec(s);
  if (!m) return { birthDate: null, reason: '앞 6자리를 읽지 못했습니다.' };
  const [, front, g] = m;
  if (g === undefined) return { birthDate: null, reason: '뒷자리 첫 숫자가 보이지 않아 세기를 정할 수 없습니다.' };
  const yy = Number(front.slice(0, 2));
  const mm = Number(front.slice(2, 4));
  const dd = Number(front.slice(4, 6));
  const year = CENTURY[g] + yy;
  if (!validDate(year, mm, dd)) return { birthDate: null, reason: `앞 6자리 ${front}가 올바른 날짜가 아닙니다.` };
  const p = (n) => String(n).padStart(2, '0');
  return { birthDate: `${year}-${p(mm)}-${p(dd)}`, reason: null };
};

// CLOVA fields 배열 + 소유자 줄 수 → { owners, warnings }
//   owners: [{ row, name, idText, birthDate, nameConfidence, idConfidence }]
//   성명·번호가 둘 다 빈 줄은 빈 칸으로 보고 뺀다.
export const pickOwners = (fields, ownerRows) => {
  const byRow = new Map();
  for (const f of Array.isArray(fields) ? fields : []) {
    const m = FIELD_RE.exec(f?.name ?? '');
    if (!m) continue;
    const row = Number(m[1]);
    const key = m[2] === 'name' ? 'name' : 'id';
    byRow.set(row, { ...byRow.get(row), [key]: { text: String(f.inferText ?? '').trim(), confidence: f.inferConfidence ?? null } });
  }

  const owners = [];
  const warnings = [];
  for (let row = 1; row <= ownerRows; row++) {
    const r = byRow.get(row);
    if (!r?.name || !r?.id) warnings.push(`${row}번째 소유자 필드(성명·번호)가 응답에 없습니다. 템플릿 필드 이름을 확인해 주세요.`);
    const name = r?.name?.text ?? '';
    const idText = r?.id?.text ?? '';
    if (!name && !idText) continue;
    const id = parseBirthDate(idText);
    if (!name) warnings.push(`${row}번째 소유자: 성명을 읽지 못했습니다.`);
    if (id.reason) warnings.push(`${row}번째 소유자: ${id.reason}`);
    owners.push({
      row,
      name,
      idText,
      birthDate: id.birthDate,
      nameConfidence: r?.name?.confidence ?? null,
      idConfidence: r?.id?.confidence ?? null,
    });
  }
  if (!owners.length) warnings.push('소유자를 한 명도 읽지 못했습니다.');
  return { owners, warnings };
};
