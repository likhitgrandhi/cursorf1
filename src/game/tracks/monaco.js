import * as THREE from 'three';

function p(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

/**
 * Circuit de Monaco — scaled 5× for ~3.3 km arc length (matches real circuit).
 * Clockwise from Start/Finish on the harbour straight.
 */
export const MONACO = {
  id: 'monaco',
  name: 'Circuit de Monaco',
  width: 14,
  totalLaps: 3,
  points: [
    // Start / Finish straight
    p(460, 0.0, -430),
    p(500, 0.0, -390),
    p(540, 0.1, -330),
    // Sainte Dévote
    p(580, 0.5, -250),
    p(590, 1.2, -160),
    p(560, 2.0, -70),
    // Beau Rivage
    p(510, 3.0, 20),
    p(450, 4.2, 110),
    p(370, 5.4, 200),
    p(280, 6.2, 280),
    // Massenet
    p(170, 6.8, 340),
    p(60, 7.0, 380),
    p(-50, 6.8, 390),
    // Casino Square
    p(-160, 6.4, 360),
    p(-250, 5.8, 290),
    p(-300, 5.0, 210),
    // Fairmont Hairpin
    p(-320, 4.5, 120),
    p(-290, 4.0, 40),
    p(-220, 3.6, 0),
    // Mirabeau
    p(-140, 3.2, -10),
    p(-60, 2.8, -10),
    p(10, 2.4, 0),
    // Grand Hotel hairpin
    p(80, 2.1, -30),
    p(130, 1.9, -80),
    p(150, 1.7, -140),
    // Portier → Tunnel
    p(170, 1.5, -190),
    p(210, 1.2, -230),
    p(270, 0.8, -260),
    // Tunnel
    p(340, 0.2, -280),
    p(420, 0.1, -290),
    p(480, 0.1, -320),
    // Nouvelle Chicane
    p(500, 0.3, -360),
    p(450, 0.5, -400),
    p(410, 0.5, -420),
    // Tabac
    p(340, 0.3, -440),
    p(260, 0.2, -460),
    // Swimming Pool
    p(190, 0.1, -470),
    p(170, 0.1, -440),
    p(220, 0.0, -420),
    // La Rascasse
    p(290, 0.0, -410),
    p(370, 0.0, -420),
    // Anthony Noges → Start
    p(420, 0.0, -430),
  ],
  grid: [
    { tOffset: -0.006, lateral: -3.0 },
    { tOffset: -0.006, lateral: 3.0 },
    { tOffset: -0.014, lateral: -3.0 },
    { tOffset: -0.014, lateral: 3.0 },
  ],
};

export const TRACKS = { monaco: MONACO };
export const DEFAULT_TRACK = 'monaco';
