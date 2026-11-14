import type { Difficulty } from '../core/types';

/**
 * Difficulty changes how quickly goods are produced and ordinary buildings are completed,
 * while the 1x/2x/4x clock still controls simulated time. Values are fixed-point permille
 * so the simulation and autosaves remain deterministic.
 */
export const DIFFICULTY_RULES: Record<Difficulty, {
  productionPermille: number;
  constructionWorkPerHour: number;
  label: string;
  description: string;
}> = {
  easy: {
    productionPermille: 1500,
    constructionWorkPerHour: 5,
    label: 'Kolay',
    description: 'Üretim %50 hızlı · İnşaat yaklaşık %67 hızlı',
  },
  normal: {
    productionPermille: 1000,
    constructionWorkPerHour: 3,
    label: 'Normal',
    description: 'Standart üretim ve inşaat hızları',
  },
  hard: {
    productionPermille: 750,
    constructionWorkPerHour: 2,
    label: 'Zor',
    description: 'Üretim %25 yavaş · İnşaat yaklaşık %33 yavaş',
  },
};

export const difficultyOf = (difficulty: Difficulty | undefined): Difficulty =>
  difficulty && Object.prototype.hasOwnProperty.call(DIFFICULTY_RULES, difficulty) ? difficulty : 'normal';
