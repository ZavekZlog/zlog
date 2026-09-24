/**
 * Test-only bundle of Site Diary setup UI sources after Project Details extraction.
 * Keeps label-order and grep contracts stable across page + section + controller.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SETUP_PAGE_PATH = 'app/dashboard/diary/setup/page.jsx'
export const SETUP_SECTION_PATH = 'components/site-diary/SiteDiaryProjectDetailsSection.jsx'
export const SETUP_CONTROLLER_PATH = 'lib/use-site-diary-project-details.js'

export function readSetupPageSource() {
  return readFileSync(join(root, SETUP_PAGE_PATH), 'utf8')
}

export function readSetupSectionSource() {
  return readFileSync(join(root, SETUP_SECTION_PATH), 'utf8')
}

export function readSetupControllerSource() {
  return readFileSync(join(root, SETUP_CONTROLLER_PATH), 'utf8')
}

/** Composed mount-order source for SETUP_UI_LABEL_SEQUENCE contracts. */
export function readSetupUiComposedSource() {
  const setupPage = readSetupPageSource()
  const section = readSetupSectionSource()
  const stickySrc = readFileSync(join(root, 'components/project/ProjectStickyFields.jsx'), 'utf8')
  const datesSrc = readFileSync(join(root, 'components/project/ProjectDatesFields.jsx'), 'utf8')
  const stickyMount = section.indexOf('<ProjectStickyFields')
  const datesMount = section.indexOf('<ProjectDatesFields')
  if (stickyMount < 0 || datesMount < stickyMount) {
    return `${setupPage}\n${section}`
  }
  return [
    setupPage,
    '\n',
    section.slice(0, stickyMount),
    stickySrc,
    section.slice(stickyMount, datesMount),
    datesSrc,
    section.slice(datesMount),
  ].join('\n')
}

/** Controller + host page for Continue / SDSC / hydrate greps. */
export function readSetupBehaviourSource() {
  return `${readSetupControllerSource()}\n${readSetupPageSource()}`
}

/** Pre–Unit 1 monolithic setup page equivalent for source greps. */
export function readSetupLegacySourceBundle() {
  return `${readSetupPageSource()}\n${readSetupSectionSource()}\n${readSetupControllerSource()}`
}
