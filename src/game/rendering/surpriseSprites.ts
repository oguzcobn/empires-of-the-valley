import type { Graphics } from 'pixi.js';

export function drawSaucer(g: Graphics): void {
  g.ellipse(1, 3, 35, 8).fill({ color: 0x08313e, alpha: .21 });
  g.ellipse(0, 0, 31, 10).fill(0x23343f);
  for (let i = 0; i < 7; i++) {
    const light = [0x495960, 0x5f757c, 0x879c9d, 0xb8bbb4, 0xbfc8be, 0xaebeb6, 0x779e9f][i]!;
    g.ellipse(0, -i * .92, 31 - i * 1.25, 10 - i * .65).fill(light);
  }
  g.ellipse(0, -5, 20, 6.5).fill(0x273c42).stroke({ color: 0xc9d3ce, width: .75 });
  g.ellipse(0, -8, 15.8, 9.2).fill(0x386772);
  g.ellipse(-2, -11, 12, 6.3).fill(0x529297);
  g.ellipse(-4, -13, 7, 2.4).fill({ color: 0xc6fbef, alpha: .46 });
  for (let i = 0; i < 9; i++) {
    const a = .24 + i * .33;
    const x = Math.cos(a) * 28, y = Math.sin(a) * 9;
    g.ellipse(x, y, 3.2, 1.4).fill({ color: 0x78ffdc, alpha: .24 });
    g.ellipse(x, y, 1.45, .69).fill(i % 3 ? 0xa4ffe9 : 0xffeeb4);
  }
}

/** Wood, canvas, iron and rope with separate reflected and key-light ramps. */
export function drawCorsair(g: Graphics): void {
  g.poly([-62, -17, -45, -7, 7, 9, 51, 12, 69, -2, 48, -20, -12, -30]).fill(0x31211b);
  g.poly([-60, -15, -41, 1, 9, 18, 48, 20, 66, 6, 67, -2, 49, 10, 11, 8, -43, -8]).fill(0x4e3325);
  g.poly([-61, -17, -10, -29, 48, -20, 67, -3, 48, 10, 8, 7, -43, -8]).fill(0x9b6c42);
  g.poly([-52, -17, -10, -26, 44, -17, 60, -4, 46, 7, 9, 4, -42, -11]).fill(0x78603e);
  for (let i = 0; i < 4; i++) {
    g.moveTo(-44 + i * 2, -7 + i * 2.2).lineTo(9, 9 + i * 2.4).lineTo(48, 12 + i * 2).lineTo(64, i * 2)
      .stroke({ color: i % 2 ? 0x997451 : 0x29241d, width: .85 });
  }
  for (let i = 0; i < 9; i++) {
    const x = -32 + i * 9, y = x < 12 ? x * .31 + 7 : 12.2;
    g.rect(x - 2.5, y - 1.8, 5, 4.4).fill(0x3b281c).stroke({ color: 0xa78050, width: .65 });
    g.moveTo(x, y).lineTo(x + 1.7, y + 3.5).stroke({ color: 0x25272a, width: 1.5 });
  }
  g.moveTo(-48, -15).lineTo(-64, -24).stroke({ color: 0x3f2a1a, width: 2.8 });
  g.moveTo(56, -10).lineTo(78, -22).stroke({ color: 0x614331, width: 2.2 });

  for (const [x, base, height, width] of [[-33, -13, 37, 27], [18, 2, 42, 36], [-7, -4, 59, 42]] as const) {
    const top = base - height;
    g.moveTo(x, base + 3).lineTo(x, top - 2).stroke({ color: 0x4a3326, width: 2.5 });
    g.moveTo(x + .8, base + 2).lineTo(x + .8, top).stroke({ color: 0x9b7853, width: .65 });
    g.moveTo(x, top + 4).lineTo(x - width * .58, base + 2).lineTo(x + width * .5, base + 1).lineTo(x, top + 4)
      .stroke({ color: 0x332d2b, width: .63, alpha: .82 });
    for (const [y, w, deep] of [[top + 8, width * .73, height * .28], [top + height * .45, width, height * .32]] as const) {
      g.moveTo(x - w / 2, y).lineTo(x + w / 2, y + 3)
        .quadraticCurveTo(x + w * .59, y + deep * .51, x + w * .43, y + deep)
        .quadraticCurveTo(x + w * .04, y + deep * .63, x - w * .42, y + deep - 2)
        .quadraticCurveTo(x - w * .52, y + deep * .5, x - w / 2, y).fill(0xd4c2a0);
      g.moveTo(x - w * .08, y + 2).quadraticCurveTo(x + w * .13, y + deep * .47, x + w * .12, y + deep * .84)
        .stroke({ color: 0x9d8b70, width: 1.2 });
      g.moveTo(x - w * .51, y).lineTo(x + w * .52, y + 3).stroke({ color: 0x51412b, width: 1.3 });
    }
  }
  g.poly([-7, -64, 10, -62, 5, -58, 10, -54, -7, -56]).fill(0x202225);
  g.circle(-.5, -59.5, 1.75).fill(0xefe9d8);
  g.moveTo(-3, -57).lineTo(2, -60).moveTo(-3, -60).lineTo(2, -57).stroke({ color: 0xefe9d8, width: .45 });
}

export function drawAlien(g: Graphics, step: number): void {
  const stride = Math.sin(step) * 2.2;
  g.ellipse(0, 1, 5.7, 2.4).fill({ color: 0x182221, alpha: .34 });
  g.moveTo(-1.8, -8).lineTo(-2.7 + stride, -2).lineTo(-4 + stride, 0)
    .moveTo(1.5, -8).lineTo(2.9 - stride, -2).lineTo(4 - stride, -.5).stroke({ color: 0x304a3e, width: 1.45 });
  g.ellipse(0, -11, 3.15, 5.2).fill(0x516959);
  g.moveTo(-2.2, -14).lineTo(-5, -10 + stride).lineTo(-5.7, -7 + stride)
    .moveTo(2.2, -14).lineTo(4.6, -10 - stride).lineTo(5.4, -7 - stride).stroke({ color: 0x829f71, width: 1.1 });
  g.ellipse(0, -21.1, 5.35, 6.5).fill(0x79946c);
  g.ellipse(-1.9, -23.5, 2.5, 2.35).fill({ color: 0xcae2a6, alpha: .58 });
  g.ellipse(-2.35, -20.2, 1.58, 2.45).fill(0x141e26);
  g.ellipse(2.16, -20.1, 1.56, 2.4).fill(0x141e26);
  g.circle(-2.65, -21, .56).fill(0xa7edcc);
  g.circle(1.8, -21, .54).fill(0xa7edcc);
}

export function drawPirate(g: Graphics, heading: number, step: number, variant: number): void {
  const stride = Math.sin(step) * 2.4;
  const coat = [0x784038, 0x535354, 0x68473e, 0x49636a][variant % 4]!;
  g.ellipse(0, 0, 4.8, 1.8).fill({ color: 0x1b1a18, alpha: .32 });
  g.moveTo(-1.3, -8).lineTo(-2.1 + stride, -.5).moveTo(1.6, -8).lineTo(2.3 - stride, -.5).stroke({ color: 0x302c28, width: 1.9 });
  g.poly([-3.4,-16, 3,-16, 4.1,-7, -4.4,-7]).fill(coat);
  g.moveTo(-3, -9.3).lineTo(3, -10.6).stroke({ color: 0xd6aa65, width: 1.05 });
  g.circle(0, -18, 2.65).fill(0xc89267);
  g.poly([-5,-18.3, -2,-22.3, 1,-21.1, 3,-22.1, 5,-18.8]).fill(0x302b28);
  g.moveTo(-4, -18.7).lineTo(4.9, -19.1).stroke({ color: 0xa78854, width: .54 });
  g.moveTo(-heading * 2.5, -12).lineTo(heading * 4.2, -13.2).stroke({ color: 0x64402e, width: 2.3 });
  g.moveTo(heading * 2, -13.2).lineTo(heading * 8.3, -14.3).stroke({ color: 0x313234, width: 1.3 });
}
