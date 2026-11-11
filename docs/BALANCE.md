# Balance sheet — Phase 1

All numbers live in `src/game/data/balance.ts` and `src/game/data/buildings.ts`. They are provisional
and guarded by `src/tests/balance.test.ts`.

## Start

- Bereket Vadisi, 24×24, 12 settlers (8 adults, 3 children, 1 elder), happiness 70.
- Stocks: 160 wood, 90 food, 70 stone, 40 gold, 20 tools, 0 research.
- Pre-built: Köy Meydanı, 1 depo, 4 kulübe, a 10-tile road.
- Caps from the first depo: wood 300, food 250, stone 250, tools 100. Gold and research are uncapped.

## Time

1 tick = 1 hour · 24 ticks/day · 30 days/season · winter starts on day 90.
At 1× a day lasts 12 s; 4× lasts 3 s.

## Buildings (level 1)

| Building     | Cost                       | Days | Workers | Effect                                        | Upkeep/day |
| ------------ | -------------------------- | ---- | ------- | --------------------------------------------- | ---------- |
| Kulübe       | 20 wood, 5 stone           | 2    | –       | +5 housing, 0.2 gold tax                      | –          |
| Depo         | 40 wood, 20 stone          | 4    | –       | +300 wood, +250 food, +250 stone, +100 tools  | 0.1        |
| Oduncu Kampı | 30 wood, 10 stone          | 3    | 2       | 4 wood/day from forest within 3 tiles         | 0.1        |
| Çiftlik      | 25 wood, 10 stone          | 3    | 3       | 6 food/day, none in winter, fertile soil only | 0.1        |
| Taş Ocağı    | 35 wood, 15 stone          | 4    | 2       | 3 stone/day from deposits within 3 tiles      | 0.1        |
| Tahıl Ambarı | 25 wood, 15 stone          | 3    | –       | +150 food capacity                            | 0.1        |
| Okul         | 40 wood, 25 stone, 10 gold | 6    | 1       | 2 research/day, +5 happiness                  | 0.4        |
| Köy Meydanı  | pre-built                  | –    | –       | 1 gold/day, merchant, tax rate                | –          |

Level 2 exists for every building (kulübe also level 3). Upgrades need Köy Meydanı level 2, which needs
16 population. Roads cost 2 wood per tile (1 refunded on removal).

## Rules

- Food: 0.25 per citizen per day.
- Tools: each production worker wears 0.03/day; with no tools output is halved.
- Forest tile: 40 wood, regrows 0.2/day. Stone tile: 300 stone, finite.
- Growth: +1 resident at most every 5 days (8 if happiness < 60) when there is free housing, 3 days of
  food, no famine and happiness ≥ 50. Newcomer: 70 % adult, 25 % child, 5 % elder (seeded).
- Famine: after 3 hungry days one resident leaves every 2 days, never below 6.
- Happiness target = 60 + food (−25…+10) + housing (−12…+5) + employment (−5…+5) + school (+5) +
  tax (−10…+5) + tools (−3); the value drifts +2/−3 per day toward it.
- Tax: low ×0.5 (+5), normal ×1, high ×1.5 (−10).
- Merchant: 8 gold → 10 wood, 10 gold → 10 food, 10 gold → 10 stone, 15 gold → 5 tools;
  10 wood → 3 gold, 10 stone → 4 gold, 10 food → 4 gold.
- Cancel construction: 100 % refund. Demolish: 50 % of invested cost. Refunds are limited by storage.

## Research

Temel Tarım 30 (çiftlik +25 %), Ormancılık 40, Taş İşçiliği 50, Depolama Düzeni 40,
Okuryazarlık 60 (needs Temel Tarım).

## Verified pacing (automated playthrough, 10 seeds)

A scripted "follow Mira" governor completes all eight quests between day 50 and day 71,
before the first winter. Doing nothing for 60 days never drops the village below 6 residents and the
merchant remains affordable.
A simulation tick costs about 0.5 ms in Node on the test machine (measured over 2,400 ticks on a finished chapter-1 village).
