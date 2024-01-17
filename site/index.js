// import * as Comlink from "https://unpkg.com/comlink/dist/esm/comlink.mjs";
import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4.4.1/+esm'


function jetColorMap(n) {
	// 線形補間関数
	function interpolate(a, b, fraction) {
		return a + (b - a) * fraction;
	}
	// カラーマップの定義
	const cmap = [
		[0, 0, 0],
		[0, 0, 0.5],
		[0, 0, 1],
		[0, 0.5, 1],
		[0, 1, 1],
		[0.5, 1, 0.5],
		[1, 1, 0],
		[1, 0.5, 0],
		[1, 0, 0],
		[0.5, 0, 0]
	];

	if (isNaN(n)) return { r: 0, g: 0, b: 0 };

	n = Math.min(0.9999999, Math.max(0.0, n));

	const index = Math.floor(n * (cmap.length - 1));

	const color1 = cmap[index];
	const color2 = cmap[index + 1];
	const fraction = n * (cmap.length - 1) - index;

	const r = interpolate(color1[0], color2[0], fraction);
	const g = interpolate(color1[1], color2[1], fraction);
	const b = interpolate(color1[2], color2[2], fraction);

	return { r, g, b };
}


function midi_to_freq(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

function noteNumberToNoteName(noteNumber) {
	const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const octave = Math.floor(noteNumber / 12) - 1;
	const noteIndex = noteNumber % 12;
	const noteName = noteNames[noteIndex];
	return `${noteName}${octave}`;
}

const MORLET_W = 70;
const sampleRate = 5000*2;
const offlineAudioContext = new OfflineAudioContext(1, sampleRate, sampleRate);
const input = document.getElementById("file");
const canvas = document.getElementById("canvas");

async function main() {
	const worker = new Worker("worker.js", { type: "module" });
	console.log(worker);
	worker.onerror = function (e) {
		console.log(e);
	};
	const SignalTransformWorker = Comlink.wrap(worker);
	
	const startNote = 21;
	const endNote = 108;
	const chunkLength = sampleRate * 20;
	const resolutionSeconds = 0.01;
	const resampleRate = Math.round(sampleRate * resolutionSeconds);

	const range = endNote - startNote + 1;
	const NOTE_HEIGHT = 15;

	{
		const indexCanvas = document.getElementById("index");
		const ctx = indexCanvas.getContext("2d");
		indexCanvas.height = range * NOTE_HEIGHT * 2;
		indexCanvas.width = 100;
		indexCanvas.style.height = range * NOTE_HEIGHT + "px";

		for (let i = 0; i < range; i++) {
			ctx.fillStyle = "white";
			ctx.fillRect(0, i * NOTE_HEIGHT * 2, 100, NOTE_HEIGHT * 2);
			ctx.fillStyle = "black";
			ctx.font = "20px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(noteNumberToNoteName(endNote - i), 5, i * NOTE_HEIGHT * 2 + NOTE_HEIGHT);
		}
	};

	canvas.height = range;
	canvas.width = chunkLength / resampleRate;
	canvas.style.height = range * NOTE_HEIGHT + "px";
	canvas.style.width = "100%";
	canvas.style.imageRendering = "pixelated";
//	canvas.addeventlistener("mousemove", (e) => {
//		const note = math.floor(endnote - (e.offsety / note_height));
//		console.log(e.offsetx, e.offsety, note, notenumbertonotename(note));
//	});
	const im = new ImageData(canvas.width, range);
	async function loadFile() {
		const file = input.files[0];
		console.log('loadFile', file);

		const arrayBuffer = await file.arrayBuffer();
		const buffer = await offlineAudioContext.decodeAudioData(arrayBuffer);
		const samples = buffer.getChannelData(0);

		const signalTransformWorker = await new SignalTransformWorker();
		await signalTransformWorker.initialize(
			startNote, endNote, sampleRate, chunkLength
		);
		console.log('set samples to worker');
		await signalTransformWorker.setSamples(Comlink.transfer(samples, [samples.buffer]));

		console.log('get cwt result from worker');
		const result = await signalTransformWorker.getCwtResult(0);

		let max = 0.0;
		for (let i = 0; i < result.length; i++) {
			max = Math.max(max, result[i]);
		}
		let min = -65 / 20;
		max = Math.log10(max);
		let scale = max - min;
		console.log({min, max, scale});


		for (let ri = 0; ri < range; ri++) {
			const row = result.subarray(ri * chunkLength, (ri + 1) * chunkLength);

			for (let i = 0; i < canvas.width; i++) {
				let v = 0;
				for (let s = 0; s < resampleRate; s++) {
					v += row[i * resampleRate + s];
				}

				let scaled = (Math.log10(v / resampleRate) - min) / scale;
				const {r, g, b} = jetColorMap(scaled);
				const index = (i + ri * canvas.width) * 4;
				im.data[index + 0] = r * 255;
				im.data[index + 1] = g * 255;
				im.data[index + 2] = b * 255;
				im.data[index + 3] = 255;
			}
		}
		console.log(result);

		canvas.getContext("2d").putImageData(im, 0, 0);
	}
	input.addEventListener("change", loadFile, false);
};

main();
