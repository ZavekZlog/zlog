/**
 * Login form helpers — FormData is the source of truth at submit time
 * so Android Chrome / Samsung password managers that fill the DOM without
 * React onChange still authenticate correctly.
 */

export function readLoginFormCredentials(form) {
  if (!form || typeof form !== 'object') {
    return { email: '', password: '' }
  }

  // Prefer FormData (includes successful autofill when flushed into the form).
  if (typeof FormData === 'function') {
    try {
      const formData =
        form instanceof FormData ? form : new FormData(/** @type {HTMLFormElement} */ (form))
      const email = String(formData.get('email') ?? '')
      const password = String(formData.get('password') ?? '')
      if (email || password) {
        return { email: email.trim(), password }
      }
    } catch {
      // Fall through to named elements / plain object.
    }
  }

  const emailEl = form.elements?.namedItem?.('email')
  const passwordEl = form.elements?.namedItem?.('password')
  if (emailEl || passwordEl) {
    return {
      email: String(emailEl && 'value' in emailEl ? emailEl.value : '').trim(),
      password: String(passwordEl && 'value' in passwordEl ? passwordEl.value : ''),
    }
  }

  return {
    email: String(form.email ?? '').trim(),
    password: String(form.password ?? ''),
  }
}

export function passwordInputType(showPassword) {
  return showPassword ? 'text' : 'password'
}

export function passwordVisibilityLabel(showPassword) {
  return showPassword ? 'Hide password' : 'Show password'
}

function eventIsTrusted(event) {
  if (!event || typeof event !== 'object') return false
  if (event.isTrusted === true) return true
  if (event.nativeEvent && event.nativeEvent.isTrusted === true) return true
  return false
}

function pointerTypeOf(event) {
  return event.pointerType || event.nativeEvent?.pointerType || ''
}

function isPrimaryPointer(event) {
  const isPrimary = event.isPrimary ?? event.nativeEvent?.isPrimary
  if (isPrimary !== true) return false
  const button = event.button ?? event.nativeEvent?.button
  if (button !== undefined && button !== 0) return false
  return true
}

function isActivationOnSignInCta(event) {
  const current = event.currentTarget
  const target = event.target
  if (!current) return true
  if (!target || target === current) return true
  if (typeof current.contains === 'function' && current.contains(target)) return true
  return false
}

/**
 * Trusted primary pointer/touch press directly on the Sign In CTA.
 * Programmatic click() and untrusted/non-primary pointers must not pass.
 */
export function isTrustedPrimarySignInPointerDown(event) {
  if (!eventIsTrusted(event)) return false
  if (!isPrimaryPointer(event)) return false
  const pointerType = pointerTypeOf(event)
  if (pointerType !== 'mouse' && pointerType !== 'touch' && pointerType !== 'pen') return false
  return isActivationOnSignInCta(event)
}

/**
 * Trusted Enter/Space while the Sign In CTA itself has focus.
 * Form/input Enter and untrusted keyboard events must not pass.
 */
export function isTrustedSignInCtaKey(event) {
  if (!eventIsTrusted(event)) return false
  if (event.nativeEvent?.isComposing) return false
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
}
