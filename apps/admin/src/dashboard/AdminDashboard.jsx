import { Badge, Card, StatCard } from '@butler/ui';

const PENDING = [
  {
    id: 1,
    tag: '승인 대기',
    tagTone: 'warn',
    title: '권리자 인증 서류 검토 — 등기부등본 3건',
    desc: '임대인 김민수 외 2명 · 접수 2026-10-18',
  },
  {
    id: 2,
    tag: '신고 접수',
    tagTone: 'crit',
    title: '커뮤니티 게시글 신고 1건',
    desc: '노원 그린아파트 단지 게시판 · 접수 2026-10-19',
  },
];

const USERS = [
  { name: '김민수', role: '임대인', joined: '2026-10-18', verified: false },
  { name: '이서연', role: '임차인', joined: '2026-10-17', verified: true },
  { name: '박도윤', role: '임대인', joined: '2026-10-15', verified: true },
];

const LOGS = [
  { date: '10.19', title: '권리자 인증 승인 · 강남 햇살빌라 345호' },
  { date: '10.18', title: '신규 회원 가입 · 임대인 3명' },
  { date: '10.17', title: '계약 등록 · 노원 그린아파트 1234호' },
];

export const AdminDashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-body text-ink-3">2026-10-19 (월)</p>
        <h2 className="mt-1 text-h1 font-bold text-ink">안녕하세요, 관리자님</h2>
        <p className="mt-1 text-body text-ink-2">처리 대기 항목이 2건 있습니다. 신고 접수 1건은 24시간 내 확인이 필요합니다.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="전체 회원" value="1,284" unit="명" hint="이번 주 +18명" />
        <StatCard label="등록 부동산" value="512" unit="건" hint="이번 주 +6건" />
        <StatCard label="진행 중 계약" value="398" unit="건" />
        <StatCard label="처리 대기" value="2" unit="건" hint="신고 1 · 인증 1" hintTone="crit" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink">처리 대기</h3>
            <span className="text-chip text-ink-3">{PENDING.length}건</span>
          </div>
          <div className="mt-4 space-y-3">
            {PENDING.map((item) => (
              <div key={item.id} className="rounded-btn border border-line p-3">
                <Badge tone={item.tagTone === 'crit' ? 'danger' : 'warning'}>{item.tag}</Badge>
                <p className="mt-1.5 text-body font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-chip text-ink-3">{item.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-body font-semibold text-ink">최근 활동 로그</h3>
          <div className="mt-4 space-y-4">
            {LOGS.map((log) => (
              <div key={log.title} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
                <div className="min-w-0">
                  <p className="font-num text-chip text-ink-3">{log.date}</p>
                  <p className="text-body text-ink-2">{log.title}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-body font-semibold text-ink">최근 가입 회원</h3>
          <span className="text-chip text-ink-3">{USERS.length}명</span>
        </div>
        <table className="mt-4 w-full text-body">
          <thead>
            <tr className="border-y border-line text-left text-chip text-ink-3">
              <th className="px-5 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">역할</th>
              <th className="px-3 py-2 font-medium">가입일</th>
              <th className="px-5 py-2 font-medium">권리자 인증</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.name} className="border-b border-line last:border-b-0">
                <td className="px-5 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-3 py-3 text-ink-2">{u.role}</td>
                <td className="px-3 py-3 font-num text-chip text-ink-2">{u.joined}</td>
                <td className="px-5 py-3">
                  <Badge tone={u.verified ? 'verified' : 'pending'}>{u.verified ? '인증 완료' : '미인증'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
