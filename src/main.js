import initControls from './controls'
import addUI from "./add/ui";
import addMap from "./add/map";

const map = addMap();

addUI({map});

initControls();
