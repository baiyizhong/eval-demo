import { PageHeader } from '../components/PageHeader';

export function SystemSettings() {
  return (
    <div>
      <PageHeader title="系统设置" description="平台级配置与维护" />
      <div className="p-6 max-w-2xl space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">平台配置</h3>
          <div className="space-y-4">
            {[
              { label: '平台名称', value: 'ObserveIQ' },
              { label: '支持邮箱', value: 'support@observeiq.com' },
              { label: '默认时区', value: 'UTC+8' },
              { label: '默认数据保留天数', value: '90' },
            ].map(s => (
              <div key={s.label}>
                <label className="block text-sm text-slate-600 mb-1.5">{s.label}</label>
                <input defaultValue={s.value} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">保存</button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">邮件 / SMTP 设置</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'SMTP 主机', value: 'smtp.sendgrid.net' },
              { label: 'SMTP 端口', value: '587' },
              { label: 'SMTP 用户名', value: 'apikey' },
              { label: '发件地址', value: 'noreply@observeiq.com' },
            ].map(s => (
              <div key={s.label}>
                <label className="block text-sm text-slate-600 mb-1.5">{s.label}</label>
                <input defaultValue={s.value} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">测试连接</button>
            <button className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
