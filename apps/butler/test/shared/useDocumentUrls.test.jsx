import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDocumentUrls } from '../../src/shared/documentViewer/useDocumentUrls';

// 썸네일(THUMBNAIL)은 감사하지 않고, 크게 본 것(VIEW)만 감사한다(서버 purpose). 화면 쪽은 purpose를 알맞게 넘기는지 본다.
const setup = () => {
  const fetchUrl = vi.fn(async (id, { purpose }) => ({ url: `https://files.test/${id}?${purpose}` }));
  const { result } = renderHook(() => useDocumentUrls(fetchUrl));
  return { fetchUrl, result };
};

describe('useDocumentUrls purpose', () => {
  it('썸네일로 받은 주소는 크게 볼 때 VIEW로 다시 받는다', async () => {
    const { fetchUrl, result } = setup();
    await act(() => result.current.load('d1', { purpose: 'THUMBNAIL' }));
    expect(fetchUrl).toHaveBeenLastCalledWith('d1', { purpose: 'THUMBNAIL' });
    await act(() => result.current.load('d1'));
    expect(fetchUrl).toHaveBeenLastCalledWith('d1', { purpose: 'VIEW' });
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });

  it('VIEW로 받은 주소는 4분 안에 썸네일·VIEW 모두 다시 쓰고 새로 받지 않는다', async () => {
    const { fetchUrl, result } = setup();
    await act(() => result.current.load('d1'));
    await act(() => result.current.load('d1', { purpose: 'THUMBNAIL' }));
    await act(() => result.current.load('d1'));
    expect(fetchUrl).toHaveBeenCalledTimes(1);
  });

  it('저장은 썸네일 주소가 있어도 VIEW로 새 주소를 받는다', async () => {
    const { fetchUrl, result } = setup();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(() => result.current.load('d1', { purpose: 'THUMBNAIL' }));
    await act(() => result.current.save({ id: 'd1', fileName: 'a.jpg' }));
    expect(fetchUrl).toHaveBeenLastCalledWith('d1', { purpose: 'VIEW' });
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });

  it('늦게 온 썸네일 주소가 먼저 받은 VIEW 주소를 덮지 않는다', async () => {
    let resolveThumb;
    const fetchUrl = vi.fn((id, { purpose }) =>
      purpose === 'THUMBNAIL' ? new Promise((resolve) => { resolveThumb = () => resolve({ url: 'thumb' }); }) : Promise.resolve({ url: 'view' }),
    );
    const { result } = renderHook(() => useDocumentUrls(fetchUrl));
    let thumb;
    act(() => { thumb = result.current.load('d1', { purpose: 'THUMBNAIL' }); });
    await act(() => result.current.load('d1'));
    await act(async () => { resolveThumb(); await thumb; });
    expect(result.current.entries.d1).toMatchObject({ url: 'view', purpose: 'VIEW' });
  });
});
