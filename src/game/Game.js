import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { createTrack, getTrackFrame, getGridPosition } from './Track.js';
import { createPlayerCar, createAICar, createRemoteCar } from './Car.js';
import { CarPhysics } from './CarPhysics.js';
import { NetworkPhysics } from './NetworkPhysics.js';
import { RacingLine } from './RacingLine.js';
import { AIRacer } from './AIRacer.js';
import { RaceManager } from './RaceManager.js';
import { MultiplayerSync } from './MultiplayerSync.js';
import { Input } from './Input.js';
import { HUD } from './HUD.js';

const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _camTangent = new THREE.Vector3();
const _camNormal = new THREE.Vector3();
const _camBinormal = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export class Game {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.input = new Input();
    this.preview = options.preview ?? false;
    this.session = null;
    this.multiplayer = null;
    this.previewAngle = 0;
    this.totalLaps = 3;
    this.cars = [];
    this.aiCars = [];

    this.initRenderer();
    this.initScene();
    this.initPostProcessing();

    this.hud = new HUD(this.curve, this.trackDef);
    this.racingLine = new RacingLine(this.curve, this.trackLength, this.trackWidth);

    this.smoothLookAt = new THREE.Vector3();
    this.smoothCamTangent = new THREE.Vector3();
    this.shakePhase = 0;
    this.crashShake = 0;

    if (!this.preview) {
      this.initRace();
    }

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.58;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0028);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 800);

    this.scene.add(new THREE.AmbientLight(0x505070, 1.0));

    const hemi = new THREE.HemisphereLight(0xaabbee, 0x181820, 0.7);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.35);
    dirLight.position.set(60, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    dirLight.shadow.camera.top = 120;
    dirLight.shadow.camera.bottom = -120;
    this.scene.add(dirLight);
    this.keyLight = dirLight;

    const rim = new THREE.DirectionalLight(0xbbccff, 0.55);
    rim.position.set(-60, 40, -50);
    this.scene.add(rim);

    this.carLight = new THREE.PointLight(0xffffff, 1.4, 28, 1.4);
    this.carLight.position.set(0, 3, 0);
    this.scene.add(this.carLight);

    const { group, curve, trackLength, trackWidth, trackDef, sampler } = createTrack();
    this.track = group;
    this.curve = curve;
    this.trackLength = trackLength;
    this.trackWidth = trackWidth;
    this.trackDef = trackDef;
    this.sampler = sampler;
    this.scene.add(group);

    const grid = new THREE.GridHelper(900, 45, 0x111111, 0x080808);
    grid.position.y = -6;
    this.scene.add(grid);
  }

  startSession(config) {
    this.preview = false;
    this.session = config;
    this.initRace(config);

    const prompt = document.getElementById('start-prompt');
    if (config.mode === 'online') {
      prompt.textContent = 'Waiting for lights out…';
      this._scheduleOnlineStart(config.raceStartAt);
      this.multiplayer?.dispose();
      this.multiplayer = new MultiplayerSync(
        config.networkClient,
        config.localPlayerId,
        () => this._localStatePayload()
      );
      this.multiplayer.start();
    } else {
      prompt.textContent = 'Press ↑ when ready — use ← → through every corner';
      prompt.classList.remove('hidden');
    }
  }

  _scheduleOnlineStart(startAt) {
    const delay = Math.max(0, (startAt ?? Date.now()) - Date.now());
    setTimeout(() => {
      if (this.race?.state === 'grid') this.race.armCountdown();
    }, delay);
  }

  _localStatePayload() {
    const p = this.player?.physics;
    if (!p) return null;
    return {
      s: p.s,
      lateral: p.lateral,
      v: p.v,
      progress: p.progress,
      lap: p.lap,
      finishedLaps: p.finishedLaps,
    };
  }

  _clearCars() {
    for (const car of this.cars) {
      this.scene.remove(car.root);
      this.scene.remove(car.trailGroup);
    }
    this.cars = [];
    this.aiCars = [];
    this.player = null;
  }

  initRace(config = {}) {
    this._clearCars();
    this.multiplayer?.dispose();
    this.multiplayer = null;

    const players = config.players ?? this._defaultPlayers();
    this.totalLaps = config.totalLaps ?? this.trackDef.totalLaps;

    players.forEach((p, i) => {
      let car;
      if (p.isLocal) {
        car = createPlayerCar({ name: p.name, team: p.team });
        this.player = car;
      } else if (p.isAI) {
        car = createAICar(p);
        this.aiCars.push(car);
      } else {
        car = createRemoteCar(p);
      }

      const slot = this.trackDef.grid[i] ?? this.trackDef.grid[this.trackDef.grid.length - 1];
      const { s, lateral } = getGridPosition(this.trackLength, slot);

      let physics;
      if (car.isRemote) {
        physics = new NetworkPhysics({
          trackLength: this.trackLength,
          trackWidth: this.trackWidth,
        });
      } else {
        physics = new CarPhysics({
          trackLength: this.trackLength,
          trackWidth: this.trackWidth,
          isPlayer: car.isPlayer,
          skill: p.isLocal ? 1 : p.skill ?? 0.9,
        });
      }

      physics.s = s;
      physics.lateral = lateral;
      physics.v = 0;
      car.initPhysics(physics);

      if (p.isAI) {
        car.ai = new AIRacer({
          skill: p.skill ?? 0.9,
          aggression: p.aggression ?? 0.5,
        });
      }

      this.cars.push(car);
      this.scene.add(car.root);
      this.scene.add(car.trailGroup);
    });

    this.race = new RaceManager({
      totalLaps: this.totalLaps,
      trackName: this.trackDef.name,
      onLapComplete: (lap) => this.hud.onLapComplete(lap),
      onRaceFinish: () => this.hud.onRaceFinish(),
    });
    this.race.resetLapTracking();

    this.smoothLookAt.set(0, 0, 0);
    this.smoothCamTangent.set(0, 0, 0);
  }

  _defaultPlayers() {
    return [
      { id: 'local', name: 'You', team: 'audi', isLocal: true, isAI: false },
      { id: 'ai1', name: 'Hamilton', team: 'mercedes', isLocal: false, isAI: true, skill: 0.88, aggression: 0.45 },
      { id: 'ai2', name: 'Leclerc', team: 'ferrari', isLocal: false, isAI: true, skill: 0.91, aggression: 0.55 },
      { id: 'ai3', name: 'Norris', team: 'mclaren', isLocal: false, isAI: true, skill: 0.90, aggression: 0.5 },
    ];
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,
      0.35,
      0.9
    );
    this.composer.addPass(this.bloomPass);
  }

  getSteerInput() {
    let steer = 0;
    if (this.input.left) steer -= 1;
    if (this.input.right) steer += 1;
    return steer;
  }

  updatePlayer(dt) {
    const p = this.player.physics;
    const online = this.session?.mode === 'online';

    if (this.input.up && this.race.state === 'grid' && !online) {
      this.race.armCountdown();
    }

    if (!this.race.isRacing) {
      p.v = THREE.MathUtils.lerp(p.v, 0, dt * 8);
      return;
    }

    const frame = getTrackFrame(this.curve, p.progress, this.trackLength, this.sampler);

    p.update(
      dt,
      {
        throttle: this.input.up ? 1 : 0,
        brake: this.input.down ? 1 : 0,
        steer: this.getSteerInput(),
      },
      { curvature: frame.curvature, turnDirection: frame.turnDirection }
    );
  }

  updateAI(dt) {
    const rivals = this.cars.map((c) => c.physics);
    const racing = this.race.isRacing;

    for (const car of this.aiCars) {
      const p = car.physics;
      const frame = getTrackFrame(this.curve, p.progress, this.trackLength, this.sampler);
      const inputs = car.ai.update(dt, p, frame, this.racingLine, rivals, racing);

      p.update(dt, inputs, {
        curvature: frame.curvature,
        turnDirection: frame.turnDirection,
        gripMult: 0.96 + car.aiProfile.skill * 0.04,
      });
    }
  }

  updateRemote(dt) {
    if (!this.multiplayer) return;
    for (const car of this.cars) {
      if (!car.isRemote) continue;
      const state = this.multiplayer.getRemoteState(car.remoteId);
      if (state) car.physics.applyNetworkState(state, dt);
    }
  }

  computeDraft() {
    let draft = 0;
    const pp = this.player.physics;
    const playerFrame = getTrackFrame(this.curve, pp.progress, this.trackLength, this.sampler);

    for (const car of this.cars) {
      if (car.isPlayer) continue;
      const ap = car.physics;
      const frame = getTrackFrame(this.curve, ap.progress, this.trackLength, this.sampler);
      const dist = playerFrame.position.distanceTo(frame.position);
      let pd = Math.abs(pp.progress - ap.progress);
      pd = Math.min(pd, 1 - pd);

      if (dist < 16 && pd < 0.02 && ap.v > pp.v * 0.85) {
        draft = Math.max(draft, (1 - dist / 16) * 100);
      }
    }

    pp.draftBoost = draft > 12 ? 1 + (draft / 100) * 0.06 : 1;
    return draft;
  }

  getPlayerPosition() {
    const sorted = [...this.cars].sort((a, b) => b.raceProgress - a.raceProgress);
    return sorted.findIndex((c) => c.isPlayer) + 1;
  }

  updatePreviewCamera(dt) {
    this.previewAngle += dt * 0.12;
    const frame = getTrackFrame(this.curve, 0, this.trackLength, this.sampler);
    const radius = 18;
    this.camera.position
      .copy(frame.position)
      .addScaledVector(frame.normal, 7 + Math.sin(this.previewAngle * 0.7) * 1.5)
      .addScaledVector(frame.binormal, Math.cos(this.previewAngle) * radius)
      .addScaledVector(frame.tangent, Math.sin(this.previewAngle * 0.5) * 6);
    this.camera.lookAt(
      frame.position.x,
      frame.position.y + 1.5,
      frame.position.z
    );
  }

  updateCamera(dt) {
    const p = this.player.physics;
    const frame = getTrackFrame(this.curve, p.progress, this.trackLength, this.sampler);
    const carPos = this.player.smoothPos;
    const speedRatio = THREE.MathUtils.clamp(p.v / p.maxSpeed, 0, 1);

    this.carLight.position.copy(carPos).add(new THREE.Vector3(0, 2.2, 0));
    this.keyLight.position.copy(carPos).add(new THREE.Vector3(40, 60, 30));

    if (this.smoothCamTangent.lengthSq() === 0) {
      this.smoothCamTangent.copy(frame.tangent);
    }
    this.smoothCamTangent.lerp(frame.tangent, 1 - Math.exp(-3.5 * dt)).normalize();

    _camBinormal.crossVectors(this.smoothCamTangent, _worldUp).normalize();
    if (_camBinormal.lengthSq() < 0.001) _camBinormal.set(1, 0, 0);
    _camNormal.crossVectors(_camBinormal, this.smoothCamTangent).normalize();
    _camTangent.copy(this.smoothCamTangent);

    const chaseDist = 6.2 + speedRatio * 1.6;
    const chaseHeight = 3.1 + speedRatio * 0.8;
    const lookAhead = 4.5 + speedRatio * 3.5;

    _camPos
      .copy(carPos)
      .addScaledVector(_camNormal, chaseHeight)
      .addScaledVector(_camTangent, -chaseDist)
      .addScaledVector(_camBinormal, -p.lateral * 0.3);

    _lookAt
      .copy(carPos)
      .addScaledVector(_camTangent, lookAhead)
      .addScaledVector(_camNormal, 1.2);

    const camAlpha = 1 - Math.exp(-5.5 * dt);
    const lookAlpha = 1 - Math.exp(-7 * dt);

    this.camera.position.lerp(_camPos, camAlpha);
    if (this.smoothLookAt.lengthSq() === 0) this.smoothLookAt.copy(_lookAt);
    this.smoothLookAt.lerp(_lookAt, lookAlpha);
    this.camera.lookAt(this.smoothLookAt);

    if (p.wallHitTimer > 0 && p.lastWallImpact > 15) {
      this.crashShake = Math.max(this.crashShake, p.lastWallImpact * 0.0008);
    }
    this.crashShake *= 0.88;

    this.shakePhase += dt * (6 + speedRatio * 16);
    const shake = speedRatio * 0.025 + this.crashShake;
    this.camera.position.x += Math.sin(this.shakePhase * 1.7) * shake * 2;
    this.camera.position.y += Math.sin(this.shakePhase * 2.3) * shake * 0.8;

    const targetFov = 50 + speedRatio * 10;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-3.5 * dt));
    this.camera.updateProjectionMatrix();
  }

  updateCars(dt) {
    for (const car of this.cars) {
      const frame = getTrackFrame(this.curve, car.physics.progress, this.trackLength, this.sampler);
      car.updateVisuals(frame, dt);
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.033);

    if (this.preview) {
      this.updatePreviewCamera(dt);
      this.composer.render();
      return;
    }

    this.race.update(dt, this.player.physics);
    this.updatePlayer(dt);
    this.updateAI(dt);
    this.updateRemote(dt);
    this.multiplayer?.update(dt);
    this.updateCars(dt);

    const draft = this.computeDraft();
    this.updateCamera(dt);

    this.hud.update(this.player, this.cars, draft, {
      race: this.race,
      position: this.getPlayerPosition(),
      totalLaps: this.totalLaps,
      crashed: this.player.physics.isCrashed,
    });

    this.composer.render();
  }
}
