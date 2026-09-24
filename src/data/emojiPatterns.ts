export interface AiTellEmoji {
  emoji: string;
  name: string;
  aiFrequency: string;
  humanAlternative: string;
}

export interface HumanPatternEmoji {
  emoji: string;
  name: string;
}

export const AI_TELL_EMOJIS: AiTellEmoji[] = [
  { emoji: '🚀', name: 'rocket', aiFrequency: '38.4% of synthetic posts', humanAlternative: '📦 or plain line break' },
  { emoji: '✨', name: 'sparkles', aiFrequency: '34.1% of synthetic posts', humanAlternative: 'Omit completely' },
  { emoji: '💡', name: 'lightbulb', aiFrequency: '29.7% of synthetic posts', humanAlternative: '— or bold number' },
  { emoji: '🎯', name: 'target', aiFrequency: '26.2% of synthetic posts', humanAlternative: 'Plain bullet (—)' },
  { emoji: '📈', name: 'chart_increasing', aiFrequency: '22.8% of synthetic posts', humanAlternative: 'Exact percentage (+34%)' },
  { emoji: '🔥', name: 'fire', aiFrequency: '19.5% of synthetic posts', humanAlternative: 'Omit completely' },
  { emoji: '🔑', name: 'key', aiFrequency: '18.1% of synthetic posts', humanAlternative: 'Number (1, 2, 3)' },
  { emoji: '💪', name: 'flexed_biceps', aiFrequency: '16.7% of synthetic posts', humanAlternative: 'Omit or thoughtful question' },
  { emoji: '👇', name: 'backhand_index_pointing_down', aiFrequency: '41.2% of synthetic CTAs', humanAlternative: '"What is your take?"' }
];

export const HUMAN_PATTERN_EMOJIS: HumanPatternEmoji[] = [
  { emoji: '👀', name: 'eyes' },
  { emoji: '🤷‍♂️', name: 'shrug' },
  { emoji: '😅', name: 'sweat_smile' },
  { emoji: '☕', name: 'coffee' },
  { emoji: '🤦', name: 'facepalm' },
  { emoji: '📌', name: 'pushpin' },
  { emoji: '🫡', name: 'salute' },
  { emoji: '🤝', name: 'handshake' }
];
