import {
  AppList,
  type AppListAddFormValues,
} from '../components/business/app-list'

const addDialogFormId = 'create-app-form'

export const appListAddFormValuesUsage: AppListAddFormValues = {
  name: 'GitHub',
  status: 'active',
  desc: '集成 GitHub，优化代码协作与管理。',
}

export const appListWithDefaultAddFormUsage = (
  <AppList
    apps={[]}
    onAddSubmit={(values) => {
      const nextValues: AppListAddFormValues = values
      void nextValues
    }}
  />
)

export const appListWithAddDialogUsage = (
  <AppList
    apps={[]}
    addDialogTitle='新增项目'
    addDialogDescription='填写项目信息后提交。'
    addDialogContent={({ close }) => (
      <form
        id={addDialogFormId}
        onSubmit={(event) => {
          event.preventDefault()
          close()
        }}
      />
    )}
    addDialogProps={{
      confirmText: '创建',
      confirmProps: { form: addDialogFormId, type: 'submit' },
      contentProps: { showCloseButton: true },
    }}
  />
)
