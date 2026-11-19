import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import {
  applySettings,
  clearSettings,
  discardSettings,
  getSavedSettings,
  getSettings,
  previewSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  subscribeSystemTheme,
} from '../utils/displaySettings';

// 화면 설정 읽기·바꾸기.
// settings: 지금 화면에 적용된 값(고르는 중이면 그 값) · saved: 저장된 값 · isDirty: 저장하지 않은 변경이 있는지
// preview(patch): 저장 없이 미리 적용 · save(): 저장 · discard(): 저장 안 한 변경 버리기 · reset(): 기본값으로 미리 적용
export const useDisplaySettings = () => {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const saved = useSyncExternalStore(subscribeSettings, getSavedSettings);
  return {
    settings,
    saved,
    isDirty: settings !== saved,
    preview: previewSettings,
    save: saveSettings,
    discard: discardSettings,
    reset: resetSettings,
  };
};

// 임대인 웹 맨 위에서 한 번 부른다. 설정을 <html>에 적용하고, 화면을 떠나면 걷는다.
// 테마가 '시스템'이면 OS 설정이 바뀔 때 따라간다.
export const useApplyDisplaySettings = () => {
  const { settings } = useDisplaySettings();

  useLayoutEffect(() => {
    applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.theme !== 'system') return undefined;
    return subscribeSystemTheme(() => applySettings(settings));
  }, [settings]);

  useEffect(() => clearSettings, []);
};
