export class Input {
  constructor() {
    this.keys = {};
    this.started = false;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'ArrowUp') this.started = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  get up() { return this.keys['ArrowUp'] ?? false; }
  get down() { return this.keys['ArrowDown'] ?? false; }
  get left() { return this.keys['ArrowLeft'] ?? false; }
  get right() { return this.keys['ArrowRight'] ?? false; }
}
