import { Loading } from '../../components/common/loading'

export function LoadingTypeUsage() {
  return (
    <>
      <Loading text='加载数据中...' />
      <Loading full />
      <Loading className='min-h-24' />
    </>
  )
}
