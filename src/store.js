import Alpine from "alpinejs";
import k from "./kaboom";
import MazeBuilder from "./vendor/MazeGenerator";
import {NewDungeon} from "./vendor/DungeonGenerator";
import {debounce} from "lodash";
import {stringKilobytes} from "./helpers";

export default function store(name = 'map', data) {
    return Alpine.store(name, data)
}

const saveMap = debounce(function () {
    try {
        const map = store().mapToString(false);
        const size = stringKilobytes(map);
        console.info(`Saving map...\nMap size: ${size}kb`);
        if (size < 5000) {
            localStorage.setItem('mapString', map)
        } else {
            console.error(`Map size is too big to save! (${size}kb)`)
        }
    } catch (e) {
        console.error(e);
    }
}, 500);

/**
 * Initializing store
 */

Alpine.store('map', {
    width: 14,
    height: 12,
    tileSize: 32,
    character: 'X',
    format: 'array-text', // text, array-text, array-array
    grid_enabled: true,
    colors_enabled: true,
    features_enabled: false,
    colors: {},
    map: [],
    mapString: '',
    empty: ' ',
    info: '',
    extra: {
        minRoomSize: 4,
        maxRoomSize: 8,
    },
    initialized: false,

    init() {
        if (store().initialized) {
            return;
        }
        store().initialized = true;

        if (localStorage.getItem('mapString')) {
            store().load(localStorage.getItem('mapString'), true, false);
            store().width = Math.max(3, store().width);
            store().height = Math.max(3, store().height);
            store().format = localStorage.getItem('format') ? localStorage.getItem('format') : 'array-text';

            store().updateMapString(false);
        }
    },

    save() {
        saveMap();
    },

    /**
     * @param x {int}
     * @param y {int}
     * @param character {string}
     */
    setMapPoint(x, y, character) {
        let map = store().map;
        if (!map[y]) {
            map[y] = [];
        }
        map[y][x] = character;
        store().save();
    },

    switchFormat() {
        if (store().format === 'text') {
            store().format = 'array-text';
        } else if (store().format === 'array-text') {
            store().format = 'array-array';
        } else {
            store().format = 'text';
        }

        localStorage.setItem('format', store().format);
        store().updateMapString();
    },

    clear() {
        store().map = [];
        store().updateMapString();
        k.play('message-pop');
    },

    /**
     * Load map
     * @param map {any}
     * @param fixMapSize {boolean}
     * @param save {boolean}
     */
    load(map = false, fixMapSize = true, save = true) {
        function detectMapSize(arr) {
            let width = 0;
            let height = 0;
            arr.forEach(row => {
                if (row && row.length > width) width = row.length;
                height++;
            });
            return {width, height};
        }

        if (typeof map !== 'object') {
            const mapString = map ? map : store().mapString;
            const format = store().detectMapFormat(mapString);
            store().map = store().convertToArrayArray(format, mapString);
            store().centerCamera();
        } else {
            store().map = map;
        }

        if (fixMapSize) {
            const {width, height} = detectMapSize(store().map);
            store().width = width;
            store().height = height;

            if (save) {
                store().save();
            }
        }
    },

    centerCamera() {
        k.get('map')[0]?.centerCamera();
        k.play('message-pop');
    },

    toClipboard() {
        try {
            const el = document.createElement('textarea');
            el.value = store().mapToString(false);
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            k.play('message-pop');
        } catch (e) {
            console.error(e);
        }
    },

    /**
     * Convert map array to string
     * @returns {string}
     */
    mapToString(returnMessage = true) {
        const {width, height, format, map, empty} = store()

        if (returnMessage && width * height > 50000) {
            return 'Map has been hidden due to its size but you can still export it. Current format is ' + format + '.';
        }

        if (format === 'array-array') {
            // return JSON.stringify(map);
            let _map = [];
            for (let y = 0; y < height; y++) {
                let row = [];
                for (let x = 0; x < width; x++) {
                    row.push(map?.[y]?.[x] || empty);
                }
                _map.push(row);
            }
            return JSON.stringify(_map);
        } else if (format === 'array-text') {
            let _map = [];
            for (let y = 0; y < height; y++) {
                let row = '';
                for (let x = 0; x < width; x++) {
                    row += map?.[y]?.[x] || empty;
                }
                _map.push(row);
            }
            return JSON.stringify(_map, null, '  ');
        } else {
            let _map = '';
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    _map += map?.[y]?.[x] || empty;
                }
                _map += (y < height ? '\n' : '');
            }
            return _map;
        }
    },

    updateMapString(save = true) {
        store().mapString = store().mapToString();
        if (save) {
            store().save();
        }
    },

    /**
     * @param character {string}
     */
    getColor(character) {
        if (!this.colors_enabled) {
            return [120, 120, 120];
        }

        if (!this.colors[character]) {
            this.colors[character] = [k.randi(255), k.randi(255), k.randi(255)]
        }
        return this.colors[character];
    },

    /**
     * @param string {string}
     * @returns {string}
     */
    detectMapFormat(string) {
        try {
            let json = JSON.parse(string);
            if (typeof json === 'object' && json.length > 0 && typeof json[0] === 'object') {
                return 'array-array';
            }
            if (typeof json === 'object' && json.length > 0 && typeof json[0] === 'string') {
                return 'array-text';
            }
        } catch (e) {
            return 'text';
        }
    },

    /**
     * @param format {string} Format of the map
     * @param map {string} Map string with desired format
     * @returns {[]}
     */
    convertToArrayArray(format, map) {
        if (format === 'array-text') {
            let array = [];
            let rows = JSON.parse(map);
            for (let row of rows) {
                array.push(row.split(''));
            }
            return array;
        } else if (format === 'text') {
            let array = [];
            let rows = map.split('\n');
            for (let row of rows) {
                array.push(row.split(''));
            }
            // remove last element if it's empty
            if (array[array.length - 1].length === 0) {
                array.pop();
            }
            return array;
        }

        return JSON.parse(map);
    },

    generateDungeon() {
        try {
            const {width, height, character, extra, empty} = store();
            let map = [];
            const dungeon = NewDungeon({
                width: width,
                height: height,
                minRoomSize: parseInt(extra.minRoomSize),
                maxRoomSize: parseInt(extra.maxRoomSize),
            });

            for (let y = 0; y < dungeon.length; y++) {
                let tmp = [];
                for (let x = 0; x < dungeon[y].length; x++) {
                    if (dungeon[y][x] === 1) {
                        tmp.push(character);
                    } else {
                        tmp.push(empty);
                    }
                }
                map.push(tmp);
            }

            k.play('message-pop');
            store().load(map);
            store().updateMapString();
        } catch (e) {
            console.error(e);
        }
    },

    generateMaze() {
        try {
            const {width, height, character, empty} = store();
            let map = [];
            let Maze = new MazeBuilder(width, height);
            let maze = Maze.maze;
            for (let y = 0; y < maze.length; y++) {
                let tmp = [];
                for (let x = 0; x < maze[y].length; x++) {
                    if (maze[y][x].includes('door')) {
                        tmp.push('D');
                    } else if (maze[y][x].includes('wall')) {
                        tmp.push(character);
                    } else {
                        tmp.push(empty);
                    }
                }
                map[y] = tmp;
            }
            k.play('message-pop');
            store().load(map);
            store().updateMapString();
        } catch (e) {
            console.error(e);
        }
    }
})

Alpine.start()