import k from "../kaboom";
import store from "../store";
import {posToCoordinates} from "../helpers";

export default function addMap() {
    return k.add([
        'map',
        k.pos(0, 0),
        k.rect(0, 0),
        k.outline(4),
        k.color(240, 234, 210),
        {
            add() {
                this.centerCamera();
            },
            centerCamera() {
                k.camPos(
                    this.worldPos().x + (store().width * store().tileSize / 2) + 140,
                    this.worldPos().y + (store().height * store().tileSize / 2)
                );
            },
            update() {
                // Update map size
                const {width, height, tileSize} = store();
                this.width = width * tileSize
                this.height = height * tileSize
            },
            /**
             * Most magic happens here
             */
            draw() {
                const {map, tileSize, height, width, grid_enabled, empty} = store()
                const {x, y} = posToCoordinates();

                // Calculation of the visible area

                const screenRect = new Rect(k.vec2(0), k.width(), k.height())
                const screenbbox = screenRect.bbox();
                const mapPosLeftTop = posToCoordinates(screenbbox.pos);
                const mapPosRightBottom = posToCoordinates({
                    x: screenbbox.pos.x + screenbbox.width,
                    y: screenbbox.pos.y + screenbbox.height,
                });

                // Drawing characters in the visible area

                for (let y = mapPosLeftTop.y + 1; y < Math.min(height, mapPosRightBottom.y); y++) {
                    const charY = map[y];
                    if (!charY) {
                        continue;
                    }
                    for (let x = mapPosLeftTop.x + 1; x < Math.min(width, mapPosRightBottom.x); x++) {
                        const charX = charY[x];
                        if (charX && charX !== empty) {
                            const color = store().getColor(charX)
                            k.drawText({
                                text: charX,
                                size: tileSize / 1.2,
                                width: tileSize,
                                height: tileSize,
                                pos: k.vec2((x * tileSize) + 5, (y * tileSize) + 3),
                                color: k.rgb(color[0], color[1], color[2]),
                            })
                        }
                    }
                }

                // Drawing grid in the visible area

                if (grid_enabled) {
                    // Vertical
                    for (let x = Math.max(1, mapPosLeftTop.x + 1); x < Math.min(width, mapPosRightBottom.x + 1); x++) {
                        k.drawLine({
                            p1: k.vec2((x * tileSize), Math.max(4, (mapPosLeftTop.y * tileSize) + 4)),
                            p2: k.vec2((x * tileSize), this.height - 4),
                            color: k.rgb(173, 193, 120),
                            width: 2,
                        })
                    }

                    // Horizontal
                    for (let y = Math.max(1, mapPosLeftTop.y + 1); y < Math.min(height, mapPosRightBottom.y + 1); y++) {
                        k.drawLine({
                            p1: k.vec2(Math.max(4, (mapPosLeftTop.x * tileSize) - tileSize + 4), (y * tileSize)),
                            p2: k.vec2(this.width - 4, (y * tileSize)),
                            color: k.rgb(173, 193, 120),
                            width: 2,
                        })
                    }
                }

                // Drawing cursor

                const isRemovingMode = k.isKeyDown('alt') || k.isKeyDown('control') || k.isKeyDown('meta');
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    k.drawRect({
                        width: tileSize,
                        height: tileSize,
                        pos: k.vec2(x * tileSize, y * tileSize),
                        color: isRemovingMode ? k.rgb(250, 50, 50) : k.rgb(173, 193, 120),
                        opacity: 0.5,
                    })
                }
            }
        }
    ])
}