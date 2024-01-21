// import * as Comlink from "https://unpkg.com/comlink/dist/esm/comlink.mjs";
import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4.4.1/+esm';
import { createApp, ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

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

function freqToNoteNumber(freq) {
	return 69 + 12 * Math.log2(freq / 440);
}


function noteNumberToFreq(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

function noteNumberToNoteName(noteNumber) {
	const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const octave = Math.floor(noteNumber / 12) - 1;
	const noteIndex = noteNumber % 12;
	const noteName = noteNames[noteIndex];
	return `${noteName}${octave}`;
}

const sampleRate = 5000*2;
const offlineAudioContext = new OfflineAudioContext(1, sampleRate, sampleRate);

const HARMONICS_OFFSET = [0, 12, 19, 24, 28, 31, 34, 36, 38, 40];

createApp({
	data() {
		return {
			hoverNote : null,
			loading: {
				done: true,
				message: '',
				total: 0,
				loaded: 0,
			},
			chunkCount: 0,
			progress: 0,
			progressTime: 0,

			playing: false,

			keyBindings: {
				"Space": function () {
					if (this.playing) {
						this.stop();
					} else {
						this.play();
					}
				}
			}
		}
	},

	async mounted() {
		console.log('mounted');

		const { inputFile, canvasIndex }  = this.$refs;

		const worker = new Worker("worker.js", { type: "module" });
		console.log(worker);
		worker.onerror = function (e) {
			console.log(e);
		};
		const SignalTransformWorker = Comlink.wrap(worker);
		
		const startNote = 21;
		const endNote = 108;
		const chunkLength = sampleRate * 10;
		const resolutionSeconds = 0.005;
		const resampleRate = Math.round(sampleRate * resolutionSeconds);
		this.pixelPerSecond = sampleRate / resampleRate;

		const range = endNote - startNote + 1;
		const NOTE_HEIGHT = 15;

		{
			const ctx = canvasIndex.getContext("2d");
			canvasIndex.height = range * NOTE_HEIGHT * 2;
			canvasIndex.width = 100;
			canvasIndex.style.height = range * NOTE_HEIGHT + "px";

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

		const noteCursor = this.$refs.noteCursor;
		console.log(noteCursor);
		const noteCursors = [];
		noteCursors.push(noteCursor);
		for (let i = 0; i < 4; i++) {
			const clone = noteCursor.cloneNode(true);
			noteCursors.push(clone);
			noteCursor.parentNode.appendChild(clone);
		}
		this.$refs.graphContainer.addEventListener("mousemove", (e) => {
			const note = Math.floor(endNote - (e.offsetY / NOTE_HEIGHT) + 1);
			if (note < startNote || note > endNote) {
				this.hoverNote = null;
				return;
			}
			this.hoverNote = note;

			for (let i = 0; i < noteCursors.length; i++) {
				const noteCursor = noteCursors[i];
				const offset = HARMONICS_OFFSET[i];
				const target = note + offset;
				if (target < startNote || target > endNote) {
					noteCursor.style.display = "none";
					continue;
				} else {
					noteCursor.style.display = "block";
				}
				const noteY = (endNote - target) * NOTE_HEIGHT;
				noteCursor.style.height = `${NOTE_HEIGHT}px`;
				noteCursor.style.top = `${noteY}px`;
			}
		});

		this.chunkWidth = chunkLength / resampleRate;
		const im = new ImageData(this.chunkWidth, range);

		const loadFile = async () => {
			this.initAudioContext();

			const file = inputFile.files[0];
			this.loading.message = 'Loading file';
			this.loading.done = false;
			this.loading.loaded = 0;
			this.loading.total = 0;
			this.progressTime = 0;
			console.log('loadFile', file);

			const arrayBuffer = await file.arrayBuffer();


			// prepare audio buffer for play back
			this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));

			// decodeAudioData is not available in worker
			// re-sampling with OfflineAudioContext
			const buffer = await offlineAudioContext.decodeAudioData(arrayBuffer);
			// -1.0 ~ +1.0
			const samples = buffer.getChannelData(0);

			const signalTransformWorker = await new SignalTransformWorker();
			await signalTransformWorker.initialize(
				startNote, endNote, sampleRate, chunkLength
			);
			console.log('set samples to worker');
			this.loading.message = 'Set samples to worker';
			await signalTransformWorker.setSamples(Comlink.transfer(samples, [samples.buffer]));

			this.chunkCount = await signalTransformWorker.getChunkCount();
			this.loading.loaded = 0;
			this.loading.total = this.chunkCount;

			console.log('get cwt result from worker');
			this.loading.message = 'Get cwt result from worker';
			this.$refs.graphContainer.innerHTML = '';
			this.graphCursor = this.$refs.graphCursor.cloneNode(true)
			this.$refs.graphContainer.appendChild(this.graphCursor);

			let max = -50 / 20;
			let min = -80 / 20;
			let scale = max - min;
			console.log({min, max, scale});

			for (let chunk = 0; chunk < this.chunkCount; chunk++) {
				const canvasGraph = document.createElement("canvas");
				canvasGraph.height = im.height;
				canvasGraph.width = im.width;
				canvasGraph.style.height = range * NOTE_HEIGHT + "px";
				canvasGraph.style.width = chunkLength / resampleRate + "px";
				canvasGraph.style.imageRendering = "pixelated";
				const result = await signalTransformWorker.getCwtResult(chunk);

				for (let ri = 0; ri < range; ri++) {
					const row = result.subarray(ri * chunkLength, (ri + 1) * chunkLength);

					for (let i = 0; i < canvasGraph.width; i++) {
						let v = 0;
						for (let s = 0; s < resampleRate; s++) {
							v += row[i * resampleRate + s];
						}

						let scaled = (Math.log10(v / resampleRate) - min) / scale;
						const {r, g, b} = jetColorMap(scaled);
						const index = (i + ri * canvasGraph.width) * 4;
						im.data[index + 0] = r * 255;
						im.data[index + 1] = g * 255;
						im.data[index + 2] = b * 255;
						im.data[index + 3] = 255;
					}
				}

				canvasGraph.getContext("2d").putImageData(im, 0, 0);
				this.$refs.graphContainer.appendChild(canvasGraph);
				this.loading.loaded++;
			}

			this.loading.message = 'Successfully loaded';
			this.loading.done = true;
		}
		inputFile.addEventListener("change", loadFile, false);

		this.bindKeys();
	},

	methods: {
		noteNumberToFreq,
		noteNumberToNoteName,

		initAudioContext: function () {
			if (this.audioContext) {
				return;
			}
			const audioContext = new AudioContext();
			this.audioContext = audioContext;
		},

		bindKeys: function () {
			window.addEventListener("keydown", (e) => {
				e.stopPropagation();
				const key = 
					(e.ctrlKey ? "Ctrl-" : "") +
					(e.shiftKey ? "Shift-" : "") +
					(e.altKey ? "Alt-" : "") +
					(e.metaKey ? "Meta-" : "") +
					e.code;
				const func = this.keyBindings[key];
				console.log(key, func);
				if (func) {
					e.preventDefault();
					func.call(this);
				}
			});
		},

		play: function () {
			console.log('play', this.audioBuffer);
			if (!this.audioBuffer) return;

			this.source = this.audioContext.createBufferSource();
			this.source.buffer = this.audioBuffer;
			this.source.connect(this.audioContext.destination);
			this.source.addEventListener("ended", () => {
				this.stop();
			});

			const startTime = this.audioContext.currentTime;
			const startOffset = this.progressTime;
			this.source.start(startTime, this.progressTime);
			this.playing = true;

			const updateProgress = () => {
				const currentTime = this.audioContext.currentTime;
				const progressTime = currentTime - startTime + startOffset;
				const duration = this.audioBuffer.duration;
				const progress = progressTime / duration;
				this.progressTime = progressTime;
				this.progress = progress;

				const pos = progressTime * this.pixelPerSecond;
				this.graphCursor.style.left = `${pos}px`;
				this.$refs.graphContainer.scrollLeft = pos - this.$refs.graphContainer.offsetWidth / 2;
				if (!this.playing) return;
				requestAnimationFrame(updateProgress);
			};
			requestAnimationFrame(updateProgress);
		},

		stop: function () {
			this.source.stop();
			this.playing = false;
		},
	}
}).mount('#app')
