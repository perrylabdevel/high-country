# Character models

These GLB files were downloaded from the creators’ Sketchfab download controls. Textures are embedded. All assets are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit the creators and preserve these notices when distributing.

- **Western Cowboy (Rigged)** by **human being (stevedaman)**: https://sketchfab.com/3d-models/western-cowboy-rigged-160bf043b71c458984c81c717b7483c9
- **Farm Cow Animated Dairy cattle** by **Rukh3D**: https://sketchfab.com/3d-models/farm-cow-animated-dairy-cattle-0e780cb5ab6d457198ded7d4e191a03e
- **Lucille | VGDC** by **MooKorea**: https://sketchfab.com/3d-models/lucille-vgdc-940ca0a626404fcd966a309c03ff2ad9
- **Lillian | VGDC** by **MooKorea**: https://sketchfab.com/3d-models/lillian-vgdc-dfe0231a096d48e0b8e5e3d0ba3de1bb
- **Child Boy Character Animated Blender** by **nijatmursali**: https://sketchfab.com/3d-models/child-boy-character-animated-blender-28a769dffab9481b84740f4adcf124fd
- **Medieval poor woman** by **carmenpaloma**: https://sketchfab.com/3d-models/medieval-poor-woman-24db154842a84717bfecea3ace0f7cfa
- **Gunnar the Gunslinger (rigged, motions)** by **tegnemaskin**: https://sketchfab.com/3d-models/gunnar-the-gunslinger-rigged-motions-1bb1864f3e414215850e3b37d3c65db2

Source files are unchanged. Runtime adaptation changes scale, orientation, material settings and animation behavior for the game. SHA-256 checksums and download sizes are in credits.json.

The cowboy includes a 2K color texture and a zero-duration Mixamo pose (not a playable animation). The cow includes 512-pixel textures and idle/attack/death clips; this is a textured mesh set, not a final high-resolution cattle texture set. Visual acceptance is pending the user’s in-game review. The medieval poor woman’s garment and headscarf ship unskinned by design; see the `processing` note in credits.json and `.ai/HANDOFF.md`.

These small self-contained model files live separately from the existing generated terrain texture release bundle. Keep them with the source checkout; Vite copies public/models into the production build.
