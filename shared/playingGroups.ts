/**
 * Pure utility for generating balanced playing groups from a player roster.
 * No DB or framework dependencies — safe to use on both client and server.
 */

export type LockedSet = string[];

/**
 * A cart pair represents one golf cart that holds up to 2 players by default,
 * or more if multiple carts have been merged into a pre-group.
 */
export interface CartPair {
  players: string[];
  isMerged?: boolean;
}

/**
 * Compute the number of 2-seat cart slots needed for n players.
 * e.g. 4 players → 2 carts, 5 players → 3 carts, 6 players → 3 carts.
 */
export function computeCartCount(n: number): number {
  return Math.ceil(n / 2);
}

export interface GeneratedGroup {
  players: string[];
  lockedPlayerNames: Set<string>;
}

/**
 * Determine the optimal number of groups for n players.
 * Rules:
 *  - Min group size: 3, max: 5
 *  - Prefer as few groups as possible (larger groups)
 *  - Prefer even group sizes where feasible
 *
 * Examples: 12→3×4, 11→2×4+1×3, 10→2×5, 9→1×5+1×4, 8→2×4
 */
export function computeGroupLayout(n: number): { numGroups: number; baseSizes: number[] } {
  if (n < 3) {
    return { numGroups: 1, baseSizes: [n] };
  }

  const numGroups = Math.ceil(n / 5);
  const baseSize = Math.floor(n / numGroups);
  const remainder = n % numGroups;

  const sizes: number[] = [];
  for (let i = 0; i < numGroups; i++) {
    sizes.push(i < remainder ? baseSize + 1 : baseSize);
  }

  return { numGroups, baseSizes: sizes };
}

/**
 * Shuffle an array using Fisher-Yates.
 */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate playing groups from the given player list and locked sets.
 *
 * Placement strategy: First Fit Decreasing (locked sets sorted by size desc,
 * each placed into the group with the LEAST remaining capacity that can still
 * fit it). This avoids "wasting" large slots on small sets and handles cases
 * like n=7, locks=[2,2,3] correctly.
 *
 * If any locked set cannot fit into any group (truly unsatisfiable), throws a
 * PlayingGroupsConstraintError — callers should surface this as a user-visible
 * error rather than silently breaking locks.
 *
 * @param allPlayers   Full list of player names in the event roster.
 * @param lockedSets   Arrays of player names (2–4) that must play together.
 * @returns            Array of groups, each with a player list and a per-group
 *                     set of which players are locked (for UI display).
 * @throws PlayingGroupsConstraintError when locked constraints cannot all be satisfied.
 */
export class PlayingGroupsConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayingGroupsConstraintError";
  }
}

export function generatePlayingGroups(
  allPlayers: string[],
  lockedSets: LockedSet[] = [],
): GeneratedGroup[] {
  const n = allPlayers.length;
  if (n === 0) return [];

  const roster = new Set(allPlayers);

  // --- Validate locked sets ---
  // Keep only: players in roster, no player in two sets, size 2–4.
  const seenInLock = new Set<string>();
  const validLocked: LockedSet[] = [];
  for (const set of lockedSets) {
    const members = set.filter((p) => roster.has(p) && !seenInLock.has(p));
    if (members.length >= 2 && members.length <= 4) {
      members.forEach((p) => seenInLock.add(p));
      validLocked.push(members);
    }
  }

  const { baseSizes } = computeGroupLayout(n);
  const numGroups = baseSizes.length;

  const groupPlayers: string[][] = Array.from({ length: numGroups }, () => []);
  const groupLockedSets: LockedSet[][] = Array.from({ length: numGroups }, () => []);
  // capacity[g] = remaining slots in group g (used for locked set placement)
  const capacity = [...baseSizes];

  // --- First Fit Decreasing placement ---
  // Sort locked sets largest-first to give small sets the best chance of fitting
  // into whatever space remains after large sets are placed.
  for (const set of [...validLocked].sort((a, b) => b.length - a.length)) {
    // Pick the group with the LEAST remaining capacity that can still fit this set.
    // This "tightest-fit" strategy avoids wasting large slots and handles cases
    // like layout=[4,3] + locks=[3,2,2]: [3] fills the size-3 slot first, then
    // both [2]s fit in the size-4 slot — all locks honored.
    let best = -1;
    let bestCap = Infinity;
    for (let g = 0; g < numGroups; g++) {
      if (capacity[g] >= set.length && capacity[g] < bestCap) {
        best = g;
        bestCap = capacity[g];
      }
    }

    if (best === -1) {
      // Genuinely unsatisfiable — reject rather than silently break the lock.
      throw new PlayingGroupsConstraintError(
        `Cannot keep [${set.join(", ")}] together: no group has room for ${set.length} players. ` +
        `Try removing a locked set or reducing the number of locked players.`,
      );
    }

    groupPlayers[best].push(...set);
    groupLockedSets[best].push(set);
    capacity[best] -= set.length;
  }

  // --- Fill remaining slots with free players (shuffled) ---
  const lockedPool = new Set(validLocked.flat());
  const freePool = shuffled(allPlayers.filter((p) => !lockedPool.has(p)));

  let fi = 0;
  for (let g = 0; g < numGroups; g++) {
    while (capacity[g] > 0 && fi < freePool.length) {
      groupPlayers[g].push(freePool[fi++]);
      capacity[g]--;
    }
  }

  // Safety overflow: if any players remain (shouldn't happen with a correct
  // layout, but guard anyway), distribute to the smallest groups.
  while (fi < freePool.length) {
    const smallest = groupPlayers.reduce(
      (min, grp, i) => (grp.length < groupPlayers[min].length ? i : min),
      0,
    );
    groupPlayers[smallest].push(freePool[fi++]);
  }

  // --- Build output with per-group locked player names ---
  return groupPlayers.map((players, g) => ({
    players,
    lockedPlayerNames: new Set<string>(groupLockedSets[g].flat()),
  }));
}

/**
 * Format groups as plain text for sharing.
 * e.g. "Group 1: Alice, Bob, Carol\nGroup 2: Dave, Eve"
 */
export function formatGroupsForSharing(groups: { players: string[] }[]): string {
  return groups
    .map((g, i) => `Group ${i + 1}: ${g.players.join(", ")}`)
    .join("\n");
}
