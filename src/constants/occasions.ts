export const OCCASION_KEYWORDS: Array<{ words: string[]; mapped: string }> = [
  { words: ['interview', 'office', 'meeting', 'presentation'], mapped: 'professional' },
  { words: ['wedding', 'reception', 'gala', 'ceremony', 'formal'], mapped: 'formal' },
  { words: ['party', 'birthday', 'club', 'night', 'celebration'], mapped: 'party' },
  { words: ['puja', 'festival', 'traditional', 'function', 'ethnic'], mapped: 'ethnic' },
];

export const ALL_OCCASIONS = ['casual', 'professional', 'formal', 'party', 'ethnic'] as const;
