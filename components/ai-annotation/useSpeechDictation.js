'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Browser SpeechRecognition helper (en-GB). Gracefully unsupported when unavailable.
 */
export function useSpeechDictation(onResult) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop?.()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SpeechRecognition) return false
    stop()
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-GB'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const text = event?.results?.[0]?.[0]?.transcript
      if (text) onResult(String(text).trim())
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      return true
    } catch {
      setListening(false)
      return false
    }
  }, [onResult, stop])

  useEffect(() => () => stop(), [stop])

  const supported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  return { start, stop, listening, supported }
}
