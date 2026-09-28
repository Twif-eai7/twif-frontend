import { useState, useRef, useCallback, useEffect } from 'react'

// Encapsulates the getUserMedia/MediaRecorder lifecycle for recording a voice message —
// mirrors CameraCaptureModal's self-contained stream handling, but as a hook rather than a
// full-screen modal since the recording UI here is just a small composer-row indicator.
// Produces a File (like a picked/captured attachment) so callers can push it straight into
// their existing attachment pipeline instead of needing a separate send path.
export default function useVoiceRecorder({ onRecorded, onError } = {}) {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const timerRef    = useRef(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 0) {
          const mt = recorder.mimeType || 'audio/webm'
          const ext = mt.includes('mp4') ? 'm4a' : mt.includes('ogg') ? 'ogg' : 'webm'
          onRecorded?.(new File([blob], `voice-message-${Date.now()}.${ext}`, { type: blob.type }))
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      setIsRecording(true)
    } catch {
      onError?.('Microphone access is required to record a voice message')
    }
  }, [isRecording, stopStream, onRecorded, onError])

  // Stops and keeps whatever was captured — fires onRecorded via the recorder's own onstop.
  const finish = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    setIsRecording(false)
  }, [])

  // Stops and discards — detaches onstop first so the in-progress clip is never handed back.
  const cancel = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.onstop = null
      if (recorderRef.current.state === 'recording') recorderRef.current.stop()
      recorderRef.current = null
    }
    chunksRef.current = []
    stopStream()
    setIsRecording(false)
  }, [stopStream])

  useEffect(() => () => cancel(), [cancel])

  return { isRecording, seconds, start, finish, cancel }
}
