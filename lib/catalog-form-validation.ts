// Mounted hidden tabs still participate in validation; reveal before focusing.
export function revealInvalidCatalogField(form: HTMLFormElement, selectTab: (tab: string) => void) {
  const invalid = Array.from(form.elements).find(element =>
    'validity' in element && (element as HTMLInputElement).willValidate !== false && !(element as HTMLInputElement).validity.valid) as HTMLInputElement | undefined;
  if (!invalid) return false;
  const panel = invalid.closest<HTMLElement>('[data-editor-panel]');
  if (panel?.dataset.editorPanel) selectTab(panel.dataset.editorPanel);
  for (let parent = invalid.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
  return true;
}
