// Bilingual UI strings (English primary, Hindi secondary). Every key has both languages.
type Entry = { en: string; hi: string };

export const strings = {
  appName: { en: 'ShiftTrack', hi: 'शिफ्ट ट्रैक' },
  clockIn: { en: 'Clock In', hi: 'आगमन दर्ज करें' },
  clockOut: { en: 'Clock Out', hi: 'प्रस्थान दर्ज करें' },
  myAttendance: { en: 'My Attendance', hi: 'मेरी हाजिरी' },
  placeFinger: { en: 'Place your finger on the scanner', hi: 'स्कैनर पर अपनी उंगली रखें' },
  liftFinger: { en: 'Lift your finger', hi: 'उंगली हटाएं' },
  clockedInAt: { en: 'Clocked In at {time}', hi: '{time} पर आगमन दर्ज' },
  clockedOutAt: { en: 'Clocked Out at {time}', hi: '{time} पर प्रस्थान दर्ज' },
  late: { en: 'Late arrival', hi: 'देर से आगमन' },
  savedOffline: { en: 'Saved. Will send when internet returns.', hi: 'सहेजा गया। इंटरनेट आने पर भेजा जाएगा।' },
  back: { en: 'Back', hi: 'वापस' },
  online: { en: 'Online', hi: 'ऑनलाइन' },
  offline: { en: 'Offline', hi: 'ऑफ़लाइन' },
  pending: { en: '{count} waiting to send', hi: '{count} भेजना बाकी' },
  noRecords: { en: 'No attendance in the last 31 days', hi: 'पिछले 31 दिनों में कोई हाजिरी नहीं' },
  missingOut: { en: 'No clock-out', hi: 'प्रस्थान दर्ज नहीं' },
  overtime: { en: 'Overtime', hi: 'ओवरटाइम' },
  latestPay: { en: 'Latest pay slip', hi: 'नवीनतम वेतन पर्ची' },
  // Error codes from the scanner module and the clock-event function
  NO_MATCH: { en: 'Fingerprint not recognised. Please try again.', hi: 'फिंगरप्रिंट पहचाना नहीं गया। फिर से प्रयास करें।' },
  AMBIGUOUS_MATCH: { en: 'Fingerprint unclear. Please try again.', hi: 'फिंगरप्रिंट स्पष्ट नहीं। फिर से प्रयास करें।' },
  TIMEOUT: { en: 'No finger detected. Please try again.', hi: 'उंगली नहीं मिली। फिर से प्रयास करें।' },
  LOW_QUALITY: { en: 'Press your finger flat and try again.', hi: 'उंगली सीधी दबाकर फिर से प्रयास करें।' },
  NO_SCANNER: { en: 'Scanner not connected. Please call the supervisor.', hi: 'स्कैनर जुड़ा नहीं है। सुपरवाइज़र को बुलाएं।' },
  USB_PERMISSION_REQUESTED: { en: 'Tap "OK" to allow the scanner, then try again.', hi: 'स्कैनर की अनुमति के लिए "OK" दबाएं, फिर प्रयास करें।' },
  ALREADY_IN: { en: 'You are already clocked in today.', hi: 'आप आज पहले ही आगमन दर्ज कर चुके हैं।' },
  NOT_IN: { en: 'You have not clocked in yet.', hi: 'आपने अभी आगमन दर्ज नहीं किया है।' },
  TOO_SOON: { en: 'Please wait one minute before scanning again.', hi: 'दोबारा स्कैन से पहले एक मिनट रुकें।' },
  INACTIVE_EMPLOYEE: { en: 'Your profile is not active. Please see the supervisor.', hi: 'आपकी प्रोफ़ाइल सक्रिय नहीं है। सुपरवाइज़र से मिलें।' },
  DEVICE_NOT_REGISTERED: { en: 'This kiosk is not set up. Please call the supervisor.', hi: 'यह कियोस्क सेट नहीं है। सुपरवाइज़र को बुलाएं।' },
  NETWORK: { en: 'No internet. Please try again later.', hi: 'इंटरनेट नहीं है। बाद में प्रयास करें।' },
  UNKNOWN: { en: 'Something went wrong. Please try again.', hi: 'कुछ गलत हुआ। फिर से प्रयास करें।' },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof strings;

export function t(key: StringKey, vars: Record<string, string | number> = {}): Entry {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { en: fill(strings[key].en), hi: fill(strings[key].hi) };
}

/** Maps any thrown error (native code or API reason) to a message key. */
export function errorKey(e: unknown): StringKey {
  const code = (e as { code?: string })?.code;
  return code && code in strings ? (code as StringKey) : 'UNKNOWN';
}

/** "8:02 AM" without relying on Intl support in the JS engine. */
export function formatTime(iso: string | number): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
