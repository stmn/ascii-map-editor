import kaboom from "kaboom";

const k = kaboom({
    canvas: document.querySelector("#app"),
    background: [100, 91, 80],
    pixelDensity: window.devicePixelRatio,
    font: "sinko",
});

k.loadSound('message-pop', `assets/pop.wav`)
k.loadBitmapFont("sinko", "assets/sinko.png", 8, 10)

export default k;

/**
 * This helps to detect trackpad
 */

window.isTrackpad = false;

function detectTrackPad(e) {
    if (e.wheelDeltaY) {
        if (e.wheelDeltaY === (e.deltaY * -3)) {
            window.isTrackpad = true;
        }
    } else if (e.deltaMode === 0) {
        window.isTrackpad = true;
    }
}

window.addEventListener("mousewheel", detectTrackPad, false);
window.addEventListener("DOMMouseScroll", detectTrackPad, false);

/**
 * This is fixing the issue with toggling fullscreen on itch.io
 */

let isItchIo = location.hostname.indexOf("itch") !== -1;
let height = window.innerHeight;
let embedHeight = 560;
if (isItchIo) {
    window.addEventListener("resize", () => {
        if ((height === embedHeight && window.innerHeight !== height) || (height !== embedHeight && window.innerHeight === embedHeight)) {
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    });
}