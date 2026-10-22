// 하루 한도가 있는 외부 API의 호출 수 카운터(external_api_usage, KST 날짜별).
// K-apt 기본정보(개발계정 하루 5,000회)는 백필 스크립트·resolve·주간 cron이 나눠 쓰므로
// 모든 호출이 이 카운터를 거친다. 경로마다 상한을 달리 둬서 실서비스(resolve) 몫을 남긴다.
import { formatDateKST } from '../../platform/dateUtils.js';

export const KAPT_BASIS_API = 'kapt-basis';

// 하루 상한: 백필 4,500(로컬 스크립트) < cron 4,700 < 실서비스 resolve 5,000(개발계정 한도)
export const KAPT_BASIS_BACKFILL_LIMIT = 4500;
export const KAPT_BASIS_CRON_LIMIT = 4700;
export const KAPT_BASIS_LIVE_LIMIT = 5000;

// usage_date(@db.Date)에 넣을 KST 오늘 날짜 'YYYY-MM-DD'
const toUsageDate = (now) => formatDateKST(now);

export const getApiUsage = async (prisma, api, now = new Date()) => {
  const rows = await prisma.$queryRaw`
    SELECT count FROM external_api_usage WHERE api = ${api} AND usage_date = ${toUsageDate(now)}::date`;
  return rows[0]?.count ?? 0;
};

// 호출 1회를 기록한다. 오늘 수가 이미 limit 이상이면 늘리지 않고 null을 돌려준다(호출하지 말 것).
// 비교와 증가를 한 문장으로 해서 여러 경로가 동시에 불러도 limit을 넘지 않는다.
export const spendApiCall = async (prisma, api, limit, now = new Date()) => {
  if (limit < 1) return null;
  const rows = await prisma.$queryRaw`
    INSERT INTO external_api_usage (api, usage_date, count)
    VALUES (${api}, ${toUsageDate(now)}::date, 1)
    ON CONFLICT (api, usage_date) DO UPDATE SET count = external_api_usage.count + 1
    WHERE external_api_usage.count < ${limit}
    RETURNING count`;
  return rows[0]?.count ?? null;
};
