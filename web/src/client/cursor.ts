// The remote cursor, drawn locally by the browser so pointer movement has no stream
// latency. Cursor messages: type byte, pad, width, height, hot x, hot y (u16 each),
// serial (u32), then RGBA. Position messages (i32 x, y in desktop pixels) let touch
// viewers, which have no hover, see the pointer between taps.
import type { App } from './app';

// On-screen cursor size bounds in CSS pixels, applied to the image's longer side.
// 24 is the standard pointer size (Xcursor's default), so a desktop scaled down
// into a small window (an embedded sidebar) keeps a normal-sized pointer.
const MIN_CURSOR_PX = 24;
const MAX_CURSOR_PX = 128;

export function createCursor(app: App) {
	let msg: ArrayBuffer | null = null;
	let url = '';
	let hotspot = { x: 0, y: 0 };
	let pos: { x: number; y: number } | null = null;
	const scaled = document.createElement('canvas');

	// A touch screen has no pointer to hang the CSS cursor on, so the cursor image is
	// drawn as an overlay at the position the desktop reports.
	const coarse = matchMedia('(pointer: coarse)').matches;
	const overlay = document.createElement('img');
	overlay.style.cssText =
		'position:fixed;left:0;top:0;pointer-events:none;z-index:2;display:none;';
	if (coarse && document.body) document.body.appendChild(overlay);

	function place() {
		if (!coarse || !pos || !url || !app.desk.w) return;
		const r = app.surface.getBoundingClientRect();
		const s = r.width / app.desk.w;
		overlay.style.transform = `translate(${r.left + pos.x * s - hotspot.x}px, ${r.top + pos.y * s - hotspot.y}px)`;
		overlay.style.display = 'block';
	}

	function apply() {
		if (!msg) return;
		const v = new DataView(msg);
		const w = v.getUint16(2),
			h = v.getUint16(4),
			hx = v.getUint16(6),
			hy = v.getUint16(8);
		if (!w || !h) {
			app.surface.style.cursor = 'none';
			overlay.style.display = 'none';
			return;
		}
		const src = document.createElement('canvas');
		src.width = w;
		src.height = h;
		src
			.getContext('2d')!
			.putImageData(
				new ImageData(new Uint8ClampedArray(msg, 14, w * h * 4), w, h),
				0,
				0
			);
		// Cursor images are in desktop pixels; show them at the on-screen scale, but
		// never smaller than a normal pointer.
		const dpr = window.devicePixelRatio || 1;
		const size = Math.max(w, h);
		const s = Math.min(
			Math.max(app.view.scale, MIN_CURSOR_PX / size),
			MAX_CURSOR_PX / size
		);
		const cw = Math.max(1, Math.round(w * s)),
			ch = Math.max(1, Math.round(h * s));
		const dpw = Math.max(1, Math.round(cw * dpr)),
			dph = Math.max(1, Math.round(ch * dpr));
		scaled.width = dpw;
		scaled.height = dph;
		const cx = scaled.getContext('2d')!;
		cx.imageSmoothingQuality = 'high';
		cx.clearRect(0, 0, dpw, dph);
		cx.drawImage(src, 0, 0, dpw, dph);
		url = scaled.toDataURL('image/png');
		const hsx = Math.round(hx * s),
			hsy = Math.round(hy * s);
		hotspot = { x: hsx, y: hsy };
		if (coarse) {
			overlay.src = url;
			overlay.style.width = `${cw}px`;
			overlay.style.height = `${ch}px`;
			place();
			return;
		}
		app.surface.style.cursor =
			dpr > 1
				? `-webkit-image-set(url(${url}) ${dpr}x) ${hsx} ${hsy}, url(${url}) ${hsx} ${hsy}, default`
				: `url(${url}) ${hsx} ${hsy}, default`;
		if (dpr > 1 && !app.surface.style.cursor)
			app.surface.style.cursor = `url(${url}) ${hsx} ${hsy}, default`;
	}

	if (coarse) app.surface.style.cursor = 'none';

	return {
		set(buf: ArrayBuffer) {
			msg = buf;
			apply();
		},
		setPos(x: number, y: number) {
			pos = { x, y };
			place();
		},
		apply,
	};
}
