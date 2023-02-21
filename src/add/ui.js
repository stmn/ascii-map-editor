import k from "../kaboom";
import store from "../store";
import {posToCoordinates} from "../helpers";
import addResizeButtons from "./resizeButtons";

export default function addUI({map}) {
    // Resize buttons

    addResizeButtons(map);

    // Information text

    k.add([
        'info',
        k.text('', {size: 20}),
        k.fixed(),
        k.color(190, 190, 190),
        k.pos(10, 10),
        {
            update() {
                this.text = store().info
            }
        }
    ])

    // Coordinates

    k.add([
        'coords',
        k.text('', {size: 20}),
        k.fixed(),
        k.color(190, 190, 190),
        k.pos(10, k.height() - 30),
        {
            update() {
                this.text = '';

                const {x, y} = posToCoordinates();
                if (x >= 0 && y >= 0 && x < store().width && y < store().height) {
                    this.text = x + 'x' + y;
                }
            }
        }
    ])
}