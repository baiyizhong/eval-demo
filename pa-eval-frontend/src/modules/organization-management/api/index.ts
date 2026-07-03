export const organizationApi = {
  getOrganizations: {
    method: 'GET',
    url: '/organizations',
  },
  createOrganization: {
    method: 'POST',
    url: '/organizations',
  },
  getOrganization: {
    method: 'GET',
    url: '/organizations/:organizationId',
  },
  updateOrganization: {
    method: 'PATCH',
    url: '/organizations/:organizationId',
  },
  getOrganizationMembers: {
    method: 'GET',
    url: '/organizations/:organizationId/members',
  },
  createOrganizationMember: {
    method: 'POST',
    url: '/organizations/:organizationId/members',
  },
  updateOrganizationMember: {
    method: 'PATCH',
    url: '/organizations/:organizationId/members/:memberId',
  },
  deleteOrganizationMember: {
    method: 'DELETE',
    url: '/organizations/:organizationId/members/:memberId',
  },
  importOrganizationMembers: {
    method: 'POST',
    url: '/organizations/:organizationId/members/import',
  },
} as const
