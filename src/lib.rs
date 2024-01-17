extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

mod cwt;
use crate::cwt::FastCWT;

#[wasm_bindgen]
pub struct WasmCWT {
    fast_cwt: FastCWT,
}

#[wasm_bindgen]
impl WasmCWT {
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize, widths: &[f32], morlet_w: f32) -> Self {
        Self {
            fast_cwt: FastCWT::new_with_morlet(n, widths, morlet_w),
        }
    }

    pub fn cwt(&self, input: &[f32], result: &mut [f32]) {
        self.fast_cwt.cwt(input, result);
    }
}
