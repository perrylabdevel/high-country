# Audit pass 04

**Grader model: `haiku`** (provider: claude, temperature 0)

> **The grader changed since pass 3 (`gemini-2.5-flash`).** Scores across the two are not comparable; decide whether to restart the series.

Captures: 32 · Generated: 2026-08-15T16:19:11.769Z
Capture backend: `webgpu` · adapter: Sj · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | 1 | Foreground is wide expanses of untextured bare dark dirt with minimal vegetation cover. |
| badlands-golden.png | U2 | 2 | Ground shows a smooth, low-frequency wash rather than human-scale detail; lacks micro-texture definition. |
| badlands-golden.png | U3 | 2 | Ground appears mostly uniform in the near field without noise-broken irregular transitions between materials. |
| badlands-golden.png | U4 | 4 | Distant vegetation and terrain features appear to sit correctly on the ground. |
| badlands-golden.png | U5 | 3 | Golden hour sun visible at horizon with directional shadows, but foreground shows crushed blacks with insufficient tonal separation from lit areas. |
| badlands-golden.png | U6 | 4 | Distant terrain and sparse trees read by shape with identifiable silhouettes; good depth perception. |
| badlands-golden.png | D1 | 3 | Mid-distance rock formations show some tonal layering suggesting stratification, but near field lacks visible strata. |
| badlands-golden.png | D2 | 3 | Distant terrain tones follow slopes in the mid-ground, but foreground lacks visible slope-driven material variation. |
| badlands-golden.png | D3 | 4 | Sparse vegetation visible as scattered trees in middle distance, consistent with arid badlands. |
| badlands-golden.png | G1 | — | n/a |
| badlands-midday.png | U1 | 4 | Ground is textured and detailed, appropriate for badlands; criterion about grass cover does not apply to this arid biome. |
| badlands-midday.png | U2 | 4 |  |
| badlands-midday.png | U3 | 4 |  |
| badlands-midday.png | U4 | 4 |  |
| badlands-midday.png | U5 | 4 |  |
| badlands-midday.png | U6 | 4 |  |
| badlands-midday.png | D1 | 3 | Distant badlands formation shows some color/shade variation suggesting layering, but stratification is subtle and not prominently visible. |
| badlands-midday.png | D2 | 4 |  |
| badlands-midday.png | D3 | 5 |  |
| badlands-midday.png | G1 | — | n/a |
| burn-golden.png | U1 | 4 | Ground cover is continuous and reads as charred/burned earth throughout, not bare or untextured, with clear tonal variation with distance. |
| burn-golden.png | U2 | 4 | Texture detail is at human scale relative to burned trunks and shadows; no obvious tiling grid or low-frequency wash. |
| burn-golden.png | U3 | 4 | Transitions between darker and lighter ground areas are irregular and noise-broken, no clean straight material boundaries. |
| burn-golden.png | U4 | 4 | Standing charred trunks and fallen logs meet the ground with proper grounding and shadows. |
| burn-golden.png | U5 | 4 | Golden hour lighting is warm and clear with directional shadows; sun disk visible as bright warm orb; no blown highlights or crushed blacks. |
| burn-golden.png | U6 | 4 | Distant tree silhouettes and forest edge read as identifiable shapes, not smeared or collapsed into flat geometry. |
| burn-golden.png | B1 | 5 | Charred standing trunks with no canopy clearly visible throughout; ground visibly darkened to match burned terrain. |
| burn-golden.png | B2 | 1 | No visible smoke plume or smoke anchored to a ground source; only atmospheric haze. |
| burn-golden.png | G1 | — | n/a |
| burn-midday.png | U1 | 2 | Near field is mostly bare burnt earth with sparse grass; far field shows better coverage but near field lacks continuous grass cover. |
| burn-midday.png | U2 | 4 |  |
| burn-midday.png | U3 | 4 |  |
| burn-midday.png | U4 | 5 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 5 |  |
| burn-midday.png | B2 | 0 | No visible smoke plume. |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 1 | Ground is predominantly bare dirt and gravel with minimal visible grass cover throughout the near and middle field. |
| cemetery-golden.png | U2 | 4 |  |
| cemetery-golden.png | U3 | 4 |  |
| cemetery-golden.png | U4 | 4 |  |
| cemetery-golden.png | U5 | 4 |  |
| cemetery-golden.png | U6 | 4 |  |
| cemetery-golden.png | C1 | 4 |  |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 5 |  |
| cemetery-midday.png | U2 | 5 |  |
| cemetery-midday.png | U3 | 4 | Most transitions are irregular, but some material boundaries could be more noise-broken. |
| cemetery-midday.png | U4 | 5 |  |
| cemetery-midday.png | U5 | 5 |  |
| cemetery-midday.png | U6 | 4 | Distant conifers read clearly, but objects on the far ridge blur and become harder to distinguish. |
| cemetery-midday.png | C1 | 4 | Headstones show height variation and some spacing irregularity, but arrangement is fairly orderly rather than highly varied. |
| cemetery-midday.png | G1 | 4 | Road edges are reasonably ragged and show texture variation with a darker center, though definition could be sharper. |
| elPaso-golden.png | U1 | 1 | Ground is bare dark terrain with no visible grass cover in near or far field. |
| elPaso-golden.png | U2 | 2 | Ground texture is uniform and lacking detail; scale against human eye height is unclear. |
| elPaso-golden.png | U3 | 3 | Uniform dark ground makes material transitions difficult to assess; no obvious seams but minimal variation. |
| elPaso-golden.png | U4 | 4 | Buildings appear to sit properly on ground without visible gaps or sinking. |
| elPaso-golden.png | U5 | 4 | Golden hour lighting is present with warm sky tones and directional shadows; shadows could be more pronounced. |
| elPaso-golden.png | U6 | 4 | Distant tree and hills are readable by silhouette; far structures are visible but slightly undefined. |
| elPaso-golden.png | E1 | 1 | Structures are untextured geometric boxes with no adobe surface detail or architectural character. |
| elPaso-golden.png | G1 | — | n/a |
| elPaso-midday.png | U1 | 1 | Ground is entirely bare dirt with no grass cover visible in the near field; should read as continuous grass thinning with distance. |
| elPaso-midday.png | U2 | 3 | Texture has some rocky detail but appears somewhat uniform and lacks clear human-scale variation; difficult to assess for repeating tiles from this angle. |
| elPaso-midday.png | U3 | 4 |  |
| elPaso-midday.png | U4 | 4 |  |
| elPaso-midday.png | U5 | 4 |  |
| elPaso-midday.png | U6 | 4 |  |
| elPaso-midday.png | E1 | 4 |  |
| elPaso-midday.png | G1 | — | n/a |
| fortGrant-golden.png | U1 | 2 | Large expanses of the ground appear uniformly dark and bare, with insufficient visible texture or vegetation cover to read as grassed terrain. |
| fortGrant-golden.png | U2 | — | Darkness prevents assessment of whether ground detail is human-scale or if tiling is present. |
| fortGrant-golden.png | U3 | — | Darkness prevents clear visibility of material transitions between grass, dirt, or gravel. |
| fortGrant-golden.png | U4 | 4 | Structures appear to sit properly on the ground; no obvious gaps or floating elements, though darkness limits certainty. |
| fortGrant-golden.png | U5 | 1 | Scene is dominated by crushed blacks and shadows with no visible warm golden-hour tones; lacks the characteristic warmth and long-shadow definition of golden-hour lighting. |
| fortGrant-golden.png | U6 | 4 | Distant mountains and trees read clearly as distinct silhouettes; not smeared or popping. |
| fortGrant-golden.png | F1 | 3 | Four walls are visible enclosing a space, but no clear centered gate opening is visible from this angle due to darkness and camera position. |
| fortGrant-golden.png | F2 | 4 | Interior structures with roofs are clearly visible inside the fort walls. |
| fortGrant-golden.png | G1 | — | A lighter path may be present near the fort, but wheel tracks and ragged edges cannot be assessed due to insufficient visibility and darkness. |
| fortGrant-midday.png | U1 | 2 | Near field is mostly bare brown dirt with only sparse discontinuous patches of darker material; no continuous grass cover visible. |
| fortGrant-midday.png | U2 | 3 | Dirt texture shows visible repeating linear striations and tiling patterns rather than natural-scale detail. |
| fortGrant-midday.png | U3 | 4 |  |
| fortGrant-midday.png | U4 | 4 |  |
| fortGrant-midday.png | U5 | 4 |  |
| fortGrant-midday.png | U6 | 4 |  |
| fortGrant-midday.png | F1 | 4 |  |
| fortGrant-midday.png | F2 | 5 |  |
| fortGrant-midday.png | G1 | — | n/a |
| huntingCabin-golden.png | U1 | 2 | Near field is predominantly bare gravel and dirt; grass appears only on left side and does not read as continuous ground cover. |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 4 |  |
| huntingCabin-golden.png | U4 | 4 |  |
| huntingCabin-golden.png | U5 | 5 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 4 | All elements present; chimney somewhat obscured by shadow. |
| huntingCabin-golden.png | G1 | 4 |  |
| huntingCabin-midday.png | U1 | 4 | Grass cover is continuous in mid-distance, but a wide bare dirt/road area occupies significant ground space in the near field. |
| huntingCabin-midday.png | U2 | 4 |  |
| huntingCabin-midday.png | U3 | 2 | Road edges are sharp and linear, not ragged and noise-broken; clean straight boundary between path and grass violates the criterion. |
| huntingCabin-midday.png | U4 | 5 |  |
| huntingCabin-midday.png | U5 | 4 |  |
| huntingCabin-midday.png | U6 | 4 |  |
| huntingCabin-midday.png | H1 | 2 | Roof pitch is barely perceptible and reads as nearly flat rather than clearly pitched; door is not visible from this camera angle. |
| huntingCabin-midday.png | G1 | 2 | Road edges are straight and clean throughout, lacking the ragged and noise-broken character required; boundary is too linear. |
| ironValley-golden.png | U1 | 1 | Near field is predominantly dark and bare, with no visible grass cover texture. Ground reads as untextured shadow rather than grassed terrain. |
| ironValley-golden.png | U2 | 1 | Foreground is too dark to assess texture scale against eye height; surface detail is obscured by shadow. |
| ironValley-golden.png | U3 | 3 | Material transitions are unclear due to deep foreground shadow, but visible edges do not show obvious straight lines. |
| ironValley-golden.png | U4 | 4 |  |
| ironValley-golden.png | U5 | 2 | Crushed blacks in foreground violate the 'no crushed blacks' requirement despite correct directional and warm golden-hour lighting. |
| ironValley-golden.png | U6 | 4 |  |
| ironValley-golden.png | I1 | 2 | Tailings piles are identifiable, but background industrial structures are backlit silhouettes with no distinguishable headframe or stamp mill shape. |
| ironValley-golden.png | I2 | 2 | Structures are backlit into dark silhouettes; no color separation visible between rust, iron, and timber materials. |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 1 | Ground is predominantly bare brown earth with minimal grass cover; wide expanses of untextured dirt in the near and middle field where biome should be grassed. |
| ironValley-midday.png | U2 | 2 | Ground texture appears smeared and uniform with no readable human-scale detail; lacks variation that would register at 1.62m eye height. |
| ironValley-midday.png | U3 | 4 |  |
| ironValley-midday.png | U4 | 4 |  |
| ironValley-midday.png | U5 | 3 | Midday sun position reads correctly with minimal shadows, but overall image is washed out and flat with desaturated colors. |
| ironValley-midday.png | U6 | 3 | Distant trees and structures are identifiable by shape but soft and hazy; lack crisp silhouettes at distance. |
| ironValley-midday.png | I1 | 2 | Visible structures are too generic and simplified; no recognizable headframe, stamp mill silhouette, or other distinctive mining equipment. |
| ironValley-midday.png | I2 | 2 | Materials are solid flat colors without visual distinction; no visible rust texture, weathering, or timber grain that differentiates material types. |
| ironValley-midday.png | G1 | — | n/a |
| lakeMercy-golden.png | U1 | — | Camera positioned over water; ground not visible. Would need shore/beach view to assess. |
| lakeMercy-golden.png | U2 | 1 | Water surface is completely featureless—no visible texture detail at any scale, reads as a uniform flat plane. |
| lakeMercy-golden.png | U3 | — | No material transitions visible at assessable distance; camera is over uniform water. |
| lakeMercy-golden.png | U4 | 4 | Boat sits on water surface correctly, though overall water rendering is problematic. |
| lakeMercy-golden.png | U5 | 1 | Water is pure black instead of showing golden/warm reflections at golden hour; lighting fundamentally incorrect for the scene and sun position. |
| lakeMercy-golden.png | U6 | 3 | Distant treeline is identifiable by shape but appears pixelated and slightly smeared at the horizon. |
| lakeMercy-golden.png | L1 | 1 | No depth gradient visible; water is uniformly dark black throughout instead of pale at shore and saturated at depth. |
| lakeMercy-golden.png | L2 | 1 | Water surface has no visible detail at any scale—completely featureless, no surface motion or normal variation. |
| lakeMercy-golden.png | L3 | — | Shoreline not clearly visible from this camera angle; would need closer view of water-land transition. |
| lakeMercy-golden.png | L4 | — | No dock visible in frame. |
| lakeMercy-golden.png | G1 | — | n/a—no road visible in this frame. |
| lakeMercy-midday.png | U1 | 1 | Near field is water; visible ground (island) is rocky/tan colored, not continuous grass. |
| lakeMercy-midday.png | U2 | 4 |  |
| lakeMercy-midday.png | U3 | 4 |  |
| lakeMercy-midday.png | U4 | 5 |  |
| lakeMercy-midday.png | U5 | 4 |  |
| lakeMercy-midday.png | U6 | 4 |  |
| lakeMercy-midday.png | L1 | 4 |  |
| lakeMercy-midday.png | L2 | 3 | Water surface shows some texture details but they are subtle and don't clearly distinguish two distinct scales. |
| lakeMercy-midday.png | L3 | 1 | No visible white foam along shoreline; tan island meets dark water with clean transition. |
| lakeMercy-midday.png | L4 | 4 |  |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 0 | Ground is nearly black with no visible grass cover; appears to be bare or completely unlit. |
| mission-golden.png | U2 | 0 | Ground is too dark to discern texture scale or human-scale detail visibility. |
| mission-golden.png | U3 | — | Camera distance and extreme darkness prevent assessment of material transitions. |
| mission-golden.png | U4 | 2 | Building silhouette appears to contact ground but is too dark to confirm whether gaps or half-burial are present. |
| mission-golden.png | U5 | 0 | Sky shows golden-hour color but scene is severely underexposed; foreground is nearly black with crushed shadows, lacks warm ground illumination expected in golden hour. |
| mission-golden.png | U6 | 2 | Building reads as a box shape with cross/tower on horizon but is extremely distant, small, and dark to distinguish architectural details. |
| mission-golden.png | M1 | — | Cannot distinguish adobe from timber in this darkness and distance. |
| mission-golden.png | M2 | 2 | Cross or tower structure is visible on the building's roofline but too distant and dark to confirm proper placement on facade rather than roof center. |
| mission-golden.png | G1 | — | n/a |
| mission-midday.png | U1 | 1 | The entire visible ground is bare brown dirt with zero grass coverage in near or far field where a grassed biome is expected. |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 3 | Only one dominant material (dirt) visible; transitions between different terrain types are not clearly present or assessable. |
| mission-midday.png | U4 | 4 |  |
| mission-midday.png | U5 | 4 |  |
| mission-midday.png | U6 | 4 |  |
| mission-midday.png | M1 | 4 |  |
| mission-midday.png | M2 | 4 |  |
| mission-midday.png | G1 | — | No distinct gravel road visible; ground is uniform dirt with subtle curved marks that may be tracks. |
| northernPines-golden.png | U1 | 2 | Foreground shows sparse scattered small plants over exposed dark soil, not continuous grass cover as required for the near field. |
| northernPines-golden.png | U2 | 4 |  |
| northernPines-golden.png | U3 | 4 |  |
| northernPines-golden.png | U4 | 5 |  |
| northernPines-golden.png | U5 | 5 |  |
| northernPines-golden.png | U6 | 4 |  |
| northernPines-golden.png | P1 | 4 |  |
| northernPines-golden.png | P2 | 5 |  |
| northernPines-golden.png | P3 | 4 |  |
| northernPines-golden.png | P4 | 4 |  |
| northernPines-golden.png | P5 | 4 |  |
| northernPines-golden.png | G1 | 2 | The lighter road area through the center has relatively clean edges rather than ragged, noise-broken transitions against the surrounding ground. |
| northernPines-midday.png | U1 | 3 | Grass present in mid-field but large dark dirt/gravel road dominates the foreground, breaking continuous ground cover. |
| northernPines-midday.png | U2 | 4 |  |
| northernPines-midday.png | U3 | 3 | Road edges are relatively well-defined rather than noise-broken; left edge of the road shows fairly clean boundary against grass. |
| northernPines-midday.png | U4 | 5 |  |
| northernPines-midday.png | U5 | 5 |  |
| northernPines-midday.png | U6 | 4 |  |
| northernPines-midday.png | P1 | 4 |  |
| northernPines-midday.png | P2 | 4 |  |
| northernPines-midday.png | P3 | 4 |  |
| northernPines-midday.png | P4 | 5 |  |
| northernPines-midday.png | P5 | 4 |  |
| northernPines-midday.png | G1 | 3 | Road center is darker and smoother than edges, but the margins are more defined than noise-broken. |
| overlook-golden.png | U1 | 2 | Most of the near-mid field is crushed black, obscuring ground texture visibility. |
| overlook-golden.png | U2 | 3 | Only the extreme foreground texture is readable; the rest is too dark to assess scale properly. |
| overlook-golden.png | U3 | — | Material transitions are not visible due to crushed shadows throughout the scene. |
| overlook-golden.png | U4 | 4 |  |
| overlook-golden.png | U5 | 1 | Most of the foreground and middle ground is crushed black with no visible shadow detail or directional lighting. |
| overlook-golden.png | U6 | 4 |  |
| overlook-golden.png | O1 | 2 | The middle distance is crushed black and unreadable, failing the readable vista requirement. |
| overlook-golden.png | O2 | 3 |  |
| overlook-golden.png | G1 | — | n/a |
| overlook-midday.png | U1 | 2 | Visible bare dirt/worn patches interrupt continuous grass cover in the near field; brown areas dominate rather than reading as peripheral. |
| overlook-midday.png | U2 | 4 |  |
| overlook-midday.png | U3 | 2 | Road and fence edges are clean and geometric rather than noise-broken; material boundaries read as hard lines rather than irregular transitions. |
| overlook-midday.png | U4 | 4 |  |
| overlook-midday.png | U5 | 4 |  |
| overlook-midday.png | U6 | 4 |  |
| overlook-midday.png | O1 | 5 |  |
| overlook-midday.png | O2 | 4 |  |
| overlook-midday.png | G1 | 2 | Road path is visible and worn darker in center, but edges lack ragged, noise-broken character; boundaries are too clean and straight. |
| ranch-golden.png | U1 | 3 | Grass cover is patchy with bare ground visible in the near field, not the continuous cover the criterion expects. |
| ranch-golden.png | U2 | 4 |  |
| ranch-golden.png | U3 | 4 |  |
| ranch-golden.png | U4 | 4 |  |
| ranch-golden.png | U5 | 5 |  |
| ranch-golden.png | U6 | 4 |  |
| ranch-golden.png | R1 | 4 |  |
| ranch-golden.png | R2 | 4 |  |
| ranch-golden.png | R3 | 4 |  |
| ranch-golden.png | R4 | 4 |  |
| ranch-golden.png | R5 | — | Door scale cannot be assessed from backlighting and distance; would require closer front-facing view. |
| ranch-golden.png | R6 | 4 |  |
| ranch-golden.png | G1 | 4 |  |
| ranch-midday.png | U1 | 4 | Grass covers near field with continuous coverage, thinning toward distant terrain; some exposed dirt patches but not wide bare expanses. |
| ranch-midday.png | U2 | 4 | Ground texture appears human-scale against eye height with no obvious repeating tiling or smeared wash. |
| ranch-midday.png | U3 | 3 | Dirt-to-grass transitions visible but boundaries appear somewhat regular and clean rather than consistently noise-broken. |
| ranch-midday.png | U4 | 4 | All structures sit properly on ground with no gaps, floating, or half-buried elements. |
| ranch-midday.png | U5 | 4 | Midday lighting with directional shadows visible on building; no blown highlights or crushed blacks. |
| ranch-midday.png | U6 | 4 | Distant trees and outbuildings on left horizon are identifiable by shape and not collapsed into flat cards. |
| ranch-midday.png | R1 | 3 | Building structure partially obscured by shadow; L-plan massing with distinct main block and ell cannot be fully confirmed from this angle. |
| ranch-midday.png | R2 | 3 | Roof is clearly peaked but full hip roof form with even overhang on all four sides cannot be assessed from this viewing angle. |
| ranch-midday.png | R3 | 2 | Front entry area is heavily shadowed; no clearly visible porch posts supporting a roof structure. |
| ranch-midday.png | R4 | 4 | Vertical chimney or flue element visible on roof, running from wall above the ridge line, not detached. |
| ranch-midday.png | R5 | — | Front door not visible from this camera angle; move closer to building face or view from front elevation. |
| ranch-midday.png | R6 | 2 | Distant outbuildings lack sufficient detail; barn gable orientation, fence rail count, and windmill type cannot be clearly assessed. |
| ranch-midday.png | G1 | 3 | Road center shows wear pattern and is darker than margins, but edges do not show consistently ragged or noise-broken texture against grass. |
| silverCreek-golden.png | U1 | 1 | Bare dark ground dominates; no visible grass cover in near field |
| silverCreek-golden.png | U2 | 2 | Ground texture heavily crushed into shadow; detail is lost |
| silverCreek-golden.png | U3 | — | Extreme backlighting prevents clear assessment of material transitions |
| silverCreek-golden.png | U4 | 4 | Buildings sit properly on ground; no obvious floating or sinking |
| silverCreek-golden.png | U5 | 3 | Golden hour warmth and long shadows present but crushed blacks reduce detail and create muddy mid-tones |
| silverCreek-golden.png | U6 | 5 | Treeline and steeple silhouettes are clear and identifiable |
| silverCreek-golden.png | S1 | 2 | Buildings appear scattered without clear street alignment; no legible street corridor |
| silverCreek-golden.png | S2 | 0 | No evidence of false fronts in visible silhouettes |
| silverCreek-golden.png | S3 | — | Cannot clearly assess steeple position relative to entry at this distance and lighting |
| silverCreek-golden.png | S4 | 0 | No boardwalk visible in this heavily shadowed view |
| silverCreek-golden.png | S5 | 4 | Buildings show variety in height, width and color tone |
| silverCreek-golden.png | G1 | — | n/a |
| silverCreek-midday.png | U1 | 0 | Ground is entirely bare gravel/dirt in near and mid field with no grass cover; criterion requires continuous grass thinning with distance but none is visible here. |
| silverCreek-midday.png | U2 | 2 | Ground texture is uniform and smeared without human-scale detail; no visible pebbles, tufts, or fine variation that would read at 1.62m eye height. |
| silverCreek-midday.png | U3 | 2 | Road perimeter shows clean, straight boundaries against the surrounding terrain rather than noise-broken irregular transitions. |
| silverCreek-midday.png | U4 | 3 | Most buildings contact the ground but some appear to have minor gaps or floating artifacts at their bases. |
| silverCreek-midday.png | U5 | 4 | Shadows are present and directional; lighting is appropriately flat for high sun position; no blown highlights or crushed blacks. |
| silverCreek-midday.png | U6 | 3 | Distant trees and terrain are simplified and somewhat flat but remain identifiable by silhouette. |
| silverCreek-midday.png | S1 | 1 | Buildings are scattered in loose cluster; no clear street corridor or consistent alignment—buildings face varying angles rather than a coherent street. |
| silverCreek-midday.png | S2 | 0 | No false fronts visible; buildings are simple geometric boxes without facade or architectural detailing. |
| silverCreek-midday.png | S3 | 3 | Steeple is visible on central church structure and appears positioned over the gable, but camera angle limits verification of exact placement. |
| silverCreek-midday.png | S4 | 0 | No raised boardwalk visible; buildings sit directly on ground level. |
| silverCreek-midday.png | S5 | 2 | Limited variety—buildings repeat simple box forms in tan and dark brown; insufficient height, width, and material differentiation. |
| silverCreek-midday.png | G1 | 2 | Road edges are clean and straight against surrounding terrain rather than ragged and noise-broken; wheel-track center detail is not clearly distinguished from loose margins. |
| timberCamp-golden.png | U1 | 3 | Significant bare dirt and gravel visible around central structures and extending rightward, not just thinning at distance. |
| timberCamp-golden.png | U2 | 4 |  |
| timberCamp-golden.png | U3 | 3 | Dirt/gravel boundaries around the central worked area appear relatively clean and defined rather than noise-broken. |
| timberCamp-golden.png | U4 | 4 |  |
| timberCamp-golden.png | U5 | 5 |  |
| timberCamp-golden.png | U6 | 4 |  |
| timberCamp-golden.png | T1 | 4 |  |
| timberCamp-golden.png | T2 | 2 | Main structures are heavily backlit and silhouetted; pitched roofs and doors are not visible. |
| timberCamp-golden.png | G1 | 3 | Road visible but edges are partially straight rather than fully ragged and noise-broken. |
| timberCamp-midday.png | U1 | 3 | Significant bare dirt expanse in the central work area; grass patches visible at edges but not continuous in near field. |
| timberCamp-midday.png | U2 | 4 | Ground texture reads at human scale with believable detail; minor repetition pattern noticeable but not distracting. |
| timberCamp-midday.png | U3 | 4 | Grass-to-dirt transitions mostly irregular and noise-broken; edge between central dirt area and peripheral grass shows some abruptness. |
| timberCamp-midday.png | U4 | 5 |  |
| timberCamp-midday.png | U5 | 4 | Shadows present and directional; lighting and exposure correct for midday; shadows could be crisper. |
| timberCamp-midday.png | U6 | 4 | Distant trees and landscape features read clearly by silhouette; minor LOD transitions present but not objectionable. |
| timberCamp-midday.png | T1 | 5 |  |
| timberCamp-midday.png | T2 | 4 | Main buildings have pitched roofs and doors; white tent lacks pitched roof but may be appropriate for camp structure type. |
| timberCamp-midday.png | G1 | 3 | Worn ground path visible through camp with some texture variation; edges lack the clearly ragged, noise-broken quality against grass. |
| tribal-golden.png | U1 | 2 | Extensive bare tan/brown dirt and gravel dominate the near field; grass is patchy rather than continuous cover. |
| tribal-golden.png | U2 | 4 |  |
| tribal-golden.png | U3 | 4 |  |
| tribal-golden.png | U4 | 4 |  |
| tribal-golden.png | U5 | 4 |  |
| tribal-golden.png | U6 | 3 | Distant trees are readable as silhouettes but render somewhat soft and hazy at the horizon. |
| tribal-golden.png | N1 | 3 | Tipis show clear scale variation but minimal rotation variation; most point in similar directions. |
| tribal-golden.png | N2 | 4 |  |
| tribal-golden.png | G1 | — | n/a |
| tribal-midday.png | U1 | 2 | A large, continuous bare dirt patch runs horizontally through the center of the camp, interrupting grass continuity in the near field. |
| tribal-midday.png | U2 | 5 |  |
| tribal-midday.png | U3 | 1 | The boundary between grass and the central dirt clearing is a clean, straight horizontal line with no noise or irregularity. |
| tribal-midday.png | U4 | 5 |  |
| tribal-midday.png | U5 | 4 | Shadows are present and directional; midday lighting is appropriate, though sky detail is slightly washed. |
| tribal-midday.png | U6 | 4 | Distant trees and terrain are identifiable by shape; detail is slightly simplified but readable, not smeared or collapsed. |
| tribal-midday.png | N1 | 3 | Tipis show some rotation variation but are uniformly scaled with no significant size differentiation. |
| tribal-midday.png | N2 | 4 | Arrangement is not on a grid and reads organized, though placement could be more sprawling and organic. |
| tribal-midday.png | G1 | — | n/a |
| westernRange-golden.png | U1 | 0 | Foreground is crushed to black; ground cover not visible. |
| westernRange-golden.png | U2 | 0 | Ground texture not visible; foreground rendered as pure black. |
| westernRange-golden.png | U3 | 0 | Material transitions not visible in crushed foreground. |
| westernRange-golden.png | U4 | 0 | No ground detail visible to assess object interaction. |
| westernRange-golden.png | U5 | 0 | Crushed blacks throughout; no visible golden-hour lighting on terrain. |
| westernRange-golden.png | U6 | 5 | Distant evergreen trees are clearly identifiable by silhouette. |
| westernRange-golden.png | W1 | 0 | Grassland does not read to horizon; foreground is black. |
| westernRange-golden.png | W2 | — | n/a |
| westernRange-golden.png | W3 | — | n/a |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 3 | Ground has continuous texture throughout, but the foreground reads as brown bare soil rather than visible grass cover. |
| westernRange-midday.png | U2 | 4 |  |
| westernRange-midday.png | U3 | 4 |  |
| westernRange-midday.png | U4 | 5 |  |
| westernRange-midday.png | U5 | 4 |  |
| westernRange-midday.png | U6 | 5 |  |
| westernRange-midday.png | W1 | 2 | Terrain reads as brown bare or sparse scrub, not grassed grassland to the horizon. |
| westernRange-midday.png | W2 | — | n/a - no cattle visible in frame |
| westernRange-midday.png | W3 | — | n/a - no fences visible in frame |
| westernRange-midday.png | G1 | — | n/a - no road visible in frame |

## Regressions

- **burn-midday.png B2: 5 → 0** — No visible smoke plume.
- **westernRange-golden.png U3: 4 → 0** — Material transitions not visible in crushed foreground.
- **westernRange-golden.png U4: 4 → 0** — No ground detail visible to assess object interaction.
- **westernRange-golden.png U5: 3 → 0** — Crushed blacks throughout; no visible golden-hour lighting on terrain.
- **mission-golden.png U2: 2 → 0** — Ground is too dark to discern texture scale or human-scale detail visibility.
- **mission-golden.png U5: 2 → 0** — Sky shows golden-hour color but scene is severely underexposed; foreground is nearly black with crushed shadows, lacks warm ground illumination expected in golden hour.
- **westernRange-golden.png U2: 2 → 0** — Ground texture not visible; foreground rendered as pure black.
- **burn-golden.png B2: 5 → 1** — No visible smoke plume or smoke anchored to a ground source; only atmospheric haze.
- **overlook-golden.png U5: 5 → 1** — Most of the foreground and middle ground is crushed black with no visible shadow detail or directional lighting.
- **tribal-midday.png U3: 4 → 1** — The boundary between grass and the central dirt clearing is a clean, straight horizontal line with no noise or irregularity.
- **fortGrant-golden.png U5: 2 → 1** — Scene is dominated by crushed blacks and shadows with no visible warm golden-hour tones; lacks the characteristic warmth and long-shadow definition of golden-hour lighting.
- **ironValley-golden.png U2: 2 → 1** — Foreground is too dark to assess texture scale against eye height; surface detail is obscured by shadow.
- **lakeMercy-golden.png U5: 2 → 1** — Water is pure black instead of showing golden/warm reflections at golden hour; lighting fundamentally incorrect for the scene and sun position.
- **overlook-golden.png O1: 5 → 2** — The middle distance is crushed black and unreadable, failing the readable vista requirement.
- **badlands-golden.png U3: 4 → 2** — Ground appears mostly uniform in the near field without noise-broken irregular transitions between materials.
- **mission-golden.png U4: 4 → 2** — Building silhouette appears to contact ground but is too dark to confirm whether gaps or half-burial are present.
- **silverCreek-midday.png U3: 4 → 2** — Road perimeter shows clean, straight boundaries against the surrounding terrain rather than noise-broken irregular transitions.
- **mission-golden.png U6: 3 → 2** — Building reads as a box shape with cross/tower on horizon but is extremely distant, small, and dark to distinguish architectural details.
- **timberCamp-golden.png T2: 3 → 2** — Main structures are heavily backlit and silhouetted; pitched roofs and doors are not visible.
- **overlook-golden.png O2: 5 → 3** — 
- **ranch-midday.png R2: 5 → 3** — Roof is clearly peaked but full hip roof form with even overhang on all four sides cannot be assessed from this viewing angle.
- **silverCreek-golden.png U5: 5 → 3** — Golden hour warmth and long shadows present but crushed blacks reduce detail and create muddy mid-tones
- **elPaso-golden.png U3: 4 → 3** — Uniform dark ground makes material transitions difficult to assess; no obvious seams but minimal variation.
- **ironValley-golden.png U3: 4 → 3** — Material transitions are unclear due to deep foreground shadow, but visible edges do not show obvious straight lines.
- **mission-midday.png U3: 4 → 3** — Only one dominant material (dirt) visible; transitions between different terrain types are not clearly present or assessable.
- **northernPines-midday.png U3: 4 → 3** — Road edges are relatively well-defined rather than noise-broken; left edge of the road shows fairly clean boundary against grass.
- **timberCamp-golden.png U3: 4 → 3** — Dirt/gravel boundaries around the central worked area appear relatively clean and defined rather than noise-broken.
- **badlands-golden.png D3: 5 → 4** — Sparse vegetation visible as scattered trees in middle distance, consistent with arid badlands.
- **cemetery-golden.png U5: 5 → 4** — 
- **fortGrant-golden.png F2: 5 → 4** — Interior structures with roofs are clearly visible inside the fort walls.
- **ranch-golden.png U4: 5 → 4** — 
- **ranch-golden.png R2: 5 → 4** — 
- **ranch-golden.png R4: 5 → 4** — 
- **ranch-midday.png U4: 5 → 4** — All structures sit properly on ground with no gaps, floating, or half-buried elements.
- **ranch-midday.png R4: 5 → 4** — Vertical chimney or flue element visible on roof, running from wall above the ridge line, not detached.
- **tribal-golden.png U5: 5 → 4** — 
- **tribal-golden.png N2: 5 → 4** — 
- **tribal-midday.png N2: 5 → 4** — Arrangement is not on a grid and reads organized, though placement could be more sprawling and organic.

## Five worst criteria

1. **burn-midday.png B2 (0)** — No visible smoke plume.
1. **mission-golden.png U1 (0)** — Ground is nearly black with no visible grass cover; appears to be bare or completely unlit.
1. **mission-golden.png U2 (0)** — Ground is too dark to discern texture scale or human-scale detail visibility.
1. **mission-golden.png U5 (0)** — Sky shows golden-hour color but scene is severely underexposed; foreground is nearly black with crushed shadows, lacks warm ground illumination expected in golden hour.
1. **silverCreek-golden.png S2 (0)** — No evidence of false fronts in visible silhouettes

## Could not assess

- badlands-golden.png G1 — n/a
- badlands-midday.png G1 — n/a
- burn-golden.png G1 — n/a
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- elPaso-golden.png G1 — n/a
- elPaso-midday.png G1 — n/a
- fortGrant-golden.png U2 — Darkness prevents assessment of whether ground detail is human-scale or if tiling is present.
- fortGrant-golden.png U3 — Darkness prevents clear visibility of material transitions between grass, dirt, or gravel.
- fortGrant-golden.png G1 — A lighter path may be present near the fort, but wheel tracks and ragged edges cannot be assessed due to insufficient visibility and darkness.
- fortGrant-midday.png G1 — n/a
- ironValley-golden.png G1 — n/a
- ironValley-midday.png G1 — n/a
- lakeMercy-golden.png U1 — Camera positioned over water; ground not visible. Would need shore/beach view to assess.
- lakeMercy-golden.png U3 — No material transitions visible at assessable distance; camera is over uniform water.
- lakeMercy-golden.png L3 — Shoreline not clearly visible from this camera angle; would need closer view of water-land transition.
- lakeMercy-golden.png L4 — No dock visible in frame.
- lakeMercy-golden.png G1 — n/a—no road visible in this frame.
- lakeMercy-midday.png G1 — n/a
- mission-golden.png U3 — Camera distance and extreme darkness prevent assessment of material transitions.
- mission-golden.png M1 — Cannot distinguish adobe from timber in this darkness and distance.
- mission-golden.png G1 — n/a
- mission-midday.png G1 — No distinct gravel road visible; ground is uniform dirt with subtle curved marks that may be tracks.
- overlook-golden.png U3 — Material transitions are not visible due to crushed shadows throughout the scene.
- overlook-golden.png G1 — n/a
- ranch-golden.png R5 — Door scale cannot be assessed from backlighting and distance; would require closer front-facing view.
- ranch-midday.png R5 — Front door not visible from this camera angle; move closer to building face or view from front elevation.
- silverCreek-golden.png U3 — Extreme backlighting prevents clear assessment of material transitions
- silverCreek-golden.png S3 — Cannot clearly assess steeple position relative to entry at this distance and lighting
- silverCreek-golden.png G1 — n/a
- tribal-golden.png G1 — n/a
- tribal-midday.png G1 — n/a
- westernRange-golden.png W2 — n/a
- westernRange-golden.png W3 — n/a
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — n/a - no cattle visible in frame
- westernRange-midday.png W3 — n/a - no fences visible in frame
- westernRange-midday.png G1 — n/a - no road visible in frame

## Verdict

- Rubric coverage: **95%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
