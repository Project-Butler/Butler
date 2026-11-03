// Created: 2026-11-02
// 발급받은 건축물대장 1쪽 PNG → CLOVA 템플릿 OCR → 소유자 성명·생년월일.
// 대장 종류별 템플릿과 소유자 줄 수(양식에 기재되는 소유자 수)는 환경 변수로 받는다.
//   일반건축물대장(GENERAL)          CLOVA_TEMPLATE_ID_GENERAL · CLOVA_OWNER_ROWS_GENERAL
//   집합건축물대장 전유부(UNIT_EXCLUSIVE) CLOVA_TEMPLATE_ID_UNIT    · CLOVA_OWNER_ROWS_UNIT
import { requestTemplateOcr } from './clovaOcr.js';
import { pickOwners } from './ownerCore.js';

const ENV_SUFFIX = { GENERAL: 'GENERAL', UNIT_EXCLUSIVE: 'UNIT' };

const positiveInt = (key) => {
  const n = Number(process.env[key]);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`apps/api/.env 의 ${key} 는 양의 정수여야 합니다(현재: ${process.env[key] ?? '없음'}).`);
  return n;
};

// input: { ledgerKind: 'GENERAL'|'UNIT_EXCLUSIVE', png(Buffer, 대장 1쪽) }
// 돌려주는 값: { templateId, matchedTemplate, owners: [{ row, name, idText, birthDate, nameConfidence, idConfidence }], warnings }
export const extractOwners = async ({ ledgerKind, png }) => {
  const suffix = ENV_SUFFIX[ledgerKind];
  if (!suffix) throw new Error(`알 수 없는 대장 종류: ${ledgerKind}`);
  const templateId = positiveInt(`CLOVA_TEMPLATE_ID_${suffix}`);
  const ownerRows = positiveInt(`CLOVA_OWNER_ROWS_${suffix}`);

  const image = await requestTemplateOcr({ png, templateId });
  const { owners, warnings } = pickOwners(image.fields, ownerRows);
  const matched = image.matchedTemplate ?? null;
  if (matched && Number(matched.id) !== templateId) warnings.unshift(`요청한 템플릿(${templateId})과 매칭된 템플릿(${matched.id})이 다릅니다.`);
  return { templateId, matchedTemplate: matched, owners, warnings };
};
