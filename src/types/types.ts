export type Player = {
  id: string;
  name: string;
  room: string;
  avatar: string;
  score: number;
  streak?: number;
  hasStreak?: boolean;
  isReady?: boolean;
  tacticUsed?: string[];
  wasCorrect?: boolean;
  correctCount?: number;
  totalPlayed?: number;
  scoreUpdated?: boolean;
  streakUpdated?: boolean;
};
export type Room = {
  name: string;
  count: number;
  players: Player[];
  deck?: ShuffledDeck;
  round?: number;
  type?: string; // Added type to Room for deck retrieval
  // Room-specific game state
  currentRound?: number;
  currentNewsCard?: any;
  currentTheme?: string;
  influencerCard?: InfluencerCard;
  wasScored?: boolean;
};
export type PlayerCard = { id: string; content: string };
export type InfluencerCard = { villain: string; tactic: string[] };
export type TacticUsed = { tactic: string; player: Player };
export type ShuffledDeck = {
  type: string;
  data: object[];
  isShuffled: boolean;
};
export type WasScored = boolean;
