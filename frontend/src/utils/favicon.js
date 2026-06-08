const FAVICON_SRC = '/Favicon.png';
let baseImage = null;

function loadBase() {
	if (baseImage) return Promise.resolve(baseImage);
	return new Promise(resolve => {
		const img = new Image();
		img.onload = () => { baseImage = img; resolve(img); };
		img.src = FAVICON_SRC;
	});
}

export async function updateFavicon(unreadCount) {
	const canvas = document.createElement('canvas');
	canvas.width = 32;
	canvas.height = 32;
	const ctx = canvas.getContext('2d');

	const img = await loadBase();
	ctx.drawImage(img, 0, 0, 32, 32);

	if (unreadCount > 0) {
		ctx.beginPath();
		ctx.arc(24, 8, 9, 0, 2 * Math.PI);
		ctx.fillStyle = '#e53935';
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.font = 'bold 9px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(unreadCount > 99 ? '99+' : String(unreadCount), 24, 8);
	}

	let link = document.querySelector("link[rel~='icon']");
	if (!link) {
		link = document.createElement('link');
		link.rel = 'icon';
		document.head.appendChild(link);
	}
	link.href = canvas.toDataURL('image/png');
}
