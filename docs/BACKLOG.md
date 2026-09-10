# Campaign backlog (Episodes 2–12)

Episode 1 ("Smoke on the North Wind") actually ships a mission state machine — stages complete on talk / arrive / examine, with flags `sawTheLine`, `sawArson`, `loopComplete` — plus a versioned save that stores that mission state (not a `decision` field), nav-route travel to the Ranch Overlook, and arrival/examine interactions whose result changes family dialogue and state. It does **not** yet have per-faction reputation, family relationship notes, clue records with contradictions, or a `decision` save field; those are Episode 2 prerequisites to build, not systems to reuse.

Later episodes should reuse those systems rather than new prototypes.

| Ep | Title | New data, not new engines |
| --- | --- | --- |
| 2 | The Empty Stage | Stage-road ambush clues; missing-person timeline; barn stash hotspot |
| 3 | A Measure of Water | Survey documents; two-community reputation split; town-meeting dialogue set |
| 4 | The Doctor’s Hand | Medicine/clue inspection; family health flag on ranch state |
| 5 | Noose at Sundown | Timed jail/courthouse scenes; law reputation as a clock, not a minigame engine |
| 6 | The Widow’s Claim | Title-deed documents; ranch ownership flags |
| 7 | The Quiet Giant | Frame-job evidence; Wade-specific dialogue routes |
| 8 | Children of the Pass | Northern pass travel biome; disease/supply ranch checks |
| 9 | A Candidate’s Promise | Public-speech scene; nonpartisan fictional politics; press vs law options |
| 10 | The Iron Road | Railroad construction region; tribal-land and water flags (research-backed characterization) |
| 11 | Blood at the Table | Campaign-wide clue cross-references; ally betrayal flags from prior episodes |
| 12 | Home Before Winter | Alliance checks against saved reputation; final confrontation using existing combat/dialogue hooks |

Do not start Episode 2 until the implemented Episode 1 loop — find Harlan → ride the ridge to the Overlook → glass the smoke → ride back and tell Nell, reaching `loopComplete` — can be finished without developer intervention, and the versioned save survives that climax → aftermath transition.
