import { getMinimapPoints } from './Track.js';

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '0:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export class HUD {
  constructor(curve, trackDef) {
    this.el = {
      speed: document.getElementById('speed'),
      lap: document.getElementById('lap'),
      time: document.getElementById('time'),
      best: document.getElementById('best'),
      draft: document.getElementById('draft'),
      position: document.getElementById('position'),
      trackName: document.getElementById('track-name'),
      lbList: document.getElementById('lb-list'),
      startPrompt: document.getElementById('start-prompt'),
      countdown: document.getElementById('countdown'),
      crashFlash: document.getElementById('crash-flash'),
    };

    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap.getContext('2d');
    this.trackPoints = getMinimapPoints(curve);
    this.el.trackName.textContent = trackDef.name;

    this.lapStartTime = 0;
    this.bestLapTime = null;
    this.currentLap = 1;
    this.raceStarted = false;
  }

  onLapComplete(lapNumber) {
    const lapTime = (performance.now() - this.lapStartTime) / 1000;
    if (this.bestLapTime === null || lapTime < this.bestLapTime) {
      this.bestLapTime = lapTime;
      this.el.best.textContent = formatTime(lapTime);
    }
    this.lapStartTime = performance.now();
    this.currentLap = lapNumber;
  }

  onRaceFinish() {
    this.el.startPrompt.textContent = 'Race finished — refresh to replay';
    this.el.startPrompt.classList.remove('hidden');
    this.el.countdown.classList.add('hidden');
  }

  update(player, allCars, draftValue, { race, position, totalLaps, crashed }) {
    this.el.speed.textContent = player.speedDisplay;
    this.el.lap.textContent = `${Math.min(player.lap, totalLaps)}/${totalLaps}`;
    this.el.position.textContent = `P${position}`;
    this.el.draft.textContent = Math.round(draftValue);

    if (race.isRacing) {
      if (!this.raceStarted) {
        this.raceStarted = true;
        this.lapStartTime = performance.now();
        this.el.startPrompt.classList.add('hidden');
      }
      const elapsed = (performance.now() - this.lapStartTime) / 1000;
      this.el.time.textContent = formatTime(elapsed);
    }

    const countdownText = race.countdownText;
    if (race.state === 'countdown') {
      this.el.countdown.textContent = countdownText;
      this.el.countdown.classList.remove('hidden');
      this.el.startPrompt.classList.add('hidden');
    } else if (race.state === 'grid') {
      this.el.countdown.classList.add('hidden');
      this.el.startPrompt.textContent = countdownText;
      this.el.startPrompt.classList.remove('hidden');
    } else if (race.state === 'racing') {
      this.el.countdown.classList.add('hidden');
    }

    this.updateLeaderboard(allCars);
    this.drawMinimap(player, allCars);

    if (crashed) {
      this.el.crashFlash.classList.remove('hidden');
    } else {
      this.el.crashFlash.classList.add('hidden');
    }
  }

  updateLeaderboard(cars) {
    const sorted = [...cars].sort((a, b) => b.raceProgress - a.raceProgress);
    this.el.lbList.innerHTML = sorted
      .map((car, i) => {
        const color = `#${car.color.getHexString()}`;
        return `<li class="${car.isPlayer ? 'you' : ''}">
          <span class="rank">${i + 1}</span>
          <span class="dot" style="background:${color}"></span>
          <span class="name">${car.name}</span>
          <span class="lap-tag">${car.skin?.name ?? ''} · L${car.lap}</span>
        </li>`;
      })
      .join('');
  }

  drawMinimap(player, allCars) {
    const ctx = this.minimapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);

    const xs = this.trackPoints.map((p) => p.x);
    const zs = this.trackPoints.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const pad = 10;
    const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxZ - minZ || 1));

    const toScreen = (x, z) => ({
      x: (w - (maxX - minX) * scale) / 2 + (x - minX) * scale,
      y: (h - (maxZ - minZ) * scale) / 2 + (z - minZ) * scale,
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.trackPoints.forEach((p, i) => {
      const s = toScreen(p.x, p.z);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.stroke();

    for (const car of allCars) {
      if (car.isPlayer) continue;
      const pt = toScreen(car.smoothPos.x, car.smoothPos.z);
      ctx.fillStyle = `#${car.color.getHexString()}`;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const playerPt = toScreen(player.smoothPos.x, player.smoothPos.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playerPt.x, playerPt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
