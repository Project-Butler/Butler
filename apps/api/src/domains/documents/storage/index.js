// 저장소 선택(STORAGE_DRIVER). 쓸 수 없으면 null이고, service가 503 STORAGE_UNAVAILABLE로 거절한다.
// 권리자 인증 실행기 선택(ownershipVerifications/runners/index.js)과 같은 방식이다.
// local은 서버 디스크를 쓰므로 Vercel(파일이 남지 않음)에서는 쓸 수 없다. 서명 비밀값이 없어도 쓸 수 없다.
// 요청마다 환경 변수를 다시 읽는다(테스트가 바꿀 수 있게). 관리 로그 service도 파일 삭제에 쓰므로 service.js를 import하지 않는다(순환 방지).
import { createLocalStorage } from './local.js';

export const resolveStorageKind = (env) => {
  if (env.STORAGE_DRIVER === 'local') return env.VERCEL || !env.STORAGE_SIGNING_SECRET ? null : 'local';
  return null;
};

export const selectStorage = (env = process.env) => {
  if (resolveStorageKind(env) === 'local') {
    return createLocalStorage({ dir: env.LOCAL_STORAGE_DIR || undefined, secret: env.STORAGE_SIGNING_SECRET });
  }
  return null;
};

// 파일 삭제는 행을 숨긴 뒤 트랜잭션 밖에서 한다. 실패해도 응답은 성공(행은 이미 숨김). 저장소가 없으면 건너뛴다.
export const removeStoredObjects = async (storagePaths) => {
  if (storagePaths.length === 0) return;
  const storage = selectStorage();
  if (!storage) return;
  for (const storagePath of storagePaths) {
    try {
      await storage.deleteObject(storagePath);
    } catch (error) {
      console.error('[documents] 파일 삭제 실패', storagePath, error?.code ?? error?.message);
    }
  }
};
