// 서버 enum 값 → 화면 문구·Badge tone. 화면마다 따로 적지 않고 여기서만 바꾼다.
export const ROLE_LABEL = {
  LANDLORD: '임대인',
  TENANT: '임차인',
  ADMIN: '운영자',
};

export const USER_STATUS_LABEL = {
  ACTIVE: '정상',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
};

export const USER_STATUS_TONE = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  WITHDRAWN: 'default',
};

export const VERIFICATION_STATUS_LABEL = {
  UNVERIFIED: '미인증',
  VERIFIED: '인증 완료',
  EXPIRED: '인증 만료',
  REVOKED: '인증 취소',
};

export const VERIFICATION_STATUS_TONE = {
  UNVERIFIED: 'pending',
  VERIFIED: 'verified',
  EXPIRED: 'warning',
  REVOKED: 'rejected',
};

export const END_REASON_LABEL = {
  SELF_ENDED: '본인 종료',
  SUPERSEDED: '새 소유자 인증',
  ADMIN_ENDED: '운영자 종료',
};

// 감사 로그 액션(api-contract.md 10장). 등록형이라 모르는 값은 원래 값을 그대로 보여 준다.
export const AUDIT_ACTION_LABEL = {
  AUTH_LOGIN_FAILED: '로그인 연속 실패',
  AUTH_PASSWORD_RESET: '비밀번호 재설정',
  USER_STATUS_CHANGED: '회원 상태 변경',
  USER_WITHDRAWN: '회원 탈퇴',
  OWNERSHIP_CREATED: '소유 관계 등록',
  OWNERSHIP_VERIFICATION_APPLIED: '권리자 인증 반영',
  OWNERSHIP_ENDED: '소유 관계 종료',
  OWNERSHIP_REVOKED_BY_ADMIN: '권리자 인증 취소',
  CONTRACT_CREATED: '계약 등록',
  CONTRACT_UPDATED: '계약 수정',
  CONTRACT_TERMINATED: '계약 해지',
  TENANT_INVITATION_ISSUED: '임차인 초대',
  TENANT_INVITATION_ACCEPTED: '임차인 초대 수락',
  MANAGEMENT_LOG_UPDATED: '관리 기록 수정',
  TICKET_STATUS_CHANGED: '요청 상태 변경',
  DOCUMENT_DOWNLOAD_URL_ISSUED: '문서 다운로드',
  DOCUMENT_DELETED: '문서 삭제',
  MESSAGE_HIDDEN: '메시지 숨김',
  COMPLEX_CREATED_BY_ADMIN: '단지 직접 등록',
  JOB_RETRIED: '작업 재시도',
};

export const JOB_STATUS_LABEL = {
  PENDING: '대기',
  PROCESSING: '실행 중',
  SUCCEEDED: '성공',
  FAILED: '실패',
};

export const JOB_STATUS_TONE = {
  PENDING: 'pending',
  PROCESSING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
};

// 작업 type. 피처 팀이 접두어를 붙여 늘리는 값이라 모르는 값은 원래 값을 그대로 보여 준다.
export const JOB_TYPE_LABEL = {
  JUSO_REFRESH_MANUAL: 'juso 즉시 갱신',
  KAPT_BASIS_REFRESH_MANUAL: 'K-apt 즉시 갱신',
  KAPT_COMPLEX_SYNC: 'K-apt 단지 동기화',
  REFERENCE_DATA_DAILY: '참고 데이터 일일 갱신',
  EXTERNAL_API_HEALTH: '외부 API 상태 점검',
};

// 감사 로그 resourceType(등록형). 필터 선택지로 쓴다.
export const AUDIT_RESOURCE_TYPE_LABEL = {
  USER: '회원',
  OWNERSHIP: '소유 관계',
  CONTRACT: '계약',
  TICKET: '수리·점검 요청',
  DOCUMENT: '문서',
  JOB: '작업',
};
