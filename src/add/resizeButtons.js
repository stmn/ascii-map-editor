import k from "../kaboom";
import store from "../store";

function resizeButton(data) {
    return [
        k.text(data.text, {size: 40}),
        k.area(),
        k.anchor('center'),
        {
            update() {
                if (this.isClicked()) {
                    store('resizer')[data.action]();
                }

                if (!store().info && this.isHovering()) {
                    store().info = data.info;
                } else if (store().info === data.info && !this.isHovering()) {
                    store().info = '';
                }

                this.color = this.isHovering() ? k.rgb(120, 120, 120) : k.rgb(255, 255, 255);
            }
        }
    ];
}

export default function addResizeButtons(map) {
    /**
     * Actions
     */

    store('resizer', {
        // Extending

        extendFromTop() {
            const map = store().map;
            map.unshift([]);
            store().map = map;
            store().height += 1;
            store().updateMapString();
        },
        extendFromBottom() {
            const map = store().map;
            map.push([]);
            store().map = map;
            store().height += 1;
            store().updateMapString();
            k.camPos(k.camPos().x, k.camPos().y + store().tileSize);
        },
        extendFromLeft() {
            const map = store().map;
            for (let i = 0; i < map.length; i++) {
                if (map[i]) {
                    map[i].unshift(' ')
                }
            }
            store().map = map;
            store().width += 1;
            store().updateMapString();
        },
        extendFromRight() {
            const map = store().map;
            for (let i = 0; i < map.length; i++) {
                if (map[i]) {
                    map[i].push(' ')
                }
            }
            store().map = map;
            store().width += 1;
            store().updateMapString();
            k.camPos(k.camPos().x + store().tileSize, k.camPos().y);
        },

        // Shortening

        shortenFromTop() {
            if (store().height <= 3) return;
            const map = store().map;
            map.shift();
            store().map = map;
            store().height -= 1;
            store().updateMapString();
        },
        shortenFromBottom() {
            if (store().height <= 3) return;
            const map = store().map;
            map.pop();
            store().height -= 1;
            store().updateMapString();
            k.camPos(k.camPos().x, k.camPos().y - store().tileSize);
        },
        shortenFromLeft() {
            if (store().width <= 3) return;
            const map = store().map;
            for (let i = 0; i < map.length; i++) {
                map[i]?.shift()
            }
            store().map = map;
            store().width -= 1;
            store().updateMapString();
        },
        shortenFromRight() {
            if (store().width <= 3) return;
            const map = store().map;
            for (let i = 0; i < map.length; i++) {
                map[i]?.pop()
            }
            store().width -= 1;
            store().updateMapString();
            k.camPos(k.camPos().x - store().tileSize, k.camPos().y);
        }
    });

    /**
     * Buttons
     */

    // Top

    map.add([
        ...resizeButton({
            text: '+',
            info: 'Extend your map from top',
            action: 'extendFromTop'
        }),
        {
            update() {
                const {x, y} = map.worldPos();
                this.pos = k.vec2(x + (store().width * store().tileSize / 2) - 25, y - 35)
            }
        }
    ]);
    map.add([
        ...resizeButton({
            text: '-',
            info: 'Shorten your map from top',
            action: 'shortenFromTop'
        }),
        {
            update() {
                const {x, y} = map.worldPos();
                this.pos = k.vec2(x + (store().width * store().tileSize / 2) + 25, y - 35)
            }
        }
    ]);

    // Left

    map.add([
        ...resizeButton({
            text: '+',
            info: 'Extend your map from left',
            action: 'extendFromLeft'
        }),
        {
            update() {
                const {x, y} = map.worldPos();
                this.pos = k.vec2(x - 40, y + (store().height * store().tileSize / 2) - 15)
            }
        }
    ]);
    map.add([
        ...resizeButton({
            text: '-',
            info: 'Shorten your map from left',
            action: 'shortenFromLeft'
        }),
        {
            update() {
                const {x, y} = map.worldPos();
                this.pos = k.vec2(x - 40, y + (store().height * store().tileSize / 2) + 25)
            }
        }
    ]);

    // Bottom

    map.add([
        ...resizeButton({
            text: '+',
            info: 'Extend your map from bottom',
            action: 'extendFromBottom'
        }),
        {
            update() {
                const {x} = map.worldPos();
                this.pos = k.vec2(x + (store().width * store().tileSize / 2) - 25, store().height * store().tileSize + 40)
            }
        }
    ]);
    map.add([
        ...resizeButton({
            text: '-',
            info: 'Shorten your map from bottom',
            action: 'shortenFromBottom'
        }),
        {
            update() {
                const {x} = map.worldPos();
                this.pos = k.vec2(x + (store().width * store().tileSize / 2) + 25, store().height * store().tileSize + 40)
            }
        }
    ]);

    // Right

    map.add([
        ...resizeButton({
            text: '+',
            info: 'Extend your map from right',
            action: 'extendFromRight'
        }),
        {
            update() {
                const {y} = map.worldPos();
                this.pos = k.vec2((store().width * store().tileSize) + 50, y + (store().height * store().tileSize / 2) - 15)
            }
        }
    ]);
    map.add([
        ...resizeButton({
            text: '-',
            info: 'Shorten your map from right',
            action: 'shortenFromRight'
        }),
        {
            update() {
                const {y} = map.worldPos();
                this.pos = k.vec2((store().width * store().tileSize) + 50, y + (store().height * store().tileSize / 2) + 25)
            }
        }
    ]);
}