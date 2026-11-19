import { useEffect, useState } from 'react';
import { Palette, PanelLeft, Rows3, Type } from 'lucide-react';
import { Button, Card, SegmentedControl } from '@butler/ui';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useDisplaySettings } from '../hooks/useDisplaySettings';
import { DENSITY_OPTIONS, FONT_SIZE_OPTIONS, SIDEBAR_OPTIONS, THEME_OPTIONS } from '../utils/displaySettings';

// 설정 한 줄: 아이콘·이름·설명은 왼쪽, 선택은 오른쪽. 좁은 화면에서는 위아래로 쌓는다.
const SettingRow = ({ icon: Icon, title, description, children }) => (
  <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-8">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-accent-soft text-accent-strong">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h3 className="text-card font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-body text-ink-2">{description}</p>
      </div>
    </div>
    <div className="shrink-0 md:w-[26rem] 2xl:w-[34rem]">{children}</div>
  </div>
);

// 웹 화면 환경 설정. 서비스 동작이 아니라 이 기기에서 화면을 어떻게 보여 줄지만 정한다(기기별 저장).
// 고르면 바로 화면에 적용되지만 [저장]을 눌러야 남는다. 저장하지 않고 이 화면을 떠나면 저장된 값으로 돌아간다. 메뉴 구성은 바꿀 수 없다.
export const SettingsPage = () => {
  const { settings, isDirty, preview, save, discard, reset } = useDisplaySettings();
  const [isSaved, setIsSaved] = useState(false);

  // 저장하지 않고 떠나면(다른 메뉴로 이동) 미리 적용하던 값을 버린다.
  useEffect(() => discard, [discard]);

  const handlePreview = (patch) => {
    setIsSaved(false);
    preview(patch);
  };

  // 기본값도 미리 적용만 한다. 저장해야 남는다.
  const handleReset = () => {
    setIsSaved(false);
    reset();
  };

  const handleSave = () => {
    save();
    setIsSaved(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="설정"
        description="이 기기에서 화면을 보기 편하게 맞춥니다. 고르면 바로 보이고, 저장하면 웹을 열 때마다 적용돼요."
        actions={
          <>
            <Button variant="secondary" onClick={handleReset}>
              기본값으로
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!isDirty}>
              저장
            </Button>
          </>
        }
      />

      <Card className="divide-y divide-line p-6">
        <SettingRow icon={Palette} title="테마" description="시스템을 고르면 기기의 라이트·다크 설정을 따라가요.">
          <SegmentedControl
            ariaLabel="테마"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => handlePreview({ theme })}
          />
        </SettingRow>
        <SettingRow icon={Rows3} title="밀도" description="컴팩트는 여백을 줄여 한 화면에 더 많은 내용을 보여 줘요.">
          <SegmentedControl
            ariaLabel="밀도"
            options={DENSITY_OPTIONS}
            value={settings.density}
            onChange={(density) => handlePreview({ density })}
          />
        </SettingRow>
        <SettingRow icon={PanelLeft} title="사이드바" description="아이콘만은 메뉴를 좁게, 자동 접힘은 화면이 좁을 때만 좁게 보여 줘요.">
          <SegmentedControl
            ariaLabel="사이드바"
            options={SIDEBAR_OPTIONS}
            value={settings.sidebar}
            onChange={(sidebar) => handlePreview({ sidebar })}
          />
        </SettingRow>
        <SettingRow icon={Type} title="글자 크기" description="화면 전체의 글자를 키우거나 줄여요. 간격은 그대로예요.">
          <SegmentedControl
            ariaLabel="글자 크기"
            options={FONT_SIZE_OPTIONS}
            value={settings.fontSize}
            onChange={(fontSize) => handlePreview({ fontSize })}
          />
        </SettingRow>
      </Card>

      <div className="min-h-5">
        {isDirty && (
          <p role="status" className="text-label text-ink-2">
            저장하지 않은 변경이 있어요. 저장하지 않고 이 화면을 나가면 이전 설정으로 돌아가요.
          </p>
        )}
        {!isDirty && isSaved && (
          <p role="status" className="text-label text-ok-ink">
            저장했어요. 이 기기에서 웹을 열 때마다 적용돼요.
          </p>
        )}
      </div>
    </div>
  );
};
