// src/modules/organization-management/data/permissions.ts
function canManageMembers(role) {
  return role === "OWNER" || role === "ADMIN";
}
function canAssignRole(actorRole, targetRole) {
  if (actorRole === "OWNER") {
    return true;
  }
  if (actorRole === "ADMIN") {
    return targetRole !== "OWNER";
  }
  return false;
}
function canRemoveMember(actorRole, targetRole, ownerCount) {
  if (!canManageMembers(actorRole)) {
    return {
      allowed: false,
      reason: "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u5220\u9664\u6210\u5458"
    };
  }
  if (actorRole === "ADMIN" && targetRole === "OWNER") {
    return {
      allowed: false,
      reason: "Admin \u4E0D\u80FD\u5220\u9664 Owner"
    };
  }
  if (targetRole === "OWNER" && ownerCount <= 1) {
    return {
      allowed: false,
      reason: "\u4E0D\u80FD\u5220\u9664\u6700\u540E\u4E00\u4E2A Owner"
    };
  }
  return { allowed: true };
}

// src/modules/organization-management/data/schema.ts
import { z } from "zod";
var organizationRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER"
]);
var organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  subsystem: z.string().nullable().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
var organizationMemberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: organizationRoleSchema,
  status: z.string().optional(),
  joinedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
var createOrganizationPayloadSchema = z.object({
  name: z.string(),
  subsystem: z.string(),
  description: z.string().optional()
});
var updateOrganizationPayloadSchema = createOrganizationPayloadSchema.partial();
var createOrganizationMemberPayloadSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email(),
  role: organizationRoleSchema
});
var updateOrganizationMemberPayloadSchema = z.object({
  role: organizationRoleSchema
});
var importOrganizationMembersPayloadSchema = z.object({
  members: z.array(createOrganizationMemberPayloadSchema)
});
var importOrganizationMemberFailureSchema = z.object({
  row: z.number().int().nonnegative(),
  email: z.string().email(),
  reason: z.string()
});

// mock/organizations.ts
var RESPONSE_CODE = {
  success: 0,
  badRequest: 1001,
  forbidden: 1003,
  notFound: 1004
};
var CURRENT_USER = {
  id: "user-current",
  name: "\u9648\u9ED8",
  email: "chenmo@pa-eval.dev"
};
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var createTxId = () => `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
var success = (data) => ({
  code: RESPONSE_CODE.success,
  message: "success",
  data,
  txId: createTxId()
});
var failure = (code, message, data) => ({
  code,
  message,
  data,
  txId: createTxId()
});
var toNumber = (value, fallback) => {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
var toStringValue = (value) => typeof value === "string" ? value.trim() : "";
var parseOrganizationRole = (value) => {
  const result = organizationRoleSchema.safeParse(value);
  return result.success ? result.data : null;
};
var paginate = (items, query) => {
  const page = toNumber(query.page, 1);
  const pageSize = toNumber(query.pageSize, 10);
  const startIndex = (page - 1) * pageSize;
  return {
    total: items.length,
    datas: items.slice(startIndex, startIndex + pageSize)
  };
};
var maskSecretKey = (secretKey) => `${secretKey.slice(0, 10)}...${secretKey.slice(-4)}`;
var organizations = [
  {
    id: "org-owner-001",
    name: "PA \u5E73\u53F0\u4E3B\u7EC4\u7EC7",
    description: "\u5F53\u524D\u7528\u6237\u4E3A Owner\uFF0C\u7528\u4E8E\u5B8C\u6574\u7BA1\u7406\u6D41\u7A0B\u9A8C\u8BC1",
    subsystem: "evaluation",
    publicKey: "pk-live-owner001",
    secretKeyMasked: "sk-live-own...r001",
    createdBy: "system.seed",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-07-01T09:30:00.000Z"
  },
  {
    id: "org-admin-001",
    name: "\u6A21\u578B\u8BC4\u6D4B Admin \u7EC4\u7EC7",
    description: "\u5F53\u524D\u7528\u6237\u4E3A Admin\uFF0C\u7528\u4E8E\u6743\u9650\u53D7\u9650\u573A\u666F",
    subsystem: "model-eval",
    publicKey: "pk-live-admin001",
    secretKeyMasked: "sk-live-adm...0001",
    createdBy: "system.seed",
    createdAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-07-01T09:30:00.000Z"
  },
  {
    id: "org-member-001",
    name: "\u6570\u636E\u6807\u6CE8\u534F\u4F5C\u7EC4\u7EC7",
    description: "\u5F53\u524D\u7528\u6237\u4E3A Member\uFF0C\u7528\u4E8E\u7981\u7528\u6210\u5458\u7BA1\u7406\u64CD\u4F5C",
    subsystem: "annotation",
    publicKey: "pk-live-member001",
    secretKeyMasked: "sk-live-mem...0001",
    createdBy: "system.seed",
    createdAt: "2026-06-08T08:00:00.000Z",
    updatedAt: "2026-07-01T09:30:00.000Z"
  },
  {
    id: "org-viewer-001",
    name: "\u53EA\u8BFB\u5BA1\u8BA1\u7EC4\u7EC7",
    description: "\u5F53\u524D\u7528\u6237\u4E3A Viewer\uFF0C\u7528\u4E8E\u53EA\u8BFB\u573A\u666F",
    subsystem: "audit",
    publicKey: "pk-live-view001",
    secretKeyMasked: "sk-live-vie...0001",
    createdBy: "system.seed",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-07-01T09:30:00.000Z"
  }
];
var members = [
  {
    id: "mem-owner-self",
    organizationId: "org-owner-001",
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-06-01T08:00:00.000Z",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:00:00.000Z"
  },
  {
    id: "mem-owner-002",
    organizationId: "org-owner-001",
    userId: "user-owner-002",
    name: "\u6797\u96EA",
    email: "linxue@pa-eval.dev",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-06-02T08:00:00.000Z",
    createdAt: "2026-06-02T08:00:00.000Z",
    updatedAt: "2026-06-20T09:00:00.000Z"
  },
  {
    id: "mem-owner-003",
    organizationId: "org-owner-001",
    userId: "user-admin-001",
    name: "\u4F55\u5DDD",
    email: "hechuan@pa-eval.dev",
    role: "ADMIN",
    status: "ACTIVE",
    joinedAt: "2026-06-03T08:00:00.000Z",
    createdAt: "2026-06-03T08:00:00.000Z",
    updatedAt: "2026-06-21T09:00:00.000Z"
  },
  {
    id: "mem-owner-004",
    organizationId: "org-owner-001",
    userId: "user-admin-002",
    name: "\u5F20\u4E00\u821F",
    email: "zhangyizhou@pa-eval.dev",
    role: "ADMIN",
    status: "INVITED",
    joinedAt: "2026-06-04T08:00:00.000Z",
    createdAt: "2026-06-04T08:00:00.000Z",
    updatedAt: "2026-06-22T09:00:00.000Z"
  },
  {
    id: "mem-owner-005",
    organizationId: "org-owner-001",
    userId: "user-member-001",
    name: "\u82CF\u9752",
    email: "suqing@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-05T08:00:00.000Z",
    createdAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-23T09:00:00.000Z"
  },
  {
    id: "mem-owner-006",
    organizationId: "org-owner-001",
    userId: "user-member-002",
    name: "\u987E\u7136",
    email: "guran@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-06T08:00:00.000Z",
    createdAt: "2026-06-06T08:00:00.000Z",
    updatedAt: "2026-06-24T09:00:00.000Z"
  },
  {
    id: "mem-owner-007",
    organizationId: "org-owner-001",
    userId: "user-member-003",
    name: "\u9AD8\u73A5",
    email: "gaoyue@pa-eval.dev",
    role: "MEMBER",
    status: "SUSPENDED",
    joinedAt: "2026-06-07T08:00:00.000Z",
    createdAt: "2026-06-07T08:00:00.000Z",
    updatedAt: "2026-06-25T09:00:00.000Z"
  },
  {
    id: "mem-owner-008",
    organizationId: "org-owner-001",
    userId: "user-member-004",
    name: "\u738B\u8C28",
    email: "wangjin@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-08T08:00:00.000Z",
    createdAt: "2026-06-08T08:00:00.000Z",
    updatedAt: "2026-06-26T09:00:00.000Z"
  },
  {
    id: "mem-owner-009",
    organizationId: "org-owner-001",
    userId: "user-viewer-001",
    name: "\u9648\u8BFA",
    email: "chennuo@pa-eval.dev",
    role: "VIEWER",
    status: "ACTIVE",
    joinedAt: "2026-06-09T08:00:00.000Z",
    createdAt: "2026-06-09T08:00:00.000Z",
    updatedAt: "2026-06-27T09:00:00.000Z"
  },
  {
    id: "mem-owner-010",
    organizationId: "org-owner-001",
    userId: "user-viewer-002",
    name: "\u8BB8\u5B89",
    email: "xuan@pa-eval.dev",
    role: "VIEWER",
    status: "INVITED",
    joinedAt: "2026-06-10T08:00:00.000Z",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-28T09:00:00.000Z"
  },
  {
    id: "mem-owner-011",
    organizationId: "org-owner-001",
    userId: "user-member-005",
    name: "\u90D1\u5317",
    email: "zhengbei@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-11T08:00:00.000Z",
    createdAt: "2026-06-11T08:00:00.000Z",
    updatedAt: "2026-06-29T09:00:00.000Z"
  },
  {
    id: "mem-owner-012",
    organizationId: "org-owner-001",
    userId: "user-member-006",
    name: "\u5510\u65F6",
    email: "tangshi@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-12T08:00:00.000Z",
    createdAt: "2026-06-12T08:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z"
  },
  {
    id: "mem-owner-013",
    organizationId: "org-owner-001",
    userId: "user-member-007",
    name: "\u8D3A\u793C",
    email: "heli@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-13T08:00:00.000Z",
    createdAt: "2026-06-13T08:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z"
  },
  {
    id: "mem-admin-self",
    organizationId: "org-admin-001",
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: "ADMIN",
    status: "ACTIVE",
    joinedAt: "2026-06-05T08:00:00.000Z",
    createdAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T08:00:00.000Z"
  },
  {
    id: "mem-admin-002",
    organizationId: "org-admin-001",
    userId: "user-admin-owner",
    name: "\u675C\u5C9A",
    email: "dulan@pa-eval.dev",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-06-05T09:00:00.000Z",
    createdAt: "2026-06-05T09:00:00.000Z",
    updatedAt: "2026-06-05T09:00:00.000Z"
  },
  {
    id: "mem-admin-003",
    organizationId: "org-admin-001",
    userId: "user-admin-member",
    name: "\u65B9\u5B81",
    email: "fangning@pa-eval.dev",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-06T09:00:00.000Z",
    createdAt: "2026-06-06T09:00:00.000Z",
    updatedAt: "2026-06-06T09:00:00.000Z"
  },
  {
    id: "mem-member-self",
    organizationId: "org-member-001",
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-06-08T08:00:00.000Z",
    createdAt: "2026-06-08T08:00:00.000Z",
    updatedAt: "2026-06-08T08:00:00.000Z"
  },
  {
    id: "mem-member-002",
    organizationId: "org-member-001",
    userId: "user-member-owner",
    name: "\u6881\u821F",
    email: "liangzhou@pa-eval.dev",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-06-08T09:00:00.000Z",
    createdAt: "2026-06-08T09:00:00.000Z",
    updatedAt: "2026-06-08T09:00:00.000Z"
  },
  {
    id: "mem-viewer-self",
    organizationId: "org-viewer-001",
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: "VIEWER",
    status: "ACTIVE",
    joinedAt: "2026-06-10T08:00:00.000Z",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:00:00.000Z"
  },
  {
    id: "mem-viewer-002",
    organizationId: "org-viewer-001",
    userId: "user-viewer-owner",
    name: "\u5468\u5B81",
    email: "zhouning@pa-eval.dev",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-06-10T09:00:00.000Z",
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-10T09:00:00.000Z"
  }
];
var apiKeys = [
  {
    id: "key-owner-001",
    organizationId: "org-owner-001",
    name: "\u9ED8\u8BA4\u751F\u4EA7 Key",
    maskedKey: "sk-live-own...001",
    publicKey: "pk-live-owner001",
    secretKeyMasked: "sk-live-own...001",
    createdBy: CURRENT_USER.name,
    updatedAt: "2026-06-20T09:00:00.000Z",
    lastUsedAt: "2026-07-01T10:00:00.000Z",
    createdAt: "2026-06-01T08:00:00.000Z"
  },
  {
    id: "key-owner-002",
    organizationId: "org-owner-001",
    name: "\u6279\u91CF\u4EFB\u52A1 Key",
    maskedKey: "sk-live-own...002",
    publicKey: "pk-live-owner002",
    secretKeyMasked: "sk-live-own...002",
    createdBy: "\u6797\u96EA",
    updatedAt: "2026-06-25T09:00:00.000Z",
    lastUsedAt: null,
    createdAt: "2026-06-15T08:00:00.000Z"
  },
  {
    id: "key-admin-001",
    organizationId: "org-admin-001",
    name: "\u53EA\u8BFB\u96C6\u6210 Key",
    maskedKey: "sk-live-adm...001",
    publicKey: "pk-live-admin001",
    secretKeyMasked: "sk-live-adm...001",
    createdBy: "\u675C\u5C9A",
    updatedAt: "2026-06-18T09:00:00.000Z",
    lastUsedAt: "2026-06-30T10:00:00.000Z",
    createdAt: "2026-06-05T08:00:00.000Z"
  }
];
var getOrganizationById = (organizationId) => organizations.find((organization) => organization.id === organizationId);
var getMembersByOrganizationId = (organizationId) => members.filter((member) => member.organizationId === organizationId);
var getActorMember = (organizationId) => getMembersByOrganizationId(organizationId).find(
  (member) => member.userId === CURRENT_USER.id
);
var getActorRole = (organizationId) => getActorMember(organizationId)?.role ?? null;
var ensureOrganization = (organizationId) => {
  const organization = getOrganizationById(organizationId);
  if (!organization) {
    return failure(RESPONSE_CODE.notFound, "\u7EC4\u7EC7\u4E0D\u5B58\u5728", {});
  }
  return organization;
};
var ensureActorRole = (organizationId) => {
  const actorRole = getActorRole(organizationId);
  if (!actorRole) {
    return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u7528\u6237\u4E0D\u5728\u8BE5\u7EC4\u7EC7\u5185", {});
  }
  return actorRole;
};
var ensureManagePermission = (organizationId) => {
  const actorRole = ensureActorRole(organizationId);
  if (typeof actorRole !== "string") {
    return actorRole;
  }
  if (!canManageMembers(actorRole)) {
    return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u7BA1\u7406\u6210\u5458", {});
  }
  return actorRole;
};
var parsePathSegment = (request, index) => {
  if (typeof request.url !== "string") {
    return "";
  }
  const pathname = request.url.split("?")[0] ?? "";
  return pathname.split("/")[index] ?? "";
};
var parseOrganizationId = (request) => toStringValue(request.query.organizationId) || parsePathSegment(request, 3);
var parseMemberId = (request) => toStringValue(request.query.memberId) || parsePathSegment(request, 5);
var parseApiKeyId = (request) => toStringValue(request.query.apiKeyId) || parsePathSegment(request, 5);
var normalizeKeyword = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
var normalizeRoleFilter = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim().toUpperCase()).filter(
      (item) => organizationRoleSchema.safeParse(item).success
    );
  }
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    return organizationRoleSchema.safeParse(normalized).success ? [normalized] : [];
  }
  return [];
};
var filterMembers = (organizationId, keyword, roleFilter) => {
  const scopedMembers = getMembersByOrganizationId(organizationId);
  const normalizedRoleFilter = normalizeRoleFilter(roleFilter);
  const roleMatchedMembers = normalizedRoleFilter.length > 0 ? scopedMembers.filter(
    (member) => normalizedRoleFilter.includes(member.role)
  ) : scopedMembers;
  if (!keyword) {
    return roleMatchedMembers;
  }
  return roleMatchedMembers.filter(
    (member) => [member.name, member.email, member.role, member.status].filter(Boolean).some((field) => field.toLowerCase().includes(keyword))
  );
};
var serializeApiKey = (apiKey) => ({
  ...apiKey,
  maskedKey: apiKey.secretKeyMasked ?? apiKey.maskedKey,
  secretKey: void 0
});
var mockHandlers = [
  {
    url: "/api/organizations",
    method: "get",
    response: ({ query }) => {
      const keyword = normalizeKeyword(query.keyword);
      const filtered = organizations.filter((organization) => {
        if (!keyword) {
          return true;
        }
        return [organization.name, organization.description, organization.subsystem].filter(Boolean).some((field) => field.toLowerCase().includes(keyword));
      });
      return success(paginate(filtered, query));
    }
  },
  {
    url: "/api/organizations",
    method: "post",
    response: ({ body }) => {
      const name = toStringValue(body.name);
      const subsystem = toStringValue(body.subsystem);
      if (!name) {
        return failure(RESPONSE_CODE.badRequest, "\u7EC4\u7EC7\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A", {});
      }
      if (!subsystem) {
        return failure(RESPONSE_CODE.badRequest, "\u6240\u5C5E\u5B50\u7CFB\u7EDF\u4E0D\u80FD\u4E3A\u7A7A", {});
      }
      const timestamp = Date.now();
      const createdAt = now();
      const organizationId = `org-${timestamp}`;
      const publicKey = `pk-live-${timestamp}`;
      const secretKey = `sk-live-${timestamp}${Math.random().toString(36).slice(2, 8)}`;
      const organization = {
        id: organizationId,
        name,
        description: typeof body.description === "string" ? body.description : null,
        subsystem,
        publicKey,
        secretKeyMasked: maskSecretKey(secretKey),
        createdBy: CURRENT_USER.name,
        createdAt,
        updatedAt: createdAt
      };
      organizations.unshift(organization);
      members.unshift({
        id: `mem-${timestamp}`,
        organizationId,
        userId: CURRENT_USER.id,
        name: CURRENT_USER.name,
        email: CURRENT_USER.email,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt
      });
      apiKeys.unshift({
        id: `key-${timestamp}`,
        organizationId,
        name: "\u9ED8\u8BA4\u521D\u59CB\u5316 Key",
        maskedKey: maskSecretKey(secretKey),
        publicKey,
        secretKeyMasked: maskSecretKey(secretKey),
        secretKey,
        createdBy: CURRENT_USER.name,
        updatedAt: createdAt,
        lastUsedAt: null,
        createdAt
      });
      return success({
        ...organization,
        secretKey
      });
    }
  },
  {
    url: "/api/organizations/:organizationId/members",
    method: "get",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const keyword = normalizeKeyword(request.query.keyword);
      const filtered = filterMembers(organizationId, keyword, request.query.role);
      return success(paginate(filtered, request.query));
    }
  },
  {
    url: "/api/organizations/:organizationId/members",
    method: "post",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureManagePermission(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      const email = toStringValue(request.body.email).toLowerCase();
      const name = toStringValue(request.body.name);
      const role = parseOrganizationRole(request.body.role);
      if (!email || !role) {
        return failure(RESPONSE_CODE.badRequest, "\u6210\u5458\u89D2\u8272\u4E0D\u5408\u6CD5", {});
      }
      if (!canAssignRole(actorRole, role)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u6388\u4E88\u8BE5\u6743\u9650", {});
      }
      const exists = getMembersByOrganizationId(organizationId).some(
        (member2) => member2.email === email
      );
      if (exists) {
        return failure(RESPONSE_CODE.badRequest, "\u8BE5\u6210\u5458\u5DF2\u5B58\u5728", {});
      }
      const createdAt = now();
      const nextId = `mem-${Date.now()}`;
      const emailPrefix = email.split("@")[0] ?? "new-user";
      const member = {
        id: nextId,
        organizationId,
        userId: `user-${emailPrefix}`,
        name: name || emailPrefix,
        email,
        role,
        status: "INVITED",
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt
      };
      members.unshift(member);
      return success(member);
    }
  },
  {
    url: "/api/organizations/:organizationId/members/:memberId",
    method: "patch",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const memberId = parseMemberId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureManagePermission(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      const target = members.find(
        (member) => member.organizationId === organizationId && member.id === memberId
      );
      if (!target) {
        return failure(RESPONSE_CODE.notFound, "\u6210\u5458\u4E0D\u5B58\u5728", {});
      }
      const nextRole = parseOrganizationRole(request.body.role);
      if (!nextRole) {
        return failure(RESPONSE_CODE.badRequest, "\u6210\u5458\u89D2\u8272\u4E0D\u5408\u6CD5", {});
      }
      if (!canAssignRole(actorRole, nextRole)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u6388\u4E88\u8BE5\u6743\u9650", {});
      }
      if (target.role === "OWNER" && nextRole !== "OWNER") {
        const ownerCount = getMembersByOrganizationId(organizationId).filter(
          (member) => member.role === "OWNER"
        ).length;
        const removeCheck = canRemoveMember(actorRole, "OWNER", ownerCount);
        if (!removeCheck.allowed) {
          return failure(
            RESPONSE_CODE.forbidden,
            removeCheck.reason ?? "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u53D8\u66F4\u8BE5\u6210\u5458",
            {}
          );
        }
      }
      target.role = nextRole;
      target.updatedAt = now();
      return success(target);
    }
  },
  {
    url: "/api/organizations/:organizationId/members/:memberId",
    method: "delete",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const memberId = parseMemberId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureManagePermission(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      const memberIndex = members.findIndex(
        (member) => member.organizationId === organizationId && member.id === memberId
      );
      if (memberIndex < 0) {
        return failure(RESPONSE_CODE.notFound, "\u6210\u5458\u4E0D\u5B58\u5728", {});
      }
      const target = members[memberIndex];
      const ownerCount = getMembersByOrganizationId(organizationId).filter(
        (member) => member.role === "OWNER"
      ).length;
      const removeCheck = canRemoveMember(actorRole, target.role, ownerCount);
      if (!removeCheck.allowed) {
        return failure(
          RESPONSE_CODE.forbidden,
          removeCheck.reason ?? "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u5220\u9664\u6210\u5458",
          {}
        );
      }
      members.splice(memberIndex, 1);
      return success({});
    }
  },
  {
    url: "/api/organizations/:organizationId/members/import",
    method: "post",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureManagePermission(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      const payloadMembers = Array.isArray(request.body.members) ? request.body.members : [];
      const failures = [];
      const imported = [];
      payloadMembers.forEach((item, index) => {
        const email = typeof item === "object" && item !== null ? toStringValue(item.email).toLowerCase() : "";
        const name = typeof item === "object" && item !== null ? toStringValue(item.name) : "";
        const role = typeof item === "object" && item !== null ? parseOrganizationRole(item.role) : "";
        if (!email || !role) {
          failures.push({
            row: index + 1,
            email,
            reason: "\u6210\u5458\u53C2\u6570\u4E0D\u5B8C\u6574"
          });
          return;
        }
        if (!canAssignRole(actorRole, role)) {
          failures.push({
            row: index + 1,
            email,
            reason: "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u6388\u4E88\u8BE5\u6743\u9650"
          });
          return;
        }
        const exists = getMembersByOrganizationId(organizationId).some(
          (member2) => member2.email === email
        );
        if (exists) {
          failures.push({
            row: index + 1,
            email,
            reason: "\u8BE5\u6210\u5458\u5DF2\u5B58\u5728"
          });
          return;
        }
        const createdAt = now();
        const emailPrefix = email.split("@")[0] ?? `import-${index + 1}`;
        const member = {
          id: `mem-${Date.now()}-${index + 1}`,
          organizationId,
          userId: `user-${emailPrefix}`,
          name: name || emailPrefix,
          email,
          role,
          status: "INVITED",
          joinedAt: createdAt,
          createdAt,
          updatedAt: createdAt
        };
        members.unshift(member);
        imported.push(member);
      });
      return success({
        total: imported.length,
        datas: imported,
        failures
      });
    }
  },
  {
    url: "/api/organizations/:organizationId/api-keys",
    method: "get",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureActorRole(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u67E5\u770B API Key", {});
      }
      const keyword = normalizeKeyword(request.query.keyword);
      const scopedKeys = apiKeys.filter((apiKey) => apiKey.organizationId === organizationId).filter((apiKey) => {
        if (!keyword) {
          return true;
        }
        return [apiKey.name, apiKey.publicKey, apiKey.createdBy].some(
          (value) => value?.toLowerCase().includes(keyword)
        );
      }).map(serializeApiKey);
      return success(paginate(scopedKeys, request.query));
    }
  },
  {
    url: "/api/organizations/:organizationId/api-keys",
    method: "post",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureActorRole(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u521B\u5EFA API Key", {});
      }
      const name = toStringValue(request.body.name);
      if (!name) {
        return failure(RESPONSE_CODE.badRequest, "API Key \u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A", {});
      }
      const timestamp = Date.now();
      const createdAt = now();
      const publicKey = `pk-live-${timestamp}`;
      const secretKey = `sk-live-${timestamp}${Math.random().toString(36).slice(2, 8)}`;
      const secretKeyMasked = maskSecretKey(secretKey);
      const apiKey = {
        id: `key-${timestamp}`,
        organizationId,
        name,
        maskedKey: secretKeyMasked,
        publicKey,
        secretKeyMasked,
        secretKey,
        createdBy: CURRENT_USER.name,
        updatedAt: createdAt,
        lastUsedAt: null,
        createdAt
      };
      apiKeys.unshift(apiKey);
      return success(apiKey);
    }
  },
  {
    url: "/api/organizations/:organizationId/api-keys/:apiKeyId",
    method: "delete",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const apiKeyId = parseApiKeyId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureActorRole(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u5220\u9664 API Key", {});
      }
      const apiKeyIndex = apiKeys.findIndex(
        (apiKey) => apiKey.organizationId === organizationId && apiKey.id === apiKeyId
      );
      if (apiKeyIndex < 0) {
        return failure(RESPONSE_CODE.notFound, "API Key \u4E0D\u5B58\u5728", {});
      }
      apiKeys.splice(apiKeyIndex, 1);
      return success({});
    }
  },
  {
    url: "/api/organizations/:organizationId",
    method: "get",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      return success(organization);
    }
  },
  {
    url: "/api/organizations/:organizationId",
    method: "patch",
    response: (request) => {
      const organizationId = parseOrganizationId(request);
      const organization = ensureOrganization(organizationId);
      if ("code" in organization) {
        return organization;
      }
      const actorRole = ensureActorRole(organizationId);
      if (typeof actorRole !== "string") {
        return actorRole;
      }
      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, "\u5F53\u524D\u89D2\u8272\u4E0D\u80FD\u7F16\u8F91\u7EC4\u7EC7\u4FE1\u606F", {});
      }
      if (typeof request.body.name === "string") {
        return failure(RESPONSE_CODE.badRequest, "\u7EC4\u7EC7\u540D\u79F0\u4E0D\u5141\u8BB8\u4FEE\u6539", {});
      }
      if (typeof request.body.subsystem === "string" && !request.body.subsystem.trim()) {
        return failure(RESPONSE_CODE.badRequest, "\u6240\u5C5E\u5B50\u7CFB\u7EDF\u4E0D\u80FD\u4E3A\u7A7A", {});
      }
      if (typeof request.body.description === "string") {
        organization.description = request.body.description;
      }
      if (typeof request.body.subsystem === "string") {
        organization.subsystem = request.body.subsystem;
      }
      organization.updatedAt = now();
      return success(organization);
    }
  }
];
var organizations_default = mockHandlers;
export {
  organizations_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21vZHVsZXMvb3JnYW5pemF0aW9uLW1hbmFnZW1lbnQvZGF0YS9wZXJtaXNzaW9ucy50cyIsICJzcmMvbW9kdWxlcy9vcmdhbml6YXRpb24tbWFuYWdlbWVudC9kYXRhL3NjaGVtYS50cyIsICJtb2NrL29yZ2FuaXphdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL3BhbnBhbi9Qcm9qZWN0L2V2YWwtZGVtby9wYS1ldmFsLWZyb250ZW5kL3NyYy9tb2R1bGVzL29yZ2FuaXphdGlvbi1tYW5hZ2VtZW50L2RhdGEvcGVybWlzc2lvbnMudHNcIjtjb25zdCBfX2luamVjdGVkX2Rpcm5hbWVfXyA9IFwiL1VzZXJzL3BhbnBhbi9Qcm9qZWN0L2V2YWwtZGVtby9wYS1ldmFsLWZyb250ZW5kL3NyYy9tb2R1bGVzL29yZ2FuaXphdGlvbi1tYW5hZ2VtZW50L2RhdGFcIjtjb25zdCBfX2luamVjdGVkX2ltcG9ydF9tZXRhX3VybF9fID0gXCJmaWxlOi8vL1VzZXJzL3BhbnBhbi9Qcm9qZWN0L2V2YWwtZGVtby9wYS1ldmFsLWZyb250ZW5kL3NyYy9tb2R1bGVzL29yZ2FuaXphdGlvbi1tYW5hZ2VtZW50L2RhdGEvcGVybWlzc2lvbnMudHNcIjtpbXBvcnQgdHlwZSB7IE9yZ2FuaXphdGlvblJvbGUgfSBmcm9tICcuL3NjaGVtYSdcblxudHlwZSBSZW1vdmVNZW1iZXJSZXN1bHQgPSB7XG4gIGFsbG93ZWQ6IGJvb2xlYW5cbiAgcmVhc29uPzogc3RyaW5nXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5NYW5hZ2VNZW1iZXJzKHJvbGU6IE9yZ2FuaXphdGlvblJvbGUpOiBib29sZWFuIHtcbiAgcmV0dXJuIHJvbGUgPT09ICdPV05FUicgfHwgcm9sZSA9PT0gJ0FETUlOJ1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FuQXNzaWduUm9sZShcbiAgYWN0b3JSb2xlOiBPcmdhbml6YXRpb25Sb2xlLFxuICB0YXJnZXRSb2xlOiBPcmdhbml6YXRpb25Sb2xlXG4pOiBib29sZWFuIHtcbiAgaWYgKGFjdG9yUm9sZSA9PT0gJ09XTkVSJykge1xuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBpZiAoYWN0b3JSb2xlID09PSAnQURNSU4nKSB7XG4gICAgcmV0dXJuIHRhcmdldFJvbGUgIT09ICdPV05FUidcbiAgfVxuXG4gIHJldHVybiBmYWxzZVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FuUmVtb3ZlTWVtYmVyKFxuICBhY3RvclJvbGU6IE9yZ2FuaXphdGlvblJvbGUsXG4gIHRhcmdldFJvbGU6IE9yZ2FuaXphdGlvblJvbGUsXG4gIG93bmVyQ291bnQ6IG51bWJlclxuKTogUmVtb3ZlTWVtYmVyUmVzdWx0IHtcbiAgaWYgKCFjYW5NYW5hZ2VNZW1iZXJzKGFjdG9yUm9sZSkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgYWxsb3dlZDogZmFsc2UsXG4gICAgICByZWFzb246ICdcdTVGNTNcdTUyNERcdTg5RDJcdTgyNzJcdTRFMERcdTgwRkRcdTUyMjBcdTk2NjRcdTYyMTBcdTU0NTgnLFxuICAgIH1cbiAgfVxuXG4gIGlmIChhY3RvclJvbGUgPT09ICdBRE1JTicgJiYgdGFyZ2V0Um9sZSA9PT0gJ09XTkVSJykge1xuICAgIHJldHVybiB7XG4gICAgICBhbGxvd2VkOiBmYWxzZSxcbiAgICAgIHJlYXNvbjogJ0FkbWluIFx1NEUwRFx1ODBGRFx1NTIyMFx1OTY2NCBPd25lcicsXG4gICAgfVxuICB9XG5cbiAgaWYgKHRhcmdldFJvbGUgPT09ICdPV05FUicgJiYgb3duZXJDb3VudCA8PSAxKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFsbG93ZWQ6IGZhbHNlLFxuICAgICAgcmVhc29uOiAnXHU0RTBEXHU4MEZEXHU1MjIwXHU5NjY0XHU2NzAwXHU1NDBFXHU0RTAwXHU0RTJBIE93bmVyJyxcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhbGxvd2VkOiB0cnVlIH1cbn1cbiIsICJjb25zdCBfX2luamVjdGVkX2ZpbGVuYW1lX18gPSBcIi9Vc2Vycy9wYW5wYW4vUHJvamVjdC9ldmFsLWRlbW8vcGEtZXZhbC1mcm9udGVuZC9zcmMvbW9kdWxlcy9vcmdhbml6YXRpb24tbWFuYWdlbWVudC9kYXRhL3NjaGVtYS50c1wiO2NvbnN0IF9faW5qZWN0ZWRfZGlybmFtZV9fID0gXCIvVXNlcnMvcGFucGFuL1Byb2plY3QvZXZhbC1kZW1vL3BhLWV2YWwtZnJvbnRlbmQvc3JjL21vZHVsZXMvb3JnYW5pemF0aW9uLW1hbmFnZW1lbnQvZGF0YVwiO2NvbnN0IF9faW5qZWN0ZWRfaW1wb3J0X21ldGFfdXJsX18gPSBcImZpbGU6Ly8vVXNlcnMvcGFucGFuL1Byb2plY3QvZXZhbC1kZW1vL3BhLWV2YWwtZnJvbnRlbmQvc3JjL21vZHVsZXMvb3JnYW5pemF0aW9uLW1hbmFnZW1lbnQvZGF0YS9zY2hlbWEudHNcIjtpbXBvcnQgeyB6IH0gZnJvbSAnem9kJ1xuXG5leHBvcnQgY29uc3Qgb3JnYW5pemF0aW9uUm9sZVNjaGVtYSA9IHouZW51bShbXG4gICdPV05FUicsXG4gICdBRE1JTicsXG4gICdNRU1CRVInLFxuICAnVklFV0VSJyxcbl0pXG5cbmV4cG9ydCB0eXBlIE9yZ2FuaXphdGlvblJvbGUgPSB6LmluZmVyPHR5cGVvZiBvcmdhbml6YXRpb25Sb2xlU2NoZW1hPlxuXG5leHBvcnQgY29uc3Qgb3JnYW5pemF0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgZGVzY3JpcHRpb246IHouc3RyaW5nKCkubnVsbGFibGUoKS5vcHRpb25hbCgpLFxuICBzdWJzeXN0ZW06IHouc3RyaW5nKCkubnVsbGFibGUoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkQnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZEF0OiB6LnN0cmluZygpLFxuICB1cGRhdGVkQXQ6IHouc3RyaW5nKCksXG59KVxuXG5leHBvcnQgdHlwZSBPcmdhbml6YXRpb24gPSB6LmluZmVyPHR5cGVvZiBvcmdhbml6YXRpb25TY2hlbWE+XG5cbmV4cG9ydCBjb25zdCBvcmdhbml6YXRpb25NZW1iZXJTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBvcmdhbml6YXRpb25JZDogei5zdHJpbmcoKSxcbiAgdXNlcklkOiB6LnN0cmluZygpLFxuICBuYW1lOiB6LnN0cmluZygpLFxuICBlbWFpbDogei5zdHJpbmcoKS5lbWFpbCgpLFxuICByb2xlOiBvcmdhbml6YXRpb25Sb2xlU2NoZW1hLFxuICBzdGF0dXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgam9pbmVkQXQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZEF0OiB6LnN0cmluZygpLFxuICB1cGRhdGVkQXQ6IHouc3RyaW5nKCksXG59KVxuXG5leHBvcnQgdHlwZSBPcmdhbml6YXRpb25NZW1iZXIgPSB6LmluZmVyPHR5cGVvZiBvcmdhbml6YXRpb25NZW1iZXJTY2hlbWE+XG5cbmV4cG9ydCB0eXBlIFBhZ2luYXRlZFJlc3VsdDxUPiA9IHtcbiAgdG90YWw6IG51bWJlclxuICBkYXRhczogVFtdXG59XG5cbmV4cG9ydCBjb25zdCBjcmVhdGVPcmdhbml6YXRpb25QYXlsb2FkU2NoZW1hID0gei5vYmplY3Qoe1xuICBuYW1lOiB6LnN0cmluZygpLFxuICBzdWJzeXN0ZW06IHouc3RyaW5nKCksXG4gIGRlc2NyaXB0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG59KVxuXG5leHBvcnQgdHlwZSBDcmVhdGVPcmdhbml6YXRpb25QYXlsb2FkID0gei5pbmZlcjxcbiAgdHlwZW9mIGNyZWF0ZU9yZ2FuaXphdGlvblBheWxvYWRTY2hlbWFcbj5cblxuZXhwb3J0IGNvbnN0IHVwZGF0ZU9yZ2FuaXphdGlvblBheWxvYWRTY2hlbWEgPVxuICBjcmVhdGVPcmdhbml6YXRpb25QYXlsb2FkU2NoZW1hLnBhcnRpYWwoKVxuXG5leHBvcnQgdHlwZSBVcGRhdGVPcmdhbml6YXRpb25QYXlsb2FkID0gei5pbmZlcjxcbiAgdHlwZW9mIHVwZGF0ZU9yZ2FuaXphdGlvblBheWxvYWRTY2hlbWFcbj5cblxuZXhwb3J0IGNvbnN0IGNyZWF0ZU9yZ2FuaXphdGlvbk1lbWJlclBheWxvYWRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG5hbWU6IHouc3RyaW5nKCkudHJpbSgpLm9wdGlvbmFsKCksXG4gIGVtYWlsOiB6LnN0cmluZygpLmVtYWlsKCksXG4gIHJvbGU6IG9yZ2FuaXphdGlvblJvbGVTY2hlbWEsXG59KVxuXG5leHBvcnQgdHlwZSBDcmVhdGVPcmdhbml6YXRpb25NZW1iZXJQYXlsb2FkID0gei5pbmZlcjxcbiAgdHlwZW9mIGNyZWF0ZU9yZ2FuaXphdGlvbk1lbWJlclBheWxvYWRTY2hlbWFcbj5cblxuZXhwb3J0IGNvbnN0IHVwZGF0ZU9yZ2FuaXphdGlvbk1lbWJlclBheWxvYWRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHJvbGU6IG9yZ2FuaXphdGlvblJvbGVTY2hlbWEsXG59KVxuXG5leHBvcnQgdHlwZSBVcGRhdGVPcmdhbml6YXRpb25NZW1iZXJQYXlsb2FkID0gei5pbmZlcjxcbiAgdHlwZW9mIHVwZGF0ZU9yZ2FuaXphdGlvbk1lbWJlclBheWxvYWRTY2hlbWFcbj5cblxuZXhwb3J0IGNvbnN0IGltcG9ydE9yZ2FuaXphdGlvbk1lbWJlcnNQYXlsb2FkU2NoZW1hID0gei5vYmplY3Qoe1xuICBtZW1iZXJzOiB6LmFycmF5KGNyZWF0ZU9yZ2FuaXphdGlvbk1lbWJlclBheWxvYWRTY2hlbWEpLFxufSlcblxuZXhwb3J0IHR5cGUgSW1wb3J0T3JnYW5pemF0aW9uTWVtYmVyc1BheWxvYWQgPSB6LmluZmVyPFxuICB0eXBlb2YgaW1wb3J0T3JnYW5pemF0aW9uTWVtYmVyc1BheWxvYWRTY2hlbWFcbj5cblxuZXhwb3J0IGNvbnN0IGltcG9ydE9yZ2FuaXphdGlvbk1lbWJlckZhaWx1cmVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHJvdzogei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLFxuICBlbWFpbDogei5zdHJpbmcoKS5lbWFpbCgpLFxuICByZWFzb246IHouc3RyaW5nKCksXG59KVxuXG5leHBvcnQgdHlwZSBJbXBvcnRPcmdhbml6YXRpb25NZW1iZXJGYWlsdXJlID0gei5pbmZlcjxcbiAgdHlwZW9mIGltcG9ydE9yZ2FuaXphdGlvbk1lbWJlckZhaWx1cmVTY2hlbWFcbj5cblxuZXhwb3J0IHR5cGUgSW1wb3J0T3JnYW5pemF0aW9uTWVtYmVyc1Jlc3VsdCA9IFBhZ2luYXRlZFJlc3VsdDxPcmdhbml6YXRpb25NZW1iZXI+ICYge1xuICBmYWlsdXJlczogSW1wb3J0T3JnYW5pemF0aW9uTWVtYmVyRmFpbHVyZVtdXG59XG4iLCAiY29uc3QgX19pbmplY3RlZF9maWxlbmFtZV9fID0gXCIvVXNlcnMvcGFucGFuL1Byb2plY3QvZXZhbC1kZW1vL3BhLWV2YWwtZnJvbnRlbmQvbW9jay9vcmdhbml6YXRpb25zLnRzXCI7Y29uc3QgX19pbmplY3RlZF9kaXJuYW1lX18gPSBcIi9Vc2Vycy9wYW5wYW4vUHJvamVjdC9ldmFsLWRlbW8vcGEtZXZhbC1mcm9udGVuZC9tb2NrXCI7Y29uc3QgX19pbmplY3RlZF9pbXBvcnRfbWV0YV91cmxfXyA9IFwiZmlsZTovLy9Vc2Vycy9wYW5wYW4vUHJvamVjdC9ldmFsLWRlbW8vcGEtZXZhbC1mcm9udGVuZC9tb2NrL29yZ2FuaXphdGlvbnMudHNcIjtpbXBvcnQgdHlwZSB7IE1vY2tNZXRob2QgfSBmcm9tICd2aXRlLXBsdWdpbi1tb2NrJ1xuXG5pbXBvcnQge1xuICBjYW5Bc3NpZ25Sb2xlLFxuICBjYW5NYW5hZ2VNZW1iZXJzLFxuICBjYW5SZW1vdmVNZW1iZXIsXG59IGZyb20gJy4uL3NyYy9tb2R1bGVzL29yZ2FuaXphdGlvbi1tYW5hZ2VtZW50L2RhdGEvcGVybWlzc2lvbnMnXG5pbXBvcnQge1xuICBvcmdhbml6YXRpb25Sb2xlU2NoZW1hLFxuICB0eXBlIE9yZ2FuaXphdGlvbixcbiAgdHlwZSBPcmdhbml6YXRpb25BcGlLZXksXG4gIHR5cGUgT3JnYW5pemF0aW9uTWVtYmVyLFxuICB0eXBlIE9yZ2FuaXphdGlvblJvbGUsXG59IGZyb20gJy4uL3NyYy9tb2R1bGVzL29yZ2FuaXphdGlvbi1tYW5hZ2VtZW50L2RhdGEvc2NoZW1hJ1xuXG50eXBlIE1vY2tSZWNvcmQgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZD5cblxudHlwZSBNb2NrUmVxdWVzdCA9IHtcbiAgdXJsOiBNb2NrUmVjb3JkIHwgc3RyaW5nXG4gIGJvZHk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gIHF1ZXJ5OiBNb2NrUmVjb3JkXG4gIGhlYWRlcnM6IE1vY2tSZWNvcmRcbn1cblxudHlwZSBNb2NrUmVzcG9uc2U8VD4gPSB7XG4gIGNvZGU6IG51bWJlclxuICBtZXNzYWdlOiBzdHJpbmdcbiAgZGF0YTogVFxuICB0eElkOiBzdHJpbmdcbn1cblxuY29uc3QgUkVTUE9OU0VfQ09ERSA9IHtcbiAgc3VjY2VzczogMCxcbiAgYmFkUmVxdWVzdDogMTAwMSxcbiAgZm9yYmlkZGVuOiAxMDAzLFxuICBub3RGb3VuZDogMTAwNCxcbn0gYXMgY29uc3RcblxuY29uc3QgQ1VSUkVOVF9VU0VSID0ge1xuICBpZDogJ3VzZXItY3VycmVudCcsXG4gIG5hbWU6ICdcdTk2NDhcdTlFRDgnLFxuICBlbWFpbDogJ2NoZW5tb0BwYS1ldmFsLmRldicsXG59XG5cbmNvbnN0IG5vdyA9ICgpID0+IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuXG5jb25zdCBjcmVhdGVUeElkID0gKCkgPT5cbiAgYHR4LSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gXG5cbmNvbnN0IHN1Y2Nlc3MgPSA8VD4oZGF0YTogVCk6IE1vY2tSZXNwb25zZTxUPiA9PiAoe1xuICBjb2RlOiBSRVNQT05TRV9DT0RFLnN1Y2Nlc3MsXG4gIG1lc3NhZ2U6ICdzdWNjZXNzJyxcbiAgZGF0YSxcbiAgdHhJZDogY3JlYXRlVHhJZCgpLFxufSlcblxuY29uc3QgZmFpbHVyZSA9IDxUPihcbiAgY29kZTogbnVtYmVyLFxuICBtZXNzYWdlOiBzdHJpbmcsXG4gIGRhdGE6IFRcbik6IE1vY2tSZXNwb25zZTxUPiA9PiAoe1xuICBjb2RlLFxuICBtZXNzYWdlLFxuICBkYXRhLFxuICB0eElkOiBjcmVhdGVUeElkKCksXG59KVxuXG5jb25zdCB0b051bWJlciA9ICh2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQsIGZhbGxiYWNrOiBudW1iZXIpID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZmFsbGJhY2tcbiAgfVxuXG4gIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSlcbiAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShwYXJzZWQpICYmIHBhcnNlZCA+IDAgPyBwYXJzZWQgOiBmYWxsYmFja1xufVxuXG5jb25zdCB0b1N0cmluZ1ZhbHVlID0gKHZhbHVlOiB1bmtub3duKSA9PlxuICB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUudHJpbSgpIDogJydcblxuY29uc3QgcGFyc2VPcmdhbml6YXRpb25Sb2xlID0gKHZhbHVlOiB1bmtub3duKTogT3JnYW5pemF0aW9uUm9sZSB8IG51bGwgPT4ge1xuICBjb25zdCByZXN1bHQgPSBvcmdhbml6YXRpb25Sb2xlU2NoZW1hLnNhZmVQYXJzZSh2YWx1ZSlcbiAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzID8gcmVzdWx0LmRhdGEgOiBudWxsXG59XG5cbmNvbnN0IHBhZ2luYXRlID0gPFQ+KGl0ZW1zOiBUW10sIHF1ZXJ5OiBNb2NrUmVjb3JkKSA9PiB7XG4gIGNvbnN0IHBhZ2UgPSB0b051bWJlcihxdWVyeS5wYWdlLCAxKVxuICBjb25zdCBwYWdlU2l6ZSA9IHRvTnVtYmVyKHF1ZXJ5LnBhZ2VTaXplLCAxMClcbiAgY29uc3Qgc3RhcnRJbmRleCA9IChwYWdlIC0gMSkgKiBwYWdlU2l6ZVxuXG4gIHJldHVybiB7XG4gICAgdG90YWw6IGl0ZW1zLmxlbmd0aCxcbiAgICBkYXRhczogaXRlbXMuc2xpY2Uoc3RhcnRJbmRleCwgc3RhcnRJbmRleCArIHBhZ2VTaXplKSxcbiAgfVxufVxuXG5jb25zdCBtYXNrU2VjcmV0S2V5ID0gKHNlY3JldEtleTogc3RyaW5nKSA9PlxuICBgJHtzZWNyZXRLZXkuc2xpY2UoMCwgMTApfS4uLiR7c2VjcmV0S2V5LnNsaWNlKC00KX1gXG5cbmNvbnN0IG9yZ2FuaXphdGlvbnM6IE9yZ2FuaXphdGlvbltdID0gW1xuICB7XG4gICAgaWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICBuYW1lOiAnUEEgXHU1RTczXHU1M0YwXHU0RTNCXHU3RUM0XHU3RUM3JyxcbiAgICBkZXNjcmlwdGlvbjogJ1x1NUY1M1x1NTI0RFx1NzUyOFx1NjIzN1x1NEUzQSBPd25lclx1RkYwQ1x1NzUyOFx1NEU4RVx1NUI4Q1x1NjU3NFx1N0JBMVx1NzQwNlx1NkQ0MVx1N0EwQlx1OUE4Q1x1OEJDMScsXG4gICAgc3Vic3lzdGVtOiAnZXZhbHVhdGlvbicsXG4gICAgcHVibGljS2V5OiAncGstbGl2ZS1vd25lcjAwMScsXG4gICAgc2VjcmV0S2V5TWFza2VkOiAnc2stbGl2ZS1vd24uLi5yMDAxJyxcbiAgICBjcmVhdGVkQnk6ICdzeXN0ZW0uc2VlZCcsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wMVQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA3LTAxVDA5OjMwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdvcmctYWRtaW4tMDAxJyxcbiAgICBuYW1lOiAnXHU2QTIxXHU1NzhCXHU4QkM0XHU2RDRCIEFkbWluIFx1N0VDNFx1N0VDNycsXG4gICAgZGVzY3JpcHRpb246ICdcdTVGNTNcdTUyNERcdTc1MjhcdTYyMzdcdTRFM0EgQWRtaW5cdUZGMENcdTc1MjhcdTRFOEVcdTY3NDNcdTk2NTBcdTUzRDdcdTk2NTBcdTU3M0FcdTY2NkYnLFxuICAgIHN1YnN5c3RlbTogJ21vZGVsLWV2YWwnLFxuICAgIHB1YmxpY0tleTogJ3BrLWxpdmUtYWRtaW4wMDEnLFxuICAgIHNlY3JldEtleU1hc2tlZDogJ3NrLWxpdmUtYWRtLi4uMDAwMScsXG4gICAgY3JlYXRlZEJ5OiAnc3lzdGVtLnNlZWQnLFxuICAgIGNyZWF0ZWRBdDogJzIwMjYtMDYtMDVUMDg6MDA6MDAuMDAwWicsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNy0wMVQwOTozMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAnb3JnLW1lbWJlci0wMDEnLFxuICAgIG5hbWU6ICdcdTY1NzBcdTYzNkVcdTY4MDdcdTZDRThcdTUzNEZcdTRGNUNcdTdFQzRcdTdFQzcnLFxuICAgIGRlc2NyaXB0aW9uOiAnXHU1RjUzXHU1MjREXHU3NTI4XHU2MjM3XHU0RTNBIE1lbWJlclx1RkYwQ1x1NzUyOFx1NEU4RVx1Nzk4MVx1NzUyOFx1NjIxMFx1NTQ1OFx1N0JBMVx1NzQwNlx1NjRDRFx1NEY1QycsXG4gICAgc3Vic3lzdGVtOiAnYW5ub3RhdGlvbicsXG4gICAgcHVibGljS2V5OiAncGstbGl2ZS1tZW1iZXIwMDEnLFxuICAgIHNlY3JldEtleU1hc2tlZDogJ3NrLWxpdmUtbWVtLi4uMDAwMScsXG4gICAgY3JlYXRlZEJ5OiAnc3lzdGVtLnNlZWQnLFxuICAgIGNyZWF0ZWRBdDogJzIwMjYtMDYtMDhUMDg6MDA6MDAuMDAwWicsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNy0wMVQwOTozMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAnb3JnLXZpZXdlci0wMDEnLFxuICAgIG5hbWU6ICdcdTUzRUFcdThCRkJcdTVCQTFcdThCQTFcdTdFQzRcdTdFQzcnLFxuICAgIGRlc2NyaXB0aW9uOiAnXHU1RjUzXHU1MjREXHU3NTI4XHU2MjM3XHU0RTNBIFZpZXdlclx1RkYwQ1x1NzUyOFx1NEU4RVx1NTNFQVx1OEJGQlx1NTczQVx1NjY2RicsXG4gICAgc3Vic3lzdGVtOiAnYXVkaXQnLFxuICAgIHB1YmxpY0tleTogJ3BrLWxpdmUtdmlldzAwMScsXG4gICAgc2VjcmV0S2V5TWFza2VkOiAnc2stbGl2ZS12aWUuLi4wMDAxJyxcbiAgICBjcmVhdGVkQnk6ICdzeXN0ZW0uc2VlZCcsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0xMFQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA3LTAxVDA5OjMwOjAwLjAwMFonLFxuICB9LFxuXVxuXG5jb25zdCBtZW1iZXJzOiBPcmdhbml6YXRpb25NZW1iZXJbXSA9IFtcbiAge1xuICAgIGlkOiAnbWVtLW93bmVyLXNlbGYnLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLW93bmVyLTAwMScsXG4gICAgdXNlcklkOiBDVVJSRU5UX1VTRVIuaWQsXG4gICAgbmFtZTogQ1VSUkVOVF9VU0VSLm5hbWUsXG4gICAgZW1haWw6IENVUlJFTlRfVVNFUi5lbWFpbCxcbiAgICByb2xlOiAnT1dORVInLFxuICAgIHN0YXR1czogJ0FDVElWRScsXG4gICAgam9pbmVkQXQ6ICcyMDI2LTA2LTAxVDA4OjAwOjAwLjAwMFonLFxuICAgIGNyZWF0ZWRBdDogJzIwMjYtMDYtMDFUMDg6MDA6MDAuMDAwWicsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNi0wMVQwODowMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAnbWVtLW93bmVyLTAwMicsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICB1c2VySWQ6ICd1c2VyLW93bmVyLTAwMicsXG4gICAgbmFtZTogJ1x1Njc5N1x1OTZFQScsXG4gICAgZW1haWw6ICdsaW54dWVAcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdPV05FUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDJUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wMlQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTIwVDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tb3duZXItMDAzJyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1vd25lci0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItYWRtaW4tMDAxJyxcbiAgICBuYW1lOiAnXHU0RjU1XHU1REREJyxcbiAgICBlbWFpbDogJ2hlY2h1YW5AcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdBRE1JTicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDNUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wM1QwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTIxVDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tb3duZXItMDA0JyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1vd25lci0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItYWRtaW4tMDAyJyxcbiAgICBuYW1lOiAnXHU1RjIwXHU0RTAwXHU4MjFGJyxcbiAgICBlbWFpbDogJ3poYW5neWl6aG91QHBhLWV2YWwuZGV2JyxcbiAgICByb2xlOiAnQURNSU4nLFxuICAgIHN0YXR1czogJ0lOVklURUQnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0wNFQwODowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTA0VDA4OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjJUMDk6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1vd25lci0wMDUnLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLW93bmVyLTAwMScsXG4gICAgdXNlcklkOiAndXNlci1tZW1iZXItMDAxJyxcbiAgICBuYW1lOiAnXHU4MkNGXHU5NzUyJyxcbiAgICBlbWFpbDogJ3N1cWluZ0BwYS1ldmFsLmRldicsXG4gICAgcm9sZTogJ01FTUJFUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDVUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wNVQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTIzVDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tb3duZXItMDA2JyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1vd25lci0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItbWVtYmVyLTAwMicsXG4gICAgbmFtZTogJ1x1OTg3RVx1NzEzNicsXG4gICAgZW1haWw6ICdndXJhbkBwYS1ldmFsLmRldicsXG4gICAgcm9sZTogJ01FTUJFUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDZUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wNlQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTI0VDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tb3duZXItMDA3JyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1vd25lci0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItbWVtYmVyLTAwMycsXG4gICAgbmFtZTogJ1x1OUFEOFx1NzNBNScsXG4gICAgZW1haWw6ICdnYW95dWVAcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdNRU1CRVInLFxuICAgIHN0YXR1czogJ1NVU1BFTkRFRCcsXG4gICAgam9pbmVkQXQ6ICcyMDI2LTA2LTA3VDA4OjAwOjAwLjAwMFonLFxuICAgIGNyZWF0ZWRBdDogJzIwMjYtMDYtMDdUMDg6MDA6MDAuMDAwWicsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNi0yNVQwOTowMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAnbWVtLW93bmVyLTAwOCcsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICB1c2VySWQ6ICd1c2VyLW1lbWJlci0wMDQnLFxuICAgIG5hbWU6ICdcdTczOEJcdThDMjgnLFxuICAgIGVtYWlsOiAnd2FuZ2ppbkBwYS1ldmFsLmRldicsXG4gICAgcm9sZTogJ01FTUJFUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDhUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wOFQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTI2VDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tb3duZXItMDA5JyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1vd25lci0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItdmlld2VyLTAwMScsXG4gICAgbmFtZTogJ1x1OTY0OFx1OEJGQScsXG4gICAgZW1haWw6ICdjaGVubnVvQHBhLWV2YWwuZGV2JyxcbiAgICByb2xlOiAnVklFV0VSJyxcbiAgICBzdGF0dXM6ICdBQ1RJVkUnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0wOVQwODowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTA5VDA4OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjdUMDk6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1vd25lci0wMTAnLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLW93bmVyLTAwMScsXG4gICAgdXNlcklkOiAndXNlci12aWV3ZXItMDAyJyxcbiAgICBuYW1lOiAnXHU4QkI4XHU1Qjg5JyxcbiAgICBlbWFpbDogJ3h1YW5AcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdWSUVXRVInLFxuICAgIHN0YXR1czogJ0lOVklURUQnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0xMFQwODowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTEwVDA4OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjhUMDk6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1vd25lci0wMTEnLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLW93bmVyLTAwMScsXG4gICAgdXNlcklkOiAndXNlci1tZW1iZXItMDA1JyxcbiAgICBuYW1lOiAnXHU5MEQxXHU1MzE3JyxcbiAgICBlbWFpbDogJ3poZW5nYmVpQHBhLWV2YWwuZGV2JyxcbiAgICByb2xlOiAnTUVNQkVSJyxcbiAgICBzdGF0dXM6ICdBQ1RJVkUnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0xMVQwODowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTExVDA4OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjlUMDk6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1vd25lci0wMTInLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLW93bmVyLTAwMScsXG4gICAgdXNlcklkOiAndXNlci1tZW1iZXItMDA2JyxcbiAgICBuYW1lOiAnXHU1NTEwXHU2NUY2JyxcbiAgICBlbWFpbDogJ3RhbmdzaGlAcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdNRU1CRVInLFxuICAgIHN0YXR1czogJ0FDVElWRScsXG4gICAgam9pbmVkQXQ6ICcyMDI2LTA2LTEyVDA4OjAwOjAwLjAwMFonLFxuICAgIGNyZWF0ZWRBdDogJzIwMjYtMDYtMTJUMDg6MDA6MDAuMDAwWicsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNi0zMFQwOTowMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAnbWVtLW93bmVyLTAxMycsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICB1c2VySWQ6ICd1c2VyLW1lbWJlci0wMDcnLFxuICAgIG5hbWU6ICdcdThEM0FcdTc5M0MnLFxuICAgIGVtYWlsOiAnaGVsaUBwYS1ldmFsLmRldicsXG4gICAgcm9sZTogJ01FTUJFUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMTNUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0xM1QwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA3LTAxVDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tYWRtaW4tc2VsZicsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctYWRtaW4tMDAxJyxcbiAgICB1c2VySWQ6IENVUlJFTlRfVVNFUi5pZCxcbiAgICBuYW1lOiBDVVJSRU5UX1VTRVIubmFtZSxcbiAgICBlbWFpbDogQ1VSUkVOVF9VU0VSLmVtYWlsLFxuICAgIHJvbGU6ICdBRE1JTicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDVUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wNVQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTA1VDA4OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tYWRtaW4tMDAyJyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1hZG1pbi0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItYWRtaW4tb3duZXInLFxuICAgIG5hbWU6ICdcdTY3NUNcdTVDOUEnLFxuICAgIGVtYWlsOiAnZHVsYW5AcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdPV05FUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDVUMDk6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wNVQwOTowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTA1VDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tYWRtaW4tMDAzJyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1hZG1pbi0wMDEnLFxuICAgIHVzZXJJZDogJ3VzZXItYWRtaW4tbWVtYmVyJyxcbiAgICBuYW1lOiAnXHU2NUI5XHU1QjgxJyxcbiAgICBlbWFpbDogJ2ZhbmduaW5nQHBhLWV2YWwuZGV2JyxcbiAgICByb2xlOiAnTUVNQkVSJyxcbiAgICBzdGF0dXM6ICdBQ1RJVkUnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0wNlQwOTowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTA2VDA5OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMDZUMDk6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1tZW1iZXItc2VsZicsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctbWVtYmVyLTAwMScsXG4gICAgdXNlcklkOiBDVVJSRU5UX1VTRVIuaWQsXG4gICAgbmFtZTogQ1VSUkVOVF9VU0VSLm5hbWUsXG4gICAgZW1haWw6IENVUlJFTlRfVVNFUi5lbWFpbCxcbiAgICByb2xlOiAnTUVNQkVSJyxcbiAgICBzdGF0dXM6ICdBQ1RJVkUnLFxuICAgIGpvaW5lZEF0OiAnMjAyNi0wNi0wOFQwODowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTA4VDA4OjAwOjAwLjAwMFonLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMDhUMDg6MDA6MDAuMDAwWicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21lbS1tZW1iZXItMDAyJyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1tZW1iZXItMDAxJyxcbiAgICB1c2VySWQ6ICd1c2VyLW1lbWJlci1vd25lcicsXG4gICAgbmFtZTogJ1x1Njg4MVx1ODIxRicsXG4gICAgZW1haWw6ICdsaWFuZ3pob3VAcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdPV05FUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMDhUMDk6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wOFQwOTowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTA4VDA5OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tdmlld2VyLXNlbGYnLFxuICAgIG9yZ2FuaXphdGlvbklkOiAnb3JnLXZpZXdlci0wMDEnLFxuICAgIHVzZXJJZDogQ1VSUkVOVF9VU0VSLmlkLFxuICAgIG5hbWU6IENVUlJFTlRfVVNFUi5uYW1lLFxuICAgIGVtYWlsOiBDVVJSRU5UX1VTRVIuZW1haWwsXG4gICAgcm9sZTogJ1ZJRVdFUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMTBUMDg6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0xMFQwODowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTEwVDA4OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZW0tdmlld2VyLTAwMicsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctdmlld2VyLTAwMScsXG4gICAgdXNlcklkOiAndXNlci12aWV3ZXItb3duZXInLFxuICAgIG5hbWU6ICdcdTU0NjhcdTVCODEnLFxuICAgIGVtYWlsOiAnemhvdW5pbmdAcGEtZXZhbC5kZXYnLFxuICAgIHJvbGU6ICdPV05FUicsXG4gICAgc3RhdHVzOiAnQUNUSVZFJyxcbiAgICBqb2luZWRBdDogJzIwMjYtMDYtMTBUMDk6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0xMFQwOTowMDowMC4wMDBaJyxcbiAgICB1cGRhdGVkQXQ6ICcyMDI2LTA2LTEwVDA5OjAwOjAwLjAwMFonLFxuICB9LFxuXVxuXG5jb25zdCBhcGlLZXlzOiBPcmdhbml6YXRpb25BcGlLZXlbXSA9IFtcbiAge1xuICAgIGlkOiAna2V5LW93bmVyLTAwMScsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICBuYW1lOiAnXHU5RUQ4XHU4QkE0XHU3NTFGXHU0RUE3IEtleScsXG4gICAgbWFza2VkS2V5OiAnc2stbGl2ZS1vd24uLi4wMDEnLFxuICAgIHB1YmxpY0tleTogJ3BrLWxpdmUtb3duZXIwMDEnLFxuICAgIHNlY3JldEtleU1hc2tlZDogJ3NrLWxpdmUtb3duLi4uMDAxJyxcbiAgICBjcmVhdGVkQnk6IENVUlJFTlRfVVNFUi5uYW1lLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjBUMDk6MDA6MDAuMDAwWicsXG4gICAgbGFzdFVzZWRBdDogJzIwMjYtMDctMDFUMTA6MDA6MDAuMDAwWicsXG4gICAgY3JlYXRlZEF0OiAnMjAyNi0wNi0wMVQwODowMDowMC4wMDBaJyxcbiAgfSxcbiAge1xuICAgIGlkOiAna2V5LW93bmVyLTAwMicsXG4gICAgb3JnYW5pemF0aW9uSWQ6ICdvcmctb3duZXItMDAxJyxcbiAgICBuYW1lOiAnXHU2Mjc5XHU5MUNGXHU0RUZCXHU1MkExIEtleScsXG4gICAgbWFza2VkS2V5OiAnc2stbGl2ZS1vd24uLi4wMDInLFxuICAgIHB1YmxpY0tleTogJ3BrLWxpdmUtb3duZXIwMDInLFxuICAgIHNlY3JldEtleU1hc2tlZDogJ3NrLWxpdmUtb3duLi4uMDAyJyxcbiAgICBjcmVhdGVkQnk6ICdcdTY3OTdcdTk2RUEnLFxuICAgIHVwZGF0ZWRBdDogJzIwMjYtMDYtMjVUMDk6MDA6MDAuMDAwWicsXG4gICAgbGFzdFVzZWRBdDogbnVsbCxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTE1VDA4OjAwOjAwLjAwMFonLFxuICB9LFxuICB7XG4gICAgaWQ6ICdrZXktYWRtaW4tMDAxJyxcbiAgICBvcmdhbml6YXRpb25JZDogJ29yZy1hZG1pbi0wMDEnLFxuICAgIG5hbWU6ICdcdTUzRUFcdThCRkJcdTk2QzZcdTYyMTAgS2V5JyxcbiAgICBtYXNrZWRLZXk6ICdzay1saXZlLWFkbS4uLjAwMScsXG4gICAgcHVibGljS2V5OiAncGstbGl2ZS1hZG1pbjAwMScsXG4gICAgc2VjcmV0S2V5TWFza2VkOiAnc2stbGl2ZS1hZG0uLi4wMDEnLFxuICAgIGNyZWF0ZWRCeTogJ1x1Njc1Q1x1NUM5QScsXG4gICAgdXBkYXRlZEF0OiAnMjAyNi0wNi0xOFQwOTowMDowMC4wMDBaJyxcbiAgICBsYXN0VXNlZEF0OiAnMjAyNi0wNi0zMFQxMDowMDowMC4wMDBaJyxcbiAgICBjcmVhdGVkQXQ6ICcyMDI2LTA2LTA1VDA4OjAwOjAwLjAwMFonLFxuICB9LFxuXVxuXG5jb25zdCBnZXRPcmdhbml6YXRpb25CeUlkID0gKG9yZ2FuaXphdGlvbklkOiBzdHJpbmcpID0+XG4gIG9yZ2FuaXphdGlvbnMuZmluZCgob3JnYW5pemF0aW9uKSA9PiBvcmdhbml6YXRpb24uaWQgPT09IG9yZ2FuaXphdGlvbklkKVxuXG5jb25zdCBnZXRNZW1iZXJzQnlPcmdhbml6YXRpb25JZCA9IChvcmdhbml6YXRpb25JZDogc3RyaW5nKSA9PlxuICBtZW1iZXJzLmZpbHRlcigobWVtYmVyKSA9PiBtZW1iZXIub3JnYW5pemF0aW9uSWQgPT09IG9yZ2FuaXphdGlvbklkKVxuXG5jb25zdCBnZXRBY3Rvck1lbWJlciA9IChvcmdhbml6YXRpb25JZDogc3RyaW5nKSA9PlxuICBnZXRNZW1iZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZCkuZmluZChcbiAgICAobWVtYmVyKSA9PiBtZW1iZXIudXNlcklkID09PSBDVVJSRU5UX1VTRVIuaWRcbiAgKVxuXG5jb25zdCBnZXRBY3RvclJvbGUgPSAob3JnYW5pemF0aW9uSWQ6IHN0cmluZyk6IE9yZ2FuaXphdGlvblJvbGUgfCBudWxsID0+XG4gIGdldEFjdG9yTWVtYmVyKG9yZ2FuaXphdGlvbklkKT8ucm9sZSA/PyBudWxsXG5cbmNvbnN0IGVuc3VyZU9yZ2FuaXphdGlvbiA9IChvcmdhbml6YXRpb25JZDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IG9yZ2FuaXphdGlvbiA9IGdldE9yZ2FuaXphdGlvbkJ5SWQob3JnYW5pemF0aW9uSWQpXG5cbiAgaWYgKCFvcmdhbml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLm5vdEZvdW5kLCAnXHU3RUM0XHU3RUM3XHU0RTBEXHU1QjU4XHU1NzI4Jywge30pXG4gIH1cblxuICByZXR1cm4gb3JnYW5pemF0aW9uXG59XG5cbmNvbnN0IGVuc3VyZUFjdG9yUm9sZSA9IChvcmdhbml6YXRpb25JZDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGFjdG9yUm9sZSA9IGdldEFjdG9yUm9sZShvcmdhbml6YXRpb25JZClcblxuICBpZiAoIWFjdG9yUm9sZSkge1xuICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuZm9yYmlkZGVuLCAnXHU1RjUzXHU1MjREXHU3NTI4XHU2MjM3XHU0RTBEXHU1NzI4XHU4QkU1XHU3RUM0XHU3RUM3XHU1MTg1Jywge30pXG4gIH1cblxuICByZXR1cm4gYWN0b3JSb2xlXG59XG5cbmNvbnN0IGVuc3VyZU1hbmFnZVBlcm1pc3Npb24gPSAob3JnYW5pemF0aW9uSWQ6IHN0cmluZykgPT4ge1xuICBjb25zdCBhY3RvclJvbGUgPSBlbnN1cmVBY3RvclJvbGUob3JnYW5pemF0aW9uSWQpXG4gIGlmICh0eXBlb2YgYWN0b3JSb2xlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBhY3RvclJvbGVcbiAgfVxuXG4gIGlmICghY2FuTWFuYWdlTWVtYmVycyhhY3RvclJvbGUpKSB7XG4gICAgcmV0dXJuIGZhaWx1cmUoUkVTUE9OU0VfQ09ERS5mb3JiaWRkZW4sICdcdTVGNTNcdTUyNERcdTg5RDJcdTgyNzJcdTRFMERcdTgwRkRcdTdCQTFcdTc0MDZcdTYyMTBcdTU0NTgnLCB7fSlcbiAgfVxuXG4gIHJldHVybiBhY3RvclJvbGVcbn1cblxuY29uc3QgcGFyc2VQYXRoU2VnbWVudCA9IChyZXF1ZXN0OiBNb2NrUmVxdWVzdCwgaW5kZXg6IG51bWJlcikgPT4ge1xuICBpZiAodHlwZW9mIHJlcXVlc3QudXJsICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiAnJ1xuICB9XG5cbiAgY29uc3QgcGF0aG5hbWUgPSByZXF1ZXN0LnVybC5zcGxpdCgnPycpWzBdID8/ICcnXG4gIHJldHVybiBwYXRobmFtZS5zcGxpdCgnLycpW2luZGV4XSA/PyAnJ1xufVxuXG5jb25zdCBwYXJzZU9yZ2FuaXphdGlvbklkID0gKHJlcXVlc3Q6IE1vY2tSZXF1ZXN0KSA9PlxuICB0b1N0cmluZ1ZhbHVlKHJlcXVlc3QucXVlcnkub3JnYW5pemF0aW9uSWQpIHx8IHBhcnNlUGF0aFNlZ21lbnQocmVxdWVzdCwgMylcblxuY29uc3QgcGFyc2VNZW1iZXJJZCA9IChyZXF1ZXN0OiBNb2NrUmVxdWVzdCkgPT5cbiAgdG9TdHJpbmdWYWx1ZShyZXF1ZXN0LnF1ZXJ5Lm1lbWJlcklkKSB8fCBwYXJzZVBhdGhTZWdtZW50KHJlcXVlc3QsIDUpXG5cbmNvbnN0IHBhcnNlQXBpS2V5SWQgPSAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+XG4gIHRvU3RyaW5nVmFsdWUocmVxdWVzdC5xdWVyeS5hcGlLZXlJZCkgfHwgcGFyc2VQYXRoU2VnbWVudChyZXF1ZXN0LCA1KVxuXG5jb25zdCBub3JtYWxpemVLZXl3b3JkID0gKHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgPT5cbiAgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogJydcblxuY29uc3Qgbm9ybWFsaXplUm9sZUZpbHRlciA9ICh2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAubWFwKChpdGVtKSA9PiBpdGVtLnRyaW0oKS50b1VwcGVyQ2FzZSgpKVxuICAgICAgLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgT3JnYW5pemF0aW9uUm9sZSA9PlxuICAgICAgICBvcmdhbml6YXRpb25Sb2xlU2NoZW1hLnNhZmVQYXJzZShpdGVtKS5zdWNjZXNzXG4gICAgICApXG4gIH1cblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS50cmltKCkudG9VcHBlckNhc2UoKVxuICAgIHJldHVybiBvcmdhbml6YXRpb25Sb2xlU2NoZW1hLnNhZmVQYXJzZShub3JtYWxpemVkKS5zdWNjZXNzXG4gICAgICA/IFtub3JtYWxpemVkIGFzIE9yZ2FuaXphdGlvblJvbGVdXG4gICAgICA6IFtdXG4gIH1cblxuICByZXR1cm4gW11cbn1cblxuY29uc3QgZmlsdGVyTWVtYmVycyA9IChcbiAgb3JnYW5pemF0aW9uSWQ6IHN0cmluZyxcbiAga2V5d29yZDogc3RyaW5nLFxuICByb2xlRmlsdGVyOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZFxuKSA9PiB7XG4gIGNvbnN0IHNjb3BlZE1lbWJlcnMgPSBnZXRNZW1iZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZClcbiAgY29uc3Qgbm9ybWFsaXplZFJvbGVGaWx0ZXIgPSBub3JtYWxpemVSb2xlRmlsdGVyKHJvbGVGaWx0ZXIpXG4gIGNvbnN0IHJvbGVNYXRjaGVkTWVtYmVycyA9XG4gICAgbm9ybWFsaXplZFJvbGVGaWx0ZXIubGVuZ3RoID4gMFxuICAgICAgPyBzY29wZWRNZW1iZXJzLmZpbHRlcigobWVtYmVyKSA9PlxuICAgICAgICAgIG5vcm1hbGl6ZWRSb2xlRmlsdGVyLmluY2x1ZGVzKG1lbWJlci5yb2xlKVxuICAgICAgICApXG4gICAgICA6IHNjb3BlZE1lbWJlcnNcblxuICBpZiAoIWtleXdvcmQpIHtcbiAgICByZXR1cm4gcm9sZU1hdGNoZWRNZW1iZXJzXG4gIH1cblxuICByZXR1cm4gcm9sZU1hdGNoZWRNZW1iZXJzLmZpbHRlcigobWVtYmVyKSA9PlxuICAgIFttZW1iZXIubmFtZSwgbWVtYmVyLmVtYWlsLCBtZW1iZXIucm9sZSwgbWVtYmVyLnN0YXR1c11cbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5zb21lKChmaWVsZCkgPT4gZmllbGQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhrZXl3b3JkKSlcbiAgKVxufVxuXG5jb25zdCBzZXJpYWxpemVBcGlLZXkgPSAoYXBpS2V5OiBPcmdhbml6YXRpb25BcGlLZXkpOiBPcmdhbml6YXRpb25BcGlLZXkgPT4gKHtcbiAgLi4uYXBpS2V5LFxuICBtYXNrZWRLZXk6IGFwaUtleS5zZWNyZXRLZXlNYXNrZWQgPz8gYXBpS2V5Lm1hc2tlZEtleSxcbiAgc2VjcmV0S2V5OiB1bmRlZmluZWQsXG59KVxuXG5jb25zdCBtb2NrSGFuZGxlcnM6IE1vY2tNZXRob2RbXSA9IFtcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucycsXG4gICAgbWV0aG9kOiAnZ2V0JyxcbiAgICByZXNwb25zZTogKHsgcXVlcnkgfTogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IGtleXdvcmQgPSBub3JtYWxpemVLZXl3b3JkKHF1ZXJ5LmtleXdvcmQpXG4gICAgICBjb25zdCBmaWx0ZXJlZCA9IG9yZ2FuaXphdGlvbnMuZmlsdGVyKChvcmdhbml6YXRpb24pID0+IHtcbiAgICAgICAgaWYgKCFrZXl3b3JkKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBbb3JnYW5pemF0aW9uLm5hbWUsIG9yZ2FuaXphdGlvbi5kZXNjcmlwdGlvbiwgb3JnYW5pemF0aW9uLnN1YnN5c3RlbV1cbiAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgICAgLnNvbWUoKGZpZWxkKSA9PiBmaWVsZCEudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhrZXl3b3JkKSlcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBzdWNjZXNzKHBhZ2luYXRlKGZpbHRlcmVkLCBxdWVyeSkpXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucycsXG4gICAgbWV0aG9kOiAncG9zdCcsXG4gICAgcmVzcG9uc2U6ICh7IGJvZHkgfTogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG5hbWUgPSB0b1N0cmluZ1ZhbHVlKGJvZHkubmFtZSlcbiAgICAgIGNvbnN0IHN1YnN5c3RlbSA9IHRvU3RyaW5nVmFsdWUoYm9keS5zdWJzeXN0ZW0pXG5cbiAgICAgIGlmICghbmFtZSkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLmJhZFJlcXVlc3QsICdcdTdFQzRcdTdFQzdcdTU0MERcdTc5RjBcdTRFMERcdTgwRkRcdTRFM0FcdTdBN0EnLCB7fSlcbiAgICAgIH1cblxuICAgICAgaWYgKCFzdWJzeXN0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGZhaWx1cmUoUkVTUE9OU0VfQ09ERS5iYWRSZXF1ZXN0LCAnXHU2MjQwXHU1QzVFXHU1QjUwXHU3Q0ZCXHU3RURGXHU0RTBEXHU4MEZEXHU0RTNBXHU3QTdBJywge30pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KClcbiAgICAgIGNvbnN0IGNyZWF0ZWRBdCA9IG5vdygpXG4gICAgICBjb25zdCBvcmdhbml6YXRpb25JZCA9IGBvcmctJHt0aW1lc3RhbXB9YFxuICAgICAgY29uc3QgcHVibGljS2V5ID0gYHBrLWxpdmUtJHt0aW1lc3RhbXB9YFxuICAgICAgY29uc3Qgc2VjcmV0S2V5ID0gYHNrLWxpdmUtJHt0aW1lc3RhbXB9JHtNYXRoLnJhbmRvbSgpXG4gICAgICAgIC50b1N0cmluZygzNilcbiAgICAgICAgLnNsaWNlKDIsIDgpfWBcblxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uOiBPcmdhbml6YXRpb24gPSB7XG4gICAgICAgIGlkOiBvcmdhbml6YXRpb25JZCxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgdHlwZW9mIGJvZHkuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gYm9keS5kZXNjcmlwdGlvbiA6IG51bGwsXG4gICAgICAgIHN1YnN5c3RlbSxcbiAgICAgICAgcHVibGljS2V5LFxuICAgICAgICBzZWNyZXRLZXlNYXNrZWQ6IG1hc2tTZWNyZXRLZXkoc2VjcmV0S2V5KSxcbiAgICAgICAgY3JlYXRlZEJ5OiBDVVJSRU5UX1VTRVIubmFtZSxcbiAgICAgICAgY3JlYXRlZEF0LFxuICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRBdCxcbiAgICAgIH1cblxuICAgICAgb3JnYW5pemF0aW9ucy51bnNoaWZ0KG9yZ2FuaXphdGlvbilcbiAgICAgIG1lbWJlcnMudW5zaGlmdCh7XG4gICAgICAgIGlkOiBgbWVtLSR7dGltZXN0YW1wfWAsXG4gICAgICAgIG9yZ2FuaXphdGlvbklkLFxuICAgICAgICB1c2VySWQ6IENVUlJFTlRfVVNFUi5pZCxcbiAgICAgICAgbmFtZTogQ1VSUkVOVF9VU0VSLm5hbWUsXG4gICAgICAgIGVtYWlsOiBDVVJSRU5UX1VTRVIuZW1haWwsXG4gICAgICAgIHJvbGU6ICdPV05FUicsXG4gICAgICAgIHN0YXR1czogJ0FDVElWRScsXG4gICAgICAgIGpvaW5lZEF0OiBjcmVhdGVkQXQsXG4gICAgICAgIGNyZWF0ZWRBdCxcbiAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkQXQsXG4gICAgICB9KVxuXG4gICAgICBhcGlLZXlzLnVuc2hpZnQoe1xuICAgICAgICBpZDogYGtleS0ke3RpbWVzdGFtcH1gLFxuICAgICAgICBvcmdhbml6YXRpb25JZCxcbiAgICAgICAgbmFtZTogJ1x1OUVEOFx1OEJBNFx1NTIxRFx1NTlDQlx1NTMxNiBLZXknLFxuICAgICAgICBtYXNrZWRLZXk6IG1hc2tTZWNyZXRLZXkoc2VjcmV0S2V5KSxcbiAgICAgICAgcHVibGljS2V5LFxuICAgICAgICBzZWNyZXRLZXlNYXNrZWQ6IG1hc2tTZWNyZXRLZXkoc2VjcmV0S2V5KSxcbiAgICAgICAgc2VjcmV0S2V5LFxuICAgICAgICBjcmVhdGVkQnk6IENVUlJFTlRfVVNFUi5uYW1lLFxuICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRBdCxcbiAgICAgICAgbGFzdFVzZWRBdDogbnVsbCxcbiAgICAgICAgY3JlYXRlZEF0LFxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIHN1Y2Nlc3Moe1xuICAgICAgICAuLi5vcmdhbml6YXRpb24sXG4gICAgICAgIHNlY3JldEtleSxcbiAgICAgIH0pXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucy86b3JnYW5pemF0aW9uSWQvbWVtYmVycycsXG4gICAgbWV0aG9kOiAnZ2V0JyxcbiAgICByZXNwb25zZTogKHJlcXVlc3Q6IE1vY2tSZXF1ZXN0KSA9PiB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25JZCA9IHBhcnNlT3JnYW5pemF0aW9uSWQocmVxdWVzdClcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbiA9IGVuc3VyZU9yZ2FuaXphdGlvbihvcmdhbml6YXRpb25JZClcblxuICAgICAgaWYgKCdjb2RlJyBpbiBvcmdhbml6YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG9yZ2FuaXphdGlvblxuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXl3b3JkID0gbm9ybWFsaXplS2V5d29yZChyZXF1ZXN0LnF1ZXJ5LmtleXdvcmQpXG4gICAgICBjb25zdCBmaWx0ZXJlZCA9IGZpbHRlck1lbWJlcnMob3JnYW5pemF0aW9uSWQsIGtleXdvcmQsIHJlcXVlc3QucXVlcnkucm9sZSlcblxuICAgICAgcmV0dXJuIHN1Y2Nlc3MocGFnaW5hdGUoZmlsdGVyZWQsIHJlcXVlc3QucXVlcnkpKVxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICB1cmw6ICcvYXBpL29yZ2FuaXphdGlvbnMvOm9yZ2FuaXphdGlvbklkL21lbWJlcnMnLFxuICAgIG1ldGhvZDogJ3Bvc3QnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gZW5zdXJlT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKVxuXG4gICAgICBpZiAoJ2NvZGUnIGluIG9yZ2FuaXphdGlvbikge1xuICAgICAgICByZXR1cm4gb3JnYW5pemF0aW9uXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFjdG9yUm9sZSA9IGVuc3VyZU1hbmFnZVBlcm1pc3Npb24ob3JnYW5pemF0aW9uSWQpXG4gICAgICBpZiAodHlwZW9mIGFjdG9yUm9sZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGFjdG9yUm9sZVxuICAgICAgfVxuXG4gICAgICBjb25zdCBlbWFpbCA9IHRvU3RyaW5nVmFsdWUocmVxdWVzdC5ib2R5LmVtYWlsKS50b0xvd2VyQ2FzZSgpXG4gICAgICBjb25zdCBuYW1lID0gdG9TdHJpbmdWYWx1ZShyZXF1ZXN0LmJvZHkubmFtZSlcbiAgICAgIGNvbnN0IHJvbGUgPSBwYXJzZU9yZ2FuaXphdGlvblJvbGUocmVxdWVzdC5ib2R5LnJvbGUpXG5cbiAgICAgIGlmICghZW1haWwgfHwgIXJvbGUpIHtcbiAgICAgICAgcmV0dXJuIGZhaWx1cmUoUkVTUE9OU0VfQ09ERS5iYWRSZXF1ZXN0LCAnXHU2MjEwXHU1NDU4XHU4OUQyXHU4MjcyXHU0RTBEXHU1NDA4XHU2Q0Q1Jywge30pXG4gICAgICB9XG5cbiAgICAgIGlmICghY2FuQXNzaWduUm9sZShhY3RvclJvbGUsIHJvbGUpKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuZm9yYmlkZGVuLCAnXHU1RjUzXHU1MjREXHU4OUQyXHU4MjcyXHU0RTBEXHU4MEZEXHU2Mzg4XHU0RTg4XHU4QkU1XHU2NzQzXHU5NjUwJywge30pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4aXN0cyA9IGdldE1lbWJlcnNCeU9yZ2FuaXphdGlvbklkKG9yZ2FuaXphdGlvbklkKS5zb21lKFxuICAgICAgICAobWVtYmVyKSA9PiBtZW1iZXIuZW1haWwgPT09IGVtYWlsXG4gICAgICApXG4gICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuYmFkUmVxdWVzdCwgJ1x1OEJFNVx1NjIxMFx1NTQ1OFx1NURGMlx1NUI1OFx1NTcyOCcsIHt9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBjcmVhdGVkQXQgPSBub3coKVxuICAgICAgY29uc3QgbmV4dElkID0gYG1lbS0ke0RhdGUubm93KCl9YFxuICAgICAgY29uc3QgZW1haWxQcmVmaXggPSBlbWFpbC5zcGxpdCgnQCcpWzBdID8/ICduZXctdXNlcidcblxuICAgICAgY29uc3QgbWVtYmVyOiBPcmdhbml6YXRpb25NZW1iZXIgPSB7XG4gICAgICAgIGlkOiBuZXh0SWQsXG4gICAgICAgIG9yZ2FuaXphdGlvbklkLFxuICAgICAgICB1c2VySWQ6IGB1c2VyLSR7ZW1haWxQcmVmaXh9YCxcbiAgICAgICAgbmFtZTogbmFtZSB8fCBlbWFpbFByZWZpeCxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIHJvbGUsXG4gICAgICAgIHN0YXR1czogJ0lOVklURUQnLFxuICAgICAgICBqb2luZWRBdDogY3JlYXRlZEF0LFxuICAgICAgICBjcmVhdGVkQXQsXG4gICAgICAgIHVwZGF0ZWRBdDogY3JlYXRlZEF0LFxuICAgICAgfVxuXG4gICAgICBtZW1iZXJzLnVuc2hpZnQobWVtYmVyKVxuXG4gICAgICByZXR1cm4gc3VjY2VzcyhtZW1iZXIpXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucy86b3JnYW5pemF0aW9uSWQvbWVtYmVycy86bWVtYmVySWQnLFxuICAgIG1ldGhvZDogJ3BhdGNoJyxcbiAgICByZXNwb25zZTogKHJlcXVlc3Q6IE1vY2tSZXF1ZXN0KSA9PiB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25JZCA9IHBhcnNlT3JnYW5pemF0aW9uSWQocmVxdWVzdClcbiAgICAgIGNvbnN0IG1lbWJlcklkID0gcGFyc2VNZW1iZXJJZChyZXF1ZXN0KVxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gZW5zdXJlT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKVxuXG4gICAgICBpZiAoJ2NvZGUnIGluIG9yZ2FuaXphdGlvbikge1xuICAgICAgICByZXR1cm4gb3JnYW5pemF0aW9uXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFjdG9yUm9sZSA9IGVuc3VyZU1hbmFnZVBlcm1pc3Npb24ob3JnYW5pemF0aW9uSWQpXG4gICAgICBpZiAodHlwZW9mIGFjdG9yUm9sZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGFjdG9yUm9sZVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0YXJnZXQgPSBtZW1iZXJzLmZpbmQoXG4gICAgICAgIChtZW1iZXIpID0+XG4gICAgICAgICAgbWVtYmVyLm9yZ2FuaXphdGlvbklkID09PSBvcmdhbml6YXRpb25JZCAmJiBtZW1iZXIuaWQgPT09IG1lbWJlcklkXG4gICAgICApXG4gICAgICBpZiAoIXRhcmdldCkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLm5vdEZvdW5kLCAnXHU2MjEwXHU1NDU4XHU0RTBEXHU1QjU4XHU1NzI4Jywge30pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5leHRSb2xlID0gcGFyc2VPcmdhbml6YXRpb25Sb2xlKHJlcXVlc3QuYm9keS5yb2xlKVxuICAgICAgaWYgKCFuZXh0Um9sZSkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLmJhZFJlcXVlc3QsICdcdTYyMTBcdTU0NThcdTg5RDJcdTgyNzJcdTRFMERcdTU0MDhcdTZDRDUnLCB7fSlcbiAgICAgIH1cblxuICAgICAgaWYgKCFjYW5Bc3NpZ25Sb2xlKGFjdG9yUm9sZSwgbmV4dFJvbGUpKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuZm9yYmlkZGVuLCAnXHU1RjUzXHU1MjREXHU4OUQyXHU4MjcyXHU0RTBEXHU4MEZEXHU2Mzg4XHU0RTg4XHU4QkU1XHU2NzQzXHU5NjUwJywge30pXG4gICAgICB9XG5cbiAgICAgIGlmICh0YXJnZXQucm9sZSA9PT0gJ09XTkVSJyAmJiBuZXh0Um9sZSAhPT0gJ09XTkVSJykge1xuICAgICAgICBjb25zdCBvd25lckNvdW50ID0gZ2V0TWVtYmVyc0J5T3JnYW5pemF0aW9uSWQob3JnYW5pemF0aW9uSWQpLmZpbHRlcihcbiAgICAgICAgICAobWVtYmVyKSA9PiBtZW1iZXIucm9sZSA9PT0gJ09XTkVSJ1xuICAgICAgICApLmxlbmd0aFxuICAgICAgICBjb25zdCByZW1vdmVDaGVjayA9IGNhblJlbW92ZU1lbWJlcihhY3RvclJvbGUsICdPV05FUicsIG93bmVyQ291bnQpXG4gICAgICAgIGlmICghcmVtb3ZlQ2hlY2suYWxsb3dlZCkge1xuICAgICAgICAgIHJldHVybiBmYWlsdXJlKFxuICAgICAgICAgICAgUkVTUE9OU0VfQ09ERS5mb3JiaWRkZW4sXG4gICAgICAgICAgICByZW1vdmVDaGVjay5yZWFzb24gPz8gJ1x1NUY1M1x1NTI0RFx1ODlEMlx1ODI3Mlx1NEUwRFx1ODBGRFx1NTNEOFx1NjZGNFx1OEJFNVx1NjIxMFx1NTQ1OCcsXG4gICAgICAgICAgICB7fVxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0YXJnZXQucm9sZSA9IG5leHRSb2xlXG4gICAgICB0YXJnZXQudXBkYXRlZEF0ID0gbm93KClcblxuICAgICAgcmV0dXJuIHN1Y2Nlc3ModGFyZ2V0KVxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICB1cmw6ICcvYXBpL29yZ2FuaXphdGlvbnMvOm9yZ2FuaXphdGlvbklkL21lbWJlcnMvOm1lbWJlcklkJyxcbiAgICBtZXRob2Q6ICdkZWxldGUnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3QgbWVtYmVySWQgPSBwYXJzZU1lbWJlcklkKHJlcXVlc3QpXG4gICAgICBjb25zdCBvcmdhbml6YXRpb24gPSBlbnN1cmVPcmdhbml6YXRpb24ob3JnYW5pemF0aW9uSWQpXG5cbiAgICAgIGlmICgnY29kZScgaW4gb3JnYW5pemF0aW9uKSB7XG4gICAgICAgIHJldHVybiBvcmdhbml6YXRpb25cbiAgICAgIH1cblxuICAgICAgY29uc3QgYWN0b3JSb2xlID0gZW5zdXJlTWFuYWdlUGVybWlzc2lvbihvcmdhbml6YXRpb25JZClcbiAgICAgIGlmICh0eXBlb2YgYWN0b3JSb2xlICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gYWN0b3JSb2xlXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1lbWJlckluZGV4ID0gbWVtYmVycy5maW5kSW5kZXgoXG4gICAgICAgIChtZW1iZXIpID0+XG4gICAgICAgICAgbWVtYmVyLm9yZ2FuaXphdGlvbklkID09PSBvcmdhbml6YXRpb25JZCAmJiBtZW1iZXIuaWQgPT09IG1lbWJlcklkXG4gICAgICApXG4gICAgICBpZiAobWVtYmVySW5kZXggPCAwKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUubm90Rm91bmQsICdcdTYyMTBcdTU0NThcdTRFMERcdTVCNThcdTU3MjgnLCB7fSlcbiAgICAgIH1cblxuICAgICAgY29uc3QgdGFyZ2V0ID0gbWVtYmVyc1ttZW1iZXJJbmRleF1cbiAgICAgIGNvbnN0IG93bmVyQ291bnQgPSBnZXRNZW1iZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZCkuZmlsdGVyKFxuICAgICAgICAobWVtYmVyKSA9PiBtZW1iZXIucm9sZSA9PT0gJ09XTkVSJ1xuICAgICAgKS5sZW5ndGhcbiAgICAgIGNvbnN0IHJlbW92ZUNoZWNrID0gY2FuUmVtb3ZlTWVtYmVyKGFjdG9yUm9sZSwgdGFyZ2V0LnJvbGUsIG93bmVyQ291bnQpXG5cbiAgICAgIGlmICghcmVtb3ZlQ2hlY2suYWxsb3dlZCkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShcbiAgICAgICAgICBSRVNQT05TRV9DT0RFLmZvcmJpZGRlbixcbiAgICAgICAgICByZW1vdmVDaGVjay5yZWFzb24gPz8gJ1x1NUY1M1x1NTI0RFx1ODlEMlx1ODI3Mlx1NEUwRFx1ODBGRFx1NTIyMFx1OTY2NFx1NjIxMFx1NTQ1OCcsXG4gICAgICAgICAge31cbiAgICAgICAgKVxuICAgICAgfVxuXG4gICAgICBtZW1iZXJzLnNwbGljZShtZW1iZXJJbmRleCwgMSlcblxuICAgICAgcmV0dXJuIHN1Y2Nlc3Moe30pXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucy86b3JnYW5pemF0aW9uSWQvbWVtYmVycy9pbXBvcnQnLFxuICAgIG1ldGhvZDogJ3Bvc3QnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gZW5zdXJlT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKVxuXG4gICAgICBpZiAoJ2NvZGUnIGluIG9yZ2FuaXphdGlvbikge1xuICAgICAgICByZXR1cm4gb3JnYW5pemF0aW9uXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFjdG9yUm9sZSA9IGVuc3VyZU1hbmFnZVBlcm1pc3Npb24ob3JnYW5pemF0aW9uSWQpXG4gICAgICBpZiAodHlwZW9mIGFjdG9yUm9sZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGFjdG9yUm9sZVxuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXlsb2FkTWVtYmVycyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5ib2R5Lm1lbWJlcnMpXG4gICAgICAgID8gcmVxdWVzdC5ib2R5Lm1lbWJlcnNcbiAgICAgICAgOiBbXVxuXG4gICAgICBjb25zdCBmYWlsdXJlczogQXJyYXk8eyByb3c6IG51bWJlcjsgZW1haWw6IHN0cmluZzsgcmVhc29uOiBzdHJpbmcgfT4gPSBbXVxuICAgICAgY29uc3QgaW1wb3J0ZWQ6IE9yZ2FuaXphdGlvbk1lbWJlcltdID0gW11cblxuICAgICAgcGF5bG9hZE1lbWJlcnMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3QgZW1haWwgPVxuICAgICAgICAgIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsXG4gICAgICAgICAgICA/IHRvU3RyaW5nVmFsdWUoKGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmVtYWlsKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgICA6ICcnXG4gICAgICAgIGNvbnN0IG5hbWUgPVxuICAgICAgICAgIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsXG4gICAgICAgICAgICA/IHRvU3RyaW5nVmFsdWUoKGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLm5hbWUpXG4gICAgICAgICAgICA6ICcnXG4gICAgICAgIGNvbnN0IHJvbGUgPVxuICAgICAgICAgIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsXG4gICAgICAgICAgICA/IHBhcnNlT3JnYW5pemF0aW9uUm9sZSgoaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucm9sZSlcbiAgICAgICAgICAgIDogJydcblxuICAgICAgICBpZiAoIWVtYWlsIHx8ICFyb2xlKSB7XG4gICAgICAgICAgZmFpbHVyZXMucHVzaCh7XG4gICAgICAgICAgICByb3c6IGluZGV4ICsgMSxcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgICAgcmVhc29uOiAnXHU2MjEwXHU1NDU4XHU1M0MyXHU2NTcwXHU0RTBEXHU1QjhDXHU2NTc0JyxcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjYW5Bc3NpZ25Sb2xlKGFjdG9yUm9sZSwgcm9sZSkpIHtcbiAgICAgICAgICBmYWlsdXJlcy5wdXNoKHtcbiAgICAgICAgICAgIHJvdzogaW5kZXggKyAxLFxuICAgICAgICAgICAgZW1haWwsXG4gICAgICAgICAgICByZWFzb246ICdcdTVGNTNcdTUyNERcdTg5RDJcdTgyNzJcdTRFMERcdTgwRkRcdTYzODhcdTRFODhcdThCRTVcdTY3NDNcdTk2NTAnLFxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdHMgPSBnZXRNZW1iZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZCkuc29tZShcbiAgICAgICAgICAobWVtYmVyKSA9PiBtZW1iZXIuZW1haWwgPT09IGVtYWlsXG4gICAgICAgIClcbiAgICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICAgIGZhaWx1cmVzLnB1c2goe1xuICAgICAgICAgICAgcm93OiBpbmRleCArIDEsXG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICAgIHJlYXNvbjogJ1x1OEJFNVx1NjIxMFx1NTQ1OFx1NURGMlx1NUI1OFx1NTcyOCcsXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNyZWF0ZWRBdCA9IG5vdygpXG4gICAgICAgIGNvbnN0IGVtYWlsUHJlZml4ID0gZW1haWwuc3BsaXQoJ0AnKVswXSA/PyBgaW1wb3J0LSR7aW5kZXggKyAxfWBcbiAgICAgICAgY29uc3QgbWVtYmVyOiBPcmdhbml6YXRpb25NZW1iZXIgPSB7XG4gICAgICAgICAgaWQ6IGBtZW0tJHtEYXRlLm5vdygpfS0ke2luZGV4ICsgMX1gLFxuICAgICAgICAgIG9yZ2FuaXphdGlvbklkLFxuICAgICAgICAgIHVzZXJJZDogYHVzZXItJHtlbWFpbFByZWZpeH1gLFxuICAgICAgICAgIG5hbWU6IG5hbWUgfHwgZW1haWxQcmVmaXgsXG4gICAgICAgICAgZW1haWwsXG4gICAgICAgICAgcm9sZSxcbiAgICAgICAgICBzdGF0dXM6ICdJTlZJVEVEJyxcbiAgICAgICAgICBqb2luZWRBdDogY3JlYXRlZEF0LFxuICAgICAgICAgIGNyZWF0ZWRBdCxcbiAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRBdCxcbiAgICAgICAgfVxuXG4gICAgICAgIG1lbWJlcnMudW5zaGlmdChtZW1iZXIpXG4gICAgICAgIGltcG9ydGVkLnB1c2gobWVtYmVyKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIHN1Y2Nlc3Moe1xuICAgICAgICB0b3RhbDogaW1wb3J0ZWQubGVuZ3RoLFxuICAgICAgICBkYXRhczogaW1wb3J0ZWQsXG4gICAgICAgIGZhaWx1cmVzLFxuICAgICAgfSlcbiAgICB9LFxuICB9LFxuICB7XG4gICAgdXJsOiAnL2FwaS9vcmdhbml6YXRpb25zLzpvcmdhbml6YXRpb25JZC9hcGkta2V5cycsXG4gICAgbWV0aG9kOiAnZ2V0JyxcbiAgICByZXNwb25zZTogKHJlcXVlc3Q6IE1vY2tSZXF1ZXN0KSA9PiB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25JZCA9IHBhcnNlT3JnYW5pemF0aW9uSWQocmVxdWVzdClcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbiA9IGVuc3VyZU9yZ2FuaXphdGlvbihvcmdhbml6YXRpb25JZClcblxuICAgICAgaWYgKCdjb2RlJyBpbiBvcmdhbml6YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG9yZ2FuaXphdGlvblxuICAgICAgfVxuXG4gICAgICBjb25zdCBhY3RvclJvbGUgPSBlbnN1cmVBY3RvclJvbGUob3JnYW5pemF0aW9uSWQpXG4gICAgICBpZiAodHlwZW9mIGFjdG9yUm9sZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGFjdG9yUm9sZVxuICAgICAgfVxuXG4gICAgICBpZiAoIWNhbk1hbmFnZU1lbWJlcnMoYWN0b3JSb2xlKSkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLmZvcmJpZGRlbiwgJ1x1NUY1M1x1NTI0RFx1ODlEMlx1ODI3Mlx1NEUwRFx1ODBGRFx1NjdFNVx1NzcwQiBBUEkgS2V5Jywge30pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleXdvcmQgPSBub3JtYWxpemVLZXl3b3JkKHJlcXVlc3QucXVlcnkua2V5d29yZClcbiAgICAgIGNvbnN0IHNjb3BlZEtleXMgPSBhcGlLZXlzXG4gICAgICAgIC5maWx0ZXIoKGFwaUtleSkgPT4gYXBpS2V5Lm9yZ2FuaXphdGlvbklkID09PSBvcmdhbml6YXRpb25JZClcbiAgICAgICAgLmZpbHRlcigoYXBpS2V5KSA9PiB7XG4gICAgICAgICAgaWYgKCFrZXl3b3JkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBbYXBpS2V5Lm5hbWUsIGFwaUtleS5wdWJsaWNLZXksIGFwaUtleS5jcmVhdGVkQnldLnNvbWUoKHZhbHVlKSA9PlxuICAgICAgICAgICAgdmFsdWU/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoa2V5d29yZClcbiAgICAgICAgICApXG4gICAgICAgIH0pXG4gICAgICAgIC5tYXAoc2VyaWFsaXplQXBpS2V5KVxuXG4gICAgICByZXR1cm4gc3VjY2VzcyhwYWdpbmF0ZShzY29wZWRLZXlzLCByZXF1ZXN0LnF1ZXJ5KSlcbiAgICB9LFxuICB9LFxuICB7XG4gICAgdXJsOiAnL2FwaS9vcmdhbml6YXRpb25zLzpvcmdhbml6YXRpb25JZC9hcGkta2V5cycsXG4gICAgbWV0aG9kOiAncG9zdCcsXG4gICAgcmVzcG9uc2U6IChyZXF1ZXN0OiBNb2NrUmVxdWVzdCkgPT4ge1xuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uSWQgPSBwYXJzZU9yZ2FuaXphdGlvbklkKHJlcXVlc3QpXG4gICAgICBjb25zdCBvcmdhbml6YXRpb24gPSBlbnN1cmVPcmdhbml6YXRpb24ob3JnYW5pemF0aW9uSWQpXG5cbiAgICAgIGlmICgnY29kZScgaW4gb3JnYW5pemF0aW9uKSB7XG4gICAgICAgIHJldHVybiBvcmdhbml6YXRpb25cbiAgICAgIH1cblxuICAgICAgY29uc3QgYWN0b3JSb2xlID0gZW5zdXJlQWN0b3JSb2xlKG9yZ2FuaXphdGlvbklkKVxuICAgICAgaWYgKHR5cGVvZiBhY3RvclJvbGUgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBhY3RvclJvbGVcbiAgICAgIH1cblxuICAgICAgaWYgKCFjYW5NYW5hZ2VNZW1iZXJzKGFjdG9yUm9sZSkpIHtcbiAgICAgICAgcmV0dXJuIGZhaWx1cmUoUkVTUE9OU0VfQ09ERS5mb3JiaWRkZW4sICdcdTVGNTNcdTUyNERcdTg5RDJcdTgyNzJcdTRFMERcdTgwRkRcdTUyMUJcdTVFRkEgQVBJIEtleScsIHt9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdG9TdHJpbmdWYWx1ZShyZXF1ZXN0LmJvZHkubmFtZSlcbiAgICAgIGlmICghbmFtZSkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLmJhZFJlcXVlc3QsICdBUEkgS2V5IFx1NTQwRFx1NzlGMFx1NEUwRFx1ODBGRFx1NEUzQVx1N0E3QScsIHt9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpXG4gICAgICBjb25zdCBjcmVhdGVkQXQgPSBub3coKVxuICAgICAgY29uc3QgcHVibGljS2V5ID0gYHBrLWxpdmUtJHt0aW1lc3RhbXB9YFxuICAgICAgY29uc3Qgc2VjcmV0S2V5ID0gYHNrLWxpdmUtJHt0aW1lc3RhbXB9JHtNYXRoLnJhbmRvbSgpXG4gICAgICAgIC50b1N0cmluZygzNilcbiAgICAgICAgLnNsaWNlKDIsIDgpfWBcbiAgICAgIGNvbnN0IHNlY3JldEtleU1hc2tlZCA9IG1hc2tTZWNyZXRLZXkoc2VjcmV0S2V5KVxuXG4gICAgICBjb25zdCBhcGlLZXk6IE9yZ2FuaXphdGlvbkFwaUtleSA9IHtcbiAgICAgICAgaWQ6IGBrZXktJHt0aW1lc3RhbXB9YCxcbiAgICAgICAgb3JnYW5pemF0aW9uSWQsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIG1hc2tlZEtleTogc2VjcmV0S2V5TWFza2VkLFxuICAgICAgICBwdWJsaWNLZXksXG4gICAgICAgIHNlY3JldEtleU1hc2tlZCxcbiAgICAgICAgc2VjcmV0S2V5LFxuICAgICAgICBjcmVhdGVkQnk6IENVUlJFTlRfVVNFUi5uYW1lLFxuICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRBdCxcbiAgICAgICAgbGFzdFVzZWRBdDogbnVsbCxcbiAgICAgICAgY3JlYXRlZEF0LFxuICAgICAgfVxuXG4gICAgICBhcGlLZXlzLnVuc2hpZnQoYXBpS2V5KVxuXG4gICAgICByZXR1cm4gc3VjY2VzcyhhcGlLZXkpXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIHVybDogJy9hcGkvb3JnYW5pemF0aW9ucy86b3JnYW5pemF0aW9uSWQvYXBpLWtleXMvOmFwaUtleUlkJyxcbiAgICBtZXRob2Q6ICdkZWxldGUnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3QgYXBpS2V5SWQgPSBwYXJzZUFwaUtleUlkKHJlcXVlc3QpXG4gICAgICBjb25zdCBvcmdhbml6YXRpb24gPSBlbnN1cmVPcmdhbml6YXRpb24ob3JnYW5pemF0aW9uSWQpXG5cbiAgICAgIGlmICgnY29kZScgaW4gb3JnYW5pemF0aW9uKSB7XG4gICAgICAgIHJldHVybiBvcmdhbml6YXRpb25cbiAgICAgIH1cblxuICAgICAgY29uc3QgYWN0b3JSb2xlID0gZW5zdXJlQWN0b3JSb2xlKG9yZ2FuaXphdGlvbklkKVxuICAgICAgaWYgKHR5cGVvZiBhY3RvclJvbGUgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBhY3RvclJvbGVcbiAgICAgIH1cblxuICAgICAgaWYgKCFjYW5NYW5hZ2VNZW1iZXJzKGFjdG9yUm9sZSkpIHtcbiAgICAgICAgcmV0dXJuIGZhaWx1cmUoUkVTUE9OU0VfQ09ERS5mb3JiaWRkZW4sICdcdTVGNTNcdTUyNERcdTg5RDJcdTgyNzJcdTRFMERcdTgwRkRcdTUyMjBcdTk2NjQgQVBJIEtleScsIHt9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBhcGlLZXlJbmRleCA9IGFwaUtleXMuZmluZEluZGV4KFxuICAgICAgICAoYXBpS2V5KSA9PlxuICAgICAgICAgIGFwaUtleS5vcmdhbml6YXRpb25JZCA9PT0gb3JnYW5pemF0aW9uSWQgJiYgYXBpS2V5LmlkID09PSBhcGlLZXlJZFxuICAgICAgKVxuICAgICAgaWYgKGFwaUtleUluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLm5vdEZvdW5kLCAnQVBJIEtleSBcdTRFMERcdTVCNThcdTU3MjgnLCB7fSlcbiAgICAgIH1cblxuICAgICAgYXBpS2V5cy5zcGxpY2UoYXBpS2V5SW5kZXgsIDEpXG5cbiAgICAgIHJldHVybiBzdWNjZXNzKHt9KVxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICB1cmw6ICcvYXBpL29yZ2FuaXphdGlvbnMvOm9yZ2FuaXphdGlvbklkJyxcbiAgICBtZXRob2Q6ICdnZXQnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gZW5zdXJlT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKVxuXG4gICAgICBpZiAoJ2NvZGUnIGluIG9yZ2FuaXphdGlvbikge1xuICAgICAgICByZXR1cm4gb3JnYW5pemF0aW9uXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdWNjZXNzKG9yZ2FuaXphdGlvbilcbiAgICB9LFxuICB9LFxuICB7XG4gICAgdXJsOiAnL2FwaS9vcmdhbml6YXRpb25zLzpvcmdhbml6YXRpb25JZCcsXG4gICAgbWV0aG9kOiAncGF0Y2gnLFxuICAgIHJlc3BvbnNlOiAocmVxdWVzdDogTW9ja1JlcXVlc3QpID0+IHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvbklkID0gcGFyc2VPcmdhbml6YXRpb25JZChyZXF1ZXN0KVxuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gZW5zdXJlT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKVxuXG4gICAgICBpZiAoJ2NvZGUnIGluIG9yZ2FuaXphdGlvbikge1xuICAgICAgICByZXR1cm4gb3JnYW5pemF0aW9uXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFjdG9yUm9sZSA9IGVuc3VyZUFjdG9yUm9sZShvcmdhbml6YXRpb25JZClcbiAgICAgIGlmICh0eXBlb2YgYWN0b3JSb2xlICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gYWN0b3JSb2xlXG4gICAgICB9XG5cbiAgICAgIGlmICghY2FuTWFuYWdlTWVtYmVycyhhY3RvclJvbGUpKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuZm9yYmlkZGVuLCAnXHU1RjUzXHU1MjREXHU4OUQyXHU4MjcyXHU0RTBEXHU4MEZEXHU3RjE2XHU4RjkxXHU3RUM0XHU3RUM3XHU0RkUxXHU2MDZGJywge30pXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdC5ib2R5Lm5hbWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBmYWlsdXJlKFJFU1BPTlNFX0NPREUuYmFkUmVxdWVzdCwgJ1x1N0VDNFx1N0VDN1x1NTQwRFx1NzlGMFx1NEUwRFx1NTE0MVx1OEJCOFx1NEZFRVx1NjUzOScsIHt9KVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiByZXF1ZXN0LmJvZHkuc3Vic3lzdGVtID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAhcmVxdWVzdC5ib2R5LnN1YnN5c3RlbS50cmltKClcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFpbHVyZShSRVNQT05TRV9DT0RFLmJhZFJlcXVlc3QsICdcdTYyNDBcdTVDNUVcdTVCNTBcdTdDRkJcdTdFREZcdTRFMERcdTgwRkRcdTRFM0FcdTdBN0EnLCB7fSlcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0LmJvZHkuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIG9yZ2FuaXphdGlvbi5kZXNjcmlwdGlvbiA9IHJlcXVlc3QuYm9keS5kZXNjcmlwdGlvblxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QuYm9keS5zdWJzeXN0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIG9yZ2FuaXphdGlvbi5zdWJzeXN0ZW0gPSByZXF1ZXN0LmJvZHkuc3Vic3lzdGVtXG4gICAgICB9XG5cbiAgICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBub3coKVxuXG4gICAgICByZXR1cm4gc3VjY2Vzcyhvcmdhbml6YXRpb24pXG4gICAgfSxcbiAgfSxcbl1cblxuZXhwb3J0IGRlZmF1bHQgbW9ja0hhbmRsZXJzXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBT08sU0FBUyxpQkFBaUIsTUFBaUM7QUFDaEUsU0FBTyxTQUFTLFdBQVcsU0FBUztBQUN0QztBQUVPLFNBQVMsY0FDZCxXQUNBLFlBQ1M7QUFDVCxNQUFJLGNBQWMsU0FBUztBQUN6QixXQUFPO0FBQUEsRUFDVDtBQUVBLE1BQUksY0FBYyxTQUFTO0FBQ3pCLFdBQU8sZUFBZTtBQUFBLEVBQ3hCO0FBRUEsU0FBTztBQUNUO0FBRU8sU0FBUyxnQkFDZCxXQUNBLFlBQ0EsWUFDb0I7QUFDcEIsTUFBSSxDQUFDLGlCQUFpQixTQUFTLEdBQUc7QUFDaEMsV0FBTztBQUFBLE1BQ0wsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUNGO0FBRUEsTUFBSSxjQUFjLFdBQVcsZUFBZSxTQUFTO0FBQ25ELFdBQU87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
