// 앱 홈(M03) 숫자 계산. 웹 대시보드(LandlordDashboard)와 같은 API 응답을 받아 Figma 칸에 맞게 묶는다. 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
// 입력이 아직 없으면(불러오는 중·오류) 그 칸은 null 이다 — 0 과 구분해 '—'로 보여 준다.
import { getRentDueToday } from '../../web/utils/dashboard';

const sumDeposit = (contracts) => contracts.reduce((sum, contract) => sum + contract.deposit, 0);

// contracts: 시작 전·진행 중 계약 목록({ items }), properties: 내 소유 호실 목록({ items, meta }), ownerships: 활성 소유 관계 목록({ items, meta }).
export const toHomeSummary = ({ contracts = null, properties = null, ownerships = null, today }) => {
  // 보증금·계약 수·오늘 할 일은 진행 중(ACTIVE·EXPIRING_SOON)만 쓴다(웹 대시보드와 같음).
  const inProgress = contracts ? contracts.items.filter((contract) => contract.status !== 'UPCOMING') : null;
  const expiring = inProgress ? inProgress.filter((contract) => contract.status === 'EXPIRING_SOON') : [];
  const rentDue = inProgress ? getRentDueToday(inProgress, today) : [];
  const tasks = [
    ...rentDue.map((contract) => ({ kind: 'rent', contract })),
    ...expiring.map((contract) => ({ kind: 'expiring', contract })),
  ];

  const verified = ownerships ? ownerships.items.filter((ownership) => ownership.verificationStatus === 'VERIFIED').length : null;
  const firstUnverified = ownerships?.items.find((ownership) => ownership.verificationStatus !== 'VERIFIED') ?? null;

  return {
    depositSum: inProgress ? sumDeposit(inProgress) : null,
    contractCount: inProgress ? inProgress.length : null,
    // Figma '계약 중' 카드 칩: 종료 임박이 있으면 알리고, 없으면 정상.
    contractBadge: inProgress ? (expiring.length > 0 ? { tone: 'warning', label: `종료 임박 ${expiring.length}` } : { tone: 'success', label: '정상' }) : null,
    tasks,
    taskCount: inProgress ? tasks.length : null,
    propertyTotal: properties ? properties.meta.total : null,
    // 공실은 API 가 호실마다 계산한 status(VACANT)로 센다. 계약 예정(CONTRACT_PENDING)은 공실이 아니다.
    vacantCount: properties ? properties.items.filter((property) => property.status === 'VACANT').length : null,
    verification: ownerships
      ? {
          verified,
          total: ownerships.meta.total,
          unverified: ownerships.meta.total - verified,
          firstUnverifiedPropertyId: firstUnverified?.property.id ?? null,
        }
      : null,
  };
};
