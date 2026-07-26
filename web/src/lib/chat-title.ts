export function normalizeSessionTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  return title ? title : null;
}

/** Keep the page context visible while identifying the conversation in view. */
export function selectedChatPageTitle(
  chatLabel: string,
  sessionTitle: string | null,
): string {
  return sessionTitle ? `${chatLabel} · ${sessionTitle}` : chatLabel;
}

export function titleFromSessionInfoPayload(
  payload: unknown,
): string | null | undefined {
  if (!payload || typeof payload !== "object" || !("title" in payload)) {
    return undefined;
  }

  return normalizeSessionTitle((payload as { title?: unknown }).title);
}
