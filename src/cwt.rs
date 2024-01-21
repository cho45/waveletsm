
use rustfft::num_complex::Complex;
use rustfft::num_complex::ComplexFloat;

/**
 * same as scipy.signal.morlet2
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.morlet2.html
 */
type WaveletFn = Box<dyn Fn(usize, f32) -> Box<[Complex<f32>]>>;
fn morlet(w: f32) -> WaveletFn {
    Box::new(move |m: usize, s: f32| -> Box<[Complex<f32>]> {
        let mut ret = vec![Complex::new(0.0, 0.0); m].into_boxed_slice();
        for i in 0..m {
            let mut x = i as f32 - (m as f32 - 1.0) / 2.0;
            x /= s;
            ret[i] = (Complex::new(0.0, 1.0) * w * x).exp()
                * (-0.5 * x.powf(2.0)).exp()
                * std::f32::consts::PI.powf(-0.25)
                * (1.0 / s).sqrt()
        }
        ret
    })
}

pub struct FastCWT {
    n: usize,
    fftf: std::sync::Arc<dyn rustfft::Fft<f32>>,
    ffti: std::sync::Arc<dyn rustfft::Fft<f32>>,
    fft_size: usize,
    widths: Box<[f32]>,
    widths_n: Box<[usize]>,
    wavelets: Vec< Vec<Complex<f32>> >
}

impl FastCWT {
    pub fn new(n: usize, widths_: &[f32], wavelets_: &[ &[Complex<f32>] ]) -> Self {

        let widths = widths_.into();
        let widths_n: Box<[usize]> = wavelets_.iter().map(|w| w.len()).collect();

        let size = (n + (*widths_n.iter().max().unwrap() as f32 / 2.0).ceil() as usize).next_power_of_two();

        let mut planner = rustfft::FftPlanner::new();
        let fftf = planner.plan_fft_forward(size);
        let ffti = planner.plan_fft_inverse(size);
        eprintln!("fftlen: {} {}", fftf.len(), ffti.len());
        let fft_size = fftf.len();
        let wavelets = wavelets_.iter().map(|w| {
            let mut fd = vec![Complex::new(0.0, 0.0); fft_size];
            for (i, td) in w.iter().rev().map(|x| x.conj()).enumerate() {
                fd[i] = td;
            }
            fftf.process(&mut fd);
            fd
        }).collect();

        eprintln!("fft_size: {}", fft_size);

        Self {
            n,
            fftf,
            ffti,
            fft_size,
            widths,
            widths_n,
            wavelets,
        }
    }

    pub fn new_with_wavelet(n: usize, widths: &[f32], wavelet: WaveletFn) -> Self {
        let mut wavelets = vec![];
        for width in widths.iter() {
            let nx = usize::min( (*width * 10.0) as usize, n);
            wavelets.push(wavelet(nx, *width));
        }

        Self::new(n, widths, &wavelets.iter().map(|w| &w[..]).collect::<Vec<_>>()[..])
    }

    pub fn new_with_morlet(n: usize, widths: &[f32], morlet_w: f32) -> Self {
        let wavelet = morlet(morlet_w);
        Self::new_with_wavelet(n, widths, wavelet)
    }

    pub fn cwt(&self, input: &[f32], result: &mut [f32]) {
        let mut buffer = vec![Complex::new(0.0, 0.0); self.fft_size];
        for i in 0..self.n {
            buffer[i] = Complex::new(input[i], 0.0);
        }

        self.fftf.process(&mut buffer);

        // mirror for inverse fft
        for i in 1..(self.fft_size >> 1) {
            buffer[self.fft_size - i] = buffer[i].conj();
        }

        let scale = 1.0 / self.fft_size as f32;

        let mut computed = vec![Complex::new(0.0, 0.0); self.fft_size];
        let nwidths = (*self.widths).len();
        for width in 0..nwidths {
            for i in 0..self.fft_size {
                computed[i] = buffer[i] * self.wavelets[width][i];
            }

            self.ffti.process(&mut computed);

            let start = self.widths_n[width] / 2;
            for i in 0..self.n {
                result[width * self.n + i] = (computed[start + i] * scale / self.widths[width]).norm();
            }
        }
    }
}
