export type SceneCreateRequestState = {
  nextRequestId: number
  pendingRequestId: number
}

export function createInitialSceneCreateRequestState(): SceneCreateRequestState {
  return {
    nextRequestId: 0,
    pendingRequestId: 0,
  }
}

export function requestSceneCreate(
  state: SceneCreateRequestState
): SceneCreateRequestState {
  const nextRequestId = state.nextRequestId + 1
  return {
    nextRequestId,
    pendingRequestId: nextRequestId,
  }
}

export function consumeSceneCreateRequest(
  state: SceneCreateRequestState,
  requestId: number
): SceneCreateRequestState {
  if (requestId <= 0 || state.pendingRequestId !== requestId) return state
  return {
    ...state,
    pendingRequestId: 0,
  }
}

export function getSceneCollectionQueryKeys<TApi>(
  api: TApi,
  projectId: string
) {
  return {
    projectScenes: ['project-scenes', api, projectId] as const,
    availableScenes: ['available-scenes', api, projectId] as const,
  }
}

export function getSceneQueryKeys<TApi>(
  api: TApi,
  projectId: string,
  sceneId: string
) {
  return {
    ...getSceneCollectionQueryKeys(api, projectId),
    projectScene: ['project-scene', api, projectId, sceneId] as const,
  }
}
