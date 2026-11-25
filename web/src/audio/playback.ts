export function pcm16ToAudioBuffer(
  ctx: BaseAudioContext,
  pcm: Int16Array,
  channels: number,
  freq: number,
): AudioBuffer {
  const frames = Math.floor(pcm.length / channels);
  const out = ctx.createBuffer(channels, Math.max(frames, 1), freq);
  for (let c = 0; c < channels; c++) {
    const ch = out.getChannelData(c);
    for (let i = 0; i < frames; i++) ch[i] = (pcm[i * channels + c] ?? 0) / 32768;
  }
  return out;
}

export function playPcm16(
  ctx: AudioContext,
  pcm: Int16Array,
  channels: number,
  freq: number,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = pcm16ToAudioBuffer(ctx, pcm, channels, freq);
  src.connect(ctx.destination);
  src.start();
  return src;
}
