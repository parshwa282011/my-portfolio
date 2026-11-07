//! The phenomenon registry. Every physical effect is a module that can be switched on or off.
//! "Simple" mode uses a vetted preset; "Complex" mode lets the user toggle each module, with
//! dependencies pulled in automatically and conflicts refused.
use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cost {
    Cheap,
    Moderate,
    Heavy,
}

#[derive(Clone, Debug)]
pub struct Phenomenon {
    pub id: &'static str,
    pub name: &'static str,
    pub domain: &'static str,
    pub depends_on: &'static [&'static str],
    pub conflicts_with: &'static [&'static str],
    pub cost: Cost,
    /// Part of the "Simple" (realistic) preset.
    pub in_simple: bool,
    pub summary: &'static str,
}

pub const PHENOMENA: &[Phenomenon] = &[
    Phenomenon { id: "gravity", name: "Gravity", domain: "mechanics", depends_on: &[], conflicts_with: &[], cost: Cost::Cheap, in_simple: true, summary: "Weight of every assembled block" },
    Phenomenon { id: "buoyancy", name: "Buoyancy", domain: "fluids", depends_on: &["gravity"], conflicts_with: &[], cost: Cost::Moderate, in_simple: true, summary: "Archimedes force on submerged blocks" },
    Phenomenon { id: "hydro_drag", name: "Water drag", domain: "fluids", depends_on: &["buoyancy"], conflicts_with: &[], cost: Cost::Moderate, in_simple: true, summary: "Quadratic drag on submerged faces, which also damps rotation" },
    Phenomenon { id: "atmosphere", name: "Atmosphere", domain: "atmosphere", depends_on: &["gravity"], conflicts_with: &[], cost: Cost::Cheap, in_simple: true, summary: "Air density falls with altitude" },
    Phenomenon { id: "gas_lift", name: "Lifting gas", domain: "atmosphere", depends_on: &["atmosphere", "buoyancy"], conflicts_with: &[], cost: Cost::Moderate, in_simple: true, summary: "Lift from gas lighter than air (ideal gas law)" },
    Phenomenon { id: "air_drag", name: "Air drag", domain: "aerodynamics", depends_on: &["atmosphere"], conflicts_with: &[], cost: Cost::Moderate, in_simple: true, summary: "Quadratic drag on exposed faces" },
    Phenomenon { id: "propulsion", name: "Propulsion", domain: "propulsion", depends_on: &[], conflicts_with: &[], cost: Cost::Cheap, in_simple: true, summary: "Thrust from propellers" },
];

#[derive(Clone, Debug)]
pub struct Registry {
    enabled: BTreeSet<&'static str>,
}

impl Default for Registry {
    fn default() -> Self {
        Registry::simple()
    }
}

impl Registry {
    /// The "Simple" mode preset: the vetted realistic set.
    pub fn simple() -> Registry {
        Registry { enabled: PHENOMENA.iter().filter(|p| p.in_simple).map(|p| p.id).collect() }
    }

    pub fn none() -> Registry {
        Registry { enabled: BTreeSet::new() }
    }

    pub fn info(id: &str) -> Option<&'static Phenomenon> {
        PHENOMENA.iter().find(|p| p.id == id)
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        self.enabled.contains(id)
    }

    pub fn enabled(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.enabled.iter().copied()
    }

    /// Enable or disable a module. Enabling pulls in dependencies; disabling switches off everything
    /// that depends on it. Returns the list of other modules that changed, so the UI can say so.
    pub fn set(&mut self, id: &str, on: bool) -> Result<Vec<&'static str>, String> {
        let info = Registry::info(id).ok_or_else(|| format!("unknown phenomenon '{id}'"))?;
        let mut changed = Vec::new();
        if on {
            for c in info.conflicts_with {
                if self.enabled.contains(c) {
                    return Err(format!("'{}' conflicts with '{}', which is on", info.id, c));
                }
            }
            for d in info.depends_on {
                if !self.enabled.contains(d) {
                    changed.extend(self.set(d, true)?);
                    changed.push(*d);
                }
            }
            self.enabled.insert(info.id);
        } else {
            self.enabled.remove(info.id);
            let dependents: Vec<&'static str> = PHENOMENA.iter().filter(|p| p.depends_on.contains(&info.id) && self.enabled.contains(p.id)).map(|p| p.id).collect();
            for d in dependents {
                changed.extend(self.set(d, false)?);
                changed.push(d);
            }
        }
        Ok(changed)
    }

    /// Relative cost of the enabled set (for the budget display).
    pub fn cost_units(&self) -> u32 {
        self.enabled()
            .filter_map(Registry::info)
            .map(|p| match p.cost {
                Cost::Cheap => 1,
                Cost::Moderate => 3,
                Cost::Heavy => 10,
            })
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_preset_is_consistent() {
        let r = Registry::simple();
        for id in r.enabled() {
            for d in Registry::info(id).unwrap().depends_on {
                assert!(r.is_enabled(d), "{id} depends on {d}");
            }
        }
    }

    #[test]
    fn enabling_pulls_dependencies_and_disabling_cascades() {
        let mut r = Registry::none();
        let changed = r.set("hydro_drag", true).unwrap();
        assert!(r.is_enabled("buoyancy") && r.is_enabled("gravity"));
        assert!(changed.contains(&"buoyancy"));
        let off = r.set("gravity", false).unwrap();
        assert!(!r.is_enabled("buoyancy") && !r.is_enabled("hydro_drag"));
        assert!(off.contains(&"buoyancy"));
        assert!(r.set("nope", true).is_err());
    }
}
