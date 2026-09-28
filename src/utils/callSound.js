let audioCtx = null

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

// Browsers only allow an AudioContext to start/resume from inside a real user gesture.
// A chime triggered later by a realtime push has no gesture behind it, so call this from
// a mount-level click/keydown listener (see App.jsx) before a notification needs it.
export function unlockAudioForNotifications() {
  const ctx = getAudioCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

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

/** Single short chime for a new PLM workspace activity/comment arriving in the background. */
export async function playPlmActivitySound() {
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    // resume() is async; scheduling against currentTime before it resolves delays the tone.
    if (ctx.state === 'suspended') await ctx.resume()

    const beep = (time, freq) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.18, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25)
      osc.start(time)
      osc.stop(time + 0.25)
    }

    const t = ctx.currentTime
    beep(t, 740)
    beep(t + 0.14, 1046)
  } catch (err) {
    console.warn('PLM activity sound failed:', err)
  }
}
