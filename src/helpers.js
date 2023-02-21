import k from "./kaboom";
import store from "./store";

export function posToCoordinates(pos = k.mousePos()) {
    return {
        x: Math.floor(k.toWorld(pos).x / store().tileSize),
        y: Math.floor(k.toWorld(pos).y / store().tileSize),
    }
}

export function stringKilobytes(string) {
    return (string.length / 1024).toFixed(2);
}