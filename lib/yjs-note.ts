import * as Y from "yjs";

const PREFIX = "yjs:v1:";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeNoteDocument(doc: Y.Doc): string {
  return `${PREFIX}${bytesToBase64(Y.encodeStateAsUpdate(doc))}`;
}

export function decodeNoteDocument(stored: string): Y.Doc {
  const doc = new Y.Doc();
  if (stored.startsWith(PREFIX)) {
    try {
      Y.applyUpdate(doc, base64ToBytes(stored.slice(PREFIX.length)));
      return doc;
    } catch {
      // Le contenu historique reste récupérable comme texte brut.
    }
  }
  if (stored) doc.getText("content").insert(0, stored);
  return doc;
}

export function noteTextFromStorage(stored: string): string {
  const doc = decodeNoteDocument(stored);
  const text = doc.getText("content").toString();
  doc.destroy();
  return text;
}

export function encodeYjsUpdate(update: Uint8Array): string {
  return bytesToBase64(update);
}

export function decodeYjsUpdate(update: string): Uint8Array {
  return base64ToBytes(update);
}
