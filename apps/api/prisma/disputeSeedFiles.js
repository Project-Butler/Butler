// 분쟁 참고자료 seed-data JSON 목록. seedDisputes.js(시드)와 embedDisputes.js(임베딩)가 같이 쓴다.
import path from 'path';
import { fileURLToPath } from 'url';

const SEED_DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data');
const toPaths = (files) => files.map((file) => path.join(SEED_DATA_DIR, file));

// 챗봇(RAG)·상세 "관련 자료"가 쓰는 자료. 이 파일들의 자료만 임베딩한다.
// precedents.json(판례 1,152건)은 precedents-all.json의 일부다(같은 sourceKey).
export const CHATBOT_JSON_PATHS = toPaths([
  'disputes.json',
  'precedents.json',
  'klac-casebooks.json',
  'law-articles.json',
  'seoul-guidebook.json',
  'counsel-casebooks.json',
  'molit-casebook.json',
]);

// DB에 넣는 자료. 판례는 전체 7,341건(precedents-all.json)을 넣어 일반 검색에 걸리게 하고,
// 그중 precedents.json에 있는 판례만 임베딩해 챗봇에 쓴다.
export const SEED_JSON_PATHS = [
  ...CHATBOT_JSON_PATHS.filter((jsonPath) => path.basename(jsonPath) !== 'precedents.json'),
  ...toPaths(['precedents-all.json']),
];
