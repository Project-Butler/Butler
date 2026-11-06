// @vitest-environment node
// 5장 4번 import 경계가 eslint로 실제로 강제되는지 확인한다.
// 위반 코드를 가상 파일로 린트해 "막혀야 할 것은 막히고, 허용할 것은 통과하는지"를 둘 다 본다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: appRoot });

// 경계 규칙이 낸 메시지만 모은다(다른 규칙의 경고는 이 테스트와 상관없다).
const lintBoundary = async (file, code) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(appRoot, file) });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax');
};

const blocked = [
  // 역할 폴더끼리
  ['admin → landlord', 'src/admin/pages/X.jsx', "import { format } from '../../landlord/web/utils/format';"],
  ['admin → tenant', 'src/admin/pages/X.jsx', "import { Home } from '../../tenant/Home';"],
  ['landlord/web → admin', 'src/landlord/web/pages/X.jsx', "import { useCursorList } from '../../../admin/hooks/useCursorList';"],
  ['landlord/web → tenant', 'src/landlord/web/pages/X.jsx', "import { Home } from '../../../tenant/Home';"],
  ['landlord/app → admin', 'src/landlord/app/X.jsx', "import { useCursorList } from '../../admin/hooks/useCursorList';"],
  ['tenant → admin', 'src/tenant/X.jsx', "import { useCursorList } from '../admin/hooks/useCursorList';"],
  ['tenant → landlord', 'src/tenant/X.jsx', "import { format } from '../landlord/web/utils/format';"],
  ['export from 으로 다시 내보내기', 'src/admin/X.js', "export { format } from '../landlord/web/utils/format';"],
  // 동적 import도 같은 규칙
  ['admin → landlord (동적 import)', 'src/admin/pages/X.jsx', "const load = () => import('../../landlord/web/utils/format');"],
  // 역할 폴더가 앱 최상위 모듈(auth·store·surface)을 가져오는 것
  ['admin → store', 'src/admin/pages/X.jsx', "import { useSessionStore } from '../../store/sessionStore';"],
  ['landlord/web → auth', 'src/landlord/web/pages/X.jsx', "import { roleHome } from '../../../auth/roleHome';"],
  ['tenant → surface', 'src/tenant/X.jsx', "import { getSurface } from '../surface/getSurface';"],
  // axios 직접 import: 어느 위치든 금지
  ['admin의 axios', 'src/admin/hooks/X.js', "import axios from 'axios';"],
  ['landlord/web의 axios', 'src/landlord/web/hooks/X.js', "import axios from 'axios';"],
  ['tenant의 axios', 'src/tenant/X.jsx', "import axios from 'axios';"],
  ['shared의 axios', 'src/shared/X.js', "import axios from 'axios';"],
  ['auth의 axios', 'src/auth/X.jsx', "import axios from 'axios';"],
  ['App의 axios', 'src/App.jsx', "import axios from 'axios';"],
];

const allowed = [
  ['admin → shared', 'src/admin/hooks/X.js', "import { toApiError } from '../../shared/apiError';"],
  ['landlord/web → shared', 'src/landlord/web/pages/X.jsx', "import { useGetContract } from '../../../shared/useGetContract';"],
  ['tenant → shared', 'src/tenant/X.jsx', "import { toApiError } from '../shared/apiError';"],
  ['패키지(@butler/ui, @butler/api-client)', 'src/admin/pages/X.jsx', "import { Button } from '@butler/ui';\nimport { getMe } from '@butler/api-client';"],
  ['같은 역할 폴더 안', 'src/admin/pages/X.jsx', "import { useCursorList } from '../hooks/useCursorList';"],
  ['임대인 web ↔ app (같은 역할)', 'src/landlord/app/X.jsx', "import { format } from '../web/utils/format';"],
  ['앱 최상위(App.jsx)가 역할 폴더를 가져옴', 'src/App.jsx', "import { AdminRoutes } from './admin/AdminRoutes';"],
  ['앱 최상위가 역할 폴더를 동적으로 가져옴', 'src/App.jsx', "const AdminRoutes = () => import('./admin/AdminRoutes');"],
  ['auth가 store를 가져옴', 'src/auth/X.jsx', "import { useSessionStore } from '../store/sessionStore';"],
  // 이름에 auth·admin·store가 들어갈 뿐 해당 폴더가 아니면 막지 않는다
  ['이름만 비슷한 파일', 'src/landlord/web/pages/X.jsx', "import { Badge } from '../components/AuthBadge/AuthBadge';\nimport { useGetAdminLike } from '../hooks/useAdminLike';\nimport { storeFront } from '../utils/storeFront';"],
];

describe('import 경계 (eslint)', () => {
  it.each(blocked)('막혀야 한다: %s', async (_name, file, code) => {
    const messages = await lintBoundary(file, code);
    expect(messages, `${file} 에서 "${code}" 이 린트에 걸리지 않았다`).not.toHaveLength(0);
  });

  it.each(allowed)('허용해야 한다: %s', async (_name, file, code) => {
    const messages = await lintBoundary(file, code);
    expect(messages.map((m) => m.message)).toEqual([]);
  });
});
