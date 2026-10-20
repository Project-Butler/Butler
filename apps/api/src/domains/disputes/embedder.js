// 문장을 의미 벡터(임베딩)로 바꾸는 로컬 모델. 외부 API 없이 서버에서 직접 돌린다.
// 첫 호출 때 모델을 내려받고(약 280MB, 이후 캐시) 메모리에 올리므로 몇 초 걸리고, 그다음부터는 빠르다.
//
// 모델은 분쟁 질문 14개로 비교해서 골랐다(상위 5건 안에 맞는 유형이 든 비율):
// paraphrase-multilingual-mpnet-base-v2 14/14, multilingual-e5-small 12/14, LaBSE 12/14,
// paraphrase-multilingual-MiniLM-L12-v2 8/14. 모델을 바꾸면 embed:disputes를 다시 돌려야 한다.
import { pipeline } from '@huggingface/transformers';

export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-mpnet-base-v2';

let extractorPromise = null;

const getExtractor = () => {
  extractorPromise ??= pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' });
  return extractorPromise;
};

// normalize: true라서 두 벡터의 내적이 곧 코사인 유사도다.
const embed = async (texts) => {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
};

export const embedQuery = async (text) => (await embed([text]))[0];

export const embedPassages = (texts) => embed(texts);
