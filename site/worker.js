import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4.4.1/+esm'
import { default as initWasm, WasmCWT } from "../web/waveletsm.js";

console.log('worker', Comlink);

const MORLET_W = 70;

function midi_to_freq(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

class SignalTransformWorker {
	constructor() {
		// constructor can not be async
	}

	async initialize(startNote, endNote, sampleRate, chunkLength) {
		console.log('initializing wasm');
		await initWasm();
		console.log('initialized wasm');

		this.startNote = startNote;
		this.endNote = endNote;
		this.chunkLength = chunkLength;

		const range = endNote - startNote + 1;
		const widths = new Float32Array(range);
		for (let i = 0; i < range; i++) {
			const f = midi_to_freq(i + startNote);
			const fs = sampleRate;
			widths[range - i - 1] = MORLET_W * fs / (2.0*f*Math.PI);
		}

		this.widths = widths;
		console.log({widths});

		this.cwt = new WasmCWT(chunkLength, widths, MORLET_W);
		this.result = new Float32Array(chunkLength * range);
	}


	setSamples(samples) {
		this.samples = samples;
	}

	getChunkCount() {
		return Math.ceil(this.samples.length / this.chunkLength);
	}

	async getCwtResult(chunk) {
		console.log('cwt', {chunk});
		const s = this.samples.subarray(chunk * this.chunkLength, (chunk + 1) * this.chunkLength);
		if (s.length === this.chunkLength) {
			this.cwt.cwt(s, this.result);
		} else {
			console.log('signal padding', s.length);
			const tmp = this.result.subarray(0, this.chunkLength).fill(0);
			tmp.set(s, 0);
			this.cwt.cwt(tmp, this.result);
		}
		return this.result;
	}
}


Comlink.expose(SignalTransformWorker);

