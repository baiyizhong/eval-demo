export default [
  {
    url: '/api/sidebar',
    method: 'get',
    response: () => {
      return {
        code: 0,
        message: 'success',
        data: {
          user: {
            name: 'Satnaing Astro',
            email: 'satnaing@astro.com',
            avatar: '/avatars/shadcn.jpg',
          },
          teams: [
            {
              name: 'Shadcn Admin',
              logo: 'Command',
              plan: 'Vite + ShadcnUI',
            },
            {
              name: 'Acme Inc',
              logo: 'GalleryVerticalEnd',
              plan: 'Enterprise',
            },
            {
              name: 'Acme Corp.',
              logo: 'AudioWaveform',
              plan: 'Startup',
            },
          ],
          menuGroups: [
            {
              title: 'General',
              items: [
                {
                  title: '数字面板',
                  url: '/dashboard',
                  icon: 'LayoutDashboard',
                },
                {
                  title: '应用评测',
                  url: '/projects/project_customer_agent/evaluation/datasets',
                  activeMatch: 'prefix',
                  icon: 'Database',
                },
                {
                  title: '应用观测',
                  url: '/projects/project_customer_agent/observability',
                  icon: 'Monitor',
                  activeMatch: 'prefix',
                },
              ],
            },
          ],
        },
      }
    },
  },
]
