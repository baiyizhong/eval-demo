import { createAPI } from './create-api'
import { apiRegistry } from './registry'

export const api = createAPI(apiRegistry)
