import type { ReactNode } from 'react'
import {
  IconTelegram,
  IconNotion,
  IconFigma,
  IconTrello,
  IconSlack,
  IconZoom,
  IconStripe,
  IconGmail,
  IconMedium,
  IconSkype,
  IconDocker,
  IconGithub,
  IconGitlab,
  IconDiscord,
  IconWhatsapp,
} from '@/assets/brand-icons'
import type { AppCardListItem } from '@/components/business/app-card-list'

type AppListDataItem = AppCardListItem & {
  logo: ReactNode
}

export const apps: AppListDataItem[] = [
  {
    name: 'Telegram',
    logo: <IconTelegram />,
    status: 'active',
    desc: '连接 Telegram，实现实时沟通与消息通知。',
    createdAt: '2026-06-01 09:30',
  },
  {
    name: 'Notion',
    logo: <IconNotion />,
    status: 'archived',
    desc: '同步 Notion 页面，提升团队协作效率。',
    createdAt: '2026-06-02 10:15',
  },
  {
    name: 'Figma',
    logo: <IconFigma />,
    status: 'archived',
    desc: '集中查看并协作处理 Figma 设计稿。',
    createdAt: '2026-06-03 11:20',
  },
  {
    name: 'Trello',
    logo: <IconTrello />,
    status: 'active',
    desc: '同步 Trello 卡片，简化项目管理流程。',
    createdAt: '2026-06-04 14:05',
  },
  {
    name: 'Slack',
    logo: <IconSlack />,
    status: 'active',
    desc: '集成 Slack，支持高效团队沟通。',
    createdAt: '2026-06-05 15:40',
  },
  {
    name: 'Zoom',
    logo: <IconZoom />,
    status: 'archived',
    desc: '直接从工作台发起和管理 Zoom 会议。',
    createdAt: '2026-06-06 16:25',
  },
  {
    name: 'Stripe',
    logo: <IconStripe />,
    status: 'active',
    desc: '便捷管理 Stripe 交易与支付记录。',
    createdAt: '2026-06-07 09:50',
  },
  {
    name: 'Gmail',
    logo: <IconGmail />,
    status: 'archived',
    desc: '快速访问并管理 Gmail 邮件。',
    createdAt: '2026-06-08 13:10',
  },
  {
    name: 'Medium',
    logo: <IconMedium />,
    status: 'active',
    desc: '在工作台浏览并分享 Medium 内容。',
    createdAt: '2026-06-09 17:45',
  },
  {
    name: 'Skype',
    logo: <IconSkype />,
    status: 'active',
    desc: '连接 Skype 联系人，保持顺畅沟通。',
    createdAt: '2026-06-10 08:35',
  },
  {
    name: 'Docker',
    logo: <IconDocker />,
    status: 'active',
    desc: '在工作台中轻松管理 Docker 容器。',
    createdAt: '2026-06-11 12:00',
  },
  {
    name: 'GitHub',
    logo: <IconGithub />,
    status: 'active',
    desc: '集成 GitHub，优化代码协作与管理。',
    createdAt: '2026-06-12 10:45',
  },
  {
    name: 'GitLab',
    logo: <IconGitlab />,
    status: 'active',
    desc: '集成 GitLab，高效管理代码项目。',
    createdAt: '2026-06-13 14:30',
  },
  {
    name: 'Discord',
    logo: <IconDiscord />,
    status: 'active',
    desc: '连接 Discord，支持团队实时交流。',
    createdAt: '2026-06-14 18:20',
  },
  {
    name: 'WhatsApp',
    logo: <IconWhatsapp />,
    status: 'active',
    desc: '集成 WhatsApp，便捷处理即时消息。',
    createdAt: '2026-06-15 09:05',
  },
]
