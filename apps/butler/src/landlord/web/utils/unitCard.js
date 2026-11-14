// 내 부동산 호실 카드 계산(React 없음). 지금 API 응답(호실·진행 중 계약·활성 소유 관계·관리 로그)만 화면에서 합친다.
import { getVerificationAction } from './ownershipVerification';
import { formatDateKST } from './format';

// 호실 하나에 붙일 계약: 진행 중(ACTIVE·EXPIRING_SOON)을 먼저, 없으면 시작 전(UPCOMING)
export const pickCardContract = (contracts) =>
  contracts.find((contract) => contract.status !== 'UPCOMING') ?? contracts.find((contract) => contract.status === 'UPCOMING') ?? null;

// 목록을 propertyId별로 묶는다(getPropertyId로 꺼낸 값 기준)
export const groupByProperty = (items, getPropertyId) => {
  const map = new Map();
  items.forEach((item) => {
    const id = getPropertyId(item);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
  });
  return map;
};

// 다음 일정 하나: 오늘 이후 가장 가까운 것. 계약 시작(시작 전)·월세 입금일(서버 nextRentPaymentDate)·계약 종료·
// 권리자 인증 만료(인증 완료일 때)·예정 관리 로그. 없으면 null.
export const getNextEvent = ({ contract, ownership, logs = [], today }) => {
  const events = [];
  if (contract?.status === 'UPCOMING' && contract.startDate) events.push({ kind: 'CONTRACT_START', date: contract.startDate, label: '계약 시작' });
  if (contract?.nextRentPaymentDate) events.push({ kind: 'RENT', date: contract.nextRentPaymentDate, label: '월세 입금일' });
  if (contract?.endDate) events.push({ kind: 'CONTRACT_END', date: contract.endDate, label: '계약 종료' });
  if (ownership?.verificationStatus === 'VERIFIED' && ownership.verificationExpiresAt) {
    events.push({ kind: 'VERIFICATION_EXPIRY', date: formatDateKST(ownership.verificationExpiresAt), label: '권리자 인증 만료' });
  }
  logs.filter((log) => log.occurredOn > today).forEach((log) => events.push({ kind: 'LOG', date: log.occurredOn, label: log.title, logType: log.type }));
  return events.filter((event) => event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
};

// 카드 바닥의 "해야 할 행동" 하나. 인증이 먼저(인증해야 계약 등록 가능), 그다음 계약 등록, 월세 입금일 입력.
// VERIFY: 첫 인증 · RENEW: 재인증 · INQUIRY: 인증 취소(관리자 문의) · CONTRACT: 공실 · RENT_DAY: 월세 입금일 없음 · null: 할 일 없음
export const getNeededAction = ({ property, contract, ownership, now = new Date() }) => {
  const verification = getVerificationAction(ownership, now);
  if (verification) return verification;
  if (!contract && property.status === 'VACANT') return 'CONTRACT';
  if (contract && contract.leaseType === 'MONTHLY' && contract.status !== 'UPCOMING' && contract.rentPaymentDay == null) return 'RENT_DAY';
  return null;
};

// 오늘 이전(오늘 포함) 가장 최근 관리 로그. 목록 API는 날짜 내림차순으로 온다.
export const getLatestPastLog = (logs = [], today) => logs.find((log) => log.occurredOn <= today) ?? null;
