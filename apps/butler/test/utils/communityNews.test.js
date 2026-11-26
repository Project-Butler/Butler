import { describe, expect, it } from 'vitest';
import { putComplexNewsFirst } from '../../src/landlord/web/utils/communityNews';

const article = (key, url = `https://news.example/${key}`) => ({ id: key, title: `${key} 기사`, url });
const ids = (items) => items.map((item) => item.id);

describe('putComplexNewsFirst', () => {
  it('단지 기사 5건이면 앞에서 3건만 맨 위에, isComplex 표시', () => {
    const complexItems = [1, 2, 3, 4, 5].map((i) => article(`단지${i}`));
    const { items } = putComplexNewsFirst({ complexItems, sigunguItems: [article('송파1')], max: 3 });
    expect(ids(items)).toEqual(['단지1', '단지2', '단지3', '송파1']);
    expect(items.map((item) => item.isComplex === true)).toEqual([true, true, true, false]);
  });

  it('위에 올린 기사와 원문 주소가 같은 구 · 시도 기사는 뺀다', () => {
    const complexItems = [article('단지1', 'https://news.example/same'), article('단지2', 'https://news.example/sido-same')];
    const { items, sidoItems } = putComplexNewsFirst({
      complexItems,
      sigunguItems: [article('송파1', 'https://news.example/same'), article('송파2')],
      sidoItems: [article('서울1', 'https://news.example/sido-same'), article('서울2')],
      max: 3,
    });
    expect(ids(items)).toEqual(['단지1', '단지2', '송파2']);
    expect(ids(sidoItems)).toEqual(['서울2']);
  });

  it('3건 밖으로 밀린 단지 기사와 주소가 같은 구 기사는 남긴다', () => {
    const complexItems = [1, 2, 3, 4].map((i) => article(`단지${i}`));
    const { items } = putComplexNewsFirst({ complexItems, sigunguItems: [article('송파1', 'https://news.example/단지4')], max: 3 });
    expect(ids(items)).toEqual(['단지1', '단지2', '단지3', '송파1']);
  });

  it('단지 기사가 없거나 아직 없으면(undefined) 구 · 시도 기사가 받은 그대로', () => {
    const sigunguItems = [article('송파1'), article('송파2')];
    const sidoItems = [article('서울1')];
    for (const complexItems of [[], undefined]) {
      const result = putComplexNewsFirst({ complexItems, sigunguItems, sidoItems, max: 3 });
      expect(result.items).toEqual(sigunguItems);
      expect(result.sidoItems).toEqual(sidoItems);
    }
  });
});
