import { useState } from 'react';
import { Plus, Search, UserCircle, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockUsers } from '../data/mockData';

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-slate-100 text-slate-700',
  viewer: 'bg-slate-50 text-slate-500',
};

const permissionsMatrix = [
  { action: '管理租户', owner: true, admin: true, member: false, viewer: false },
  { action: '管理用户', owner: true, admin: true, member: false, viewer: false },
  { action: '创建项目', owner: true, admin: true, member: true, viewer: false },
  { action: '删除项目', owner: true, admin: true, member: 'own', viewer: false },
  { action: '查看 Trace', owner: true, admin: true, member: 'auth', viewer: 'read' },
  { action: '创建评测任务', owner: true, admin: true, member: 'auth', viewer: false },
  { action: '管理评估器', owner: true, admin: true, member: 'auth', viewer: false },
  { action: '管理 API Key', owner: true, admin: true, member: 'auth', viewer: false },
  { action: '导出数据', owner: true, admin: true, member: 'auth', viewer: 'read' },
];

const roleLabels: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读成员',
};

function PermCell({ val }: { val: boolean | string }) {
  if (val === true) return <span className="text-emerald-600 text-lg">✓</span>;
  if (val === false) return <span className="text-slate-300 text-lg">—</span>;
  const labelMap: Record<string, string> = { own: '仅本人', auth: '授权项目', read: '只读' };
  return <span className="text-xs text-amber-600 font-medium">{labelMap[val] ?? val}</span>;
}

export function UserManagement() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showMatrix, setShowMatrix] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const users = mockUsers.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.includes(search)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理团队成员、角色与访问权限"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMatrix(o => !o)}
              className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              权限矩阵
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> 邀请用户
            </button>
          </div>
        }
      />

      {showMatrix && (
        <div className="mx-6 mt-4 mb-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h4 className="text-sm font-semibold text-slate-700">角色权限矩阵</h4>
            <button onClick={() => setShowMatrix(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500">操作</th>
                {['所有者', '管理员', '成员', '只读成员'].map(r => (
                  <th key={r} className="px-5 py-2.5 text-center text-xs font-semibold text-slate-500">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissionsMatrix.map(row => (
                <tr key={row.action} className="hover:bg-slate-50">
                  <td className="px-5 py-2 text-sm text-slate-700">{row.action}</td>
                  <td className="px-5 py-2 text-center"><PermCell val={row.owner} /></td>
                  <td className="px-5 py-2 text-center"><PermCell val={row.admin} /></td>
                  <td className="px-5 py-2 text-center"><PermCell val={row.member} /></td>
                  <td className="px-5 py-2 text-center"><PermCell val={row.viewer} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            <span className="font-medium">仅本人</span> = 仅可操作本人资源 · <span className="font-medium">授权项目</span> = 仅限授权项目 · <span className="font-medium">只读</span> = 只读访问
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索用户..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-blue-500"
        >
          <option value="all">全部角色</option>
          <option value="owner">所有者</option>
          <option value="admin">管理员</option>
          <option value="member">成员</option>
          <option value="viewer">只读成员</option>
        </select>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">用户</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">角色</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">加入时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-semibold flex-shrink-0">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${roleColors[user.role]}`}>
                      {roleLabels[user.role] ?? user.role}
                    </span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={user.status} /></td>
                  <td className="px-5 py-4 text-sm text-slate-500">{user.joinedAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <select className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-500 text-slate-600">
                        <option>变更角色</option>
                        <option>所有者</option>
                        <option>管理员</option>
                        <option>成员</option>
                        <option>只读成员</option>
                      </select>
                      <button className={`px-2.5 py-1.5 text-xs border rounded-lg ml-1 ${
                        user.status === 'active'
                          ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                          : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                      }`}>
                        {user.status === 'active' ? '停用' : user.status === 'invited' ? '重发邀请' : '重新启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-slate-900">邀请用户</h2>
              <button onClick={() => setInviteOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">邮箱地址 <span className="text-red-500">*</span></label>
                <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">角色</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                  <option>成员</option>
                  <option>管理员</option>
                  <option>只读成员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">租户</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                  <option>艾康医疗</option>
                  <option>科技公司</option>
                </select>
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                系统将向该用户发送邀请邮件。用户首次登录时需要设置密码。
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
              <button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
              <button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">发送邀请</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
