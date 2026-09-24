// Typed wrapper around the Kotlin Atteno_SyncScanner native module.
import { NativeEventEmitter, NativeModules } from 'react-native';

const { Atteno_SyncScanner } = NativeModules;

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
  identify: (): Promise<MatchResult> => Atteno_SyncScanner.identify(),
  /** 3-capture enrolment. Resolves with the SHA-256 of the stored template. */
  enroll: (employeeId: string): Promise<{ templateHash: string }> => Atteno_SyncScanner.enroll(employeeId),
  deleteTemplate: (employeeId: string): Promise<boolean> => Atteno_SyncScanner.deleteTemplate(employeeId),
  enrolledIds: (): Promise<string[]> => Atteno_SyncScanner.enrolledIds(),
  devicePublicKey: (): Promise<string> => Atteno_SyncScanner.getDevicePublicKey(),
  sign: (message: string): Promise<string> => Atteno_SyncScanner.sign(message),
  nonce: (): Promise<string> => Atteno_SyncScanner.randomNonce(),
};

const emitter = new NativeEventEmitter(Atteno_SyncScanner);

export function onScannerPrompt(listener: (p: ScannerPrompt) => void): () => void {
  const sub = emitter.addListener('Atteno_SyncScanner', listener);
  return () => sub.remove();
}


