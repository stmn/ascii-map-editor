const VERTICAL = 'VERTICAL'
const HORIZONTAL = 'HORIZONTAL'

export function sum(a, b) {
    return a + b
}

/**
 * Returns a random number between min and max
 *
 * @param {number} min minimum random number to return
 * @param {number} max maximum random number to return
 * @returns {number}
 */
const randomIndexBetweenValues = (min, max) => (
    Math.floor((Math.random() * ((max - min) + 1)) + min)
)

/**
 * Return a random direction of vertical or horizontal
 *
 * @returns {string} 'vertical' or 'horizontal'
 */
function randomDirection(directionOptions = [VERTICAL, HORIZONTAL]) {
    if (directionOptions.length === 0) {
        return ''
    }

    const numOptions = directionOptions.length - 1
    return directionOptions[randomIndexBetweenValues(0, numOptions)]
}

/**
 * Add blocking tiles around the parameter of the 2d array
 *
 * @param {array} array 2d array representing a room
 */
function AddRoomBoundaries(array) {
    const currHeight = array.length - 1
    const currWidth = array[0].length - 1
    return array.map((row, rIndex) =>
        row.map((col, cIndex) => {
            if (rIndex === 0 || rIndex === currHeight || cIndex === 0 || cIndex === currWidth) {
                return 1
            }
            return col
        }),
    )
}

const setDefaultValues = (settings) => {
    console.log('logging settings', settings)
    if (settings) {
        return {
            width: settings.width || 50,
            height: settings.height || 50,
            minRoomSize: settings.minRoomSize || 5,
            maxRoomSize: settings.maxRoomSize || 20,
        }
    }
    return { width: 50, height: 50, minRoomSize: 5, maxRoomSize: 20 }
}

/**
 * Function used to create a new dungeon object
 *
 * @param {number} [width=50]
 * @param {number} [height=50]
 * @param {number} [minRoomSize=5]
 * @param {number} [maxRoomSize=20]
 * @returns dungeon object
 */
export const NewDungeon = (settings) => {
    const Dungeon = {

        init(width, height, minRoomSize, maxRoomSize) {
            // Create an empty 2D array width x height
            this.minRoomSize = minRoomSize
            this.maxRoomSize = maxRoomSize
            this.counter = 1

            // What am I trying to do here?
            this.tree = {
                level: Array.apply(null, { length: height }).map(() => (
                    Array.apply(null, { length: width })),
                ),
            }
            this.split(this.tree)
            this.connectRooms(this.tree)
        },

        /**
         * Given a 2d array (node.level), this function will split the room into two separate arrays
         * and store then in node.lNode.level and node.rNode.level.
         * The split is random (vertical or horizontal)
         * and can be anywhere along the axis as long as it doesn't result in making the room smaller
         * than this.min.
         *
         * @param {object} node
         */
        split(node) {
            if (node.level.length > this.maxRoomSize || node.level[0].length > this.maxRoomSize) {
                // If this condition is true, then we need to split again

                const splitDirection = randomDirection(
                    this.getSplitOptions(node.level.length, node.level[0].length),
                )
                const indexToSplit = this.getIndexToSplit(
                    splitDirection, node.level[0].length, node.level.length,
                )

                let lNode = node.leftNode = {}
                let rNode = node.rightNode = {}
                node.splitDirection = splitDirection
                node.splitIndex = indexToSplit

                /**
                 * Split the rooms either vertically or horizontally and store the
                 * new array in the left node and right nodes
                 */
                if (splitDirection === VERTICAL) {
                    lNode.level = node.level.map(row => row.slice(0, indexToSplit))
                    rNode.level = node.level.map(row => row.slice(indexToSplit, row.length))
                } else {
                    lNode.level = node.level.slice(0, indexToSplit)
                    rNode.level = node.level.slice(indexToSplit, node.level.length)
                }

                /**
                 * Recursive call to split the rooms again if needed
                 */
                this.split(lNode)
                this.split(rNode)
            } else {
                /**
                 * If we reach this point, then we can guarantee that the room does not
                 * have any children nodes. I.e. it's the smallest leaf node
                 * counter is used so we can visually see the different rooms when the room is rendered
                 */
                this.counter += 1
                node.level = node.level.map(row => row.map(() => this.counter))
                node.level = AddRoomBoundaries(node.level)
            }
        },

        /**
         * returns an array with the values VERTICAL if a vertical split is an option, and
         * HORIZONTAL is a horizontal split is an option, or an empy array neither are options.
         * Whether or not it is an option is based on if the size of the room is greater than
         * the maximum allowed room size.
         *
         * @param {number} verticalLength
         * @param {number} horizontalLength
         * @returns {array}
         */
        getSplitOptions(verticalLength, horizontalLength) {
            const directionOptions = []
            if (verticalLength > this.maxRoomSize) {
                directionOptions.push(HORIZONTAL)
            }
            if (horizontalLength > this.maxRoomSize) {
                directionOptions.push(VERTICAL)
            }
            return directionOptions
        },


        /**
         * Returns a random number along the vertical or horizontal axis
         *
         * @param {any} verticalLength
         * @param {any} horizontalLength
         * @returns {number}
         */
        getIndexToSplit(splitDirection, horizontalLength, verticalLength) {
            const min = this.minRoomSize
            const max = splitDirection === VERTICAL ? horizontalLength - min : verticalLength - min
            return randomIndexBetweenValues(min, max)
        },


        /**
         * @param {any} node
         * @returns
         */
        connectRooms(node) {
            /**
             * First, recursively loop through all the rooms so we're starting at the
             * lowest nodes in the tree that have child nodes, and we work our way back up.
             */
            if (node.leftNode) {
                this.connectRooms(node.leftNode)
            } else {
                return
            }

            if (node.rightNode) {
                this.connectRooms(node.rightNode)
            } else {
                return
            }

            const lNode = node.leftNode.level
            const rNode = node.rightNode.level


            /**
             * Since this function is called after all the rooms have been created, we know that all
             * the rooms already have boundaries. We just need to remove the wall at a random
             * intersecting point.
             */
            if (node.splitDirection === VERTICAL) {
                /**
                 * For vertical cut, the corridor will be horizontal.
                 * So somewhere along the 0 -> firstRoom.length axis
                 * Don't put the corridor on the outer most index values (0 and length - 1) because
                 * that can allow the corridor to be on the map boundary
                 */
                const vIndex = randomIndexBetweenValues(1, lNode.length - 2)
                node.corridorIndex = vIndex
                lNode[vIndex][lNode[0].length - 1] = 0
                lNode[vIndex][lNode[0].length - 2] = 0
                rNode[vIndex][0] = 0
                rNode[vIndex][1] = 0
            } else {
                // For horizontal cut, the corridor will be vertical.
                // So somewhere along the firstRoom[row[0]] -> firstRoom[row.length] axis
                const hIndex = randomIndexBetweenValues(1, lNode[0].length - 2)
                node.corridorIndex = hIndex
                lNode[lNode.length - 1][hIndex] = 0
                lNode[lNode.length - 2][hIndex] = 0
                rNode[0][hIndex] = 0
                rNode[1][hIndex] = 0
            }

            /**
             * Combine the child left node and right node rooms back together, and
             * save the result in the current level node.
             */
            node.level = []
            if (node.splitDirection === VERTICAL) {
                node.level = lNode.reduce((obj, val, index) => {
                    const temp = []
                    temp.push(...lNode[index])
                    temp.push(...rNode[index])
                    obj.push(temp)
                    return obj
                }, [])
            } else {
                // If we get to this point, then the slice was horizontal
                node.level.push(...lNode)
                node.level.push(...rNode)
            }
        },
    }

    const dungeon = Object.create(Dungeon)
    const { width, height, minRoomSize, maxRoomSize } = setDefaultValues(settings)

    dungeon.init(width, height, minRoomSize, maxRoomSize)
    return dungeon.tree.level
} // end NewDungeon

export default NewDungeon