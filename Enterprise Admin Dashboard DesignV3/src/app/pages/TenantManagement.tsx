import { useState } from 'react';
import { Plus, Building2, Edit2, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockTenants } from '../data/mockData';

export function TenantManagement() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="租户管理"
        description="管理租户、套餐计划与资源配额"
        badge={<span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">超级管理员</span>}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 新建租户
          </button>
        }
      />

      <div className="p-6">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: '租户总数', value: mockTenants.length },
            { label: '企业版', value: mockTenants.filter(t => t.plan === 'enterprise').length },
            { label: '专业版', value: mockTenants.filter(t => t.plan === 'pro').length },
            { label: '免费版', value: mockTenants.filter(t => t.plan === 'free').length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">租户</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">套餐</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Trace 配额</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">用户数</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockTenants.map(tenant => {
                const tracePct = (tenant.traceUsed / tenant.traceLimit) * 100;
                const userPct = (tenant.userCount / tenant.userLimit) * 100;
                return (
                  <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-slate-800">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={tenant.plan} /></td>
                    <td className="px-5 py-4"><StatusBadge status={tenant.status} /></td>
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>{(tenant.traceUsed / 1000).toFixed(0)}k / {(tenant.traceLimit / 1000).toFixed(0)}k</span>
                          <span className={tracePct > 90 ? 'text-red-600 font-semibold' : ''}>{tracePct.toFixed(0)}%</span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${tracePct > 90 ? 'bg-red-500' : tracePct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(tracePct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-700">{tenant.userCount}/{tenant.userLimit}</span>
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(userPct, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">{tenant.createdAt}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">编辑</button>
                        <button className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">配额</button>
                        <button className={`px-2.5 py-1.5 text-xs border rounded-lg ${
                          tenant.status === 'active'
                            ? 'text-red-600 border-red-200 hover:bg-red-50'
                            : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                        }`}>
                          {tenant.status === 'active' ? '停用' : '重新启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-slate-900">新建租户</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">租户名称 <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="例如：艾康医疗" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">联系邮箱 <span className="text-red-500">*</span></label>
                <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="admin@example.com" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1.5">套餐</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                  <option>免费版</option>
                  <option>专业版</option>
                  <option>企业版</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 mb-1.5">Trace 月额度</label>
                  <input type="number" defaultValue="10000" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1.5">用户上限</label>
                  <input type="number" defaultValue="5" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">创建租户</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
