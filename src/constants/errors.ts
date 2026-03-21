export type ErrorKey =
  | 'offline'
  | 'internetLost'
  | 'rateLimit'
  | 'geminiTimeout'
  | 'geminiInvalidJson'
  | 'gemini500'
  | 'sqliteWriteFail'
  | 'imageSaveFail'
  | 'mlkitFail'
  | 'imageTooLarge'
  | 'skinTooDark'
  | 'skinNotDetected'
  | 'fewClosetItems'
  | 'noOccasionMatch'
  | 'imageMissing'
  | 'storageFull'
  | 'noCandidates'
  | 'feedbackWriteFail'
  | 'geminiValidationUnavailable'
  | 'tasteProfileMissing';

export const ERROR_MESSAGES: Record<ErrorKey, { icon: string; title: string; description: string; action: string }> = {
  offline: { icon: '📶', title: 'No internet', description: 'You are offline. Fit Check is unavailable right now.', action: 'Retry' },
  internetLost: { icon: '📡', title: 'Connection lost', description: 'Your internet dropped during this action.', action: 'Retry' },
  rateLimit: { icon: '⏳', title: 'Daily limit reached', description: 'You have used 60 free checks today.', action: 'OK, remind me tomorrow' },
  geminiTimeout: { icon: '⌛', title: 'Analysis timed out', description: 'Analysis is taking too long. Tap to try again.', action: 'Retry' },
  geminiInvalidJson: { icon: '🧩', title: 'Partial AI response', description: 'AI returned malformed output. Partial insights are shown.', action: 'Retry' },
  gemini500: { icon: '🛠️', title: 'AI service unavailable', description: 'Gemini returned a server error.', action: 'Retry' },
  sqliteWriteFail: { icon: '💾', title: 'Save failed', description: 'Local database write failed after retries.', action: 'Retry' },
  imageSaveFail: { icon: '🖼️', title: 'Image save failed', description: 'Could not store this image locally.', action: 'Retry' },
  mlkitFail: { icon: '🏷️', title: 'Auto-tagging unavailable', description: 'ML Kit tagging failed. Manual form is available.', action: 'Retry' },
  imageTooLarge: { icon: '📷', title: 'Optimizing image', description: 'Image is large and will be compressed automatically.', action: 'OK' },
  skinTooDark: { icon: '🌤️', title: 'Photo too dark', description: 'Photo is too dark. Please retake in natural daylight.', action: 'Retake Photo' },
  skinNotDetected: { icon: '👤', title: 'Skin tone not detected', description: 'Please choose tone manually to continue.', action: 'Retake Photo' },
  fewClosetItems: { icon: '👕', title: 'Not enough items', description: 'Add at least one top and one bottom to generate outfits.', action: 'Show Similar' },
  noOccasionMatch: { icon: '🧭', title: 'No exact occasion match', description: 'Showing nearest style match based on your closet.', action: 'Show Similar' },
  imageMissing: { icon: '🗂️', title: 'Image not found', description: 'Saved image path is missing.', action: 'Retake Photo' },
  storageFull: { icon: '📦', title: 'Storage full', description: 'Device storage is low. Free space to continue.', action: 'Open Storage Settings' },
  noCandidates: { icon: '✨', title: 'No outfit candidates', description: 'We are still learning your taste. Add more feedback.', action: 'Show Similar' },
  feedbackWriteFail: { icon: '📝', title: 'Feedback delayed', description: 'Feedback will sync when storage is available.', action: 'Retry' },
  geminiValidationUnavailable: { icon: '🤖', title: 'AI validation unavailable', description: 'Returning non-AI validated results for now.', action: 'Retry' },
  tasteProfileMissing: { icon: '🧠', title: 'Taste profile restored', description: 'Taste profile was missing and has been recreated.', action: 'OK' },
};
