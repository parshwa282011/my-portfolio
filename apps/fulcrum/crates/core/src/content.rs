//! Data-driven block definitions. Everything a block *is* lives in `content/blocks.json`;
//! behaviours in the physics engine key off these numbers and the `role` string.
use serde::Deserialize;
use std::collections::HashMap;

pub type BlockId = u16;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Render {
    Opaque,
    Cutout,
    Fluid,
    None,
}

fn t() -> bool {
    true
}
fn opaque() -> Render {
    Render::Opaque
}

#[derive(Clone, Debug, Deserialize)]
pub struct BlockDef {
    pub name: String,
    #[serde(default = "t")]
    pub solid: bool,
    #[serde(default)]
    pub fluid: bool,
    #[serde(default = "opaque")]
    pub render: Render,
    #[serde(default)]
    pub color: [u8; 3],
    /// Mass of one cubic metre of this block, in kilograms.
    #[serde(default)]
    pub mass_kg: f32,
    /// Fraction of the block's volume that displaces fluid when submerged (1 = sealed hull, ~0 = open frame).
    #[serde(default)]
    pub displace: f32,
    /// Extra mass per exposed face (kg per m²): fabric skin of a gas cell, thin plating, etc.
    #[serde(default)]
    pub face_mass_kg: f32,
    /// Drag coefficient used for this block's exposed faces.
    #[serde(default)]
    pub drag_cd: f32,
    #[serde(default)]
    pub hardness: f32,
    /// Can this block be assembled into a physics structure?
    #[serde(default)]
    pub assemblable: bool,
    /// Maximum thrust of a propulsion block (newtons).
    #[serde(default)]
    pub thrust_n: f32,
    /// Density of the lifting gas inside a gas cell at the reference temperature (kg/m³).
    #[serde(default)]
    pub gas_density: f32,
    /// Behaviour tag: "gas_cell", "propeller", "helm", ...
    #[serde(default)]
    pub role: String,
}

#[derive(Deserialize)]
struct File {
    version: u32,
    blocks: Vec<BlockDef>,
}

#[derive(Clone, Debug)]
pub struct Content {
    pub blocks: Vec<BlockDef>,
    by_name: HashMap<String, BlockId>,
}

pub const MAX_BLOCKS: usize = 4096;

impl Content {
    /// The built-in block set.
    pub fn builtin() -> Content {
        Content::from_json(include_str!("../../../content/blocks.json")).expect("built-in content is valid")
    }

    /// Parse and validate content. Defensive: caps sizes and rejects non-finite or negative numbers.
    pub fn from_json(text: &str) -> Result<Content, String> {
        if text.len() > 4 * 1024 * 1024 {
            return Err("content file is too large".into());
        }
        let file: File = serde_json::from_str(text).map_err(|e| format!("invalid content: {e}"))?;
        if file.version != 1 {
            return Err(format!("unsupported content version {}", file.version));
        }
        if file.blocks.is_empty() || file.blocks.len() > MAX_BLOCKS {
            return Err("block count out of range".into());
        }
        let mut by_name = HashMap::new();
        for (i, b) in file.blocks.iter().enumerate() {
            if b.name.is_empty() || b.name.len() > 64 {
                return Err(format!("block {i}: bad name"));
            }
            for (label, v) in [
                ("mass_kg", b.mass_kg),
                ("face_mass_kg", b.face_mass_kg),
                ("displace", b.displace),
                ("drag_cd", b.drag_cd),
                ("hardness", b.hardness),
                ("thrust_n", b.thrust_n),
                ("gas_density", b.gas_density),
            ] {
                if !v.is_finite() || v < 0.0 {
                    return Err(format!("block '{}': {label} must be a finite number >= 0", b.name));
                }
            }
            if b.displace > 1.0 {
                return Err(format!("block '{}': displace must be <= 1", b.name));
            }
            if by_name.insert(b.name.clone(), i as BlockId).is_some() {
                return Err(format!("duplicate block name '{}'", b.name));
            }
        }
        if file.blocks[0].name != "air" || file.blocks[0].solid {
            return Err("block 0 must be non-solid 'air'".into());
        }
        Ok(Content { blocks: file.blocks, by_name })
    }

    pub fn id_of(&self, name: &str) -> Option<BlockId> {
        self.by_name.get(name).copied()
    }

    /// Like `id_of` but panics: for names the engine itself requires.
    pub fn require(&self, name: &str) -> BlockId {
        self.id_of(name).unwrap_or_else(|| panic!("content is missing required block '{name}'"))
    }

    pub fn get(&self, id: BlockId) -> &BlockDef {
        self.blocks.get(id as usize).unwrap_or(&self.blocks[0])
    }

    pub fn is_solid(&self, id: BlockId) -> bool {
        self.get(id).solid
    }
    pub fn is_fluid(&self, id: BlockId) -> bool {
        self.get(id).fluid
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_content_loads() {
        let c = Content::builtin();
        assert_eq!(c.id_of("air"), Some(0));
        assert!(c.get(c.require("water")).fluid);
        assert!(c.get(c.require("planks")).assemblable);
        assert!(!c.get(c.require("stone")).assemblable);
    }

    #[test]
    fn rejects_bad_content() {
        assert!(Content::from_json("not json").is_err());
        assert!(Content::from_json(r#"{"version":2,"blocks":[]}"#).is_err());
        assert!(Content::from_json(r#"{"version":1,"blocks":[{"name":"stone"}]}"#).is_err()); // block 0 must be air
        assert!(Content::from_json(r#"{"version":1,"blocks":[{"name":"air","solid":false},{"name":"x","mass_kg":-1}]}"#).is_err());
        assert!(Content::from_json(r#"{"version":1,"blocks":[{"name":"air","solid":false},{"name":"x","displace":2}]}"#).is_err());
        assert!(Content::from_json(r#"{"version":1,"blocks":[{"name":"air","solid":false},{"name":"air"}]}"#).is_err());
    }
}
