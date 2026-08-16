/**
 * Targets three@0.185.1.
 * Live parameter panel. Every material uniform should land here, not as a constant.
 */
import GUI from "lil-gui";
import { materialSettings, setQualityTier, type QualityTier } from "../materials/settings.ts";

export function createMaterialPanel(options: {
  onEnv?: () => void;
  onHdri?: () => void;
  onSun?: () => void;
  onFog?: () => void;
  onTerrain?: () => void;
  onQuality?: () => void;
  onWater?: () => void;
} = {}) {
  const gui = new GUI({ title: "Materials", closeFolders: true });
  const folders: { env?: GUI; terrain?: GUI; roads?: GUI; water?: GUI; quality?: GUI; debug?: GUI } = {};
  const onTerrain = options.onTerrain || (() => {});
  const onQuality = options.onQuality || onTerrain;
  const onWater = options.onWater || (() => {});

  folders.quality = gui.addFolder("Quality");
  folders.quality
    .add({ tier: materialSettings.quality }, "tier", ["low", "medium", "high"])
    .name("tier")
    .onChange((value: QualityTier) => {
      setQualityTier(value);
      onQuality();
    });

  folders.env = gui.addFolder("Environment");
  folders.env.add(materialSettings, "environmentIntensity", 0, 3, 0.01).name("env intensity").onChange(options.onEnv);
  folders.env.add(materialSettings, "hdri", ["midday", "golden"]).name("HDRI").onChange(options.onHdri);
  folders.env.add(materialSettings, "sunIntensity", 0, 4, 0.05).name("sun intensity").onChange(options.onSun);
  folders.env.add(materialSettings, "sunElevation", 5, 85, 0.5).name("sun elevation").onChange(options.onSun);
  folders.env.add(materialSettings, "sunAzimuth", -180, 180, 0.5).name("sun azimuth").onChange(options.onSun);
  folders.env.add(materialSettings, "fogDensity", 0, 0.002, 0.00001).name("fog").onChange(options.onFog);

  folders.terrain = gui.addFolder("Terrain");
  folders.terrain.add(materialSettings, "grassTiling", 1, 40, 0.1).onChange(onTerrain);
  folders.terrain.add(materialSettings, "dirtTiling", 1, 40, 0.1).onChange(onTerrain);
  folders.terrain.add(materialSettings, "rockTiling", 1, 40, 0.1).onChange(onTerrain);
  folders.terrain.add(materialSettings, "gravelTiling", 1, 40, 0.1).onChange(onTerrain);
  folders.terrain.add(materialSettings, "blendSharpness", 0.02, 0.5, 0.005).onChange(onTerrain);
  folders.terrain.add(materialSettings, "slopeStart", 0, 1, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "slopeEnd", 0, 1, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "altStart", 0, 80, 0.5).onChange(onTerrain);
  folders.terrain.add(materialSettings, "altEnd", 10, 160, 0.5).onChange(onTerrain);
  folders.terrain.add(materialSettings, "macroPeriod", 40, 400, 1).onChange(onTerrain);
  folders.terrain.add(materialSettings, "macroStrength", 0, 0.5, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "vertexColorMix", 0, 1, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "twoScaleMix", 0, 1, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "albedoGain", 0.5, 2, 0.01).onChange(onTerrain);
  folders.terrain.add(materialSettings, "detailDistance", 10, 200, 1).onChange(onTerrain);

  folders.roads = gui.addFolder("Roads");
  folders.roads.add(materialSettings, "roadNoiseScale", 0.05, 1.2, 0.01).name("edge noise freq").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadEdgeNoise", 0, 0.6, 0.01).name("edge noise").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadEdgeLo", 0, 0.5, 0.01).name("edge start").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadEdgeHi", 0.1, 0.8, 0.01).name("edge end").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadCenterLo", 0.2, 0.8, 0.01).name("center start").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadCenterHi", 0.4, 1, 0.01).name("center end").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadCompact", 0, 0.5, 0.01).name("center darken").onChange(onTerrain);
  folders.roads.add(materialSettings, "roadEdgeBright", 0.8, 1.4, 0.01).name("shoulder bright").onChange(onTerrain);

  folders.water = gui.addFolder("Water");
  folders.water.addColor(materialSettings, "waterShallow").name("shallow").onChange(onWater);
  folders.water.addColor(materialSettings, "waterDeep").name("deep").onChange(onWater);
  folders.water.addColor(materialSettings, "waterToxicShallow").name("toxic shallow").onChange(onWater);
  folders.water.addColor(materialSettings, "waterToxicDeep").name("toxic deep").onChange(onWater);
  folders.water.add(materialSettings, "waterDepthFalloff", 1, 20, 0.5).name("depth falloff").onChange(onWater);
  folders.water.add(materialSettings, "waterNormalScale1", 0.02, 0.4, 0.01).name("normal scale A").onChange(onWater);
  folders.water.add(materialSettings, "waterNormalScale2", 0.02, 0.4, 0.01).name("normal scale B").onChange(onWater);
  folders.water.add(materialSettings, "waterNormalSpeed1", 0.05, 2, 0.05).name("normal speed A").onChange(onWater);
  folders.water.add(materialSettings, "waterNormalSpeed2", 0.05, 2, 0.05).name("normal speed B").onChange(onWater);
  folders.water.add(materialSettings, "waterNormalStrength", 0, 1, 0.01).name("normal strength").onChange(onWater);
  folders.water.add(materialSettings, "waterFlowSpeed", 0, 2, 0.05).name("flow speed").onChange(onWater);
  folders.water.add(materialSettings, "waterFlowTiling", 0.05, 1.5, 0.05).name("flow tiling").onChange(onWater);
  folders.water.add(materialSettings, "waterRefraction", 0, 0.3, 0.01).name("refraction").onChange(onWater);
  folders.water.add(materialSettings, "waterRefractionDepth", 0.5, 8, 0.1).name("refraction depth").onChange(onWater);
  folders.water.add(materialSettings, "waterRoughness", 0, 1, 0.01).name("roughness").onChange(onWater);
  folders.water.add(materialSettings, "foamThreshold", 0, 8, 0.1).name("foam threshold").onChange(onWater);
  folders.water.add(materialSettings, "foamNoiseScale", 0.02, 0.5, 0.01).name("foam noise scale").onChange(onWater);
  folders.water.add(materialSettings, "foamStrength", 0, 2, 0.01).name("foam strength").onChange(onWater);
  folders.water.add(materialSettings, "whitewaterSlope", 0, 3, 0.05).name("whitewater slope").onChange(onWater);
  folders.water.add(materialSettings, "whitewaterStrength", 0, 3, 0.05).name("whitewater strength").onChange(onWater);

  folders.debug = gui.addFolder("Debug");
  folders.debug.add(materialSettings, "debugView", {
    final: 0,
    weights: 1,
    road: 2,
    normal: 3,
    slope: 4
  }).name("view").listen().onChange(onTerrain);

  gui.add({
    exportJson() {
      const blob = new Blob([JSON.stringify(materialSettings, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "material-settings.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }, "exportJson").name("Export settings as JSON");

  gui.close();

  return gui;
}
