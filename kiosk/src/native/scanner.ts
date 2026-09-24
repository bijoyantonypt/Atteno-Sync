// Typed wrapper around the Kotlin ShiftTrackScanner native module.
import { NativeEventEmitter, NativeModules } from 'react-native';

const { ShiftTrackScanner } = NativeModules;

export interface MatchResult {
  employeeId: string;
  score: number;
}

export type ScannerPrompt =
  | { type: 'PLACE_FINGER'; step: number }
  | { type: 'ENROLL_PLACE'; step: number }
  | { type: 'ENROLL_LIFT'; step: number };

export const scanner = {
  /** 1:N match against templates enrolled on this kiosk. Rejects with code NO_MATCH, TIMEOUT, ... */
  identify: (): Promise<MatchResult> => ShiftTrackScanner.identify(),
  /** 3-capture enrolment. Resolves with the SHA-256 of the stored template. */
  enroll: (employeeId: string): Promise<{ templateHash: string }> => ShiftTrackScanner.enroll(employeeId),
  deleteTemplate: (employeeId: string): Promise<boolean> => ShiftTrackScanner.deleteTemplate(employeeId),
  enrolledIds: (): Promise<string[]> => ShiftTrackScanner.enrolledIds(),
  devicePublicKey: (): Promise<string> => ShiftTrackScanner.getDevicePublicKey(),
  sign: (message: string): Promise<string> => ShiftTrackScanner.sign(message),
  nonce: (): Promise<string> => ShiftTrackScanner.randomNonce(),
};

const emitter = new NativeEventEmitter(ShiftTrackScanner);

export function onScannerPrompt(listener: (p: ScannerPrompt) => void): () => void {
  const sub = emitter.addListener('ShiftTrackScanner', listener);
  return () => sub.remove();
}
