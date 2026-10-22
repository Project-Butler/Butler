// 임대인 초기 세팅 STEP1~5와 진행률(순수 함수, DB 의존 없음).
// - BUILDING 완료 = 내 건물 설정 1개 이상
// - PROPERTY 완료 = 내 활성 소유 관계 1개 이상(모든 건물에 있을 필요 없음, Landly 관찰 Q12)
// - CONTRACT·TENANT_INVITE는 아직 쓸 수 없음(available: false), OPERATION_CHECK는 잠김
// progress = 완료 단계 수 / 5 × 100(정수)
export const SETUP_STEP_COUNT = 5;

export const buildSetupSteps = ({ buildingCount, propertyCount }) => {
  const steps = [
    { key: 'BUILDING', done: buildingCount > 0, count: buildingCount },
    { key: 'PROPERTY', done: propertyCount > 0, count: propertyCount },
    { key: 'CONTRACT', done: false, count: 0, available: false },
    { key: 'TENANT_INVITE', done: false, count: 0, available: false },
    { key: 'OPERATION_CHECK', done: false, locked: true },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return { progress: Math.round((doneCount / SETUP_STEP_COUNT) * 100), steps };
};
