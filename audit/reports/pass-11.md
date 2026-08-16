# Audit pass 11

**Grader model: `haiku`** (provider: claude, temperature 0)

Captures: 32 · Generated: 2026-08-16T12:25:40.153Z
Capture backend: `webgpu` · adapter: GN · antialias: true

## Scores

| Image | Criterion | Score | Note |
|---|---|---|---|
| badlands-golden.png | U1 | — | n/a - criterion for grassy biomes; badlands should be arid, not grassed |
| badlands-golden.png | U2 | 4 | Ground texture detail is human-scale; no visible smearing or tiling grid |
| badlands-golden.png | U3 | 4 | Material transitions are smooth and gradual without harsh straight boundaries |
| badlands-golden.png | U4 | 5 | All objects properly contact the ground; no gaps or floating vegetation |
| badlands-golden.png | U5 | 4 | Warm golden-hour tones with directional shadows; no blown highlights or crushed blacks |
| badlands-golden.png | U6 | 4 | Distant badlands formations identifiable by ridge silhouettes; no smearing or card collapse |
| badlands-golden.png | D1 | 4 | Distant badlands show visible stratification and layering in slopes |
| badlands-golden.png | D2 | 4 | Rocky/badlands material responds to terrain slopes without uniform painting |
| badlands-golden.png | D3 | 5 | Vegetation appropriately sparse—scattered small shrubs and trees consistent with arid badlands |
| badlands-golden.png | G1 | — | n/a - no road visible in this frame |
| badlands-midday.png | U1 | 2 | Ground is mostly bare brown dirt/clay with minimal vegetation cover; does not read as continuous ground cover, especially in the near field. |
| badlands-midday.png | U2 | 3 | Ground texture has some weathered/eroded variation but reads somewhat wash-like; lacks human-scale detail definition in the immediate foreground. |
| badlands-midday.png | U3 | 4 | Ground material transitions are reasonably noise-broken; distant plateau edges are fairly straight but that is geologically appropriate for this landform. |
| badlands-midday.png | U4 | 5 |  |
| badlands-midday.png | U5 | 5 |  |
| badlands-midday.png | U6 | 4 | Distant cemetery markers and plateau ridge are identifiable by shape but lack sharpness; readable but could have higher clarity at distance. |
| badlands-midday.png | D1 | 4 | Horizontal stratification visible across distant plateau edges, clearly defining layered rock; visible but not maximally prominent. |
| badlands-midday.png | D2 | 3 | Some color/tonal variation on distant slopes suggesting slope-driven material difference, but this differentiation is subtle and not clearly emphasized. |
| badlands-midday.png | D3 | 5 |  |
| badlands-midday.png | G1 | — | n/a |
| burn-golden.png | U1 | 1 | Ground is entirely charred bare earth with no visible grass cover in near field. This is contextually correct for a burn site, but the criterion for continuous grass is not met. |
| burn-golden.png | U2 | 2 | Ground texture is relatively uniform reddish-brown wash with limited human-scale detail variation; lacks rich texture at eye height. |
| burn-golden.png | U3 | 2 | Transitions between burnt and distant areas are gradual and smooth, not noise-broken or irregular; the burn boundary lacks ragged edges. |
| burn-golden.png | U4 | 4 | Objects are well-grounded; wooden debris and charred trunks all sit properly on surface. |
| burn-golden.png | U5 | 5 | Golden hour lighting is correct: warm reddish tones throughout, clear directional shadows extending left, no blown highlights or crushed blacks. |
| burn-golden.png | U6 | — | grader omitted this criterion |
| burn-golden.png | B1 | 5 | Burn is fully readable: numerous charred standing trunks without canopy visible throughout, ground visibly darkened to dark reddish-brown. |
| burn-golden.png | B2 | 4 | Smoke plumes visible in mid-to-far distance as atmospheric formations anchored to burn area; plumes are visible and correctly positioned but source is somewhat distant. |
| burn-golden.png | G1 | — | n/a |
| burn-midday.png | U1 | 1 | Ground is entirely bare burnt earth in near field with no grass cover; criterion requires continuous grass cover thinning with distance. |
| burn-midday.png | U2 | 4 |  |
| burn-midday.png | U3 | 2 | Clean straight color boundaries between burnt reddish-brown zones and tan/beige soil areas visible across the ground. |
| burn-midday.png | U4 | 4 |  |
| burn-midday.png | U5 | 4 |  |
| burn-midday.png | U6 | 4 |  |
| burn-midday.png | B1 | 4 |  |
| burn-midday.png | B2 | 2 | Hazy shapes in upper sky are not clearly anchored to a ground source; no visible smoke plume rising from the burn. |
| burn-midday.png | G1 | — | n/a |
| cemetery-golden.png | U1 | 3 | Ground is largely bare tan/beige dirt with sparse scattered small vegetation/rock specks; cover is not continuous and reads as sparse rather than grassed. |
| cemetery-golden.png | U2 | 4 |  |
| cemetery-golden.png | U3 | 4 |  |
| cemetery-golden.png | U4 | 5 |  |
| cemetery-golden.png | U5 | 4 | Shadows present and directional; lighting lacks the warm saturation and dramatic contrast expected at true golden hour near horizon. |
| cemetery-golden.png | U6 | 5 |  |
| cemetery-golden.png | C1 | 5 |  |
| cemetery-golden.png | G1 | — | n/a |
| cemetery-midday.png | U1 | 2 | Wide expanses of bare brown dirt visible in near and mid field; grass is sparse and scattered rather than continuous ground cover. |
| cemetery-midday.png | U2 | 3 | Distribution of dark specks shows noticeable regularity and potential repeating pattern across the ground surface. |
| cemetery-midday.png | U3 | 4 |  |
| cemetery-midday.png | U4 | 4 |  |
| cemetery-midday.png | U5 | 4 |  |
| cemetery-midday.png | U6 | 4 |  |
| cemetery-midday.png | C1 | 4 |  |
| cemetery-midday.png | G1 | — | n/a |
| elPaso-golden.png | U1 | 1 | Ground is bare dark earth with no visible grass cover; predominantly arid dirt with no green vegetation in near or far field |
| elPaso-golden.png | U2 | 4 |  |
| elPaso-golden.png | U3 | 4 |  |
| elPaso-golden.png | U4 | 4 |  |
| elPaso-golden.png | U5 | 4 |  |
| elPaso-golden.png | U6 | 4 |  |
| elPaso-golden.png | E1 | 3 | Buildings have modest height variation but read as simple geometric boxes arranged together rather than an organic adobe settlement cluster |
| elPaso-golden.png | G1 | — | n/a |
| elPaso-midday.png | U1 | 2 | Ground reads as bare dirt throughout, with minimal grass cover visible in either near or distant field. |
| elPaso-midday.png | U2 | 4 |  |
| elPaso-midday.png | U3 | 4 |  |
| elPaso-midday.png | U4 | 5 |  |
| elPaso-midday.png | U5 | 4 |  |
| elPaso-midday.png | U6 | 3 | Distant cross and background structures are somewhat flattened and lack crisp silhouette definition. |
| elPaso-midday.png | E1 | 4 |  |
| elPaso-midday.png | G1 | — | n/a |
| fortGrant-golden.png | U1 | 2 | Ground is mostly bare earth with sparse scattered rocks; lacks continuous grass cover expected in the near field. |
| fortGrant-golden.png | U2 | 4 |  |
| fortGrant-golden.png | U3 | 4 |  |
| fortGrant-golden.png | U4 | 4 | Walls sit slightly above ground rather than fully integrated, but gap is minimal. |
| fortGrant-golden.png | U5 | 4 |  |
| fortGrant-golden.png | U6 | 4 |  |
| fortGrant-golden.png | F1 | 5 |  |
| fortGrant-golden.png | F2 | 5 |  |
| fortGrant-golden.png | G1 | 4 |  |
| fortGrant-midday.png | U1 | 3 | Ground is textured and non-bare in near field with scattered rocks and sparse vegetation, but lacks continuous grass cover—shows sparse high-desert coverage instead of the dense grassland the criterion assumes. |
| fortGrant-midday.png | U2 | 4 | Texture scale is believable at human eye height with appropriate detail density; no obvious smearing or visible tiling grid. |
| fortGrant-midday.png | U3 | 4 | Material transitions are irregular and noise-broken by scattered rocks; no clean straight boundaries visible. |
| fortGrant-midday.png | U4 | 4 | Fort walls and interior structures meet ground properly; no visible gaps, floating objects, or obvious sinking issues. |
| fortGrant-midday.png | U5 | 4 | Shadows are present and directional; midday sun position creates appropriate short, defined shadows. Exposure is well-managed without blown highlights or crushed blacks. |
| fortGrant-midday.png | U6 | 4 | Distant mountains and landscape features maintain identifiable silhouettes; no popping, smearing, or flattening into cards. |
| fortGrant-midday.png | F1 | 4 | Fort walls clearly enclose a courtyard with visible opening; enclosure structure is readable though gate detail is somewhat obscured by the elevated camera angle. |
| fortGrant-midday.png | F2 | 5 |  |
| fortGrant-midday.png | G1 | — | n/a—no distinct road with visible wheel tracks or ragged edges visible in this frame. |
| huntingCabin-golden.png | U1 | 2 | Near field is dominated by bare tan ground with sparse scattered grass tufts rather than continuous grass cover. |
| huntingCabin-golden.png | U2 | 4 |  |
| huntingCabin-golden.png | U3 | 3 | Road boundaries, particularly the left edge, show somewhat clean transitions rather than fully noise-broken irregularity. |
| huntingCabin-golden.png | U4 | 5 |  |
| huntingCabin-golden.png | U5 | 5 |  |
| huntingCabin-golden.png | U6 | 4 |  |
| huntingCabin-golden.png | H1 | 3 | Roof is flat or minimal pitch, not a traditional pitched roof; door is not clearly visible from this viewing angle. |
| huntingCabin-golden.png | G1 | 4 |  |
| huntingCabin-midday.png | U1 | 5 |  |
| huntingCabin-midday.png | U2 | 5 |  |
| huntingCabin-midday.png | U3 | 4 | Road edges have some noise but could be more extensively broken up and irregular in places. |
| huntingCabin-midday.png | U4 | 5 |  |
| huntingCabin-midday.png | U5 | 5 |  |
| huntingCabin-midday.png | U6 | 5 |  |
| huntingCabin-midday.png | H1 | 5 |  |
| huntingCabin-midday.png | G1 | 5 |  |
| ironValley-golden.png | U1 | 2 | Ground is predominantly bare dirt/gravel with no visible grass cover in the near field; should show continuous grass thinning with distance. |
| ironValley-golden.png | U2 | 4 |  |
| ironValley-golden.png | U3 | 4 |  |
| ironValley-golden.png | U4 | 5 |  |
| ironValley-golden.png | U5 | 4 |  |
| ironValley-golden.png | U6 | 4 |  |
| ironValley-golden.png | I1 | 5 |  |
| ironValley-golden.png | I2 | 4 |  |
| ironValley-golden.png | G1 | — | n/a |
| ironValley-midday.png | U1 | 2 | Near field is bare dirt/earth; no continuous grass cover. Vegetation only visible on distant hillside. |
| ironValley-midday.png | U2 | 2 | Ground texture is uniform wash with low detail; darker patches do not read as believable human-scale ground variation. |
| ironValley-midday.png | U3 | 4 |  |
| ironValley-midday.png | U4 | 5 |  |
| ironValley-midday.png | U5 | 4 |  |
| ironValley-midday.png | U6 | 4 |  |
| ironValley-midday.png | I1 | 5 |  |
| ironValley-midday.png | I2 | 4 |  |
| ironValley-midday.png | G1 | 2 | Road edges are clean boundaries, not ragged; no visible wheel-track differentiation in surface texture or darkness. |
| lakeMercy-golden.png | U1 | 4 |  |
| lakeMercy-golden.png | U2 | 2 | Water surface texture is obviously repetitive with uniform wave pattern tiling across the surface. |
| lakeMercy-golden.png | U3 | 2 | Shore-to-water boundary is a clean, relatively straight line rather than noise-broken and irregular. |
| lakeMercy-golden.png | U4 | 4 |  |
| lakeMercy-golden.png | U5 | 4 |  |
| lakeMercy-golden.png | U6 | 4 |  |
| lakeMercy-golden.png | L1 | 2 | Water color is largely uniform throughout; no clear progression from pale at shore to saturated at depth. |
| lakeMercy-golden.png | L2 | 1 | Water surface shows only one scale of repetitive directional waves; no distinct smaller-scale ripples or second layer of detail. |
| lakeMercy-golden.png | L3 | 4 |  |
| lakeMercy-golden.png | L4 | 4 |  |
| lakeMercy-golden.png | G1 | — | n/a |
| lakeMercy-midday.png | U1 | 4 | Visible grassed shore shows continuous grass cover with no bare dirt, but immediate near field is water so full assessment limited. |
| lakeMercy-midday.png | U2 | 5 |  |
| lakeMercy-midday.png | U3 | 5 |  |
| lakeMercy-midday.png | U4 | 5 |  |
| lakeMercy-midday.png | U5 | 5 |  |
| lakeMercy-midday.png | U6 | 4 | Distant crosses and treeline identifiable by shape but relatively simple rather than complex silhouettes. |
| lakeMercy-midday.png | L1 | 5 |  |
| lakeMercy-midday.png | L2 | 5 |  |
| lakeMercy-midday.png | L3 | 5 |  |
| lakeMercy-midday.png | L4 | 5 |  |
| lakeMercy-midday.png | G1 | — | n/a |
| mission-golden.png | U1 | 1 | Ground is almost entirely bare dirt/rock texture with essentially no visible grass cover in near or middle field. |
| mission-golden.png | U2 | 4 |  |
| mission-golden.png | U3 | 4 |  |
| mission-golden.png | U4 | 5 |  |
| mission-golden.png | U5 | 4 | Warm golden-hour tone is correct, but shadows are subtle and not as directionally dramatic as expected for sun near horizon. |
| mission-golden.png | U6 | 4 |  |
| mission-golden.png | M1 | 4 |  |
| mission-golden.png | M2 | — | Cannot assess from this camera angle whether bell tower (small vertical element on structure) is positioned on the facade versus centered on roof. |
| mission-golden.png | G1 | — | n/a |
| mission-midday.png | U1 | 1 | Ground is entirely bare dirt and rock with no grass cover visible in the near field or at distance. |
| mission-midday.png | U2 | 4 |  |
| mission-midday.png | U3 | 4 |  |
| mission-midday.png | U4 | 5 |  |
| mission-midday.png | U5 | 4 |  |
| mission-midday.png | U6 | 4 |  |
| mission-midday.png | M1 | 4 |  |
| mission-midday.png | M2 | 4 |  |
| mission-midday.png | G1 | — | n/a |
| northernPines-golden.png | U1 | 2 | Near field shows sparse scattered vegetation specks on mostly bare dirt, not continuous grass cover as the criterion requires. |
| northernPines-golden.png | U2 | 4 | Texture scale is human-scale with scattered vegetation detail; no visible tiling grid or excessive smearing. |
| northernPines-golden.png | U3 | 3 | Road edges have some vegetation-based irregularity but still read as relatively clean, defined boundaries rather than thoroughly noise-broken. |
| northernPines-golden.png | U4 | 4 | All visible objects ground correctly; no gaps under trees or floating elements. |
| northernPines-golden.png | U5 | 4 | Golden-hour warmth, directional shadows, and proper exposure; lighting reads correctly. |
| northernPines-golden.png | U6 | 4 | Distant trees are identifiable by conical shape and read as 3D silhouettes despite LOD simplification. |
| northernPines-golden.png | P1 | 4 | Conical canopies wider at base than top; tiering visible on closer trees. |
| northernPines-golden.png | P2 | 4 | Foliage occludes background; canopies read as solid. |
| northernPines-golden.png | P3 | 2 | Tree trunks appear as flat untextured poles without visible bark relief at this viewing distance. |
| northernPines-golden.png | P4 | 4 | Good forest stand density with trees and shrubs throughout; reads as forest, not scattered saplings. |
| northernPines-golden.png | P5 | 4 | Tree heights believable relative to player perspective and landscape scale. |
| northernPines-golden.png | G1 | 3 | Road shows darker worn center and lighter margins with wheel-track effect, but edges are still relatively defined rather than thoroughly ragged. |
| northernPines-midday.png | U1 | 2 | Large dark bare dirt/road area dominates the foreground instead of continuous grass cover. |
| northernPines-midday.png | U2 | 4 |  |
| northernPines-midday.png | U3 | 3 | Transitions between road and grass show some clean, relatively straight boundaries despite noise-breaking in places. |
| northernPines-midday.png | U4 | 4 |  |
| northernPines-midday.png | U5 | 4 |  |
| northernPines-midday.png | U6 | 4 |  |
| northernPines-midday.png | P1 | 4 |  |
| northernPines-midday.png | P2 | 4 |  |
| northernPines-midday.png | P3 | 3 | Tree trunks lack clear bark relief texture; appear mostly as flat-toned poles. |
| northernPines-midday.png | P4 | 4 |  |
| northernPines-midday.png | P5 | 4 |  |
| northernPines-midday.png | G1 | 3 | Road edges show both ragged irregularity and relatively straight boundaries; wheel-track center darkening is visible but edges are inconsistently noise-broken. |
| overlook-golden.png | U1 | 3 | Vegetation appears as scattered small dots in the near field, creating sparse rather than continuous ground cover; bare brown earth dominates throughout. |
| overlook-golden.png | U2 | 4 |  |
| overlook-golden.png | U3 | 4 |  |
| overlook-golden.png | U4 | 4 |  |
| overlook-golden.png | U5 | 4 |  |
| overlook-golden.png | U6 | 4 |  |
| overlook-golden.png | O1 | 5 |  |
| overlook-golden.png | O2 | 4 |  |
| overlook-golden.png | G1 | 4 |  |
| overlook-midday.png | U1 | 4 | Grass cover is continuous and well-distributed, but the immediate foreground near the ravine shows some brown soil that could have slightly more vegetation density. |
| overlook-midday.png | U2 | 5 |  |
| overlook-midday.png | U3 | 5 |  |
| overlook-midday.png | U4 | 5 |  |
| overlook-midday.png | U5 | 4 | Lighting is correct for midday with high sun, shadows are present and directional, but shadow definition is soft—shadows could be slightly more defined. |
| overlook-midday.png | U6 | 4 | Distant vegetation and hills are identifiable, but the far treeline could have slightly sharper silhouettes to read more distinctly. |
| overlook-midday.png | O1 | 5 |  |
| overlook-midday.png | O2 | 4 | Aerial perspective is present with haze increasing toward the horizon, but the effect could be slightly more pronounced. |
| overlook-midday.png | G1 | — | n/a—no gravel road with wheel tracks visible in this frame; the brown feature is a ravine/water channel, not a road. |
| ranch-golden.png | U1 | 2 | Ground in near field is predominantly bare dirt and gravel with sparse scattered vegetation tufts, not continuous grass cover. |
| ranch-golden.png | U2 | 4 |  |
| ranch-golden.png | U3 | 4 |  |
| ranch-golden.png | U4 | 4 |  |
| ranch-golden.png | U5 | 5 |  |
| ranch-golden.png | U6 | 4 |  |
| ranch-golden.png | R1 | 4 |  |
| ranch-golden.png | R2 | 4 |  |
| ranch-golden.png | R3 | 4 |  |
| ranch-golden.png | R4 | 4 |  |
| ranch-golden.png | R5 | — | Cannot assess door scale from this camera angle; front door is not clearly visible. |
| ranch-golden.png | R6 | 4 |  |
| ranch-golden.png | G1 | 4 |  |
| ranch-midday.png | U1 | 4 | Grass cover visible in near field with natural thinning toward distance; significant bare dirt patches throughout read as plausible ground variation. |
| ranch-midday.png | U2 | 4 | Ground detail scale is appropriate to 1.62m eye height; small specks and particles read as grass and debris without obvious tiling grid. |
| ranch-midday.png | U3 | 3 | Road edges and some material transitions appear relatively straight and clean rather than noise-broken. |
| ranch-midday.png | U4 | 5 | All structures—main house, barn, outbuildings, fences—rest properly on ground with no gaps or floating elements. |
| ranch-midday.png | U5 | 5 | Midday sun lighting is correct with high shadows cast by structures, good contrast, warm color palette, no blown highlights or crushed blacks. |
| ranch-midday.png | U6 | 4 | Distant grave markers, fences, and far structures maintain readable silhouettes; no obvious LOD popping or card collapse. |
| ranch-midday.png | R1 | 4 | Main building shows L-plan massing with two-story main block and lower kitchen ell section visible from this angle. |
| ranch-midday.png | R2 | 4 | Hip roof on main building with relatively even overhang on visible sides. |
| ranch-midday.png | R3 | 3 | Vertical post-like elements visible but porch detail is heavily shadowed, making it difficult to confirm posts carry a roof. |
| ranch-midday.png | R4 | 4 | Chimney visible as continuous vertical element rising above the ridgeline. |
| ranch-midday.png | R5 | 3 | Door opening is visible but heavily shadowed, making scale assessment against 1.62m eye height difficult to verify. |
| ranch-midday.png | R6 | 4 | Barn on left has rectangular form with gable running along long axis; visible fences show multiple rails. |
| ranch-midday.png | G1 | 4 | Gravel road edges show some irregularity with visible wheel-track center appearing darker and smoother than loose margins; edges are mostly ragged rather than straight boundaries. |
| silverCreek-golden.png | U1 | 2 | Foreground and mid-ground are bare dirt; no continuous grass cover visible in the near field. |
| silverCreek-golden.png | U2 | 4 | Gravel texture reads at human scale without smearing; minor texture uniformity. |
| silverCreek-golden.png | U3 | 4 | No visible hard seams or straight boundaries between surface materials. |
| silverCreek-golden.png | U4 | 4 | Buildings meet ground properly; roofs attached to walls; no visible gaps or floating objects. |
| silverCreek-golden.png | U5 | 4 | Golden hour lighting with warm tones and long directional shadows; no blown highlights or crushed blacks. |
| silverCreek-golden.png | U6 | 4 | Distant buildings and structures are readable by silhouette; minor LOD transitions present. |
| silverCreek-golden.png | S1 | 4 | Buildings aligned along street with consistent facing direction; forms coherent street corridor. |
| silverCreek-golden.png | S2 | 4 | False fronts positioned at facade plane spanning building widths and hiding roofs. |
| silverCreek-golden.png | S3 | 4 | Steeple/cross structure positioned over entry/gable area rather than ridge center. |
| silverCreek-golden.png | S4 | 4 | Raised boardwalk platform clearly visible running along storefronts. |
| silverCreek-golden.png | S5 | 5 | Buildings show strong variety in height, width, color, and proportion; no identical boxes. |
| silverCreek-golden.png | G1 | 3 | Ground shows tonal variation in center area suggesting wear, but clear ragged grass edges not visible. |
| silverCreek-midday.png | U1 | 1 | Near field is predominantly bare gravel/dirt with no continuous grass cover; grass only appears in distant middle ground. |
| silverCreek-midday.png | U2 | 4 |  |
| silverCreek-midday.png | U3 | 3 | Transitions between gravel and grass in the distance have some fairly clean straight boundaries rather than being fully noise-broken. |
| silverCreek-midday.png | U4 | 5 |  |
| silverCreek-midday.png | U5 | 4 |  |
| silverCreek-midday.png | U6 | 4 |  |
| silverCreek-midday.png | S1 | 2 | Buildings are scattered at various angles and do not align to a common street orientation or form a legible street corridor. |
| silverCreek-midday.png | S2 | 1 | Structures lack the characteristic false-front styling; facades do not span full building width to hide roofs. |
| silverCreek-midday.png | S3 | — | Church steeple not visible from this camera angle; would need frontal or elevated view. |
| silverCreek-midday.png | S4 | 4 |  |
| silverCreek-midday.png | S5 | 4 |  |
| silverCreek-midday.png | G1 | 3 | Road edges show some raggedness but also contain relatively clean straight boundaries; wheel track is subtly visible but not strongly pronounced. |
| timberCamp-golden.png | U1 | 2 | Near field is predominantly dark gravel/dirt, not continuous grass cover; grass is sparse texture detail rather than continuous ground. |
| timberCamp-golden.png | U2 | 4 | Ground detail scale reads human-appropriate with scattered texture dots and pebbles; no obvious tiling grid or smeared wash. |
| timberCamp-golden.png | U3 | 4 | Transitions between dark worked gravel and lighter tan ground are irregular and naturally noise-broken; no straight material lines. |
| timberCamp-golden.png | U4 | 5 | All logs, stumps, and structures are grounded with no gaps or floating geometry. |
| timberCamp-golden.png | U5 | 4 | Golden-hour tone and directional shadows present; minor concern that shadow length and warmth could be more pronounced for sun-at-horizon. |
| timberCamp-golden.png | U6 | 4 | Distant vegetation markers read as identifiable shapes across the landscape; no obvious LOD popping or smearing. |
| timberCamp-golden.png | T1 | 5 | Clear worked timber site with felled logs, cut materials, and dark worked ground indicating active operation. |
| timberCamp-golden.png | T2 | 1 | No buildings with pitched roofs and doors visible; red/brown chunks read as log piles and stumps, not structures. |
| timberCamp-golden.png | G1 | 3 | Dark road path visible with somewhat irregular edges, but raggedness is subtle and wheel-track center differentiation is not clearly visible. |
| timberCamp-midday.png | U1 | 4 | Grass reads as continuous ground cover in distant areas, but central work zone is bare brown earth; realistic for active site. |
| timberCamp-midday.png | U2 | 4 | Ground detail is appropriately fine-grained for human eye height, no obvious repeating grid or smeared wash. |
| timberCamp-midday.png | U3 | 3 | Boundaries between worked earth and grass are noise-broken in places but some edges read as relatively clean lines around the work area perimeter. |
| timberCamp-midday.png | U4 | 5 |  |
| timberCamp-midday.png | U5 | 5 |  |
| timberCamp-midday.png | U6 | 4 | Distant trees readable by cross-shaped silhouette, simplified but not collapsed into flat cards. |
| timberCamp-midday.png | T1 | 5 |  |
| timberCamp-midday.png | T2 | 4 | Structures have visible door openings and roof edges, though roofs are somewhat flat rather than clearly pitched. |
| timberCamp-midday.png | G1 | — | n/a |
| tribal-golden.png | U1 | 2 | Near-field ground is predominantly bare brown dirt with sparse scattered vegetation; lacks continuous grass cover expected for a grassed biome. |
| tribal-golden.png | U2 | 4 | Small vegetation tufts and rocks appear human-scale and appropriate for standing eye height; no obvious smearing or repetitive tiling. |
| tribal-golden.png | U3 | 2 | Visible straight horizontal striping patterns in mid-distance terrain are clean linear boundaries rather than noise-broken transitions. |
| tribal-golden.png | U4 | 4 | Tipis properly meet the ground with visible shadows; no floating or half-buried structures detected. |
| tribal-golden.png | U5 | 4 | Golden-hour lighting is evident with warm tones and directional shadows from tipis; sun position creates appropriate long shadows. |
| tribal-golden.png | U6 | 4 | Distant trees and landscape features are identifiable by silhouette rather than smeared or popping. |
| tribal-golden.png | N1 | 4 | Tipis show clear rotation variation (different facing angles) and perceivable scale variation across the group. |
| tribal-golden.png | N2 | 4 | Camp arrangement is organic and non-gridded, with natural clustering rather than regular spacing. |
| tribal-golden.png | G1 | 2 | Horizontal terrain stripes appear too straight and defined; if roads, edges lack ragged noise-broken character. |
| tribal-midday.png | U1 | 4 | Grass covers most of the near field and thins with distance, but there are substantial brown dirt patches in the middle distance that read as bare ground rather than sparse vegetation. |
| tribal-midday.png | U2 | 4 | Texture scale appears human-scale with visible grass tufts and scattered vegetation, though the detail distribution reads slightly repetitive in areas. |
| tribal-midday.png | U3 | 4 | Material transitions are mostly irregular, but some dirt-to-grass boundaries could have more organic noise variation. |
| tribal-midday.png | U4 | 5 |  |
| tribal-midday.png | U5 | 4 | Shadows are appropriately short for high sun and directional, but could be slightly more pronounced for stronger visual definition. |
| tribal-midday.png | U6 | 4 | Distant trees and tipis are identifiable by silhouette, though some distant detail loses clarity. |
| tribal-midday.png | N1 | 4 | Tipis show rotation variation and perspective scale variation, though the visible cluster could show more dramatic rotation range. |
| tribal-midday.png | N2 | 4 | The camp arrangement reads organic rather than gridded, though the spacing feels slightly too regular. |
| tribal-midday.png | G1 | 4 | The eroded path shows ragged edges and a darker, smoother center track, matching expectations for wheel wear. |
| westernRange-golden.png | U1 | 4 | Ground is covered with scattered vegetation tufts throughout the scene, thinning toward the horizon. Coverage is sparse and individual-tuft based rather than a continuous sheet, but no bare untextured dirt expanses. |
| westernRange-golden.png | U2 | 4 | Ground texture shows human-scale detail with natural variation; no obvious repeating tile pattern detected, though vegetation distribution is regular enough to potentially hint at procedural generation. |
| westernRange-golden.png | U3 | 4 | Transitions between vegetation tufts and bare ground appear irregular and noise-broken; no clean straight material boundaries visible. |
| westernRange-golden.png | U4 | 5 |  |
| westernRange-golden.png | U5 | 5 |  |
| westernRange-golden.png | U6 | 4 | Distant trees are clearly identifiable by conical silhouette shape; tree on right reads sharply, tree on left is more distant but still recognizable rather than smeared or flat. |
| westernRange-golden.png | W1 | 5 |  |
| westernRange-golden.png | W2 | — | n/a |
| westernRange-golden.png | W3 | — | n/a |
| westernRange-golden.png | G1 | — | n/a |
| westernRange-midday.png | U1 | 3 | Grass coverage is sparse with significant bare brown earth visible throughout the near and middle fields, not reading as continuous ground cover. |
| westernRange-midday.png | U2 | 4 | Ground detail scale is appropriate and varied; no obvious tiling or smeared wash. |
| westernRange-midday.png | U3 | 4 | Transitions between grass and earth areas are irregular and noise-broken. |
| westernRange-midday.png | U4 | 4 | Trees are grounded with proper shadow contact; no visible floating or sinking. |
| westernRange-midday.png | U5 | 4 | Shadows are present and directional (tree on right casts clear shadow to left); lighting appropriate for midday sun high overhead. |
| westernRange-midday.png | U6 | 4 | Distant tree on left reads clearly as a tree by silhouette; no popping or LOD artifacts. |
| westernRange-midday.png | W1 | 3 | Large expanses of exposed brown earth dominate over grass; reads as sparse range rather than continuous grassland. |
| westernRange-midday.png | W2 | — | No cattle visible in this frame. |
| westernRange-midday.png | W3 | — | No fence lines visible in this frame. |
| westernRange-midday.png | G1 | — | n/a - no road visible in this frame. |

## Regressions

- **burn-midday.png U1: 4 → 1** — Ground is entirely bare burnt earth in near field with no grass cover; criterion requires continuous grass cover thinning with distance.
- **silverCreek-midday.png S2: 4 → 1** — Structures lack the characteristic false-front styling; facades do not span full building width to hide roofs.
- **timberCamp-golden.png T2: 3 → 1** — No buildings with pitched roofs and doors visible; red/brown chunks read as log piles and stumps, not structures.
- **burn-golden.png U1: 2 → 1** — Ground is entirely charred bare earth with no visible grass cover in near field. This is contextually correct for a burn site, but the criterion for continuous grass is not met.
- **elPaso-golden.png U1: 2 → 1** — Ground is bare dark earth with no visible grass cover; predominantly arid dirt with no green vegetation in near or far field
- **lakeMercy-golden.png L2: 2 → 1** — Water surface shows only one scale of repetitive directional waves; no distinct smaller-scale ripples or second layer of detail.
- **lakeMercy-golden.png L1: 5 → 2** — Water color is largely uniform throughout; no clear progression from pale at shore to saturated at depth.
- **burn-golden.png U2: 4 → 2** — Ground texture is relatively uniform reddish-brown wash with limited human-scale detail variation; lacks rich texture at eye height.
- **burn-midday.png U3: 4 → 2** — Clean straight color boundaries between burnt reddish-brown zones and tan/beige soil areas visible across the ground.
- **burn-midday.png B2: 4 → 2** — Hazy shapes in upper sky are not clearly anchored to a ground source; no visible smoke plume rising from the burn.
- **fortGrant-golden.png U1: 4 → 2** — Ground is mostly bare earth with sparse scattered rocks; lacks continuous grass cover expected in the near field.
- **ironValley-midday.png U2: 4 → 2** — Ground texture is uniform wash with low detail; darker patches do not read as believable human-scale ground variation.
- **northernPines-golden.png P3: 4 → 2** — Tree trunks appear as flat untextured poles without visible bark relief at this viewing distance.
- **northernPines-midday.png U1: 4 → 2** — Large dark bare dirt/road area dominates the foreground instead of continuous grass cover.
- **tribal-golden.png U1: 4 → 2** — Near-field ground is predominantly bare brown dirt with sparse scattered vegetation; lacks continuous grass cover expected for a grassed biome.
- **tribal-golden.png U3: 4 → 2** — Visible straight horizontal striping patterns in mid-distance terrain are clean linear boundaries rather than noise-broken transitions.
- **tribal-golden.png G1: 4 → 2** — Horizontal terrain stripes appear too straight and defined; if roads, edges lack ragged noise-broken character.
- **silverCreek-midday.png S1: 3 → 2** — Buildings are scattered at various angles and do not align to a common street orientation or form a legible street corridor.
- **cemetery-midday.png U2: 5 → 3** — Distribution of dark specks shows noticeable regularity and potential repeating pattern across the ground surface.
- **huntingCabin-golden.png H1: 5 → 3** — Roof is flat or minimal pitch, not a traditional pitched roof; door is not clearly visible from this viewing angle.
- **badlands-midday.png U2: 4 → 3** — Ground texture has some weathered/eroded variation but reads somewhat wash-like; lacks human-scale detail definition in the immediate foreground.
- **cemetery-golden.png U1: 4 → 3** — Ground is largely bare tan/beige dirt with sparse scattered small vegetation/rock specks; cover is not continuous and reads as sparse rather than grassed.
- **elPaso-golden.png E1: 4 → 3** — Buildings have modest height variation but read as simple geometric boxes arranged together rather than an organic adobe settlement cluster
- **elPaso-midday.png U6: 4 → 3** — Distant cross and background structures are somewhat flattened and lack crisp silhouette definition.
- **huntingCabin-golden.png U3: 4 → 3** — Road boundaries, particularly the left edge, show somewhat clean transitions rather than fully noise-broken irregularity.
- **northernPines-golden.png U3: 4 → 3** — Road edges have some vegetation-based irregularity but still read as relatively clean, defined boundaries rather than thoroughly noise-broken.
- **northernPines-golden.png G1: 4 → 3** — Road shows darker worn center and lighter margins with wheel-track effect, but edges are still relatively defined rather than thoroughly ragged.
- **northernPines-midday.png U3: 4 → 3** — Transitions between road and grass show some clean, relatively straight boundaries despite noise-breaking in places.
- **northernPines-midday.png P3: 4 → 3** — Tree trunks lack clear bark relief texture; appear mostly as flat-toned poles.
- **northernPines-midday.png G1: 4 → 3** — Road edges show both ragged irregularity and relatively straight boundaries; wheel-track center darkening is visible but edges are inconsistently noise-broken.
- **ranch-midday.png U3: 4 → 3** — Road edges and some material transitions appear relatively straight and clean rather than noise-broken.
- **silverCreek-midday.png U3: 4 → 3** — Transitions between gravel and grass in the distance have some fairly clean straight boundaries rather than being fully noise-broken.
- **silverCreek-midday.png G1: 4 → 3** — Road edges show some raggedness but also contain relatively clean straight boundaries; wheel track is subtly visible but not strongly pronounced.
- **westernRange-midday.png W1: 4 → 3** — Large expanses of exposed brown earth dominate over grass; reads as sparse range rather than continuous grassland.
- **badlands-golden.png U2: 5 → 4** — Ground texture detail is human-scale; no visible smearing or tiling grid
- **burn-golden.png B2: 5 → 4** — Smoke plumes visible in mid-to-far distance as atmospheric formations anchored to burn area; plumes are visible and correctly positioned but source is somewhat distant.
- **burn-midday.png U4: 5 → 4** — 
- **burn-midday.png B1: 5 → 4** — 
- **cemetery-midday.png U4: 5 → 4** — 
- **cemetery-midday.png C1: 5 → 4** — 
- **elPaso-golden.png U4: 5 → 4** — 
- **fortGrant-golden.png U3: 5 → 4** — 
- **fortGrant-golden.png U5: 5 → 4** — 
- **ironValley-golden.png U5: 5 → 4** — 
- **mission-golden.png U5: 5 → 4** — Warm golden-hour tone is correct, but shadows are subtle and not as directionally dramatic as expected for sun near horizon.
- **northernPines-golden.png U5: 5 → 4** — Golden-hour warmth, directional shadows, and proper exposure; lighting reads correctly.
- **northernPines-golden.png P4: 5 → 4** — Good forest stand density with trees and shrubs throughout; reads as forest, not scattered saplings.
- **overlook-golden.png U4: 5 → 4** — 
- **overlook-golden.png U5: 5 → 4** — 
- **overlook-golden.png O2: 5 → 4** — 
- **overlook-midday.png U1: 5 → 4** — Grass cover is continuous and well-distributed, but the immediate foreground near the ravine shows some brown soil that could have slightly more vegetation density.
- **overlook-midday.png U5: 5 → 4** — Lighting is correct for midday with high sun, shadows are present and directional, but shadow definition is soft—shadows could be slightly more defined.
- **overlook-midday.png U6: 5 → 4** — Distant vegetation and hills are identifiable, but the far treeline could have slightly sharper silhouettes to read more distinctly.
- **ranch-golden.png U4: 5 → 4** — 
- **silverCreek-golden.png U4: 5 → 4** — Buildings meet ground properly; roofs attached to walls; no visible gaps or floating objects.
- **timberCamp-golden.png U5: 5 → 4** — Golden-hour tone and directional shadows present; minor concern that shadow length and warmth could be more pronounced for sun-at-horizon.
- **tribal-midday.png U2: 5 → 4** — Texture scale appears human-scale with visible grass tufts and scattered vegetation, though the detail distribution reads slightly repetitive in areas.
- **tribal-midday.png U5: 5 → 4** — Shadows are appropriately short for high sun and directional, but could be slightly more pronounced for stronger visual definition.
- **tribal-midday.png U6: 5 → 4** — Distant trees and tipis are identifiable by silhouette, though some distant detail loses clarity.
- **tribal-midday.png N2: 5 → 4** — The camp arrangement reads organic rather than gridded, though the spacing feels slightly too regular.

## Five worst criteria

1. **burn-golden.png U1 (1)** — Ground is entirely charred bare earth with no visible grass cover in near field. This is contextually correct for a burn site, but the criterion for continuous grass is not met.
1. **burn-midday.png U1 (1)** — Ground is entirely bare burnt earth in near field with no grass cover; criterion requires continuous grass cover thinning with distance.
1. **elPaso-golden.png U1 (1)** — Ground is bare dark earth with no visible grass cover; predominantly arid dirt with no green vegetation in near or far field
1. **lakeMercy-golden.png L2 (1)** — Water surface shows only one scale of repetitive directional waves; no distinct smaller-scale ripples or second layer of detail.
1. **mission-golden.png U1 (1)** — Ground is almost entirely bare dirt/rock texture with essentially no visible grass cover in near or middle field.

## Could not assess

- badlands-golden.png U1 — n/a - criterion for grassy biomes; badlands should be arid, not grassed
- badlands-golden.png G1 — n/a - no road visible in this frame
- badlands-midday.png G1 — n/a
- burn-golden.png U6 — grader omitted this criterion
- burn-golden.png G1 — n/a
- burn-midday.png G1 — n/a
- cemetery-golden.png G1 — n/a
- cemetery-midday.png G1 — n/a
- elPaso-golden.png G1 — n/a
- elPaso-midday.png G1 — n/a
- fortGrant-midday.png G1 — n/a—no distinct road with visible wheel tracks or ragged edges visible in this frame.
- ironValley-golden.png G1 — n/a
- lakeMercy-golden.png G1 — n/a
- lakeMercy-midday.png G1 — n/a
- mission-golden.png M2 — Cannot assess from this camera angle whether bell tower (small vertical element on structure) is positioned on the facade versus centered on roof.
- mission-golden.png G1 — n/a
- mission-midday.png G1 — n/a
- overlook-midday.png G1 — n/a—no gravel road with wheel tracks visible in this frame; the brown feature is a ravine/water channel, not a road.
- ranch-golden.png R5 — Cannot assess door scale from this camera angle; front door is not clearly visible.
- silverCreek-midday.png S3 — Church steeple not visible from this camera angle; would need frontal or elevated view.
- timberCamp-midday.png G1 — n/a
- westernRange-golden.png W2 — n/a
- westernRange-golden.png W3 — n/a
- westernRange-golden.png G1 — n/a
- westernRange-midday.png W2 — No cattle visible in this frame.
- westernRange-midday.png W3 — No fence lines visible in this frame.
- westernRange-midday.png G1 — n/a - no road visible in this frame.

## Verdict

- Rubric coverage: **98%** (minimum 80% — criteria the grader declined to judge count against this; genuine n/a does not)
- This pass clean (all scored ≥4, none ≤2, coverage met): **no**
- Previous pass clean: **no**

CONTINUE
