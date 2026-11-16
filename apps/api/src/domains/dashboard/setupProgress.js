// 임대인 초기 세팅 STEP1~4와 진행률(순수 함수, DB 의존 없음).
// - PROPERTY 완료 = 내 활성 소유 관계 1개 이상(모든 건물에 있을 필요 없음, Landly 관찰 Q12)
// - CONTRACT 완료 = 내 활성 소유 관계의 해지 안 된 계약 1건 이상
// - TENANT_INVITE 완료 = 내 활성 소유 관계 계약의 수락된(ACCEPTED) 초대 1건 이상, OPERATION_CHECK는 잠김
// progress = 완료 단계 수 / 4 × 100(정수)
export const SETUP_STEP_COUNT = 4;

export const buildSetupSteps = ({ propertyCount, contractCount = 0, acceptedInvitationCount = 0 }) => {
  const steps = [
    { key: 'PROPERTY', done: propertyCount > 0, count: propertyCount },
    { key: 'CONTRACT', done: contractCount > 0, count: contractCount },
    { key: 'TENANT_INVITE', done: acceptedInvitationCount > 0, count: acceptedInvitationCount },
    { key: 'OPERATION_CHECK', done: false, locked: true },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return { progress: Math.round((doneCount / SETUP_STEP_COUNT) * 100), steps };
};
