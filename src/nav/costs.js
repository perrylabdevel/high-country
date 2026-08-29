/**
 * The cost model for route planning: is a piece of ground crossable, and what
 * does crossing it cost relative to riding an open road?
 *
 * This module is pure geometry over already-built world data (heightfield,
 * colliders). It touches no THREE, no scene, no game state — every query is a
 * pure function of (x, z, mode), which is what lets scripts/check-nav-graph
 * assert bit-identical graphs across builds.
 *
 * The gates here are deliberately the SAME numbers the movers themselves
 * enforce: a route the graph calls clear is one a player can actually walk or
 * ride. Re-tuning the horse's slope gate in horse.js without moving SLOPE_BLOCK
 * here reintroduces the "route says go, hill says no" bug where the target line
 * pointss along a face the rider can never climb.
 */

import { WATER, clampWorld } from "../map.js";
import { heightAt, normalAt } from "../heightfield.js";
import { deckHeightAt, moveAndSlide } from "../collision.js";

export const NAV = {
  // Graph resolution. 24 m matches one heightfield cell (12.5 m x2) closely
  // enough that slope sampling between nodes sees the same ground the mover
  // stands on, while keeping the whole graph small enough for sub-ms A*.
  SPACING: 24,
  // How far an approach or POI may sit from its nearest graph node before the
  // link is treated as a construction error rather than a long walk (the
  // approach check, not the graph, owns that assertion).
  SNAP_RADIUS: 60,
  // Nodes sample roads at 24 m; two samples within this distance are one
  // junction. Below ~10 m the intersection of two roads whose polylines merely
  // touch reads as two nodes 2 m apart and the A* zigzags between them; above
  // ~12 m real switchback hairpins start collapsing.
  JUNCTION_MERGE: 10,
  // Horse slope gate (horse.js). Below this slope.y the horse cannot cross at
  // all, so the graph must not offer the edge. The player gate is slightly
  // stricter (0.52); the walk gate below encodes that.
  SLOPE_BLOCK: 0.5,
  WALK_SLOPE_BLOCK: 0.52,
  // Soft slope cost: penalise but do not forbid the pitch between the hard
  // gate and ~23 deg from horizontal, so A* prefers the valley floor over the
  // ridge when both are open.
  SLOPE_SOFT: 0.92,
  SLOPE_COST: 3.0,
  // Water is crossable today (the lake bed is walkable terrain) but wrong:
  // a route that wades Lake Mercy costs the player minutes. Expensive, and
  // never silently preferred over a road. WATER_BLOCK stays false — making
  // water solid is its own campaign because it rewrites reachability for
  // docks, fords and the ranch bridge at once.
  WATER_COST: 6.0,
  WATER_BLOCK: false,
  // Off-road polylines (NAV_CUTS) are cross-country: allowed but priced like
  // the rough ground they are, so a cut is the detour of need, never the
  // default. If a cut starts winning over roads, either the roads are priced
  // wrong or the cut is on the wrong line. Both must fail check:routes.
  CUT_COST: 3.2,
  KIND_COST: { stage: 1.0, road: 1.0, trail: 1.25, cut: 3.2, bridge: 1.1, gate: 1.1, poi: 1.0 },
  // A hop whose resolve pushes the mover more than this is walking the route
  // *through* something, and the edge is dead for that mode.
  BLOCK_COST: 40,
  BLOCK_DROP: 0.6,
  // Edge failure memory: an edge a driver proved impassable leaves the search
  // for this long, and repeat failures age it out quadratically. 3 failures
  // = 12 minutes — long enough that a route search in the same session will
  // not re-offer a known wall to the player.
  EDGE_TTL: 180000,
  COLLIDER_STEP: 8
};

/** Body radius per movement mode — the actual values the movers use. */
export const MODE_RADIUS = { walk: 0.42, horse: 0.78 };

/**
 * Pointwise crossability at (x, z) for a mover of `mode`.
 *
 * Returns null when the ground itself refuses the mover — slope steeper than
 * the mover's own gate — because no cost makes an unclimbable face climbable.
 * Otherwise returns the per-metre cost contributions: slope soft cost, water
 * penalty, and (for a mover standing here) how far the world would shove it
 * sideways out of a collider.
 */
export function surfaceFactor(x, z, mode) {
  const slope = normalAt(x, z);
  const gate = mode === "walk" ? NAV.WALK_SLOPE_BLOCK : NAV.SLOPE_BLOCK;
  if (slope.y < gate) {
    return null;
  }
  const y = heightAt(x, z);
  const deck = deckHeightAt(x, z, y + 20);
  // Underwater unless a deck (bridge, boardwalk) carries ground-level
  // walkers at or above the water line at this spot.
  const inWater = y < WATER && (deck === -Infinity || deck < WATER);
  const radius = MODE_RADIUS[mode];
  const cleared = moveAndSlide(x, z, 0, 0, radius, null, y);
  return {
    slopeY: slope.y,
    inWater,
    standing: y,
    // Deviation from where we stood: nonzero means we are inside something
    // and physics ejected us.
    dev: Math.hypot(cleared.x - x, cleared.z - z)
  };
}

/**
 * Cost (metres-equivalent) for crossing edge a→b of `kind` on `mode`, or null
 * when the edge is impassable for that mode.
 *
 * A straight-line hop through a thin wall can slide between an 8 m sampling,
 * because resolve() only pushes the mover at hop endpoints; the approach stage
 * (check-approaches, 2 m legs) owns the last 60 m where that failure mode
 * would actually strand a player. This seam is documented there too — the two
 * checks must relax or tighten together.
 */
export function segmentCost(a, b, kind, mode) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const base = NAV.KIND_COST[kind] ?? 1.0;
  let cost = length * base;
  const steps = Math.max(1, Math.ceil(length / NAV.COLLIDER_STEP));

  // Pointwise slope/water/collider along the interior samples.
  const samples = [0.25, 0.5, 0.75];
  for (const t of samples) {
    const sf = surfaceFactor(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, mode);
    if (!sf) {
      return null;
    }
    // Slope soft cost rides the sampled pitch (approximating per-metre gain
    // over the whole edge with its worst interior pitch).
    cost += length * NAV.SLOPE_COST * Math.max(0, NAV.SLOPE_SOFT - sf.slopeY) / samples.length;
    if (sf.inWater) {
      if (NAV.WATER_BLOCK) {
        return null;
      }
      cost += length * NAV.WATER_COST / samples.length;
    }
    if (sf.dev > NAV.BLOCK_DROP) {
      return null;
    }
    if (sf.dev > 0.05) {
      cost += length * NAV.BLOCK_COST / samples.length;
    }
  }

  // Hop-by-hop collider pass: catches fences and walls a pointwise sample
  // would straddle, at the cost model's chosen resolution.
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const nx = a.x + (b.x - a.x) * t;
    const nz = a.z + (b.z - a.z) * t;
    const moved = moveAndSlide(px, pz, nx - px, nz - pz, MODE_RADIUS[mode], null, heightAt(px, pz));
    const dev = Math.hypot(moved.x - nx, moved.z - nz);
    if (dev > NAV.BLOCK_DROP) {
      return null;
    }
    if (dev > 0.05) {
      cost += length * NAV.BLOCK_COST / steps;
    }
    px = moved.x;
    pz = moved.z;
  }
  return cost;
}

/** Outside the playable world the graph simply does not exist. */
export function inWorld(x, z) {
  const c = clampWorld(x, z);
  return c.x === x && c.z === z;
}

export { WATER };