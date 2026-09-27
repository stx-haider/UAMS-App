function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export async function saveOfflineFile({ name, base64, text, mimeType, onSaved }) {
  const encoded = base64 ?? encodeUtf8Base64(text ?? '');
  const desktop = window.uamsPlatform;
  if (desktop?.kind === 'windows-desktop' && desktop.saveFile) {
    const result = await desktop.saveFile({ name, base64: encoded });
    onSaved?.(result.fileName || name);
    return;
  }
  const blob = base64 ? base64ToBlob(encoded, mimeType) : new Blob([text ?? ''], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  onSaved?.(name);
}
