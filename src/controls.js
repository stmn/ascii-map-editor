import k from "./kaboom";
import {posToCoordinates} from "./helpers";
import store from "./store";

export default function initControls() {
    // Putting character part 1 (updating map array)

    let lastMouseDownPos = {x: -1, y: -1};
    k.onMouseDown((btn) => {
        if (btn === 'left') {
            const {x, y} = posToCoordinates();
            const {width, height, character} = store();

            if (lastMouseDownPos.x === x && lastMouseDownPos.y === y) {
                return;
            } else if (x >= width || y >= height || x < 0 || y < 0) {
                return;
            }

            const isRemovingMode = k.isKeyDown('alt') || k.isKeyDown('control') || k.isKeyDown('meta');
            store().setMapPoint(x, y, isRemovingMode ? ' ' : character);
            lastMouseDownPos = {x, y};
        }
    });

    // Putting character part 2 (updating map string)

    k.onMouseRelease((btn) => {
        if (btn === 'left') {
            store().updateMapString();
        }
    });

    // Changing current character

    document.addEventListener('keydown', (event) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }
        const keyName = event.key;
        if (keyName.length === 1) {
            store().character = keyName;
        }
    });

    // Zooming (mouse wheel) & Moving camera (trackpad)

    k.onScroll(({x, y}) => {
        const isMacbook = window.isTrackpad && (parseInt(x) === x && parseInt(y) === y);
        if (isMacbook && window.isTrackpad) {
            const speed = 0.3;
            k.camPos(k.camPos().x + x * speed, k.camPos().y + y * speed);
            return;
        }

        const offset = (y < 0 ? 1 : -1);
        const speed = 0.1;
        k.camScale(
            Math.min(2, Math.max(0.7, k.camScale().x + (offset * speed))),
            Math.min(2, Math.max(0.7, k.camScale().y + (offset * speed))),
        );
    });

    // Moving camera by mouse

    let previousMousePos = {x: 0, y: 0};
    k.onMouseMove(({x, y}) => {
        if (k.isMouseDown('right')) {
            k.camPos(k.camPos().x + (previousMousePos.x - x), k.camPos().y + (previousMousePos.y - y));
        }
        previousMousePos = {x, y};
    });

    // Moving camera by keyboard (arrows)

    const speed = 5;
    k.onUpdate(() => {
        if (k.isKeyDown('right') || k.isKeyDown('left') || k.isKeyDown('up') || k.isKeyDown('down')) {
            let newCamPos = k.camPos();
            if (k.isKeyDown('right')) {
                newCamPos.x += speed * (k.isKeyDown('shift') ? 3 : 1);
            }
            if (k.isKeyDown('left')) {
                newCamPos.x -= speed * (k.isKeyDown('shift') ? 3 : 1);
            }
            if (k.isKeyDown('up')) {
                newCamPos.y -= speed * (k.isKeyDown('shift') ? 3 : 1);
            }
            if (k.isKeyDown('down')) {
                newCamPos.y += speed * (k.isKeyDown('shift') ? 3 : 1);
            }
            k.camPos(newCamPos.x, newCamPos.y);
        }
    });
}