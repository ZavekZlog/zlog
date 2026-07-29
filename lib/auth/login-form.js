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
