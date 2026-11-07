//! Seeded gradient (Perlin) noise with a permutation table, plus fractal sums.
use fulcrum_core::hash::mix64;

#[derive(Clone)]
pub struct Noise {
    perm: [u8; 512],
    off: [f32; 3],
}

impl Noise {
    pub fn new(seed: u64) -> Noise {
        let mut p: [u8; 256] = [0; 256];
        for (i, v) in p.iter_mut().enumerate() {
            *v = i as u8;
        }
        // Fisher-Yates driven by a splitmix stream: identical on every platform.
        let mut s = mix64(seed ^ 0x5eed);
        for i in (1..256).rev() {
            s = mix64(s);
            let j = (s % (i as u64 + 1)) as usize;
            p.swap(i, j);
        }
        let mut perm = [0u8; 512];
        for i in 0..512 {
            perm[i] = p[i & 255];
        }
        // a seeded offset so the origin is not a special (near-zero) point of the field
        let off = [0, 1, 2].map(|k| ((mix64(seed ^ (0xabcd + k)) >> 40) as f32 / 16777216.0) * 512.0);
        Noise { perm, off }
    }

    #[inline]
    fn fade(t: f32) -> f32 {
        t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
    }

    #[inline]
    fn grad3(h: u8, x: f32, y: f32, z: f32) -> f32 {
        let h = h & 15;
        let u = if h < 8 { x } else { y };
        let v = if h < 4 { y } else if h == 12 || h == 14 { x } else { z };
        (if h & 1 == 0 { u } else { -u }) + (if h & 2 == 0 { v } else { -v })
    }

    /// 3D Perlin noise in roughly [-1, 1].
    pub fn perlin3(&self, x: f32, y: f32, z: f32) -> f32 {
        let (x, y, z) = (x + self.off[0], y + self.off[1], z + self.off[2]);
        let (xf, yf, zf) = (x.floor(), y.floor(), z.floor());
        let (xi, yi, zi) = ((xf as i32 & 255) as usize, (yf as i32 & 255) as usize, (zf as i32 & 255) as usize);
        let (x, y, z) = (x - xf, y - yf, z - zf);
        let (u, v, w) = (Self::fade(x), Self::fade(y), Self::fade(z));
        let p = &self.perm;
        let a = p[xi] as usize + yi;
        let aa = p[a] as usize + zi;
        let ab = p[a + 1] as usize + zi;
        let b = p[xi + 1] as usize + yi;
        let ba = p[b] as usize + zi;
        let bb = p[b + 1] as usize + zi;
        let l = |a: f32, b: f32, t: f32| a + t * (b - a);
        l(
            l(
                l(Self::grad3(p[aa], x, y, z), Self::grad3(p[ba], x - 1.0, y, z), u),
                l(Self::grad3(p[ab], x, y - 1.0, z), Self::grad3(p[bb], x - 1.0, y - 1.0, z), u),
                v,
            ),
            l(
                l(Self::grad3(p[aa + 1], x, y, z - 1.0), Self::grad3(p[ba + 1], x - 1.0, y, z - 1.0), u),
                l(Self::grad3(p[ab + 1], x, y - 1.0, z - 1.0), Self::grad3(p[bb + 1], x - 1.0, y - 1.0, z - 1.0), u),
                v,
            ),
            w,
        ) * 0.95
    }

    pub fn perlin2(&self, x: f32, y: f32) -> f32 {
        self.perlin3(x, y, 0.5)
    }

    /// Fractal Brownian motion: `octaves` layers, each at twice the frequency and `gain` times the amplitude.
    pub fn fbm2(&self, x: f32, y: f32, octaves: u32, gain: f32) -> f32 {
        let (mut sum, mut amp, mut freq, mut norm) = (0.0, 1.0, 1.0, 0.0);
        for _ in 0..octaves {
            sum += amp * self.perlin2(x * freq, y * freq);
            norm += amp;
            amp *= gain;
            freq *= 2.0;
        }
        sum / norm
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_and_bounded() {
        let a = Noise::new(42);
        let b = Noise::new(42);
        let c = Noise::new(43);
        let mut differs = false;
        for i in 0..200 {
            let (x, y, z) = (i as f32 * 0.37, i as f32 * 0.11 + 3.0, i as f32 * 0.53);
            let v = a.perlin3(x, y, z);
            assert_eq!(v, b.perlin3(x, y, z));
            assert!(v.abs() <= 1.05, "{v}");
            if (v - c.perlin3(x, y, z)).abs() > 1e-6 {
                differs = true;
            }
        }
        assert!(differs, "different seeds should differ");
    }

    #[test]
    fn continuous() {
        let n = Noise::new(7);
        let a = n.perlin3(1.234, 5.678, 9.1);
        let b = n.perlin3(1.234 + 1e-4, 5.678, 9.1);
        assert!((a - b).abs() < 1e-2);
    }
}
