//! Small deterministic hashing helpers (no platform dependence, so native and WASM agree).

/// FNV-1a 64-bit over bytes.
pub fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// Incremental state hasher used to compare simulation states across platforms.
#[derive(Clone)]
pub struct StateHasher(u64);

impl Default for StateHasher {
    fn default() -> Self {
        StateHasher(0xcbf2_9ce4_8422_2325)
    }
}

impl StateHasher {
    pub fn write_u64(&mut self, v: u64) {
        for b in v.to_le_bytes() {
            self.0 ^= b as u64;
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    pub fn write_f32(&mut self, v: f32) {
        self.write_u64(v.to_bits() as u64);
    }
    pub fn finish(&self) -> u64 {
        self.0
    }
}

/// splitmix64 finaliser: a good 64-bit mixer.
pub fn mix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

/// Hash of a seed and three integer coordinates.
pub fn hash3(seed: u64, x: i32, y: i32, z: i32) -> u64 {
    let mut h = mix64(seed);
    h = mix64(h ^ (x as u32 as u64));
    h = mix64(h ^ ((y as u32 as u64) << 21));
    mix64(h ^ ((z as u32 as u64) << 42))
}

/// Uniform float in [0, 1) from a hash.
pub fn unit_f32(h: u64) -> f32 {
    ((h >> 40) as f32) / ((1u64 << 24) as f32)
}
