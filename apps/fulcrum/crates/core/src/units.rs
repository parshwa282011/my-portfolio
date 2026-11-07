//! SI constants used across the simulation (metres, kilograms, seconds, kelvin).

/// Standard gravity at the surface of the home world (m/s²).
pub const G0: f32 = 9.80665;
/// Density of fresh water (kg/m³).
pub const RHO_WATER: f32 = 1000.0;
/// Air density at sea level, 15 °C (kg/m³).
pub const RHO_AIR_SEA: f32 = 1.225;
/// Atmospheric scale height (m).
pub const SCALE_HEIGHT: f32 = 8500.0;
/// Specific gas constant of dry air (J/(kg·K)).
pub const R_AIR: f32 = 287.05;

/// Air density at altitude `h` metres above sea level (isothermal exponential atmosphere).
pub fn air_density(h: f32) -> f32 {
    RHO_AIR_SEA * (-h / SCALE_HEIGHT).exp()
}
