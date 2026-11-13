import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { GameState, Objective, Quest } from '../game/core/types';
import { QUEST_BY_ID } from '../game/data/quests';
import { computeFlows, homeProvince, isOperating } from '../game/systems/economy';
import { activeQuestId, objectiveProgress } from '../game/systems/quests';
import { fmtAmount, fmtInt, t } from '../i18n';
import type { TKey } from '../i18n';
import { Bar } from './common';

export function objectiveLabel(o: Objective): string {
  switch (o.type) {
    case 'buildingCount':
      return t('objective.buildingCount', { building: `@building.${o.buildingId}.name`, n: o.count });
    case 'staffedBuilding':
      return t('objective.staffedBuilding', { building: `@building.${o.buildingId}.name`, n: o.workers });
    case 'resourceGathered':
      return t('objective.resourceGathered', {
        resource: `@resource.${o.resourceId}`,
        n: fmtAmount(o.amount),
      });
    case 'foodBalanceStreak':
      return t('objective.foodBalanceStreak', { n: o.days });
    case 'population':
      return t('objective.population', { n: o.count });
    case 'districtCount':
      return t('objective.districtCount', { n: o.count });
    case 'militiaCount':
      return t('objective.militiaCount', { n: o.count });
    case 'techResearched':
      return t('objective.techResearched', { tech: `@tech.${o.techId}.name` });
    case 'prosperityStreak':
      return t('objective.prosperityStreak', { n: o.days, happiness: o.happiness });
  }
}

export function rewardLabel(quest: Quest): string {
  return quest.rewards
    .map((r) =>
      r.type === 'addResource'
        ? `${fmtAmount(r.amount)} ${t(`resource.${r.resourceId}`)}`
        : r.type === 'revealProvince'
          ? t('reward.reveal')
          : t('reward.chapter'),
    )
    .join(', ');
}

export function ObjectiveList({ game, quest }: { game: GameState; quest: Quest }): ReactElement {
  const progress = game.questProgress[quest.id]!;
  return (
    <ul className="objectives">
      {quest.objectives.map((o, i) => {
        const { current, target } = objectiveProgress(game, o, progress.counters[i] ?? 0);
        const done = progress.status === 'completed' || current >= target;
        const scaled = o.type === 'resourceGathered';
        return (
          <li key={i} className={done ? 'done' : ''}>
            <span className="check" aria-hidden="true">
              {done ? '✔' : '○'}
            </span>
            <span className="objective-text">
              {objectiveLabel(o)}
              <span className="objective-count">
                {scaled ? fmtInt(Math.min(current, target)) : Math.min(current, target)} /{' '}
                {scaled ? fmtInt(target) : target}
              </span>
              <Bar value={done ? 1 : current} max={done ? 1 : target} tone={done ? 'ok' : 'info'} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Mira's contextual advice: recovery prompts take priority over the quest hint. */
function miraHint(game: GameState, questId: string | null): TKey {
  const p = homeProvince(game);
  const flows = computeFlows(game);
  const hasCamp = p.buildings.some((b) => b.definitionId === 'lumber_camp' && isOperating(b));
  if (p.stocks.food <= 0) return 'mira.recover.famine';
  if (p.stocks.food < 15000 && flows.food.net < 0) return 'mira.recover.food';
  if (p.stocks.wood < 20000 && !hasCamp) return 'mira.recover.wood';
  if (p.stocks.tools <= 0) return 'mira.recover.tools';
  if (p.buildings.some((b) => !b.connected)) return 'mira.recover.road';
  return questId ? (`quest.${questId}.hint` as TKey) : 'mira.free';
}

export function QuestTracker({ game }: { game: GameState }): ReactElement | null {
  const [open, setOpen] = useState(true);
  const openPanel = useApp((s) => s.openPanel);
  if (game.mode !== 'campaign') return null;
  const id = activeQuestId(game);
  const quest = id ? QUEST_BY_ID[id] : null;
  return (
    <section className="quest card" aria-label={t('quest.tracker')} data-testid="quest-tracker">
      <header className="card-head">
        <h3>
          <span className="eyebrow">{t(quest?.chapter === 3 ? 'chapter.3.title' : quest?.chapter === 2 ? 'chapter.2.title' : 'chapter.1.title')}</span>
          {quest ? t(`quest.${quest.id}.title`) : t('quest.allDone')}
        </h3>
        <button
          className="btn icon-btn"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={t('quest.toggle')}
        >
          {open ? '▾' : '▸'}
        </button>
      </header>
      {open && (
        <>
          {quest ? (
            <>
              <p>{t(`quest.${quest.id}.desc`)}</p>
              <ObjectiveList game={game} quest={quest} />
              <p className="reward">
                {t('quest.reward')}: <b>{rewardLabel(quest)}</b>
              </p>
            </>
          ) : (
            <p>{t('quest.allDoneDesc')}</p>
          )}
          <div className="mira">
            <span className="mira-face" aria-hidden="true">
              M
            </span>
            <p>
              <b>Mira:</b> {t(miraHint(game, id))}
            </p>
          </div>
          <button className="btn link" onClick={() => openPanel('journal')}>
            {t('quest.openJournal')}
          </button>
        </>
      )}
    </section>
  );
}
