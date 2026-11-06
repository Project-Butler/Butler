import { Card } from '@butler/ui';

// 운영 API가 아직 없는 메뉴의 자리 화면.
export const ComingSoonPage = ({ title }) => (
  <Card className="p-8 text-center">
    <h2 className="text-h2 font-bold text-ink">{title}</h2>
    <p className="mt-2 text-body text-ink-2">준비 중인 화면입니다.</p>
  </Card>
);
