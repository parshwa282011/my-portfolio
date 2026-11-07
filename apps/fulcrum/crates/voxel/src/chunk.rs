use fulcrum_core::BlockId;

/// Edge length of a chunk in blocks.
pub const CS: usize = 16;
const CV: usize = CS * CS * CS;

pub type ChunkPos = (i32, i32, i32);

/// 16×16×16 blocks. A chunk that is a single block type (all air, all stone) stores nothing but that id.
#[derive(Clone)]
pub struct Chunk {
    uniform: BlockId,
    data: Option<Box<[BlockId; CV]>>,
}

#[inline]
fn idx(x: usize, y: usize, z: usize) -> usize {
    x + z * CS + y * CS * CS
}

impl Chunk {
    pub fn filled(id: BlockId) -> Chunk {
        Chunk { uniform: id, data: None }
    }

    #[inline]
    pub fn get(&self, x: usize, y: usize, z: usize) -> BlockId {
        match &self.data {
            None => self.uniform,
            Some(d) => d[idx(x, y, z)],
        }
    }

    pub fn set(&mut self, x: usize, y: usize, z: usize, id: BlockId) {
        match &mut self.data {
            None => {
                if self.uniform == id {
                    return;
                }
                let mut d = Box::new([self.uniform; CV]);
                d[idx(x, y, z)] = id;
                self.data = Some(d);
            }
            Some(d) => d[idx(x, y, z)] = id,
        }
    }

    pub fn uniform(&self) -> Option<BlockId> {
        self.data.is_none().then_some(self.uniform)
    }

    /// Collapse back to the uniform form when every block is the same (keeps memory low after edits).
    pub fn compact(&mut self) {
        if let Some(d) = &self.data {
            let first = d[0];
            if d.iter().all(|&b| b == first) {
                self.uniform = first;
                self.data = None;
            }
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (usize, usize, usize, BlockId)> + '_ {
        (0..CS).flat_map(move |y| (0..CS).flat_map(move |z| (0..CS).map(move |x| (x, y, z, self.get(x, y, z)))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniform_then_edit_then_compact() {
        let mut c = Chunk::filled(0);
        assert_eq!(c.uniform(), Some(0));
        c.set(3, 4, 5, 7);
        assert_eq!(c.get(3, 4, 5), 7);
        assert_eq!(c.get(0, 0, 0), 0);
        assert_eq!(c.uniform(), None);
        c.set(3, 4, 5, 0);
        c.compact();
        assert_eq!(c.uniform(), Some(0));
    }
}
