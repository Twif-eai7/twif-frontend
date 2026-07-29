let audioCtx = null

/** Short two-tone ring for incoming video call / invite notifications. */
export function playIncomingCallSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const beep = (time, freq) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      gain.gain.setValueAtTime(0.22, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35)
      osc.start(time)
      osc.stop(time + 0.35)
    }

    const t = audioCtx.currentTime
    beep(t, 880)
    beep(t + 0.45, 660)
    beep(t + 0.9, 880)
  } catch (err) {
    console.warn('Incoming call sound failed:', err)
  }
}
