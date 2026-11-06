import baseConfig from '@butler/config/eslint.config.js';

// import 경계 (docs/plan.md 5장 4번)
// - admin/·landlord/·tenant/ 는 서로 import할 수 없다. shared/ 와 packages/* 만 쓴다.
// - 역할 폴더는 앱 최상위 모듈(auth/·store/·surface/)도 import하지 않는다. 필요한 값은 props로 받는다.
// - axios는 어느 파일에서도 직접 import하지 않는다. API 호출 함수는 packages/api-client 에만 둔다.
// 정적 import·export from 은 no-restricted-imports, 동적 import()는 no-restricted-syntax 가 막는다.
// 경계는 test/lint/boundaries.test.js 가 실제로 막히는지 확인한다.
const ROLES = ['admin', 'landlord', 'tenant'];
const APP_LEVEL = ['auth', 'store', 'surface'];

const AXIOS_PATH = {
  name: 'axios',
  message: 'axios는 직접 import하지 않는다. API 호출 함수는 packages/api-client 에 둔다.',
};

// import 문자열의 경로 조각이 폴더 이름과 정확히 같을 때만 걸린다(AuthBadge·useAdminLike 같은 이름은 통과).
const folderPattern = (folders) => `(^|/)(${folders.join('|')})(/|$)`;

const boundaryConfig = (role) => {
  const forbidden = [...ROLES.filter((other) => other !== role), ...APP_LEVEL];
  const message = `${role}/ 는 다른 역할 폴더나 auth·store·surface 를 import할 수 없다. shared/ 와 packages/* 만 쓰고, 필요한 값은 props로 받는다.`;
  return {
    files: [`src/${role}/**/*.{js,jsx}`],
    rules: {
      'no-restricted-imports': ['error', { paths: [AXIOS_PATH], patterns: [{ regex: folderPattern(forbidden), message }] }],
      // esquery 정규식 리터럴은 슬래시를 \/ 로 적어야 한다.
      'no-restricted-syntax': [
        'error',
        { selector: `ImportExpression[source.value=/${folderPattern(forbidden).replaceAll('/', '\\/')}/]`, message },
      ],
    },
  };
};

export default [
  ...baseConfig,
  // 앱 전체: axios 직접 import 금지. 아래 역할 폴더 설정이 같은 규칙을 덮어쓰므로 거기에도 axios를 다시 넣는다.
  { files: ['src/**/*.{js,jsx}'], rules: { 'no-restricted-imports': ['error', { paths: [AXIOS_PATH] }] } },
  ...ROLES.map(boundaryConfig),
];
