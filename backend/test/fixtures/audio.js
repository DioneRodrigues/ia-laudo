// One second of audible PCM tone; no microphone, patient data or remote service.
export function createTestAudioBlob() {
  const bytes = new ArrayBuffer(44 + 16000 * 2);
  const view = new DataView(bytes);
  const ascii = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, 32000, true);
  for (let i = 0; i < 16000; i++) view.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 440 / 16000) * 12000, true);
  return new Blob([bytes], { type: 'audio/wav' });
}
