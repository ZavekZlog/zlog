/**
 * Zlog AI annotation engine — public surface.
 *
 * Usage:
 *   import { ANNOTATION_CONTEXTS, annotatePhotoFile, AiLocationWalk } from '@/lib/ai-annotation'
 *   // or components: import { AiLocationWalk } from '@/components/ai-annotation'
 */

export {
  ANNOTATION_CONTEXTS,
  ANNOTATION_CONTEXT_IDS,
  getAnnotationContext,
} from '@/lib/ai-annotation/contexts'

export {
  annotatePhoto,
  annotatePhotoFile,
  fileToAnnotationDataUrl,
} from '@/lib/ai-annotation/client'

export {
  uploadAnnotationImage,
  persistAnnotationItems,
  makeAnnotationItemKey,
} from '@/lib/ai-annotation/persist'

export {
  readCurrentArea,
  writeCurrentArea,
  clearCurrentArea,
  currentAreaScopeKey,
} from '@/lib/ai-annotation/current-area'

export {
  createAreaGroup,
  createAreaPhoto,
  flattenAreaGroups,
  groupPhotosByArea,
  collectRecentAreaNames,
  readRecentAreas,
  rememberRecentArea,
  makeWalkId,
} from '@/lib/ai-annotation/area-groups'
