import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')

function deferred() {
  let resolve
  const promise = new Promise((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

async function loadLogin() {
  const result = await build({
    entryPoints: [join(root, 'app/(auth)/login/page.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    plugins: [{
      name: 'login-single-flight-test-mocks',
      setup(buildApi) {
        const mocks = new Map([
          ['react', `
            export const useEffect = () => {}
            export const useRef = (initial) => {
              const index = globalThis.__zlogLoginRefIndex++
              return { current: index === 0 ? globalThis.__zlogLoginForm : initial }
            }
            export const useState = (initial) => {
              const index = globalThis.__zlogLoginStateIndex++
              return [initial, (value) => globalThis.__zlogLoginStateUpdates.push({ index, value })]
            }
          `],
          ['react/jsx-runtime', `
            export const Fragment = 'Fragment'
            export const jsx = (type, props, key) => ({ type, props: props || {}, key })
            export const jsxs = jsx
          `],
          ['next/navigation', `
            export const useRouter = () => ({ replace: () => {} })
          `],
          ['@/lib/supabase/client', `
            export const createClient = () => globalThis.__zlogLoginSupabase
          `],
          ['@/lib/premium-ui', `
            export const premiumScopedCss = ''
            export const ZlogBrandWordmark = 'ZlogBrandWordmark'
            export const PrimaryCTA = 'PrimaryCTA'
            export const SecondaryButton = 'SecondaryButton'
            export const labelStyle = {}
            export const inputStyle = {}
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, (args) => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'login-test-mock' }
          if (args.path.startsWith('@/')) {
            return { path: `${join(root, args.path.slice(2))}.js` }
          }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'login-test-mock' }, (args) => ({
          contents: mocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })

  const compiledModule = { exports: {} }
  const evaluate = new Function('module', 'exports', result.outputFiles[0].text)
  evaluate(compiledModule, compiledModule.exports)
  return compiledModule.exports.default
}

function findElement(node, type) {
  if (!node || typeof node !== 'object') return null
  if (node.type === type) return node
  const children = node.props?.children
  const entries = Array.isArray(children) ? children : [children]
  for (const child of entries) {
    const found = findElement(child, type)
    if (found) return found
  }
  return null
}

function loginForm({
  email = 'site.manager@zlog.app',
  password = 'SitePass!42',
} = {}) {
  const fields = {
    email: { value: email },
    password: { value: password },
  }
  return {
    fields,
    elements: {
      namedItem(name) {
        return fields[name] || null
      },
    },
  }
}

function trustedPointerDown() {
  return {
    isTrusted: true,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
  }
}

function trustedKeyDown(key = 'Enter') {
  return {
    isTrusted: true,
    key,
    preventDefault() {},
  }
}

async function settleAsyncWork() {
  await Promise.resolve()
  await new Promise((resolve) => setImmediate(resolve))
}

async function renderLogin({ form = loginForm(), signInWithPassword, search = '' } = {}) {
  const destinations = []
  globalThis.__zlogLoginForm = form
  globalThis.__zlogLoginRefIndex = 0
  globalThis.__zlogLoginStateIndex = 0
  globalThis.__zlogLoginStateUpdates = []
  globalThis.__zlogLoginSupabase = {
    auth: { signInWithPassword },
  }
  globalThis.window = {
    location: {
      search,
      replace(destination) {
        destinations.push(destination)
      },
    },
  }

  const Login = await loadLogin()
  const page = Login()
  return {
    page,
    signIn: findElement(page, 'PrimaryCTA'),
    formElement: findElement(page, 'form'),
    destinations,
    stateUpdates: globalThis.__zlogLoginStateUpdates,
  }
}

describe('Defect #6 — Login synchronous single-flight boundary', () => {
  it('accepts only one auth request from two synchronous valid submissions', async () => {
    const firstAuth = deferred()
    let authCalls = 0
    const { signIn } = await renderLogin({
      signInWithPassword() {
        authCalls += 1
        return firstAuth.promise
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    signIn.props.onPointerDown(trustedPointerDown())

    assert.equal(authCalls, 1)
    firstAuth.resolve({ error: { message: 'Invalid login credentials' } })
    await settleAsyncWork()
  })

  it('keeps rejecting submissions while the first auth promise is unresolved', async () => {
    const firstAuth = deferred()
    let authCalls = 0
    const { signIn } = await renderLogin({
      signInWithPassword() {
        authCalls += 1
        return firstAuth.promise
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    await Promise.resolve()
    signIn.props.onKeyDown(trustedKeyDown())

    assert.equal(authCalls, 1)
    firstAuth.resolve({ error: { message: 'Invalid login credentials' } })
    await settleAsyncWork()
  })

  it('releases the lock after auth failure and accepts a later retry', async () => {
    let authCalls = 0
    const { signIn, stateUpdates } = await renderLogin({
      async signInWithPassword() {
        authCalls += 1
        return { error: { message: 'Invalid login credentials' } }
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    await settleAsyncWork()

    assert.equal(authCalls, 1)
    assert.ok(stateUpdates.some(({ index, value }) =>
      index === 2 && value === 'Invalid login credentials'))
    assert.ok(stateUpdates.some(({ index, value }) => index === 1 && value === false))

    signIn.props.onPointerDown(trustedPointerDown())
    await settleAsyncWork()
    assert.equal(authCalls, 2)
  })

  it('keeps the lock held after success through navigation handoff', async () => {
    let authCalls = 0
    const { signIn, destinations } = await renderLogin({
      async signInWithPassword() {
        authCalls += 1
        return { error: null }
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    await settleAsyncWork()
    signIn.props.onPointerDown(trustedPointerDown())

    assert.equal(authCalls, 1)
    assert.deepEqual(destinations, ['/dashboard'])
  })

  it('preserves an ordinary successful login and credential payload', async () => {
    const credentials = []
    const { signIn, destinations } = await renderLogin({
      async signInWithPassword(payload) {
        credentials.push(payload)
        return { error: null }
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    await settleAsyncWork()

    assert.deepEqual(credentials, [{
      email: 'site.manager@zlog.app',
      password: 'SitePass!42',
    }])
    assert.deepEqual(destinations, ['/dashboard'])
  })

  it('does not lock validation rejection and accepts corrected credentials', async () => {
    const form = loginForm({ email: '', password: '' })
    let authCalls = 0
    const { signIn, stateUpdates } = await renderLogin({
      form,
      async signInWithPassword() {
        authCalls += 1
        return { error: { message: 'Invalid login credentials' } }
      },
    })

    signIn.props.onPointerDown(trustedPointerDown())
    assert.equal(authCalls, 0)
    assert.ok(stateUpdates.some(({ index, value }) =>
      index === 2 && value === 'Enter your email and password.'))

    form.fields.email.value = 'site.manager@zlog.app'
    form.fields.password.value = 'SitePass!42'
    signIn.props.onPointerDown(trustedPointerDown())
    await settleAsyncWork()
    assert.equal(authCalls, 1)
  })

  it('uses the same boundary for trusted CTA keyboard activation while form submit stays inert', async () => {
    const firstAuth = deferred()
    let authCalls = 0
    let formSubmitPrevented = false
    const { signIn, formElement } = await renderLogin({
      signInWithPassword() {
        authCalls += 1
        return firstAuth.promise
      },
    })

    formElement.props.onSubmit({
      preventDefault() {
        formSubmitPrevented = true
      },
    })
    assert.equal(formSubmitPrevented, true)
    assert.equal(authCalls, 0)

    signIn.props.onKeyDown(trustedKeyDown('Enter'))
    signIn.props.onKeyDown(trustedKeyDown('Enter'))
    assert.equal(authCalls, 1)

    firstAuth.resolve({ error: { message: 'Invalid login credentials' } })
    await settleAsyncWork()
  })
})
