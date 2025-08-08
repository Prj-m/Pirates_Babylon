import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  MeshBuilder,
  Texture,
  Color3,
  Color4,
  StandardMaterial,
  PBRMaterial,
  PointLight,
  GlowLayer,
  Mesh,
  Material,
  ShaderMaterial,
  RenderTargetTexture,
  Plane,
  Matrix,
  Vector4,
  SceneLoader,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
  ParticleSystem,
  VolumetricLightScatteringPostProcess,
  HemisphericLight,
} from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";
import "@babylonjs/loaders/glTF";

// This variable will hold a reference to the boat mesh
let boat: Mesh;
// This variable will hold a reference to the parent mesh that will handle movement
let boatContainer: Mesh;
// This variable will hold the boat's yaw (Y-rotation), which we set once on load.
let boatYaw = 0;

// ➡️ NOTES FOR YOU:
// 1. BOAT_SCALE: A scale of 5 is a good starting point. You can adjust this as needed.
const BOAT_SCALE = 19;
// 2. BOAT_BASE_HEIGHT: This value lifts the boat above the water. A value of 4.5 should keep the hull from being submerged.
const BOAT_BASE_HEIGHT = 16.7;
// 3. BOAT_ROTATION_Y: This rotates the boat to face a specific direction.
const BOAT_ROTATION_Y = Math.PI;

// 4. CAMERA_ALPHA: To get a rear-center view, we set the horizontal angle to Math.PI.
const CAMERA_ALPHA = Math.PI;
// 5. CAMERA_BETA: The vertical angle. A value of 1.3 radians provides a good top-down view.
const CAMERA_BETA = 1.3;
// 6. CAMERA_RADIUS: The distance from the camera's target. Adjusted for the new perspective.
const CAMERA_RADIUS = 190;
// ➡️ MODIFIED: World size for the larger looping world.
const WORLD_SIZE = 40000;
const HALF_WORLD_SIZE = WORLD_SIZE / 2;

const createScene = function (engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.6, 0.8, 1, 1);

  // --- FOG IMPLEMENTATION ---
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.8, 0.85, 0.9);
  scene.fogStart = WORLD_SIZE * 0.05;
  scene.fogEnd = WORLD_SIZE * 0.1;
  // --- END FOG IMPLEMENTATION ---

  // Camera
  const camera = new ArcRotateCamera(
    "camera",
    CAMERA_ALPHA,
    CAMERA_BETA,
    CAMERA_RADIUS,
    Vector3.Zero(),
    scene
  );
  camera.attachControl(canvas, true);
  camera.minZ = 0.1;
  camera.maxZ = WORLD_SIZE * 2;


  // --- CAMERA BEHAVIOR FIXES ---
  camera.inputs.remove(camera.inputs.attached.mousewheel);
  camera.panningSensibility = 0;
  // --- END CAMERA BEHAVIOR FIXES ---

  // Lights
  const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.8;
  hemiLight.diffuse = Color3.FromHexString("#a5c8e3");

  const sunLight = new PointLight("sunLight", new Vector3(0, 100, 0), scene);
  sunLight.intensity = 2;

  // Skybox and sky material
  const skybox = MeshBuilder.CreateBox("skyBox", { size: WORLD_SIZE * 1.5 }, scene);
  skybox.applyFog = false;
  const skyMaterial = new SkyMaterial("skyMaterial", scene);
  skyMaterial.backFaceCulling = false;
  skybox.material = skyMaterial;
  // ➡️ FIX: Start with inclination 0 for a dark, nighttime sky.
  skyMaterial.inclination = 0.0;


  // Sun sphere
  const sunSphere = MeshBuilder.CreateSphere("sunSphere", { diameter: 60 }, scene);
  const sunMat = new StandardMaterial("sunMat", scene);
  sunMat.emissiveColor = new Color3(1, 0.9, 0.6);
  sunMat.disableLighting = true;
  sunSphere.material = sunMat;
  
  // Add Volumetric Light Scattering Post-Process (God Rays)
  const godRays = new VolumetricLightScatteringPostProcess(
    "godRays",
    1.0,
    camera,
    sunSphere,
    100,
    0.5,
    engine,
    true,
    scene
  );
  
  godRays.exposure = 0.5;
  godRays.decay = 0.99;
  godRays.weight = 0.9;
  godRays.density = 0.9;

  sunSphere.isVisible = true;

  // Glow Layer
  const glowLayer = new GlowLayer("glow", scene);
  glowLayer.intensity = 0.8;
  glowLayer.addIncludedOnlyMesh(sunSphere);

  // Water mesh
  const waterMesh = MeshBuilder.CreateGround("waterMesh", {
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    subdivisions: 512,
  }, scene);

  // Reflection render target
  const reflectionTexture = new RenderTargetTexture("reflectionTexture", 512, scene, true, true, Engine.TEXTURETYPE_UNSIGNED_INT);

  // Reflection camera
  const reflectionCamera = new ArcRotateCamera("reflectionCamera", camera.alpha, camera.beta, camera.radius, Vector3.Zero(), scene);
  reflectionCamera.minZ = 0.1;
  reflectionCamera.maxZ = WORLD_SIZE * 1.5;

  // Normal map texture
  const normalTexture = new Texture("https://www.babylonjs.com/assets/waterbump.png", scene);
  normalTexture.uScale = WORLD_SIZE / 100;
  normalTexture.vScale = WORLD_SIZE / 100;

  // Shader material for water with vertex displacement for waves
  const waterShaderMaterial = new ShaderMaterial(
    "waterShader",
    scene,
    {
      vertexSource: `
        attribute vec3 position;
        attribute vec3 normal;
        uniform mat4 world;
        uniform mat4 view;
        uniform mat4 projection;
        uniform mat4 reflectionMatrix;
        uniform float time;
        uniform float worldSize;
        uniform float waveAmplitude;
        uniform float waveFrequency;

        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec4 vReflCoord;

        void main(void) {
          float wave = sin(position.x * waveFrequency + time) * cos(position.z * waveFrequency * 1.5 + time * 0.7);
          vec3 displacedPosition = vec3(position.x, position.y + wave * waveAmplitude, position.z);

          vec4 worldPos = world * vec4(displacedPosition, 1.0);
          vPosition = worldPos.xyz;
          vNormal = (world * vec4(normal, 0.0)).xyz;
          vReflCoord = reflectionMatrix * worldPos;
          gl_Position = projection * view * worldPos;
        }
      `,
      fragmentSource: `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;

        uniform sampler2D reflectionSampler;
        uniform sampler2D normalSampler;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 waterColor;
        uniform vec3 secondaryWaterColor;
        uniform vec3 cameraPosition;
        uniform float time;
        uniform float alpha;
        uniform float distortionScale;
        uniform float size;
        uniform vec3 specularColor;
        uniform vec4 vFogInfos;
        uniform vec3 vFogColor;
        uniform float colorBlendIntensity;

        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec4 vReflCoord;

        uniform float waveAmplitude;
        uniform float waveFrequency;

        vec4 getNoise(vec2 uv) {
          vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
          vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
          vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
          vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / -113.0, time / -93.0);
          vec4 noise = texture2D(normalSampler, uv0) +
                       texture2D(normalSampler, uv1) +
                       texture2D(normalSampler, uv2) +
                       texture2D(normalSampler, uv3);
          return noise * 0.5 - 1.0;
        }

        void main(void) {
          vec4 noise = getNoise(vPosition.xz * size);
          float colorMix = clamp(noise.x * colorBlendIntensity + 0.5, 0.0, 1.0);
          vec3 baseWaterColor = mix(waterColor, secondaryWaterColor, colorMix);
          
          vec3 surfaceNormal = normalize(noise.xzy * vec3(1.5, 1.0, 1.5));

          vec3 worldToEye = cameraPosition - vPosition;
          vec3 eyeDirection = normalize(worldToEye);

          float theta = max(dot(eyeDirection, surfaceNormal), 0.0);

          float reflectance = 0.005 + (0.4) * pow((1.0 - theta), 3.0);

          vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / length(worldToEye)) * distortionScale;
          vec3 reflectionSample = texture2D(reflectionSampler, (vReflCoord.xy / vReflCoord.w) + distortion).rgb;

          vec3 finalColor = mix(baseWaterColor, reflectionSample, reflectance);

          vec3 halfVector = normalize(eyeDirection + sunDirection);
          float spec = pow(max(0.0, dot(surfaceNormal, halfVector)), 256.0);
          finalColor += spec * specularColor;

          float fog = 0.0;
          float distance = length(cameraPosition - vPosition);

          float start = vFogInfos.y;
          float end = vFogInfos.z;
          fog = (end - distance) / (end - start);
          fog = clamp(fog, 0.0, 1.0);

          finalColor = mix(vFogColor, finalColor, fog);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "world", "view", "projection", "reflectionMatrix",
        "sunColor", "sunDirection", "waterColor", "secondaryWaterColor",
        "cameraPosition", "time", "alpha", "distortionScale", "size",
        "specularColor", "vFogInfos", "vFogColor", "waveAmplitude", "waveFrequency",
        "colorBlendIntensity"
      ],
      samplers: ["reflectionSampler", "normalSampler"]
    }
  );

  // Set initial uniforms
  waterShaderMaterial.setTexture("reflectionSampler", reflectionTexture);
  waterShaderMaterial.setTexture("normalSampler", normalTexture);
  waterShaderMaterial.setFloat("alpha", 1.0);
  waterShaderMaterial.setFloat("distortionScale", 20.0);
  waterShaderMaterial.setFloat("size", 1.0);
  waterShaderMaterial.setFloat("waveAmplitude", 4.0);
  waterShaderMaterial.setFloat("waveFrequency", 0.05);
  waterShaderMaterial.setFloat("colorBlendIntensity", 1.0);

  const white = Color3.White();
  waterShaderMaterial.setVector3("specularColor", new Vector3(white.r, white.g, white.b));

  waterMesh.material = waterShaderMaterial;

  waterShaderMaterial.setTexture("reflectionSampler", reflectionTexture);

  reflectionTexture.renderList = scene.meshes.filter(mesh => mesh !== waterMesh);

  reflectionTexture.onBeforeRender = () => {
    scene.activeCamera = reflectionCamera;
    waterMesh.isVisible = false;

    const normal = new Vector3(0, 1, 0);

    const camPos = camera.position;
    const reflectedPos = Vector3.Reflect(camPos, normal);
    const target = camera.getTarget();
    const viewDir = target.subtract(camPos);
    const reflectedTarget = reflectedPos.add(Vector3.Reflect(viewDir, normal));

    reflectionCamera.position.copyFrom(reflectedPos);
    reflectionCamera.setTarget(reflectedTarget);

    const clipPlane = new Plane(normal.x, normal.y, normal.z, -Vector3.Dot(normal, waterMesh.position));
    scene.clipPlane = clipPlane;
  };

  reflectionTexture.onAfterRender = () => {
    waterMesh.isVisible = true;
    scene.clipPlane = null;
    scene.activeCamera = camera;
  };

  const preDawnSunColor = Color3.FromHexString("#ff6600");
  const daySunColor = new Color3(1, 0.95, 0.8);
  const nightHemiColor = new Color3(0.01, 0.02, 0.05);
  const dayHemiColor = new Color3(0.9, 0.9, 1);
  const dawnHemiColor = Color3.FromHexString("#001228");

  const lerpColor = (start: Color3, end: Color3, t: number) =>
    new Color3(
      start.r + (end.r - start.r) * t,
      start.g + (end.g - start.g) * t,
      start.b + (end.b - start.b) * t
    );

  // ➡️ FIX: Start the scene at night by setting timeOfDay to Math.PI.
  let timeOfDay = Math.PI;
  const dayNightCycleSpeed = 0.00003;

  const cloudTex = new Texture("https://playground.babylonjs.com/textures/cloud.png", scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  cloudTex.hasAlpha = true;
  cloudTex.wrapU = Texture.WRAP_ADDRESSMODE;
  cloudTex.wrapV = Texture.WRAP_ADDRESSMODE;

  const cloudMat = new StandardMaterial("cloudMat", scene);
  // ➡️ FIX: Corrected typo from `diffusetexture` to `diffuseTexture`.
  cloudMat.diffuseTexture = cloudTex;
  cloudMat.emissiveTexture = cloudTex;
  cloudMat.useAlphaFromDiffuseTexture = true;
  // ➡️ FIX: Set initial alpha to 1.0 so clouds are visible at night.
  cloudMat.alpha = 1.0;
  cloudMat.backFaceCulling = false;
  cloudMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  cloudMat.needDepthPrePass = true;

  const clouds: Mesh[] = [];
  const numberOfClouds = 30;
  const cloudSize = WORLD_SIZE * 0.05;

  for (let i = 0; i < numberOfClouds; i++) {
    const cloud = MeshBuilder.CreatePlane("cloud_" + i, { size: cloudSize }, scene);
    cloud.material = cloudMat;
    cloud.rotation.x = Math.PI / 2;
    cloud.position.x = (Math.random() - 0.5) * WORLD_SIZE * 1.5;
    cloud.position.z = (Math.random() - 0.5) * WORLD_SIZE * 1.5;
    cloud.position.y = 250 + (Math.random() - 0.5) * 50;
    cloud.rotation.y = Math.random() * Math.PI * 2;
    cloud.renderingGroupId = 1;
    cloud.applyFog = false;

    clouds.push(cloud);
  }

  const rainParticleSystem = new ParticleSystem("rain", 2000, scene);
  rainParticleSystem.particleTexture = new Texture("https://www.babylonjs-playground.com/textures/rain.png", scene);
  rainParticleSystem.minEmitBox = new Vector3(-HALF_WORLD_SIZE, 200, -HALF_WORLD_SIZE);
  rainParticleSystem.maxEmitBox = new Vector3(HALF_WORLD_SIZE, 200, HALF_WORLD_SIZE);
  rainParticleSystem.color1 = new Color4(0.7, 0.8, 1.0, 1.0);
  rainParticleSystem.color2 = new Color4(0.7, 0.8, 1.0, 0.5);
  rainParticleSystem.colorDead = new Color4(0, 0, 0, 0.0);
  rainParticleSystem.minSize = 0.5;
  rainParticleSystem.maxSize = 2.0;
  rainParticleSystem.minLifeTime = 0.5;
  rainParticleSystem.maxLifeTime = 1.5;
  rainParticleSystem.emitRate = 1000;
  rainParticleSystem.gravity = new Vector3(0, -9.81, 0);
  rainParticleSystem.direction1 = new Vector3(0, -1, 0);
  rainParticleSystem.direction2 = new Vector3(0, -1, 0);
  rainParticleSystem.minEmitPower = 10;
  rainParticleSystem.maxEmitPower = 20;
  rainParticleSystem.updateSpeed = 0.01;

  rainParticleSystem.start();


  SceneLoader.Append(
    "textures/",
    "brig.glb",
    scene,
    (loadedScene) => {
      console.log("All loaded meshes:", loadedScene.meshes);

      const rootMesh = loadedScene.meshes.find(m => m.name === "__root__");
      if (rootMesh) {
        boat = rootMesh.getChildren()[0] as Mesh;

        if (boat) {
          boatContainer = new Mesh("boatContainer", scene);
          boatContainer.position = new Vector3(0, BOAT_BASE_HEIGHT, 0);
          boatContainer.rotation.y = BOAT_ROTATION_Y;

          boat.parent = boatContainer;

          const boatBoundingBox = boat.getBoundingInfo().boundingBox;
          const boatHeight = boatBoundingBox.maximum.y - boatBoundingBox.minimum.y;
          boat.position.y = boatHeight / 2 - 1.0;
          boat.scaling = new Vector3(BOAT_SCALE, BOAT_SCALE, BOAT_SCALE);

          boatYaw = boatContainer.rotation.y;

          if (boat.material) {
            (boat.material as any).twoSidedLighting = true;
          } else {
            console.warn("Boat material not found, using a default StandardMaterial.");
            boat.material = new StandardMaterial("defaultBoatMat", scene);
            (boat.material as StandardMaterial).diffuseColor = Color3.FromHexString("#704214");
          }

          camera.setTarget(boatContainer.position);
          reflectionCamera.setTarget(boatContainer.position);

          if (reflectionTexture.renderList) {
            reflectionTexture.renderList.push(boat);
          }
        } else {
          console.error("Could not find any mesh in the loaded scene.");
        }
      }
    }
  );

  const inputMap: any = {};
  scene.actionManager = new ActionManager(scene);
  scene.actionManager.registerAction(
    new ExecuteCodeAction(
      ActionManager.OnKeyDownTrigger,
      (evt) => {
        inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
      }
    )
  );
  scene.actionManager.registerAction(
    new ExecuteCodeAction(
      ActionManager.OnKeyUpTrigger,
      (evt) => {
        inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
      }
    )
  );

  const moveSpeed = 0.5;
  const turnSpeed = 0.005;

  const waveHeight = (x: number, z: number, time: number) => {
    const waveFrequency = 0.05;
    const waveAmplitude = 4.0;
    const wave = Math.sin(x * waveFrequency + time) * Math.sin(z * waveFrequency * 1.5 + time * 0.7);
    return wave * waveAmplitude;
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now() / 1000;
    const dt = engine.getDeltaTime();

    const waveStrength = 0.5 + 0.5 * Math.sin(now * 0.05);

    const minAmplitude = 1.0;
    const maxAmplitude = 7.0;
    const newAmplitude = minAmplitude + (maxAmplitude - minAmplitude) * waveStrength;

    const minFrequency = 0.005;
    const maxFrequency = 0.03;
    const newFrequency = minFrequency + (maxFrequency - minFrequency) * waveStrength;

    waterShaderMaterial.setFloat("waveAmplitude", newAmplitude);
    waterShaderMaterial.setFloat("waveFrequency", newFrequency);

    const blueColor = new Vector3(0.0, 0.2, 0.6);
    const greenColor = new Vector3(0.1, 0.7, 0.4);

    waterShaderMaterial.setVector3("waterColor", blueColor);
    waterShaderMaterial.setVector3("secondaryWaterColor", greenColor);
    waterShaderMaterial.setFloat("colorBlendIntensity", 2.0);

    waterShaderMaterial.setFloat("time", now);
    waterShaderMaterial.setVector3("cameraPosition", camera.position.scale(1.0));
    waterShaderMaterial.setVector3("sunDirection", sunLight.position.normalize());

    waterShaderMaterial.setVector4("vFogInfos", new Vector4(scene.fogMode, scene.fogStart, scene.fogEnd, scene.fogDensity));
    waterShaderMaterial.setVector3("vFogColor", new Vector3(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b));

    // ➡️ FIX: New day-night cycle logic for shorter nights and starting at sunrise
    timeOfDay += dayNightCycleSpeed * dt;
    const offset = Math.PI / 2;
    const cycle = Math.sin(timeOfDay + offset);

    const nightDuration = 0.5;
    const dayNightRatio = 1.0 - nightDuration;

    const inclinationFactor = Math.max(0, (cycle + nightDuration) / dayNightRatio);

    skyMaterial.inclination = 0.2 + 0.8 * inclinationFactor;

    // ➡️ FIX: Update colors and intensity to use the new inclinationFactor
    const currentSunColor = lerpColor(nightHemiColor, daySunColor, inclinationFactor);
    const currentHemiColor = lerpColor(nightHemiColor, dayHemiColor, inclinationFactor);

    sunMat.emissiveColor = currentSunColor;
    hemiLight.diffuse = currentHemiColor;
    hemiLight.intensity = 0.4 + 0.6 * inclinationFactor;
    sunLight.intensity = 1.0 + 1.0 * inclinationFactor;

    skyMaterial.turbidity = 10;
    skyMaterial.luminance = 1;

    waterShaderMaterial.setVector3("sunColor", new Vector3(currentSunColor.r, currentSunColor.g, currentSunColor.b));

    const sunPos = skyMaterial.sunPosition.scale(WORLD_SIZE * 0.015);
    sunSphere.position.copyFrom(sunPos);
    sunLight.position.copyFrom(sunPos);

    // ➡️ FIX: Adjust cloud visibility based on time of day
    // The clouds are only fully visible during the day
    // Removed to keep clouds visible at night
    // cloudMat.alpha = 0.8 * inclinationFactor;

    for (const cloud of clouds) {
      cloud.position.x += dt * 0.01;
      if (cloud.position.x > HALF_WORLD_SIZE * 1.5) {
        cloud.position.x = -HALF_WORLD_SIZE * 1.5;
      }
    }

    if (boatContainer) {
      const boatWaveAmplitude = 0.25;

      const worldPosition = boatContainer.position;

      const wave = Math.sin(worldPosition.x * newFrequency + now) * Math.sin(worldPosition.z * newFrequency * 1.5 + now * 0.7);
      const verticalOffset = wave * newAmplitude;

      const targetY = verticalOffset * boatWaveAmplitude + BOAT_BASE_HEIGHT;
      boatContainer.position.y = lerp(boatContainer.position.y, targetY, 0.05);

      const pitchDelta = 5;
      const pitchFrontWave = Math.sin(worldPosition.x * newFrequency + now) * Math.sin((worldPosition.z + pitchDelta) * newFrequency * 1.5 + now * 0.7);
      const pitchBackWave = Math.sin(worldPosition.x * newFrequency + now) * Math.sin((worldPosition.z - pitchDelta) * newFrequency * 1.5 + now * 0.7);
      const pitchFront = pitchFrontWave * newAmplitude;
      const pitchBack = pitchBackWave * newAmplitude;
      const pitch = (pitchFront - pitchBack) / (2 * pitchDelta);

      const rollDelta = 3;
      const rollRightWave = Math.sin((worldPosition.x + rollDelta) * newFrequency + now) * Math.sin(worldPosition.z * newFrequency * 1.5 + now * 0.7);
      const rollLeftWave = Math.sin((worldPosition.x - rollDelta) * newFrequency + now) * Math.sin(worldPosition.z * newFrequency * 1.5 + now * 0.7);
      const rollRight = rollRightWave * newAmplitude;
      const rollLeft = rollLeftWave * newAmplitude;
      const roll = (rollRight - rollLeft) / (2 * rollDelta);

      const targetPitch = pitch * 0.1;
      const targetRoll = roll * -0.5;

      boatContainer.rotation.x = lerp(boatContainer.rotation.x, targetPitch, 0.05);
      boatContainer.rotation.z = lerp(boatContainer.rotation.z, targetRoll, 0.05);

      const forward = new Vector3(
        Math.cos(boatContainer.rotation.y),
        0,
        Math.sin(-boatContainer.rotation.y)
      );

      if (inputMap["w"] || inputMap["ArrowUp"]) {
        boatContainer.position.addInPlace(forward.scale(-moveSpeed));
      }
      if (inputMap["s"] || inputMap["ArrowDown"]) {
        boatContainer.position.addInPlace(forward.scale(moveSpeed));
      }
      if (inputMap["a"] || inputMap["ArrowLeft"]) {
        boatYaw -= turnSpeed * dt;
      }
      if (inputMap["d"] || inputMap["ArrowRight"]) {
        boatYaw += turnSpeed * dt;
      }

      boatContainer.rotation.y = lerp(boatContainer.rotation.y, boatYaw, 0.1);
      
      if (boatContainer.position.x > HALF_WORLD_SIZE) {
        boatContainer.position.x = -HALF_WORLD_SIZE;
      } else if (boatContainer.position.x < -HALF_WORLD_SIZE) {
        boatContainer.position.x = HALF_WORLD_SIZE;
      }

      if (boatContainer.position.z > HALF_WORLD_SIZE) {
        boatContainer.position.z = -HALF_WORLD_SIZE;
      } else if (boatContainer.position.z < -HALF_WORLD_SIZE) {
        boatContainer.position.z = HALF_WORLD_SIZE;
      }

      camera.target.copyFrom(boatContainer.position);
    }

    const reflectionView = reflectionCamera.getViewMatrix();
    const combinedMatrix = camera.getProjectionMatrix().multiply(reflectionView);
    waterShaderMaterial.setMatrix("reflectionMatrix", combinedMatrix);
  });

  return scene;
};

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = createScene(engine, canvas);

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});