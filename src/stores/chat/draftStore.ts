const DRAFT_PREFIX = "swift_draft_";

export function loadDraft(conversationId: string): string {
  try {
    return localStorage.getItem(`${DRAFT_PREFIX}${conversationId}`) || "";
  } catch {
    return "";
  }
}

export function saveDraft(conversationId: string, value: string) {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${conversationId}`, value);
  } catch {}
}

export function clearDraft(conversationId: string) {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
  } catch {}
}
