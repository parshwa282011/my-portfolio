//! Turning placed blocks into a structure: flood fill from a seed block over assemblable blocks.
use fulcrum_core::{BlockId, Content};
use std::collections::{HashSet, VecDeque};

#[derive(Debug, PartialEq, Eq)]
pub enum AssembleError {
    /// The seed block is not made of something that can be assembled (stone, dirt, air, ...).
    NotAssemblable,
    /// More blocks are connected than the configured limit.
    TooLarge { limit: usize },
}

/// A set of blocks in world coordinates, found by flood fill.
#[derive(Debug, Clone)]
pub struct Assembly {
    pub blocks: Vec<([i32; 3], BlockId)>,
}

/// Collect every assemblable block face-connected to `seed`. `get` reads blocks from the world.
pub fn assemble(content: &Content, seed: [i32; 3], get: impl Fn(i32, i32, i32) -> BlockId, max_blocks: usize) -> Result<Assembly, AssembleError> {
    let ok = |id: BlockId| content.get(id).assemblable;
    if !ok(get(seed[0], seed[1], seed[2])) {
        return Err(AssembleError::NotAssemblable);
    }
    let mut seen: HashSet<[i32; 3]> = HashSet::new();
    let mut queue = VecDeque::new();
    let mut blocks = Vec::new();
    seen.insert(seed);
    queue.push_back(seed);
    while let Some(p) = queue.pop_front() {
        let id = get(p[0], p[1], p[2]);
        blocks.push((p, id));
        if blocks.len() > max_blocks {
            return Err(AssembleError::TooLarge { limit: max_blocks });
        }
        for d in [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] {
            let n = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
            if !seen.contains(&n) && ok(get(n[0], n[1], n[2])) {
                seen.insert(n);
                queue.push_back(n);
            }
        }
    }
    blocks.sort();
    Ok(Assembly { blocks })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn flood_fill_collects_connected_blocks_only() {
        let c = Content::builtin();
        let planks = c.require("planks");
        let stone = c.require("stone");
        let mut w: HashMap<[i32; 3], BlockId> = HashMap::new();
        for x in 0..3 {
            w.insert([x, 0, 0], planks);
        }
        w.insert([10, 0, 0], planks); // not connected
        w.insert([1, -1, 0], stone); // terrain under the boat is not assembled
        let get = |x, y, z| *w.get(&[x, y, z]).unwrap_or(&0);
        let a = assemble(&c, [1, 0, 0], get, 100).unwrap();
        assert_eq!(a.blocks.len(), 3);
        assert_eq!(assemble(&c, [1, -1, 0], get, 100).unwrap_err(), AssembleError::NotAssemblable);
        assert_eq!(assemble(&c, [0, 0, 0], get, 2).unwrap_err(), AssembleError::TooLarge { limit: 2 });
    }
}
