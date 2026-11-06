import { Badge } from '@butler/ui';
import { ROLE_LABEL, USER_STATUS_LABEL, USER_STATUS_TONE } from '../../constants/labels';
import { formatDate } from '../../utils/formatDate';

// 회원 표. 대시보드 "최근 가입 회원"과 회원 목록이 같이 쓴다. 행을 누르면 onSelect(user).
export const UserTable = ({ users, onSelect }) => (
  <table className="w-full text-body">
    <thead>
      <tr className="border-y border-line text-left text-chip text-ink-3">
        <th className="px-5 py-2 font-medium">이름</th>
        <th className="px-3 py-2 font-medium">이메일</th>
        <th className="px-3 py-2 font-medium">역할</th>
        <th className="px-3 py-2 font-medium">상태</th>
        <th className="px-5 py-2 font-medium">가입일</th>
      </tr>
    </thead>
    <tbody>
      {users.map((user) => (
        <tr
          key={user.id}
          tabIndex={0}
          onClick={() => onSelect(user)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSelect(user);
          }}
          className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        >
          <td className="px-5 py-3 font-medium text-ink">{user.name}</td>
          <td className="px-3 py-3 text-ink-2">{user.email}</td>
          <td className="px-3 py-3 text-ink-2">{ROLE_LABEL[user.role] ?? user.role}</td>
          <td className="px-3 py-3">
            <Badge tone={USER_STATUS_TONE[user.status]}>{USER_STATUS_LABEL[user.status] ?? user.status}</Badge>
          </td>
          <td className="px-5 py-3 font-num text-chip text-ink-2">{formatDate(user.createdAt)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
