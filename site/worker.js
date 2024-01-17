
import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4.4.1/+esm'

console.log('worker', Comlink);

const obj = {
	counter: 0,
	inc() {
		this.counter++;
	},
};

Comlink.expose(obj);

