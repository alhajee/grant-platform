"use client";
import { useCallback, useEffect, useSyncExternalStore } from 'react';

// A short two-note chime built with the Web Audio API, so no audio file is shipped.
const SOUND_KEY = 'beapms:notifications:sound';
const CHIME_NOTES = [
  { frequency: 783.99, start: 0, length: 0.26 }, // G5
  { frequency: 1046.5, start: 0.12, length: 0.3 }, // C6
] as const;
const PEAK_GAIN = 0.14;
const ATTACK_S = 0.012;
const SILENT_GAIN = 0.0001;
const UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;
let unlockInstalled = false;

function audioContextClass(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const legacy = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? legacy.webkitAudioContext ?? null;
}

// Created only from a user gesture: browsers refuse (and warn) when a page starts audio on its own.
function ensureContext(): AudioContext | null {
  if (context) return context;
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return null;
  try { context = new AudioContextClass(); } catch { context = null; }
  return context;
}

function removeUnlockListeners() {
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, onGesture, true);
  unlockInstalled = false;
}

function unlock(): Promise<void> {
  const audio = ensureContext();
  if (!audio) { removeUnlockListeners(); return Promise.resolve(); }
  if (audio.state === 'running') { removeUnlockListeners(); return Promise.resolve(); }
  return audio.resume().then(() => { if (audio.state === 'running') removeUnlockListeners(); }, () => { /* still blocked: try again on the next gesture */ });
}

function onGesture() { void unlock(); }

/** Listens for the first pointer or key press so the chime is allowed to play later. */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined' || !audioContextClass()) return;
  if (context?.state === 'running') return;
  unlockInstalled = true;
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, onGesture, { capture: true, passive: true });
}

function scheduleNote(audio: AudioContext, output: AudioNode, at: number, note: typeof CHIME_NOTES[number]) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(note.frequency, at);
  envelope.gain.setValueAtTime(SILENT_GAIN, at);
  envelope.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + ATTACK_S);
  envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, at + note.length);
  oscillator.connect(envelope).connect(output);
  oscillator.start(at);
  oscillator.stop(at + note.length + 0.02);
}

function scheduleChime(audio: AudioContext) {
  if (audio.state !== 'running') return;
  try {
    const at = audio.currentTime + 0.01;
    for (const note of CHIME_NOTES) scheduleNote(audio, audio.destination, at + note.start, note);
  } catch { /* audio unavailable: the visual alert is enough */ }
}

/** Plays the chime if the page has been allowed to make sound; otherwise does nothing. */
export function playChime() {
  const audio = context;
  if (!audio || audio.state === 'closed') return;
  if (audio.state === 'running') { scheduleChime(audio); return; }
  // A context the browser suspended (e.g. after an audio interruption) may resume once a gesture has unlocked the page.
  audio.resume().then(() => scheduleChime(audio), () => { /* still blocked: stay silent */ });
}

// Sound preference: on by default, remembered per browser and kept in step across tabs.
const soundListeners = new Set<() => void>();

export function isSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

function writeSoundEnabled(enabled: boolean) {
  try { localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* storage unavailable: the choice lasts until reload */ }
  soundListeners.forEach(listener => listener());
}

function subscribeSound(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === SOUND_KEY) callback(); };
  soundListeners.add(callback);
  window.addEventListener('storage', onStorage);
  return () => { soundListeners.delete(callback); window.removeEventListener('storage', onStorage); };
}

export function useNotificationSound() {
  const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
  useEffect(() => { installAudioUnlock(); }, []);
  const toggle = useCallback(() => {
    const next = !isSoundEnabled();
    writeSoundEnabled(next);
    // The toggle click is itself a gesture, so a quick preview confirms sound is on.
    if (next) void unlock().then(playChime);
  }, []);
  return { enabled, toggle };
}
