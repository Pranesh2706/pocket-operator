// Push-to-talk speech recognition using Android's SpeechRecognizer (via expo-speech-recognition).
// We only receive text; no raw audio file is recorded or uploaded. The transcript is handed to the
// caller to place in the editable input, so the user reviews it before anything is submitted.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export type VoiceState = 'idle' | 'listening' | 'stopping';

export type VoiceNotice = { text: string; canOpenSettings?: boolean } | null;

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function useVoice(language: string, onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState<VoiceNotice>(null);
  const [available] = useState(recognitionAvailable);
  const finals = useRef('');
  const current = useRef('');
  const pressed = useRef(false);
  const errored = useRef(false);
  const active = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    active.current = true;
    setState('listening');
  });

  useSpeechRecognitionEvent('result', (ev) => {
    const t = ev.results?.[0]?.transcript ?? '';
    if (ev.isFinal) {
      finals.current = `${finals.current} ${t}`.trim();
      current.current = '';
    } else {
      current.current = t;
    }
    setInterim(`${finals.current} ${current.current}`.trim());
  });

  useSpeechRecognitionEvent('nomatch', () => {
    // Final result with nothing recognisable; 'end' will report the empty recording.
  });

  useSpeechRecognitionEvent('error', (ev) => {
    if (ev.error === 'aborted') return;
    errored.current = true;
    const messages: Record<string, VoiceNotice> = {
      'not-allowed': { text: 'Microphone permission is denied. You can still type, or allow the microphone in Settings.', canOpenSettings: true },
      'service-not-allowed': { text: 'Speech recognition is not allowed on this device. Please type instead.' },
      'no-speech': { text: "I didn't hear anything. Hold the mic and speak, or type instead." },
      'speech-timeout': { text: "I didn't hear anything. Hold the mic and speak, or type instead." },
      network: { text: 'Speech recognition needs a network connection right now. Please type instead.' },
      'language-not-supported': { text: 'That voice language is not installed on this phone. Switch to English or type.' },
      busy: { text: 'The speech recogniser is busy. Try again in a moment.' },
      'audio-capture': { text: 'Could not access the microphone. Try again or type.' },
    };
    setNotice(messages[ev.error] ?? { text: `Voice input failed (${ev.error}). Please type instead.` });
  });

  useSpeechRecognitionEvent('end', () => {
    active.current = false;
    setState('idle');
    const text = `${finals.current} ${current.current}`.trim();
    if (text) {
      onTranscript(text);
      setNotice(null);
    } else if (!errored.current) {
      setNotice({ text: 'Empty recording: nothing was heard. Hold the mic while speaking, or type instead.' });
    }
    setInterim('');
  });

  // Stop listening if the app goes to the background; never leave the mic open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && active.current) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
      }
    });
    return () => {
      sub.remove();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    };
  }, []);

  const start = useCallback(async () => {
    pressed.current = true;
    setNotice(null);
    if (!available) {
      setNotice({ text: 'Voice input is not available on this device. Please type your request.' });
      return;
    }
    try {
      let perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          setNotice({ text: 'Microphone permission is denied. You can still type, or allow the microphone in Settings.', canOpenSettings: true });
          return;
        }
        perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          setNotice({ text: 'Microphone permission was denied. You can still type your request.', canOpenSettings: !perm.canAskAgain });
          return;
        }
        // The permission dialog interrupted the press; ask the user to press again.
        setNotice({ text: 'Microphone allowed. Hold the mic button again and speak.' });
        return;
      }
      if (!pressed.current) return; // released before we were ready
      finals.current = '';
      current.current = '';
      errored.current = false;
      setInterim('');
      setState('listening');
      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: true,
        continuous: true, // keep listening while the button is held
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch (e: any) {
      setState('idle');
      setNotice({ text: `Could not start voice input. Please type instead.` });
    }
  }, [available, language]);

  const stop = useCallback(() => {
    pressed.current = false;
    if (active.current || state === 'listening') {
      setState('stopping');
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        setState('idle');
      }
    }
  }, [state]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return { state, interim, notice, available, start, stop, openSettings, clearNotice: () => setNotice(null) };
}
