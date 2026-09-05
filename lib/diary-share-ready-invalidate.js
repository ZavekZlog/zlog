/**
 * PDF-visible text-field edit: clear the prepared Share PDF, then write the field.
 * Weather / Site Summary bind this to both onInput (Android/Gboard) and onChange.
 */
export function handlePdfVisibleTextInput(invalidatePreparedSharePdf, setValue, event) {
  invalidatePreparedSharePdf()
  setValue(event.currentTarget.value)
}
