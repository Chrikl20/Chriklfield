// getRandomValues also works in local HTTP previews; randomUUID requires HTTPS.
export function requestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
